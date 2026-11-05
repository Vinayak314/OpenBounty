const crypto = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const { getAddress, verifyMessage } = require("ethers");
const User = require("../models/User");
const { requireFirebaseUser } = require("../middleware/requireFirebaseUser");

const router = express.Router();
const BASE_CHAIN_ID = 8453;

router.use(requireFirebaseUser);

function ensureDatabase(res) {
  if (mongoose.connection.readyState === 1) return true;
  res.status(503).json({ error: "The database is not connected." });
  return false;
}

async function getOrCreateUser(firebaseUser) {
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

function userResponse(user) {
  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    github: user.github,
    wallet: user.wallet?.address ? {
      address: user.wallet.address,
      chainId: user.wallet.chainId,
      connectedAt: user.wallet.connectedAt,
    } : null,
    groups: user.groups,
    ownedProjects: user.ownedProjects,
  };
}

router.get("/", async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const user = await getOrCreateUser(req.firebaseUser);
    res.json({ user: userResponse(user) });
  } catch (error) {
    console.error("Could not load user:", error.message);
    res.status(500).json({ error: "Could not load your account." });
  }
});

router.put("/github", async (req, res) => {
  if (!ensureDatabase(res)) return;
  if (req.firebaseUser.firebase?.sign_in_provider !== "github.com") {
    return res.status(403).json({ error: "Connect a GitHub account before saving a GitHub profile." });
  }
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(username)) return res.status(400).json({ error: "A valid GitHub username is required." });

  try {
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return res.status(422).json({ error: "Could not verify that GitHub profile." });
    const github = await response.json();
    const user = await getOrCreateUser(req.firebaseUser);
    user.github = {
      username: github.login,
      profileUrl: github.html_url,
      avatarUrl: github.avatar_url,
      displayName: github.name || "",
      bio: github.bio || "",
      connectedAt: user.github?.connectedAt || new Date(),
    };
    await user.save();
    res.json({ user: userResponse(user) });
  } catch (error) {
    console.error("Could not link GitHub profile:", error.message);
    res.status(500).json({ error: "Could not save your GitHub profile." });
  }
});

router.post("/wallet/challenge", async (req, res) => {
  if (!ensureDatabase(res)) return;
  const { address, chainId } = req.body || {};
  if (Number(chainId) !== BASE_CHAIN_ID) return res.status(400).json({ error: "Switch MetaMask to Base before connecting." });

  let normalizedAddress;
  try {
    normalizedAddress = getAddress(address).toLowerCase();
  } catch {
    return res.status(400).json({ error: "A valid Ethereum wallet address is required." });
  }

  try {
    const user = await getOrCreateUser(req.firebaseUser);
    const nonce = crypto.randomBytes(24).toString("hex");
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000);
    const message = [
      "OpenBounty wallet connection",
      `Firebase user: ${user.firebaseUid}`,
      `Wallet: ${normalizedAddress}`,
      `Chain ID: ${BASE_CHAIN_ID}`,
      `Nonce: ${nonce}`,
      `Issued at: ${issuedAt.toISOString()}`,
      `Expires at: ${expiresAt.toISOString()}`,
    ].join("\n");
    user.wallet.challengeMessage = message;
    user.wallet.challengeExpiresAt = expiresAt;
    await user.save();
    res.json({ message });
  } catch (error) {
    console.error("Could not create wallet challenge:", error.message);
    res.status(500).json({ error: "Could not start wallet verification." });
  }
});

router.post("/wallet/verify", async (req, res) => {
  if (!ensureDatabase(res)) return;
  const { address, chainId, signature } = req.body || {};
  if (Number(chainId) !== BASE_CHAIN_ID || typeof signature !== "string") {
    return res.status(400).json({ error: "A Base wallet signature is required." });
  }

  let normalizedAddress;
  try {
    normalizedAddress = getAddress(address).toLowerCase();
  } catch {
    return res.status(400).json({ error: "A valid Ethereum wallet address is required." });
  }

  try {
    const user = await User.findOne({ firebaseUid: req.firebaseUser.uid });
    const message = user?.wallet?.challengeMessage;
    const expiresAt = user?.wallet?.challengeExpiresAt;
    if (!message || !expiresAt || expiresAt <= new Date() || !message.includes(`Wallet: ${normalizedAddress}`)) {
      return res.status(400).json({ error: "Wallet verification expired. Start the connection again." });
    }

    let signerAddress;
    try {
      signerAddress = verifyMessage(message, signature).toLowerCase();
    } catch {
      return res.status(400).json({ error: "MetaMask returned an invalid signature." });
    }
    if (signerAddress !== normalizedAddress) return res.status(400).json({ error: "The signature does not match this wallet." });

    const linkedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        "wallet.challengeMessage": message,
        "wallet.challengeExpiresAt": { $gt: new Date() },
      },
      { $set: {
        "wallet.address": normalizedAddress,
        "wallet.chainId": BASE_CHAIN_ID,
        "wallet.connectedAt": new Date(),
        "wallet.challengeMessage": "",
        "wallet.challengeExpiresAt": null,
      } },
      { returnDocument: "after", runValidators: true },
    );
    if (!linkedUser) return res.status(400).json({ error: "Wallet verification expired or was already used. Start again." });
    res.json({ wallet: userResponse(linkedUser).wallet });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "That wallet is already linked to another account." });
    console.error("Could not verify wallet:", error.message);
    res.status(500).json({ error: "Could not verify your wallet." });
  }
});

router.delete("/wallet", async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const user = await getOrCreateUser(req.firebaseUser);
    user.wallet.address = "";
    user.wallet.chainId = null;
    user.wallet.connectedAt = null;
    user.wallet.challengeMessage = "";
    user.wallet.challengeExpiresAt = null;
    await user.save();
    res.json({ wallet: null });
  } catch (error) {
    console.error("Could not disconnect wallet:", error.message);
    res.status(500).json({ error: "Could not disconnect your wallet." });
  }
});

module.exports = router;
