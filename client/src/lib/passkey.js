import { apiRequest } from "@/lib/api";

// Passkey payment account helpers. The private key never leaves the device's authenticator; the server only
// ever receives public keys and signed assertions over digests it built itself.
const toB64url = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (text) => {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
};

export const passkeysSupported = () => typeof window !== "undefined" && Boolean(window.PublicKeyCredential && navigator.credentials);

function friendly(error) {
  if (error?.name === "NotAllowedError") return new Error("The passkey prompt was cancelled or timed out.");
  if (error?.name === "InvalidStateError") return new Error("This device already has a passkey for this account.");
  if (error?.name === "SecurityError") return new Error("Passkeys need a secure (https) site whose domain matches the server's WEBAUTHN_RP_ID.");
  return error;
}

export async function signChallenge(challenge, credentialId) {
  try {
    const credential = await navigator.credentials.get({ publicKey: {
      challenge: fromB64url(challenge),
      allowCredentials: [{ type: "public-key", id: fromB64url(credentialId) }],
      userVerification: "required",
      timeout: 120000,
    } });
    return {
      authenticatorData: toB64url(credential.response.authenticatorData),
      clientDataJSON: toB64url(credential.response.clientDataJSON),
      signature: toB64url(credential.response.signature),
    };
  } catch (error) {
    throw friendly(error);
  }
}

/** Creates the passkey, proves possession by signing the same challenge, and registers the account. */
export async function createPaymentAccount() {
  if (!passkeysSupported()) throw new Error("This browser does not support passkeys.");
  const options = await apiRequest("/wallet/passkey/options", { method: "POST" });
  let credential;
  try {
    credential = await navigator.credentials.create({ publicKey: {
      challenge: fromB64url(options.challenge),
      rp: options.rp,
      user: { id: fromB64url(options.user.id), name: options.user.name, displayName: options.user.displayName },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }], // ES256 (P-256), verified on chain
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
      attestation: "none",
      timeout: 120000,
    } });
  } catch (error) {
    throw friendly(error);
  }
  const spki = credential.response.getPublicKey?.();
  if (!spki) throw new Error("This browser cannot export the passkey public key. Use a current Chrome, Safari, Edge or Firefox.");
  const credentialId = toB64url(credential.rawId);
  const assertion = await signChallenge(options.challenge, credentialId);
  return apiRequest("/wallet/passkey/register", { method: "POST", body: { credentialId, publicKey: toB64url(spki), assertion } });
}

/** Signs a server-built intent with the passkey and submits it to the sponsor. */
export async function approveIntent(intent) {
  const assertion = await signChallenge(intent.challenge, intent.credentialId);
  return apiRequest(`/wallet/intents/${intent.intentId}/submit`, { method: "POST", body: { assertion } });
}

export const shortAddress = (address) => (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "");
export const formatUnits6 = (value) => {
  if (value === null || value === undefined) return "–";
  const big = BigInt(value);
  const whole = big / 1000000n;
  const fraction = (big % 1000000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
};
