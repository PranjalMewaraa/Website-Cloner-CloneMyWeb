const crypto = require("crypto");
const path = require("path");
const mime = require("mime-types");

function getUrlExtension(url) {
  try {
    return path.extname(new URL(url).pathname).toLowerCase();
  } catch {
    return "";
  }
}

function isFontExtension(ext) {
  return [".woff", ".woff2", ".ttf", ".otf", ".eot"].includes(ext);
}

function normalizeUrl(input, baseUrl) {
  try {
    const url = new URL(input, baseUrl);
    url.hash = "";
    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
      url.port = "";
    }
    return url.toString();
  } catch {
    return null;
  }
}

function isInternalUrl(targetUrl, rootUrl) {
  try {
    const a = new URL(targetUrl);
    const b = new URL(rootUrl);
    return a.origin === b.origin;
  } catch {
    return false;
  }
}

function hashUrl(url) {
  return crypto.createHash("sha1").update(url).digest("hex");
}

function classifyContentType(contentType = "", url = "") {
  const type = contentType.toLowerCase();
  const ext = getUrlExtension(url);
  if (type.includes("text/css")) return "css";
  if (type.includes("javascript") || type.includes("ecmascript")) return "js";
  if (type.includes("image/")) return "images";
  if (type.includes("font/") || type.includes("woff") || type.includes("ttf") || type.includes("otf") || isFontExtension(ext)) {
    return "fonts";
  }
  if (type.includes("application/json") || type.includes("text/json")) return "api";
  if (type.includes("text/html")) return "html";
  return "misc";
}

function inferExtension(url, contentType = "") {
  const urlExt = getUrlExtension(url);
  if (isFontExtension(urlExt)) return urlExt;

  const contentTypeValue = (contentType || "").split(";")[0].trim();
  const fromType = mime.extension(contentTypeValue);
  if (fromType && fromType !== "bin") return `.${fromType}`;

  if (urlExt) return urlExt;

  return ".bin";
}

function getPageOutputPath(url, rootUrl) {
  const current = new URL(url);
  const root = new URL(rootUrl);
  const pathname = current.pathname || "/";

  if (pathname === "/") {
    return "index.html";
  }

  const cleanPath = pathname.replace(/^\/+|\/+$/g, "");
  if (!cleanPath) {
    return "index.html";
  }

  const hasFileExtension = path.extname(cleanPath) !== "";
  const relative = hasFileExtension ? cleanPath : `${cleanPath}.html`;

  if (current.origin !== root.origin) {
    return path.join("external", relative);
  }

  return relative;
}

module.exports = {
  normalizeUrl,
  isInternalUrl,
  hashUrl,
  classifyContentType,
  inferExtension,
  getPageOutputPath,
};
