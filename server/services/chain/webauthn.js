const crypto = require("node:crypto");
const { AbiCoder, getBytes, hexlify, toBeHex } = require("ethers");

// secp256r1 group order; the contract (OpenZeppelin P256) rejects s > n/2, browsers may return either.
const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const WEBAUTHN_AUTH = "tuple(bytes32 r, bytes32 s, uint256 challengeIndex, uint256 typeIndex, bytes authenticatorData, string clientDataJSON)";

const b64url = (buffer) => Buffer.from(buffer).toString("base64url");
const fromB64url = (text) => {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]*={0,2}$/.test(text) || text.length > 20000) throw new WebAuthnError("Malformed passkey data.");
  return Buffer.from(text, "base64url");
};

class WebAuthnError extends Error {
  constructor(message, code = "invalid_passkey") { super(message); this.code = code; }
}

/** Raw P-256 public key (x, y as 0x-hex bytes32) from SPKI DER (what `response.getPublicKey()` returns). */
function publicKeyFromSpki(spkiB64url) {
  let key;
  try {
    key = crypto.createPublicKey({ key: fromB64url(spkiB64url), format: "der", type: "spki" });
  } catch {
    throw new WebAuthnError("The passkey public key could not be read.");
  }
  const jwk = key.export({ format: "jwk" });
  if (jwk.kty !== "EC" || jwk.crv !== "P-256") throw new WebAuthnError("The passkey must use the P-256 (ES256) algorithm.");
  return { qx: hexlify(Buffer.from(jwk.x, "base64url")), qy: hexlify(Buffer.from(jwk.y, "base64url")) };
}

function publicKeyObject(qx, qy) {
  return crypto.createPublicKey({
    key: { kty: "EC", crv: "P-256", x: b64url(getBytes(qx)), y: b64url(getBytes(qy)) }, format: "jwk",
  });
}

/** DER ECDSA signature -> { r, s } with low-s normalization. */
function derToRs(der) {
  const buf = Buffer.from(der);
  let offset = 0;
  const expect = (byte) => { if (buf[offset++] !== byte) throw new WebAuthnError("Malformed passkey signature."); };
  const readLength = () => {
    let length = buf[offset++];
    if (length & 0x80) {
      const bytes = length & 0x7f;
      length = 0;
      for (let i = 0; i < bytes; i++) length = (length << 8) | buf[offset++];
    }
    return length;
  };
  expect(0x30); readLength();
  expect(0x02); const rLen = readLength(); const r = BigInt(`0x${buf.subarray(offset, offset + rLen).toString("hex") || "0"}`); offset += rLen;
  expect(0x02); const sLen = readLength(); let s = BigInt(`0x${buf.subarray(offset, offset + sLen).toString("hex") || "0"}`);
  if (r <= 0n || r >= P256_N || s <= 0n || s >= P256_N) throw new WebAuthnError("Malformed passkey signature.");
  if (s > P256_N / 2n) s = P256_N - s;
  return { r: toBeHex(r, 32), s: toBeHex(s, 32) };
}

/**
 * Checks a browser assertion off chain: right type, right challenge, allowed origin, RP id, user presence and
 * verification, and a valid P-256 signature by the registered key. Returns the parsed parts.
 */
function verifyAssertion({ assertion, challenge, qx, qy, rpId, origins }) {
  const authenticatorData = fromB64url(assertion?.authenticatorData);
  const clientDataBytes = fromB64url(assertion?.clientDataJSON);
  const signature = fromB64url(assertion?.signature);
  const clientDataJSON = clientDataBytes.toString("utf8");
  let client;
  try { client = JSON.parse(clientDataJSON); } catch { throw new WebAuthnError("Malformed passkey client data."); }
  if (client.type !== "webauthn.get") throw new WebAuthnError("Unexpected passkey ceremony.");
  if (client.challenge !== b64url(getBytes(challenge))) throw new WebAuthnError("The passkey signed a different request.", "challenge_mismatch");
  if (origins?.length && !origins.includes(client.origin)) throw new WebAuthnError("The passkey was used on an unexpected site.", "origin_mismatch");
  if (authenticatorData.length < 37) throw new WebAuthnError("Malformed authenticator data.");
  if (rpId) {
    const expected = crypto.createHash("sha256").update(rpId).digest();
    if (!expected.equals(authenticatorData.subarray(0, 32))) throw new WebAuthnError("The passkey belongs to another site.", "rp_mismatch");
  }
  const flags = authenticatorData[32];
  if (!(flags & 0x01) || !(flags & 0x04)) throw new WebAuthnError("Confirm with your device lock (PIN or biometrics).", "user_verification");
  const signed = Buffer.concat([authenticatorData, crypto.createHash("sha256").update(clientDataBytes).digest()]);
  const ok = crypto.verify("sha256", signed, { key: publicKeyObject(qx, qy), dsaEncoding: "der" }, signature);
  if (!ok) throw new WebAuthnError("The passkey signature is not valid for this account.", "bad_signature");
  return { authenticatorData, clientDataJSON, signature };
}

/** ABI-encoded `WebAuthn.WebAuthnAuth`, the signature format OpenBountyAccount accepts. */
function encodeContractSignature({ authenticatorData, clientDataJSON, signature }) {
  const { r, s } = derToRs(signature);
  const challengeIndex = clientDataJSON.indexOf('"challenge":');
  const typeIndex = clientDataJSON.indexOf('"type":');
  if (challengeIndex < 0 || typeIndex < 0) throw new WebAuthnError("Malformed passkey client data.");
  return AbiCoder.defaultAbiCoder().encode([WEBAUTHN_AUTH], [[r, s, challengeIndex, typeIndex, authenticatorData, clientDataJSON]]);
}

module.exports = { publicKeyFromSpki, verifyAssertion, encodeContractSignature, derToRs, WebAuthnError, b64url, fromB64url, P256_N };
