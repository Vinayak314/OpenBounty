const User = require("../models/User");

function getOrCreateUser(firebaseUser) {
  return User.findOneAndUpdate(
    { firebaseUid: firebaseUser.uid },
    { $set: {
      email: firebaseUser.email || "",
      displayName: firebaseUser.name || "",
      photoURL: firebaseUser.picture || "",
    } },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  );
}

module.exports = { getOrCreateUser };
