const ChatMessage = require("../../models/ChatMessage");
const { AGENT_UID, messageResponse } = require("../chatSerializer");

let io = null;
const setIo = (value) => { io = value; };
const getIo = () => io;

/** Deterministic workflow notice in the project chat (no model call). */
async function postWorkflowNotice(projectId, body) {
  try {
    const message = await ChatMessage.create({
      project: projectId, authorUid: AGENT_UID, authorName: "Bounty agent", body,
      agent: { role: "payments", status: "ok" },
    });
    io?.to(`project:${projectId}`).emit("chat:message-created", messageResponse(message));
  } catch (error) {
    console.error("Could not post workflow notice:", error.message);
  }
}

function emitBounty(projectId, number) {
  io?.to(`project:${projectId}`).emit("bounty:updated", { number });
}

module.exports = { setIo, getIo, postWorkflowNotice, emitBounty };
