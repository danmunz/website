import { rm } from "node:fs/promises";

// Match eleventy.config.js. Resolve from this script, never an arbitrary cwd or
// user-supplied path. Committed source assets (including og-images) stay intact.
await rm(new URL("../_site/", import.meta.url), { recursive: true, force: true });
