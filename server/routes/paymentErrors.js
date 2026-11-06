// Maps payment/bounty errors to HTTP responses without leaking internals.
function sendError(res, error, fallback) {
  const status = Number(error?.status) || (["invalid_passkey", "challenge_mismatch", "origin_mismatch", "rp_mismatch", "user_verification", "bad_signature"].includes(error?.code) ? 400 : 0)
    || (error?.code === "sponsor_policy" ? 403 : 0);
  if (status && status < 500 || ["payments_disabled", "sponsor_unavailable", "sponsor_busy", "sponsor_budget", "sponsor_low_balance", "send_failed", "misconfigured"].includes(error?.code)) {
    return res.status(status || 503).json({ error: error.message, code: error.code || "" });
  }
  if (error?.code === "pending") return res.status(202).json({ status: "pending", error: error.message, code: "pending" });
  console.error(fallback, error?.code || "", error?.shortMessage || error?.message);
  return res.status(500).json({ error: fallback });
}

module.exports = { sendError };
