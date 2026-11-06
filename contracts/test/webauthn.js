// Test-only WebAuthn authenticator: produces the same assertion shape a browser returns.
const crypto = require("node:crypto");
const { getBytes, hexlify } = require("ethers");

const b64url = (buf) => Buffer.from(buf).toString("base64url");

function makePasskey() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  return {
    privateKey,
    qx: hexlify(Buffer.from(jwk.x, "base64url")),
    qy: hexlify(Buffer.from(jwk.y, "base64url")),
    spki: b64url(publicKey.export({ type: "spki", format: "der" })),
  };
}

function assertion(passkey, challenge, { flags = 0x05, rpId = "localhost", origin = "http://localhost:5173", type = "webauthn.get" } = {}) {
  const authenticatorData = Buffer.concat([
    crypto.createHash("sha256").update(rpId).digest(), Buffer.from([flags]), Buffer.from([0, 0, 0, 1]),
  ]);
  const clientDataJSON = Buffer.from(JSON.stringify({ type, challenge: b64url(getBytes(challenge)), origin, crossOrigin: false }));
  const signed = Buffer.concat([authenticatorData, crypto.createHash("sha256").update(clientDataJSON).digest()]);
  const signature = crypto.sign("sha256", signed, { key: passkey.privateKey, dsaEncoding: "der" });
  return { authenticatorData: b64url(authenticatorData), clientDataJSON: b64url(clientDataJSON), signature: b64url(signature) };
}

module.exports = { makePasskey, assertion };
