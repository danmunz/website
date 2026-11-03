# Social-card generation

Production builds run clean output → Eleventy → card generation. Eleventy validates articles, applies directory data and draft rules, and supplies the same `posts` collection to page templates, feeds, and the card manifest. Nested articles work without a second Markdown scan. The fresh `.cache/social-card-manifest.json` records the checkout, output directory, article URL, title, source path, and explicit `socialImage` mapping. Cleanup and the start of each Eleventy build remove the previous manifest; failed builds cannot leave it eligible for generation.

`/og-images/` is reserved for generated PNG cards. Assign a stable path such as `socialImage: /og-images/my-article.png`; source renames do not change that mapping. Duplicate paths and unsafe destination names fail before generation. Supply hand-authored images under `/img/` or another source-owned path, or use an HTTPS image URL. Articles without a mapping use `/img/share-img.png`.

Generated PNGs belong in `_site/og-images/`, never in tracked source. Each generator invocation replaces this generated namespace with only the current manifest's cards. Drafts, deletions, and changed mappings cannot republish an old card merely because it remains cached. The migration removes the old tracked `og-images/` files and blanket passthrough rule. No writing or images in the original authoring checkout are modified.

## Fast authoring and production

`npm run build:html` and `npm start` do not launch Chromium. They resolve generated-card mappings to the real default social image; separately supplied local or external image references remain intact. The full build sets `SOCIAL_CARDS=generate` for Eleventy so metadata names the bespoke cards that the next stage creates. `npm run check:site` verifies the finished artifact. `npm run generate-og-images` requires the manifest and matching `_site` from a successful build in this checkout; it does not discover or validate Markdown independently.

## Cache and failure behavior

`.cache/social-cards/` contains reusable PNGs addressed by SHA-256. Fingerprints cover the title, template bytes, both font files and family names, viewport/fitting options, rendering implementation version, Puppeteer version, platform, and architecture. Renaming only the destination can reuse an unchanged rendering. Changes to rendering code that affect pixels must bump the `cards-v1` implementation version in the fingerprint.

A warm cache copies valid cards without launching Chromium. Cache files are accepted only after checking PNG dimensions, chunk boundaries/checksums, complete image data, and scanline filters. Incomplete or corrupt entries are regenerated. Cache misses share one browser. A cache entry is renamed into place only after a complete validated screenshot; failures remove temporary files and incomplete public card output, and close both the page and browser. Cache retention is independent from public publication eligibility. Actions may restore this cache, but must not restore the manifest or `_site`.

## Fonts, layout, and sandbox

The renderer embeds the Latin 400-normal WOFF2 assets from the pinned `@fontsource/oswald` and `@fontsource/bricolage-grotesque` packages. Both are distributed under the SIL Open Font License; the installed packages include their license texts. Font bytes are embedded into the temporary in-memory HTML, and browser requests to external resources are blocked. No Google Fonts request is needed. Rendering waits for both actual font faces to load, escapes the title as text, and reduces its font size within a bounded range to fit the 1200×630 card. Titles that still do not fit fail with an actionable error.

Chromium's sandbox stays enabled by default. `SOCIAL_CARDS_NO_SANDBOX=1` is permitted only with `CI=true`, for a trusted Linux runner whose sandbox setup has demonstrably prevented Chromium startup. The hosted Ubuntu workflows use this exception after the observed `No usable sandbox!` failure documented in the [deployment guide](deployment.md). It is scoped to CI rendering steps; do not set it for local authoring or expand the renderer to untrusted resources without reviewing the isolation policy.

`npm test` covers manifests, inherited drafts, stale output, cache invalidation/corruption, escaped HTML, and simulated renderer failures without launching a browser. `npm run test:cards` is restricted to Linux CI and exercises a real browser, local font readiness, an escaped long title, valid PNG dimensions, a warm cache with no second launch, and cleanup after an intentionally unrenderable title. It leaves an ignored `.cache/social-card-test-preview.png` for optional CI artifact inspection. Actual production cards are separately verified by the full build and output checker.
