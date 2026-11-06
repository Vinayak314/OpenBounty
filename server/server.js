require("dotenv").config();

const express = require("express");
const http = require("node:http");
const mongoose = require("mongoose");
const { Server: SocketIOServer } = require("socket.io");
const meRouter = require("./routes/me");
const projectsRouter = require("./routes/projects");
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
app.get("/", (_req, res) => res.send("OpenBounty API"));
app.use("/api/me", meRouter);
app.use("/api/projects", projectsRouter);

async function start() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing. Add it to server/.env.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  httpServer.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

start().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
