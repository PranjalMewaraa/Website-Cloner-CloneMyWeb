const { addCloneJob, getCloneJobById, getQueueMode } = require("../queues/clone.queue");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { cloneSite, getJobTempDir } = require("../workers/clone.worker");

async function createCloneJob(req, res) {
  const { url, maxPages = 20, maxDepth = 3 } = req.body || {};

  if (!url) {
    return res.status(400).json({ error: "url is required" });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "invalid url" });
  }

  try {
    const job = await addCloneJob({ url, maxPages, maxDepth, createdAt: Date.now() });
    return res.status(202).json({
      jobId: job.id,
      status: "queued",
      mode: getQueueMode(),
      poll: `/clone/${job.id}`,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getCloneJob(req, res) {
  const { id } = req.params;
  const job = await getCloneJobById(id);

  if (!job) {
    return res.status(404).json({ error: "job not found" });
  }

  const response = {
    id: job.id,
    state: job.state,
    progress: job.progress,
    data: job.data,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
  };

  if (job.state === "completed" && job.returnvalue?.zipPath) {
    response.downloadUrl = `/clone/${job.id}/download`;
  }

  return res.json(response);
}

async function downloadCloneJob(req, res) {
  const { id } = req.params;
  const job = await getCloneJobById(id);

  if (!job) {
    return res.status(404).json({ error: "job not found" });
  }

  if (job.state !== "completed" || !job.returnvalue?.zipPath) {
    return res.status(409).json({ error: "job is not completed yet" });
  }

  const zipPath = path.resolve(job.returnvalue.zipPath);
  const downloadsRoot = path.resolve(path.join(process.cwd(), "downloads"));

  if (!zipPath.startsWith(downloadsRoot + path.sep) && zipPath !== downloadsRoot) {
    return res.status(403).json({ error: "invalid download path" });
  }

  try {
    await fs.access(zipPath);
    return res.download(zipPath, `clone-${id}.zip`);
  } catch {
    return res.status(404).json({ error: "zip file not found" });
  }
}

async function directDownloadClone(req, res) {
  const { url, maxPages = 20, maxDepth = 3 } = req.body || {};

  if (!url) {
    return res.status(400).json({ error: "url is required" });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "invalid url" });
  }

  const id = `direct-${crypto.randomUUID()}`;
  const zipPath = path.join(os.tmpdir(), `webcloner-${id}.zip`);
  const tempJobDir = getJobTempDir(id);

  const cleanup = async () => {
    await Promise.all([
      fs.rm(zipPath, { force: true }),
      fs.rm(tempJobDir, { recursive: true, force: true }),
    ]);
  };

  try {
    await cloneSite({
      id,
      data: { url, maxPages, maxDepth, __zipPath: zipPath },
      async updateProgress() {
        // Direct mode returns ZIP immediately, no polling.
      },
    });

    return res.download(zipPath, `clone-${Date.now()}.zip`, () => {
      cleanup().catch(() => {});
    });
  } catch (error) {
    await cleanup().catch(() => {});
    return res.status(500).json({ error: error.message || "clone failed" });
  }
}

module.exports = {
  createCloneJob,
  getCloneJob,
  downloadCloneJob,
  directDownloadClone,
};
