require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const meRouter = require("./routes/me");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  const allowedOrigins = (process.env.CLIENT_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
  if (allowedOrigins.includes(req.headers.origin)) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.get("/", (_req, res) => res.send("OpenBounty API"));
app.use("/api/me", meRouter);

async function start() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing. Add it to server/.env.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

start().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
