const express = require("express");
const mongoose = require("mongoose");
const ChatMessage = require("../models/ChatMessage");
const { requireFirebaseUser } = require("../middleware/requireFirebaseUser");
const { findProjectAccess } = require("../services/projectAccess");

const router = express.Router();
router.use(requireFirebaseUser);

function ensureDatabase(res) {
  if (mongoose.connection.readyState === 1) return true;
  res.status(503).json({ error: "The database is not connected." });
  return false;
}

async function accessibleProject(req, res) {
  const { project, allowed } = await findProjectAccess(req.params.slug, req.firebaseUser.uid);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return null;
  }
  if (!allowed) {
    res.status(403).json({ error: "You do not have access to this project." });
    return null;
  }
  return project;
}

function messageResponse(message, firebaseUid) {
  const authorName = message.authorName || "GitHub user";
  const initials = authorName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "GH";
  return {
    id: message.id,
    authorUid: message.authorUid,
    type: "message",
    author: { name: authorName, initials, color: "orange", photoURL: message.authorPhoto },
    me: message.authorUid === firebaseUid,
    time: new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
    variant: message.authorUid === firebaseUid ? "outlined" : "filled",
    body: message.body,
    attachments: message.attachments,
    replyTo: message.replyTo?.id ? message.replyTo : null,
    edited: message.edited,
    reactions: Object.fromEntries((message.reactions || []).map((reaction) => [reaction.emoji, {
      count: reaction.users.length,
      mine: firebaseUid ? reaction.users.includes(firebaseUid) : false,
    }])),
  };
}

function emitToProject(req, project, event, payload) {
  req.app.get("io")?.to(`project:${project.id}`).emit(event, payload);
}

router.get("/:slug", async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const { project, allowed, canManageGroup } = await findProjectAccess(req.params.slug, req.firebaseUser.uid);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!allowed) return res.status(403).json({ error: "You do not have access to this project." });
    res.json({ project: {
      id: project.id, slug: project.slug, name: project.name,
      description: project.description, repository: project.githubRepository,
      owner: project.owner.displayName || project.owner.firebaseUid,
      canManageGroup,
    } });
  } catch (error) {
    console.error("Could not load project:", error.message);
    res.status(500).json({ error: "Could not load this project." });
  }
});

router.get("/:slug/messages", async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const project = await accessibleProject(req, res);
    if (!project) return;
    const messages = await ChatMessage.find({ project: project._id }).sort({ createdAt: 1 }).limit(500);
    res.json({ messages: messages.map((message) => messageResponse(message, req.firebaseUser.uid)) });
  } catch (error) {
    console.error("Could not load project chat:", error.message);
    res.status(500).json({ error: "Could not load project messages." });
  }
});

router.post("/:slug/messages", async (req, res) => {
  if (!ensureDatabase(res)) return;
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  const rawAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
  if (!body && !rawAttachments.length) return res.status(400).json({ error: "Write a message or attach a file." });
  if (body.length > 10000 || rawAttachments.length > 5) return res.status(400).json({ error: "Messages can contain up to 10,000 characters and five attachments." });
  const attachments = rawAttachments.map((attachment) => ({
    name: typeof attachment?.name === "string" ? attachment.name.trim().slice(0, 255) : "",
    preview: typeof attachment?.preview === "string" && /^data:image\/(png|jpeg|gif|webp);base64,/.test(attachment.preview) && attachment.preview.length <= 600000
      ? attachment.preview : "",
  }));
  if (attachments.some((attachment) => !attachment.name)) return res.status(400).json({ error: "Each attachment needs a file name." });
  try {
    const project = await accessibleProject(req, res);
    if (!project) return;
    const message = await ChatMessage.create({
      project: project._id,
      authorUid: req.firebaseUser.uid,
      authorName: req.firebaseUser.name || "GitHub user",
      authorPhoto: req.firebaseUser.picture || "",
      body,
      attachments,
      replyTo: req.body?.replyTo && typeof req.body.replyTo === "object" ? {
        id: String(req.body.replyTo.id || "").slice(0, 80),
        author: String(req.body.replyTo.author || "").slice(0, 120),
        snippet: String(req.body.replyTo.snippet || "").slice(0, 120),
      } : undefined,
    });
    emitToProject(req, project, "chat:message-created", messageResponse(message));
    res.status(201).json({ message: messageResponse(message, req.firebaseUser.uid) });
  } catch (error) {
    console.error("Could not send project message:", error.message);
    res.status(500).json({ error: "Could not send your message." });
  }
});

router.put("/:slug/messages/:messageId", async (req, res) => {
  if (!ensureDatabase(res)) return;
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body || body.length > 10000) return res.status(400).json({ error: "Write a message up to 10,000 characters." });
  try {
    const project = await accessibleProject(req, res);
    if (!project) return;
    const message = await ChatMessage.findOneAndUpdate(
      { _id: req.params.messageId, project: project._id, authorUid: req.firebaseUser.uid },
      { $set: { body, edited: true } }, { returnDocument: "after", runValidators: true },
    );
    if (!message) return res.status(404).json({ error: "Message not found or you cannot edit it." });
    emitToProject(req, project, "chat:message-updated", messageResponse(message));
    res.json({ message: messageResponse(message, req.firebaseUser.uid) });
  } catch (error) {
    console.error("Could not edit project message:", error.message);
    res.status(500).json({ error: "Could not edit that message." });
  }
});

router.delete("/:slug/messages/:messageId", async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const project = await accessibleProject(req, res);
    if (!project) return;
    const message = await ChatMessage.findOneAndDelete({
      _id: req.params.messageId, project: project._id, authorUid: req.firebaseUser.uid,
    });
    if (!message) return res.status(404).json({ error: "Message not found or you cannot delete it." });
    emitToProject(req, project, "chat:message-deleted", { id: message.id });
    res.sendStatus(204);
  } catch (error) {
    console.error("Could not delete project message:", error.message);
    res.status(500).json({ error: "Could not delete that message." });
  }
});

router.patch("/:slug/messages/:messageId/reactions", async (req, res) => {
  if (!ensureDatabase(res)) return;
  const emoji = typeof req.body?.emoji === "string" ? req.body.emoji : "";
  if (!["👍", "🎉", "👀", "❤️"].includes(emoji)) return res.status(400).json({ error: "Choose a supported reaction." });

  try {
    const project = await accessibleProject(req, res);
    if (!project) return;
    const message = await ChatMessage.findOne({ _id: req.params.messageId, project: project._id });
    if (!message) return res.status(404).json({ error: "Message not found." });

    let reaction = message.reactions.find((item) => item.emoji === emoji);
    if (!reaction) {
      reaction = { emoji, users: [] };
      message.reactions.push(reaction);
    }
    const index = reaction.users.indexOf(req.firebaseUser.uid);
    const active = index === -1;
    if (active) reaction.users.push(req.firebaseUser.uid);
    else reaction.users.splice(index, 1);
    if (reaction.users.length === 0) message.reactions = message.reactions.filter((item) => item.emoji !== emoji);
    const count = reaction.users.length;
    await message.save();

    const update = { id: message.id, emoji, count, active, userId: req.firebaseUser.uid };
    emitToProject(req, project, "chat:reaction-updated", update);
    res.json({ message: messageResponse(message, req.firebaseUser.uid) });
  } catch (error) {
    console.error("Could not update project reaction:", error.message);
    res.status(500).json({ error: "Could not update that reaction." });
  }
});

module.exports = router;
