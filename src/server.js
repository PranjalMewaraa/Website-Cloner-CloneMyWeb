const express = require("express");
const path = require("path");
const { createCloneJob, getCloneJob, downloadCloneJob, directDownloadClone } = require("./controllers/clone.controller");
const { getQueueMode, REDIS_URL } = require("./queues/clone.queue");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(process.cwd(), "public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "web-cloner-v2" });
});
app.get("/config", (_req, res) => {
  res.json({ queueMode: getQueueMode(), redisUrl: REDIS_URL });
});

app.post("/clone", createCloneJob);
app.post("/clone/direct-download", directDownloadClone);
app.get("/clone/:id", getCloneJob);
app.get("/clone/:id/download", downloadCloneJob);
app.get("/", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
});
