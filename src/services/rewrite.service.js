const fs = require("fs/promises");
const path = require("path");
const cheerio = require("cheerio");
const { normalizeUrl } = require("../utils/url.util");

const URL_ATTRS = ["src", "href", "poster", "data-src", "srcset"];

function relativeTo(fromFile, toFile) {
  const rel = path.relative(path.dirname(fromFile), toFile);
  return rel.split(path.sep).join("/") || ".";
}

function resolveMappedTarget(value, currentPageUrl, currentOutputPath, assetMap, pageMap) {
  const resolved = normalizeUrl(value, currentPageUrl);
  if (!resolved) return null;

  const assetRecord = assetMap.get(resolved);
  if (assetRecord) {
    return relativeTo(currentOutputPath, assetRecord.localPath);
  }

  const pagePath = pageMap.get(resolved);
  if (pagePath) {
    return relativeTo(currentOutputPath, pagePath);
  }

  return null;
}

function rewriteSrcSet(srcset, currentPageUrl, currentOutputPath, assetMap, pageMap) {
  const entries = srcset.split(",").map((raw) => raw.trim()).filter(Boolean);
  const rewritten = entries.map((entry) => {
    const parts = entry.split(/\s+/);
    const candidate = parts[0];
    const mapped = resolveMappedTarget(candidate, currentPageUrl, currentOutputPath, assetMap, pageMap);
    if (mapped) {
      parts[0] = mapped;
    }
    return parts.join(" ");
  });
  return rewritten.join(", ");
}

function rewriteCssContent(cssText, fileLocalPath, sourceUrl, assetMap) {
  let rewritten = cssText.replace(/url\(([^)]+)\)/gi, (full, group) => {
    const raw = group.trim().replace(/^['"]|['"]$/g, "");
    if (!raw || raw.startsWith("data:")) {
      return full;
    }

    const absoluteCandidate = normalizeUrl(raw, sourceUrl);
    const mapped = (absoluteCandidate && assetMap.get(absoluteCandidate)) || assetMap.get(raw);
    if (!mapped) {
      return full;
    }

    const relative = relativeTo(fileLocalPath, mapped.localPath);
    return `url('${relative}')`;
  });

  rewritten = rewritten.replace(/@import\s+(?:url\()?['"]?([^'")]+)['"]?\)?/gi, (full, raw) => {
    if (!raw || raw.startsWith("data:")) {
      return full;
    }

    const absoluteCandidate = normalizeUrl(raw, sourceUrl);
    const mapped = (absoluteCandidate && assetMap.get(absoluteCandidate)) || assetMap.get(raw);
    if (!mapped) {
      return full;
    }

    const relative = relativeTo(fileLocalPath, mapped.localPath);
    return `@import url('${relative}')`;
  });

  return rewritten;
}

async function inlineLocalStylesheets($, currentPageUrl, currentOutputPath, buildDir, assetMap, pageMap) {
  const stylesheetLinks = $("link[rel='stylesheet'][href], link[as='style'][href]");
  const pageAbsolutePath = path.join(buildDir, currentOutputPath);

  for (const el of stylesheetLinks.toArray()) {
    const href = $(el).attr("href");
    if (!href) {
      continue;
    }

    const mapped = resolveMappedTarget(href, currentPageUrl, currentOutputPath, assetMap, pageMap);
    if (!mapped || !mapped.endsWith(".css")) {
      continue;
    }

    const absoluteCssPath = path.resolve(path.dirname(pageAbsolutePath), mapped);
    let cssText;
    try {
      cssText = await fs.readFile(absoluteCssPath, "utf8");
    } catch {
      continue;
    }

    $(el).replaceWith(`<style data-clonex-inline="true">\n${cssText}\n</style>`);
  }
}

function rewriteInlineStyleTags($, currentPageUrl, currentOutputPath, assetMap) {
  $("style").each((_, el) => {
    const cssText = $(el).html();
    if (!cssText || $(el).attr("data-clonex-inline") === "true" || $(el).attr("data-clonex-runtime") === "true") {
      return;
    }

    const rewritten = rewriteCssContent(cssText, currentOutputPath, currentPageUrl, assetMap);
    $(el).text(rewritten);
  });
}

function injectRuntimeStyles($, runtimeCss, currentPageUrl, currentOutputPath, assetMap) {
  if (!runtimeCss || !runtimeCss.trim()) {
    return;
  }

  const head = $("head");
  if (head.length === 0) {
    return;
  }

  const rewritten = rewriteCssContent(runtimeCss, currentOutputPath, currentPageUrl, assetMap);
  head.append(`<style data-clonex-runtime="true">\n${rewritten}\n</style>`);
}

async function rewriteAll({ buildDir, pages, assetMap, pageMap }) {
  for (const record of assetMap.values()) {
    if (!record.localPath.endsWith(".css") && !record.contentType.includes("css")) {
      continue;
    }

    const cssPath = path.join(buildDir, record.localPath);
    const css = await fs.readFile(cssPath, "utf8");
    const rewrittenCss = rewriteCssContent(css, record.localPath, record.url, assetMap);
    await fs.writeFile(cssPath, rewrittenCss, "utf8");
  }

  for (const record of assetMap.values()) {
    if (!record.localPath.endsWith(".js") && !record.contentType.includes("javascript")) {
      continue;
    }

    const jsPath = path.join(buildDir, record.localPath);
    let js = await fs.readFile(jsPath, "utf8");

    for (const [remote, mapped] of assetMap.entries()) {
      if (js.includes(remote)) {
        const rel = relativeTo(record.localPath, mapped.localPath);
        js = js.split(remote).join(rel);
      }
    }

    await fs.writeFile(jsPath, js, "utf8");
  }

  for (const page of pages) {
    const fullPagePath = path.join(buildDir, page.outputPath);
    let html = await fs.readFile(fullPagePath, "utf8");

    const $ = cheerio.load(html);

    URL_ATTRS.forEach((attr) => {
      $(`[${attr}]`).each((_, el) => {
        const value = $(el).attr(attr);
        if (!value || value.startsWith("data:")) {
          return;
        }

        if (attr === "srcset") {
          const rewritten = rewriteSrcSet(value, page.url, page.outputPath, assetMap, pageMap);
          $(el).attr(attr, rewritten);
          return;
        }

        const mapped = resolveMappedTarget(value, page.url, page.outputPath, assetMap, pageMap);
        if (mapped) {
          $(el).attr(attr, mapped);
        }
      });
    });

    await inlineLocalStylesheets($, page.url, page.outputPath, buildDir, assetMap, pageMap);
    rewriteInlineStyleTags($, page.url, page.outputPath, assetMap);
    injectRuntimeStyles($, page.runtimeCss, page.url, page.outputPath, assetMap);

    html = $.html();
    await fs.writeFile(fullPagePath, html, "utf8");
  }
}

module.exports = {
  rewriteAll,
};
