const axios = require("axios");
const { normalizeUrl } = require("../utils/url.util");

async function collectStylesheetLinks(page, pageUrl) {
  const hrefs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("link[rel='stylesheet'][href]"))
      .map((node) => node.getAttribute("href"))
      .filter(Boolean);
  });

  const unique = new Set();
  for (const href of hrefs) {
    const normalized = normalizeUrl(href, pageUrl);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return Array.from(unique);
}

async function fetchMissingStylesheets(page, pageUrl, assetManager) {
  const stylesheetUrls = await collectStylesheetLinks(page, pageUrl);

  for (const stylesheetUrl of stylesheetUrls) {
    if (assetManager.getAssetByUrl(stylesheetUrl)) {
      continue;
    }

    try {
      const response = await axios.get(stylesheetUrl, {
        responseType: "arraybuffer",
        timeout: Number(process.env.STYLESHEET_FETCH_TIMEOUT_MS || 20000),
        headers: {
          "User-Agent": "CloneX/1.0",
          Accept: "text/css,*/*;q=0.1",
        },
      });

      const contentType = response.headers["content-type"] || "text/css";
      await assetManager.saveAsset(
        stylesheetUrl,
        Buffer.from(response.data),
        contentType
      );
    } catch {
      // Best effort fallback for stylesheet assets that were not seen by response interception.
    }
  }
}

module.exports = {
  fetchMissingStylesheets,
};
