// Small in-memory sliding-window limiter (single process). Keys are pruned so the map stays bounded.
function createLimiter({ windowMs = 60000, limit = 30, maxKeys = 5000 } = {}) {
  const hits = new Map();
  return function allowed(key, now = Date.now()) {
    const recent = (hits.get(key) || []).filter((at) => now - at < windowMs);
    if (recent.length >= limit) { hits.set(key, recent); return false; }
    recent.push(now);
    hits.delete(key);
    hits.set(key, recent);
    if (hits.size > maxKeys) hits.delete(hits.keys().next().value);
    return true;
  };
}

/** Express middleware factory: 429 when `keyFn(req)` exceeds the limit. */
function limitRequests(options, keyFn = (req) => req.firebaseUser?.uid || req.ip) {
  const allowed = createLimiter(options);
  return (req, res, next) => (allowed(keyFn(req)) ? next() : res.status(429).json({ error: "Too many requests. Wait a minute and try again." }));
}

module.exports = { createLimiter, limitRequests };
