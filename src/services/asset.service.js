const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const {
  hashUrl,
  classifyContentType,
  inferExtension,
} = require("../utils/url.util");

const WRITE_CONCURRENCY = Number(process.env.ASSET_WRITE_CONCURRENCY || 10);

function createLimiter(concurrency) {
  let activeCount = 0;
  const queue = [];

  const runNext = () => {
    if (activeCount >= concurrency || queue.length === 0) {
      return;
    }

    activeCount += 1;
    const { task, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        activeCount -= 1;
        runNext();
      });
  };

  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      runNext();
    });
}

function createAssetManager(jobDir) {
  const buildDir = path.join(jobDir, "site-export");
  const map = new Map();
  const writeLimit = createLimiter(WRITE_CONCURRENCY);

  async function ensureDir(dir) {
    await fsp.mkdir(dir, { recursive: true });
  }

  async function initialize() {
    await Promise.all([
      ensureDir(buildDir),
      ensureDir(path.join(buildDir, "css")),
      ensureDir(path.join(buildDir, "js")),
      ensureDir(path.join(buildDir, "images")),
      ensureDir(path.join(buildDir, "fonts")),
      ensureDir(path.join(buildDir, "api")),
      ensureDir(path.join(buildDir, "misc")),
    ]);
  }

  async function saveAsset(url, buffer, contentType) {
    if (!url || !buffer || buffer.length === 0) {
      return null;
    }

    if (map.has(url)) {
      return map.get(url);
    }

    const folder = classifyContentType(contentType, url);
    if (folder === "html") {
      return null;
    }

    const ext = inferExtension(url, contentType);
    const filename = `${hashUrl(url)}${ext}`;
    const localPath = path.join(folder, filename);
    const absolutePath = path.join(buildDir, localPath);

    await writeLimit(async () => {
      await ensureDir(path.dirname(absolutePath));
      await fsp.writeFile(absolutePath, buffer);
    });

    const record = {
      url,
      localPath,
      absolutePath,
      contentType,
      size: buffer.length,
    };

    map.set(url, record);
    return record;
  }

  function getMap() {
    return map;
  }

  function getAssetByUrl(url) {
    return map.get(url) || null;
  }

  async function flushManifest() {
    const manifest = Array.from(map.values());
    const manifestPath = path.join(jobDir, "asset-manifest.json");
    await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    return manifestPath;
  }

  async function writeFileRelative(relativePath, content) {
    const absolute = path.join(buildDir, relativePath);
    await ensureDir(path.dirname(absolute));
    await fsp.writeFile(absolute, content);
    return absolute;
  }

  function readFileSync(relativePath) {
    return fs.readFileSync(path.join(buildDir, relativePath), "utf8");
  }

  function buildPath() {
    return buildDir;
  }

  return {
    initialize,
    saveAsset,
    getMap,
    getAssetByUrl,
    flushManifest,
    writeFileRelative,
    readFileSync,
    buildPath,
  };
}

module.exports = {
  createAssetManager,
};
