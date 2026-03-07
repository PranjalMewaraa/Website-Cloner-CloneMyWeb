const cheerio = require("cheerio");
const { normalizeUrl, isInternalUrl } = require("../utils/url.util");

function extractLinks(html, baseUrl, rootUrl) {
  const $ = cheerio.load(html);
  const links = new Set();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
      return;
    }

    const normalized = normalizeUrl(href, baseUrl);
    if (!normalized) {
      return;
    }

    if (isInternalUrl(normalized, rootUrl)) {
      links.add(normalized);
    }
  });

  return Array.from(links);
}

async function crawlInternalPages({
  startUrl,
  maxPages = 20,
  maxDepth = 3,
  visit,
}) {
  const queue = [{ url: startUrl, depth: 0 }];
  const visited = new Set();

  while (queue.length && visited.size < maxPages) {
    const current = queue.shift();
    if (!current || visited.has(current.url)) {
      continue;
    }

    visited.add(current.url);
    const result = await visit(current.url, current.depth);

    if (!result || !result.html || current.depth >= maxDepth) {
      continue;
    }

    const links = extractLinks(result.html, current.url, startUrl);
    for (const next of links) {
      if (!visited.has(next) && queue.length + visited.size < maxPages * 2) {
        queue.push({ url: next, depth: current.depth + 1 });
      }
    }
  }

  return Array.from(visited);
}

module.exports = {
  crawlInternalPages,
  extractLinks,
};
