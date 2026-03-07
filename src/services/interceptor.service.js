async function interceptNetwork(page, saveAsset) {
  page.on("response", async (response) => {
    try {
      const url = response.url();
      const status = response.status();
      if (status >= 400) {
        return;
      }

      const headers = response.headers();
      const contentType = headers["content-type"] || "";
      const buffer = await response.body();
      await saveAsset(url, buffer, contentType);
    } catch {
      // Best effort capture.
    }
  });
}

module.exports = {
  interceptNetwork,
};
