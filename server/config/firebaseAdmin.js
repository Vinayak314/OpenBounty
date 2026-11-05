const { applicationDefault, cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

function getFirebaseAuth() {
  let app = getApps()[0];
  if (!app) {
    const options = { projectId: process.env.FIREBASE_PROJECT_ID || "openbounty-b3e69" };
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      options.credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      options.credential = applicationDefault();
    }
    app = initializeApp(options);
  }
  return getAuth(app);
}

module.exports = { getFirebaseAuth };
