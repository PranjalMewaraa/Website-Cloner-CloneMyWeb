const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

async function zipDirectory(sourceDir, outPath) {
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      resolve({ outPath, bytes: archive.pointer() });
    });

    archive.on("error", (err) => reject(err));
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

module.exports = {
  zipDirectory,
};
