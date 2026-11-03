import { rm } from "node:fs/promises";

// Match eleventy.config.js. Resolve from this script, never an arbitrary cwd or
// user-supplied path. Hand-authored source assets stay intact.
await rm(new URL("../_site/", import.meta.url), { recursive: true, force: true });
// A standalone generator cannot reuse a manifest after its matching output was cleaned.
await rm(new URL("../.cache/social-card-manifest.json", import.meta.url), { force: true });
