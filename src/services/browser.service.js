const { chromium } = require("playwright");

let browserPromise;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

async function createPage() {
  let browser;
  try {
    browser = await getBrowser();
  } catch (error) {
    if (String(error.message || "").includes("Executable doesn't exist")) {
      error.message = `${error.message}\nRun: npx playwright install chromium`;
    }
    throw error;
  }
  const context = await browser.newContext({ bypassCSP: true });
  const page = await context.newPage();
  return { browser, context, page };
}

async function closeContext(context) {
  if (context) {
    await context.close();
  }
}

async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}

module.exports = {
  getBrowser,
  createPage,
  closeContext,
  closeBrowser,
};
