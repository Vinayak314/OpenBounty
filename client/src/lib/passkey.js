import { apiRequest } from "@/lib/api";

// Passkey payment account helpers. The private key never leaves the device's authenticator; the server only
// ever receives public keys and signed assertions over digests it built itself.
const toB64url = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (text) => {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
};

export const passkeysSupported = () => typeof window !== "undefined" && Boolean(window.PublicKeyCredential && navigator.credentials);

// Browser DOMExceptions carry technical text; show readable guidance instead of raw error strings.
function friendly(error) {
  if (!(error instanceof DOMException)) return error;
  const messages = {
    NotAllowedError: "The passkey prompt was cancelled or timed out.",
    AbortError: "The passkey prompt was interrupted. Try again.",
    InvalidStateError: "This device already has a passkey for this account.",
    SecurityError: "Passkeys need a secure (https) site whose domain matches the server's WEBAUTHN_RP_ID.",
    NotSupportedError: "This device does not support the passkey type OpenBounty needs (P-256).",
    ConstraintError: "This device cannot verify you with a PIN or biometrics, which payments require.",
  };
  return new Error(messages[error.name] || "The passkey request failed. Try again.");
}

// Only one passkey prompt may be open at a time; a second concurrent request would fail with a browser error.
let promptOpen = false;
async function exclusive(task) {
  if (promptOpen) throw new Error("A passkey prompt is already open. Finish or cancel it first.");
  promptOpen = true;
  try {
    return await task();
  } finally {
    promptOpen = false;
  }
}

export const signChallenge = (challenge, credentialId, rpId) => exclusive(async () => {
  try {
    const credential = await navigator.credentials.get({ publicKey: {
      ...(rpId ? { rpId } : {}),
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
});

/** Creates the passkey, proves possession by signing the same challenge, and registers the account. */
export async function createPaymentAccount() {
  if (!passkeysSupported()) throw new Error("This browser does not support passkeys.");
  const options = await apiRequest("/wallet/passkey/options", { method: "POST" });
  let credential;
  try {
    credential = await exclusive(() => navigator.credentials.create({ publicKey: {
      challenge: fromB64url(options.challenge),
      rp: options.rp,
      user: { id: fromB64url(options.user.id), name: options.user.name, displayName: options.user.displayName },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }], // ES256 (P-256), verified on chain
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
      attestation: "none",
      timeout: 120000,
    } }));
  } catch (error) {
    throw friendly(error);
  }
  const spki = credential.response.getPublicKey?.();
  if (!spki) throw new Error("This browser cannot export the passkey public key. Use a current Chrome, Safari, Edge or Firefox.");
  const credentialId = toB64url(credential.rawId);
  const assertion = await signChallenge(options.challenge, credentialId, options.rp.id);
  return apiRequest("/wallet/passkey/register", { method: "POST", body: { credentialId, publicKey: toB64url(spki), assertion } });
}

/** Signs a server-built intent with the passkey and submits it to the sponsor. */
export async function approveIntent(intent) {
  const assertion = await signChallenge(intent.challenge, intent.credentialId, intent.rpId);
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
