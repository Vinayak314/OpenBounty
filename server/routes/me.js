const crypto = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const { getAddress, verifyMessage } = require("ethers");
const User = require("../models/User");
const Project = require("../models/Project");
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

router.get("/github/repositories", async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const user = await getOrCreateUser(req.firebaseUser);
    const username = user.github?.username;
    if (!username) return res.status(409).json({ error: "Connect your GitHub profile before adding a repository." });
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=100`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "OpenBounty" },
    });
    if (!response.ok) return res.status(502).json({ error: "GitHub repositories could not be loaded." });
    const repositories = await response.json();
    res.json({ repositories: repositories.filter((repo) => !repo.fork && repo.owner.login.toLowerCase() === username.toLowerCase()).map((repo) => ({
      id: String(repo.id), name: repo.name, fullName: repo.full_name,
      description: repo.description || "", url: repo.html_url, private: repo.private,
      owner: repo.owner.login, defaultBranch: repo.default_branch,
    })) });
  } catch (error) {
    console.error("Could not load GitHub repositories:", error.message);
    res.status(500).json({ error: "Could not load your GitHub repositories." });
  }
});

router.get("/projects", async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const user = await getOrCreateUser(req.firebaseUser);
    const projects = await Project.find({ owner: user._id, status: { $ne: "archived" } }).sort({ updatedAt: -1 });
    res.json({ projects: projects.map((project) => ({
      id: project.id, slug: project.slug, name: project.name, description: project.description,
      repository: project.githubRepository, role: "Owner", updatedAt: project.updatedAt,
    })) });
  } catch (error) {
    console.error("Could not load projects:", error.message);
    res.status(500).json({ error: "Could not load your projects." });
  }
});

router.post("/projects", async (req, res) => {
  if (!ensureDatabase(res)) return;
  const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
  if (!/^[a-zA-Z0-9-]{1,39}\/[a-zA-Z0-9_.-]{1,100}$/.test(fullName)) {
    return res.status(400).json({ error: "Choose a valid GitHub repository." });
  }
  try {
    const user = await getOrCreateUser(req.firebaseUser);
    const username = user.github?.username;
    const [repoOwner, repoName] = fullName.split("/");
    if (!username || repoOwner.toLowerCase() !== username.toLowerCase()) {
      return res.status(403).json({ error: "You can only add repositories from your connected GitHub account." });
    }
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "OpenBounty" },
    });
    if (!response.ok) return res.status(422).json({ error: "That GitHub repository could not be verified." });
    const repo = await response.json();
    if (repo.owner.login.toLowerCase() !== username.toLowerCase()) return res.status(403).json({ error: "You can only add repositories from your connected GitHub account." });
    const existing = await Project.findOne({ "githubRepository.fullName": repo.full_name });
    if (existing) {
      if (String(existing.owner) === String(user._id)) return res.status(409).json({ error: "That repository is already in your projects." });
      return res.status(409).json({ error: "That repository has already been added to OpenBounty." });
    }
    const slugBase = `${repo.owner.login}-${repo.name}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 110);
    const project = await Project.create({
      name: repo.name, slug: `${slugBase}-${crypto.randomBytes(3).toString("hex")}`,
      description: repo.description || "", owner: user._id,
      githubRepository: { owner: repo.owner.login, name: repo.name, fullName: repo.full_name, url: repo.html_url },
    });
    user.ownedProjects.addToSet(project._id);
    await user.save();
    res.status(201).json({ project: {
      id: project.id, slug: project.slug, name: project.name, description: project.description,
      repository: project.githubRepository, role: "Owner", updatedAt: project.updatedAt,
    } });
  } catch (error) {
    console.error("Could not add project:", error.message);
    res.status(500).json({ error: "Could not add that project." });
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
