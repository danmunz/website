import assert from "node:assert/strict";
import test from "node:test";
import configure from "../eleventy.config.js";
import webmentionsPlugin from "eleventy-plugin-webmentions";

test("Webmentions registration is optional and preserves configured behavior", async () => {
  const original = process.env.WEBMENTION_IO_TOKEN;
  try {
    for (const token of [undefined, "", "  ", " synthetic-test-token "]) {
      if (token === undefined) delete process.env.WEBMENTION_IO_TOKEN;
      else process.env.WEBMENTION_IO_TOKEN = token;
      const plugins = [];
      const config = {
        addGlobalData() {}, addPreprocessor() {}, addBundle() {},
        addShortcode() {}, setLibrary() {},
        addPassthroughCopy() { return this; },
        addPlugin(plugin, options) { plugins.push({ plugin, options }); },
      };
      // Record registrations only: no plugin executes and no network is used.
      await configure(config);
      const registration = plugins.filter(entry => entry.plugin === webmentionsPlugin);
      if (token?.trim()) {
        assert.deepEqual(registration.map(entry => entry.options), [{ domain: "danmu.nz", token: "synthetic-test-token" }]);
      } else {
        assert.equal(registration.length, 0);
      }
    }
  } finally {
    if (original === undefined) delete process.env.WEBMENTION_IO_TOKEN;
    else process.env.WEBMENTION_IO_TOKEN = original;
  }
});
