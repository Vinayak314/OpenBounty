require("dotenv").config();

const express = require("express");
const http = require("node:http");
const path = require("node:path");
const { existsSync } = require("node:fs");
const mongoose = require("mongoose");
const { Server: SocketIOServer } = require("socket.io");
const meRouter = require("./routes/me");
const projectsRouter = require("./routes/projects");
const groupsRouter = require("./routes/groups");
const { getFirebaseAuth } = require("./config/firebaseAdmin");
const { findProjectAccess } = require("./services/projectAccess");

const app = express();
const httpServer = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;
const allowedOrigins = (process.env.CLIENT_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
const io = new SocketIOServer(httpServer, {
  cors: { origin: allowedOrigins.length ? allowedOrigins : false, methods: ["GET", "POST"] },
});

app.set("io", io);
// Behind a reverse proxy, set TRUST_PROXY (for example to 1) so per-visitor limits see the real client address.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set("trust proxy", Number.isInteger(hops) ? hops : process.env.TRUST_PROXY);
}

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (typeof token !== "string" || !token) return next(new Error("Firebase sign-in is required."));
  try {
    socket.data.firebaseUser = await getFirebaseAuth().verifyIdToken(token);
    next();
  } catch {
    next(new Error("Your sign-in has expired. Please sign in again."));
  }
});

io.on("connection", (socket) => {
  socket.on("project:join", async ({ slug } = {}, acknowledge = () => {}) => {
    if (mongoose.connection.readyState !== 1 || typeof slug !== "string") {
      return acknowledge({ ok: false, error: "Project chat is unavailable." });
    }
    try {
      const { project, allowed } = await findProjectAccess(slug, socket.data.firebaseUser.uid);
      if (!project || !allowed) return acknowledge({ ok: false, error: "You do not have access to this project chat." });

      if (socket.data.projectRoom) socket.leave(socket.data.projectRoom);
      socket.data.projectRoom = `project:${project.id}`;
      socket.data.projectSlug = project.slug;
      socket.join(socket.data.projectRoom);
      acknowledge({ ok: true });
    } catch (error) {
      console.error("Socket project join failed:", error.message);
      acknowledge({ ok: false, error: "Could not join this project chat." });
    }
  });

  socket.on("chat:typing", ({ isTyping } = {}) => {
    if (!socket.data.projectRoom) return;
    socket.to(socket.data.projectRoom).emit("chat:typing", {
      uid: socket.data.firebaseUser.uid,
      name: socket.data.firebaseUser.name || "A teammate",
      isTyping: Boolean(isTyping),
    });
  });
});

app.use("/api/webhooks/github", require("./routes/githubWebhooks"));
app.use(express.json({ limit: "5mb" }));
app.use((req, res, next) => {
  if (allowedOrigins.includes(req.headers.origin)) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.get("/api/health", (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ ready });
});
app.use("/api/me", meRouter);
// Bounty and payment routes are mounted first so their requests skip the generic project router.
const { bounties: bountiesRouter, payments: paymentsRouter } = require("./routes/bounties");
app.use("/api/projects/:slug/bounties", bountiesRouter);
app.use("/api/projects/:slug/payments", paymentsRouter);
app.use("/api/wallet", require("./routes/wallet"));
app.use("/api/projects", projectsRouter);
app.use("/api/groups", groupsRouter);
app.use("/api/demo/0g", require("./routes/reviewDemo"));
app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found." }));

if (process.env.SERVE_CLIENT === "true") {
  const client = path.join(__dirname, "../client/dist");
  app.use(express.static(client));
  app.get("/{*path}", (_req, res) => res.sendFile(path.join(client, "index.html")));
} else {
  app.get("/", (_req, res) => res.send("OpenBounty API"));
}

async function start() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing. Add it to server/.env.");
  }
  if (process.env.SERVE_CLIENT === "true" && !existsSync(path.join(__dirname, "../client/dist/index.html"))) {
    throw new Error("Build the client before setting SERVE_CLIENT=true.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  httpServer.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  // Payments: workflow notices go to project chats; the indexer mirrors escrow events into MongoDB.
  require("./services/bounties/notify").setIo(io);
  await require("./services/ai/orchestrator").recoverJobs();
  try {
    const { getChainConfig } = require("./config/chain");
    const config = getChainConfig();
    if (config.escrow) require("./services/chain/indexer").start();
    console.log(config.enabled ? `Payments enabled on ${config.networkName} (escrow ${config.escrow}).` : "Payments disabled: set ESCROW_ADDRESS, ACCOUNT_FACTORY_ADDRESS, SPONSOR_PRIVATE_KEY and ATTESTATION_PRIVATE_KEY.");
  } catch (error) {
    console.error("Payments could not start:", error.message);
  }
}

start().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
