const crypto = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Project = require("../models/Project");
const Group = require("../models/Group");
const Bounty = require("../models/Bounty");
const { requireFirebaseUser } = require("../middleware/requireFirebaseUser");
const { getOrCreateUser } = require("../services/users");

const router = express.Router();

router.use(requireFirebaseUser);

function githubHeaders() {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "OpenBounty" };
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GITHUB_REVIEW_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
const needsReverify = (res) => res.status(409).json({ error: "Verify your GitHub account again (sign in with GitHub) before continuing." });

function ensureDatabase(res) {
  if (mongoose.connection.readyState === 1) return true;
  res.status(503).json({ error: "The database is not connected." });
  return false;
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
      kind: user.wallet.kind || "",
      deployed: Boolean(user.wallet.deployed),
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
  // The GitHub account id Firebase verified when this user signed in. A typed username must resolve to this id.
  const verifiedId = String(req.firebaseUser.firebase?.identities?.["github.com"]?.[0] || "");
  if (!/^\d+$/.test(verifiedId)) return res.status(403).json({ error: "Sign in with GitHub again to verify your account." });

  try {
    const headers = { Accept: "application/vnd.github+json", "User-Agent": "OpenBounty" };
    const token = process.env.GITHUB_TOKEN?.trim() || process.env.GITHUB_REVIEW_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    // Look the account up by its verified numeric id, so the typed name can only confirm it, never choose it.
    const response = await fetch(`https://api.github.com/user/${verifiedId}`, { headers });
    if (response.status === 403 || response.status === 429) return res.status(503).json({ error: "GitHub is rate limiting OpenBounty. Try again in a few minutes." });
    if (!response.ok) return res.status(422).json({ error: "Could not verify that GitHub profile." });
    const github = await response.json();
    if (String(github.id) !== verifiedId || String(github.login || "").toLowerCase() !== username.toLowerCase()) {
      return res.status(403).json({ error: "That username does not belong to the GitHub account you signed in with." });
    }
    const user = await getOrCreateUser(req.firebaseUser);
    user.github = {
      id: verifiedId,
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
    if (error.code === 11000) return res.status(409).json({ error: "That GitHub account is already linked to another OpenBounty user." });
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
    if (!user.github.id) return needsReverify(res);
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=100`, {
      headers: githubHeaders(),
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
    const [groups, pendingGroups] = await Promise.all([
      Group.find({ $or: [{ owner: user._id }, { "members.user": user._id }] }).select("owner members"),
      Group.find({ "joinRequests.user": user._id }).select("name"),
    ]);
    const groupsById = new Map(groups.map((group) => [group.id, group]));
    const projects = await Project.find({
      status: { $ne: "archived" },
      $or: [{ owner: user._id }, { coOwners: user._id }, { group: { $in: groups.map((group) => group._id) } }],
    }).sort({ updatedAt: -1 });
    const roleFor = (project) => {
      if (project.owner.equals(user._id)) return "Owner";
      const group = groupsById.get(String(project.group));
      const admin = group?.owner.equals(user._id) || group?.members.some((member) =>
        member.user.equals(user._id) && ["owner", "admin"].includes(member.role));
      return admin || project.coOwners.some((id) => id.equals(user._id)) ? "Maintainer" : "Contributor";
    };
    res.json({ projects: projects.map((project) => ({
      id: project.id, slug: project.slug, name: project.name, description: project.description,
      repository: project.githubRepository, role: roleFor(project), updatedAt: project.updatedAt,
    })), pendingJoinRequests: pendingGroups.map(({ id, name }) => ({ id, name })) });
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
    if (!user.github.id) return needsReverify(res);
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}`, {
      headers: githubHeaders(),
    });
    if (response.status === 403 || response.status === 429) return res.status(503).json({ error: "GitHub is rate limiting OpenBounty. Try again in a few minutes." });
    if (!response.ok) return res.status(422).json({ error: "That GitHub repository could not be verified." });
    const repo = await response.json();
    if (String(repo.owner.id) !== user.github.id || repo.owner.login.toLowerCase() !== username.toLowerCase()) return res.status(403).json({ error: "You can only add repositories from your connected GitHub account." });
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

router.delete("/wallet", async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const user = await getOrCreateUser(req.firebaseUser);
    const address = user.wallet?.address || "";
    if (address && req.body?.confirm !== true) {
      return res.status(400).json({ error: "Confirm that you want to remove this payment account." });
    }
    if (address) {
      // A bound recipient or funder account must stay linked while money depends on it.
      const active = await Bounty.exists({
        status: { $in: ["funding", "funded", "claimed", "submitted"] },
        $or: [{ "chain.recipient": address }, { "chain.funder": address }, { claimRequests: { $elemMatch: { account: address, status: "pending" } } }],
      });
      if (active) return res.status(409).json({ error: "This account is part of an active bounty. Finish or cancel it first." });
      // Only OpenBounty's approved actions can spend from a passkey account, so unlinking one that holds funds or
      // escrow roles would strand them.
      try {
        const { chain } = require("../services/chain/client");
        const c = chain();
        if (c.config.accountsEnabled) {
          const [balance, owner, maintainer] = await Promise.all([
            c.token.balanceOf(address),
            c.escrow ? c.escrow.owner() : "",
            c.escrow ? c.escrow.isMaintainer(address) : false,
          ]);
          if (balance > 0n) {
            return res.status(409).json({ error: `This account still holds ${Number(balance) / 1e6} USDT, which only this account can spend. Keep it linked, or move the funds through a bounty first.` });
          }
          if (String(owner).toLowerCase() === address || maintainer) {
            return res.status(409).json({ error: "This account holds escrow permissions. Ask the owner to revoke them (or transfer ownership) before removing it." });
          }
        }
      } catch (chainError) {
        console.error("Wallet removal check failed:", chainError.shortMessage || chainError.message);
        return res.status(503).json({ error: "Could not check the account's balance on chain. Try again in a moment." });
      }
    }
    user.wallet = { address: "", chainId: null, kind: "", connectedAt: null, passkey: {}, deployTx: "", deployed: false, challengeMessage: "", challengeExpiresAt: null };
    await user.save();
    res.json({ wallet: null });
  } catch (error) {
    console.error("Could not disconnect wallet:", error.message);
    res.status(500).json({ error: "Could not disconnect your wallet." });
  }
});

module.exports = router;
