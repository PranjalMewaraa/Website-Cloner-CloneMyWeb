const crypto = require("crypto");

const QUEUE_NAME = "clone-jobs";
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const QUEUE_MODE = (process.env.QUEUE_MODE || "local").toLowerCase();

const connection = {
  url: REDIS_URL,
};

let cloneQueue = null;
if (QUEUE_MODE === "redis") {
  const { Queue } = require("bullmq");
  cloneQueue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  });
}

const localJobs = new Map();

function normalizeLocalJob(job) {
  return {
    id: job.id,
    state: job.state,
    progress: job.progress,
    data: job.data,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
  };
}

async function runLocalJob(job) {
  const { cloneSite } = require("../workers/clone.worker");

  try {
    job.state = "active";
    const result = await cloneSite({
      id: job.id,
      data: job.data,
      async updateProgress(progress) {
        job.progress = progress;
      },
    });

    job.returnvalue = result;
    job.state = "completed";
  } catch (error) {
    job.failedReason = error.message;
    job.state = "failed";
  }
}

async function addCloneJob(payload) {
  if (QUEUE_MODE === "redis") {
    return cloneQueue.add("clone", payload);
  }

  const id = crypto.randomUUID();
  const job = {
    id,
    data: payload,
    state: "queued",
    progress: { stage: "queued", pages: 0 },
    returnvalue: null,
    failedReason: null,
  };

  localJobs.set(id, job);
  setTimeout(() => {
    runLocalJob(job);
  }, 0);

  return { id };
}

async function getCloneJobById(id) {
  if (QUEUE_MODE === "redis") {
    const job = await cloneQueue.getJob(id);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    return {
      id: job.id,
      state,
      progress: job.progress,
      data: job.data,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
    };
  }

  const localJob = localJobs.get(id);
  if (!localJob) {
    return null;
  }

  return normalizeLocalJob(localJob);
}

function getQueueMode() {
  return QUEUE_MODE;
}

module.exports = {
  QUEUE_NAME,
  REDIS_URL,
  connection,
  cloneQueue,
  addCloneJob,
  getCloneJobById,
  getQueueMode,
};
