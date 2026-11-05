const { getFirebaseAuth } = require("../config/firebaseAdmin");

async function requireFirebaseUser(req, res, next) {
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: "Firebase sign-in is required." });

  try {
    req.firebaseUser = await getFirebaseAuth().verifyIdToken(match[1]);
    next();
  } catch (error) {
    console.error("Firebase token verification failed:", error.message);
    return res.status(401).json({ error: "Your sign-in has expired. Please sign in again." });
  }
}

module.exports = { requireFirebaseUser };
