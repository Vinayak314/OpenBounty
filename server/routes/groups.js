const { randomInt } = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const Group = require("../models/Group");
const Project = require("../models/Project");
const { requireFirebaseUser } = require("../middleware/requireFirebaseUser");
const { findProjectAccess } = require("../services/projectAccess");
const { getOrCreateUser } = require("../services/users");

const router = express.Router();
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const attempts = new Map();
let attemptWindow = 0;

router.use(requireFirebaseUser);
router.use((_req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: "The database is not connected." });
  }
  next();
});

router.post("/join", async (req, res) => {
  const window = Math.floor(Date.now() / 60_000);
  if (window !== attemptWindow) {
    attempts.clear();
    attemptWindow = window;
  }
  const uid = req.firebaseUser.uid;
  const count = attempts.get(uid) || 0;
  if (count >= 10) return res.status(429).json({ error: "Too many attempts. Try again in a minute." });
  attempts.set(uid, count + 1);

  const code = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
  if (!/^[A-Z2-9]{6}$/.test(code)) {
    return res.status(400).json({ error: "Enter a six-character group code." });
  }
  const user = await getOrCreateUser(req.firebaseUser);
  const group = await Group.findOneAndUpdate({
    joinCode: code,
    owner: { $ne: user._id },
    "members.user": { $ne: user._id },
    "joinRequests.user": { $ne: user._id },
  }, {
    $push: { joinRequests: { user: user._id, requestedAt: new Date() } },
  }, { returnDocument: "after" }).select("name");
  if (group) return res.status(201).json({ group: group.name, status: "pending" });

  const existing = await Group.findOne({ joinCode: code }).select("name owner members +joinRequests");
  if (!existing) return res.status(404).json({ error: "That group code was not found." });
  const member = existing.owner.equals(user._id) || existing.members.some(({ user: id }) => id.equals(user._id));
  return res.json({ group: existing.name, status: member ? "member" : "pending" });
});

router.use("/project/:slug", async (req, res, next) => {
  const { project, canManageGroup } = await findProjectAccess(req.params.slug, req.firebaseUser.uid);
  if (!project || project.status === "archived") return res.status(404).json({ error: "Project not found." });
  if (!canManageGroup) return res.status(403).json({ error: "Only group owners and maintainers can manage invites." });
  req.inviteProject = project;
  next();
});

router.get("/project/:slug", async (req, res) => {
  const groupId = req.inviteProject.group?._id;
  const group = groupId && await Group.findById(groupId).select("+joinCode +joinRequests")
    .populate("joinRequests.user", "displayName github.username");
  res.json({
    code: group?.joinCode ?? null,
    requests: (group?.joinRequests ?? []).map((request) => ({
      id: request.id,
      name: request.user?.displayName || request.user?.github?.username || "Contributor",
      username: request.user?.github?.username || "",
    })),
  });
});

router.post("/project/:slug/code", async (req, res) => {
  const project = req.inviteProject;
  let groupId = project.group?._id;
  await Group.init();

  if (!groupId) {
    // A deterministic ID lets concurrent requests reuse the same workspace group.
    await Group.updateOne({ _id: project._id }, { $setOnInsert: {
      slug: `project-${project.id}`,
      name: project.name.slice(0, 100),
      owner: project.owner._id,
      projects: [project._id],
    } }, { upsert: true });
    const linked = await Project.updateOne({ _id: project._id, group: null }, { $set: { group: project._id } });
    if (!linked.matchedCount) {
      const current = await Project.findById(project._id).select("group");
      if (!current?.group?.equals(project._id)) {
        return res.status(409).json({ error: "The project group changed. Reload the workspace and try again." });
      }
    }
    groupId = project._id;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from({ length: 6 }, () => codeAlphabet[randomInt(codeAlphabet.length)]).join("");
    try {
      const result = await Group.updateOne({ _id: groupId, joinCode: { $exists: false } }, { $set: { joinCode: code } });
      if (result.modifiedCount) return res.json({ code });
      const existing = await Group.findById(groupId).select("+joinCode");
      if (!existing) return res.status(404).json({ error: "Group not found." });
      return res.json({ code: existing.joinCode });
    } catch (error) {
      if (error.code !== 11000 || !error.keyPattern?.joinCode) throw error;
    }
  }
  res.status(503).json({ error: "Could not generate a unique code. Try again." });
});

router.patch("/project/:slug/requests/:requestId", async (req, res) => {
  const { requestId } = req.params;
  const { decision } = req.body ?? {};
  if (!mongoose.isObjectIdOrHexString(requestId) || !["approve", "decline"].includes(decision)) {
    return res.status(400).json({ error: "Choose a valid request and decision." });
  }
  const group = req.inviteProject.group && await Group.findById(req.inviteProject.group._id).select("+joinRequests");
  const request = group?.joinRequests.id(requestId);
  if (!request) return res.status(404).json({ error: "This request is no longer pending." });

  const filter = { _id: group._id, "joinRequests._id": request._id };
  const update = { $pull: { joinRequests: { _id: request._id } } };
  if (decision === "approve") {
    filter["members.user"] = { $ne: request.user };
    update.$push = { members: { user: request.user, role: "member", joinedAt: new Date() } };
  }
  const result = await Group.updateOne(filter, update);
  if (!result.modifiedCount) return res.status(409).json({ error: "This request has already been handled." });
  res.json({ status: decision === "approve" ? "approved" : "declined" });
});

router.use((error, _req, res, _next) => {
  console.error("Group request failed:", error.message);
  res.status(500).json({ error: "Could not complete the group request. Try again." });
});

module.exports = router;
