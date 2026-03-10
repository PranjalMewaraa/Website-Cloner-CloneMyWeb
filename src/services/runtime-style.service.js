async function collectRuntimeStyles(page) {
  return page.evaluate(() => {
    const chunks = [];

    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }

      if (!rules || rules.length === 0) {
        continue;
      }

      const text = Array.from(rules)
        .map((rule) => rule.cssText)
        .filter(Boolean)
        .join("\n");

      if (text) {
        chunks.push(text);
      }
    }

    return chunks.join("\n\n");
  });
}

module.exports = {
  collectRuntimeStyles,
};
