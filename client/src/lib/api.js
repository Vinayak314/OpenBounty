import { auth } from "../../firebase/firebase";

const API_URL = import.meta.env.VITE_API_URL || "";

export async function apiRequest(path, { method = "GET", body, publicRequest = false, ...options } = {}) {
  const user = auth.currentUser;
  if (!publicRequest && !user) throw new Error("Sign in with GitHub before continuing.");
  const token = publicRequest ? "" : await user.getIdToken();
  const response = await fetch(`${API_URL}/api${path}`, {
    ...options,
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "The OpenBounty server could not complete this request.");
  return payload;
}
