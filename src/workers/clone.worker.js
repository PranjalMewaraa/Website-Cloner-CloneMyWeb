const fs = require("fs/promises");
const path = require("path");
const { Worker } = require("bullmq");
const { QUEUE_NAME, connection, getQueueMode } = require("../queues/clone.queue");
const { createPage, closeContext } = require("../services/browser.service");
const { interceptNetwork } = require("../services/interceptor.service");
const { createAssetManager } = require("../services/asset.service");
const { crawlInternalPages } = require("../services/crawler.service");
const { rewriteAll } = require("../services/rewrite.service");
const { zipDirectory } = require("../services/zip.service");
const { getPageOutputPath, normalizeUrl } = require("../utils/url.util");

const ROOT_DIR = process.cwd();
const TEMP_DIR = path.join(ROOT_DIR, "temp");
const DOWNLOAD_DIR = path.join(ROOT_DIR, "downloads");

function getJobTempDir(jobId) {
  return path.join(TEMP_DIR, String(jobId));
}

async function cloneSite(job) {
  const { url, maxPages = 20, maxDepth = 3, __zipPath } = job.data;
  const rootUrl = normalizeUrl(url);
  if (!rootUrl) {
    throw new Error("Invalid start URL");
  }

  const jobDir = getJobTempDir(job.id);
  await fs.mkdir(jobDir, { recursive: true });

  const assetManager = createAssetManager(jobDir);
  await assetManager.initialize();

  const pages = [];
  const pageMap = new Map();

  await job.updateProgress({ stage: "crawl:start", pages: 0 });

  await crawlInternalPages({
    startUrl: rootUrl,
    maxPages,
    maxDepth,
    visit: async (pageUrl, depth) => {
      const { context, page } = await createPage();
      try {
        await interceptNetwork(page, assetManager.saveAsset);

        await page.goto(pageUrl, {
          waitUntil: "networkidle",
          timeout: Number(process.env.PAGE_TIMEOUT_MS || 45000),
        });

        const html = await page.content();
        const outputPath = getPageOutputPath(pageUrl, rootUrl);
        await assetManager.writeFileRelative(outputPath, html);

        pages.push({ url: pageUrl, outputPath, depth });
        pageMap.set(pageUrl, outputPath);

        await job.updateProgress({
          stage: "crawl:progress",
          pages: pages.length,
          current: pageUrl,
        });

        return { html };
      } finally {
        await closeContext(context);
      }
    },
  });

  await job.updateProgress({ stage: "rewrite:start", pages: pages.length });
  await rewriteAll({
    buildDir: assetManager.buildPath(),
    pages,
    assetMap: assetManager.getMap(),
    pageMap,
  });

  await assetManager.flushManifest();

  const zipPath = __zipPath || path.join(DOWNLOAD_DIR, `${job.id}.zip`);
  const zipInfo = await zipDirectory(assetManager.buildPath(), zipPath);

  await job.updateProgress({ stage: "complete", zip: zipPath, pages: pages.length });

  return {
    jobId: job.id,
    rootUrl,
    pages: pages.length,
    zipPath: zipInfo.outPath,
    bytes: zipInfo.bytes,
  };
}

function startWorker() {
  if (getQueueMode() !== "redis") {
    throw new Error("Worker is only required in QUEUE_MODE=redis");
  }

  const worker = new Worker(QUEUE_NAME, cloneSite, {
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 2),
  });

  worker.on("completed", (job) => {
    console.log(`[clone.worker] completed job ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[clone.worker] failed job ${job?.id}:`, err.message);
  });

  return worker;
}

if (require.main === module) {
  if (getQueueMode() !== "redis") {
    console.log("[clone.worker] QUEUE_MODE=local, worker not started");
    process.exit(0);
  }

  startWorker();
  console.log("[clone.worker] worker started (redis mode)");
}

module.exports = {
  cloneSite,
  startWorker,
  getJobTempDir,
};
