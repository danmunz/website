# Fonts, styles, and images

The asset pipeline preserves the site's four typography roles and reading layout. It uses Eleventy's existing CSS bundle and image transform rather than a separate optimizer framework.

## Shared styles

Shared styles are delivered as a content-hashed external stylesheet. The URL stays stable while its contents are unchanged and changes when those contents change. This adds one cold stylesheet request but lets browsers reuse the stylesheet across articles. The small syntax theme remains shared: detecting the few pages that need it would add more machinery than its size warrants. Page-specific CSS still participates in Eleventy's bundle.

Source CSS is no longer copied wholesale into the published output. Edit the source stylesheet normally; the build produces the linked asset. Obsolete commented template includes are removed because HTML comments do not prevent template evaluation.

## Fonts

The site retains Bricolage Grotesque for body text, Oswald for display headings, IBM Plex Serif for quotations, and DM Mono for code. Font files are served locally with `font-display: swap` and readable fallbacks. The retained selection is documented in [`_config/fonts.js`](../_config/fonts.js):

| Role | Published faces |
| --- | --- |
| Oswald headings | 400 and 500 normal |
| Bricolage body | One full-axis variable normal face: optical size 12–96, width 75–100, weight 200–800 |
| IBM Plex Serif quotations | 400, 600, and 700 normal/italic |
| DM Mono code | 300, 400, and 500 normal/italic |

These are Latin WOFF2 files from pinned 5.3.0 packages. The bundle retains each package's Latin Unicode range; other characters use the existing fallbacks. Bricolage has no native italic, so emphasis retains browser synthesis. DM Mono's requested 600 token weight maps to its available 500, as before. Quote emphasis and bold faces remain available without synthesizing them. The selected font files publish under versioned `/fonts/5.3.0/` paths; four SIL Open Font License notices publish under `/fonts/licenses/`.

Adding a new weight, style, or character range requires updating that selection and checking the rendered result. The quotation aesthetic remains a separate editorial decision in issue #5.

Social cards continue to embed their existing pinned local 400-normal Oswald and Bricolage Grotesque files. They do not need the quotation or code faces. See [social cards](social-cards.md) for cache fingerprints and rendering behavior.

## Responsive article images

The image transform offers 320, 640, 960, and 1280px candidates, capped to each source's dimensions. It retains AVIF/WebP and a source-compatible fallback, intrinsic dimensions, lazy loading, and asynchronous decoding. The `sizes` hint matches the reading column: the smaller of 38rem and the viewport minus 2rem. Explicit image attributes can override defaults when a different layout needs them. A remote WebP can be represented by one image element with a multi-width `srcset`; a picture wrapper is not required for responsive selection.

The default share image keeps its PNG URL and 1200×630 dimensions. Palette quantization reduced it from 1,427,474 to 551,825 bytes (61.34%). This is a lossy color-palette reduction, visually reviewed against the original; it is not pixel-identical recompression. The one-off Sharp recipe was `png({ compressionLevel: 9, palette: true, colours: 256, dither: 0.5, effort: 10 })`, with no resize or crop. Its optimization is separate from normal page-image traffic: social metadata does not itself make a browser download the share image during a homepage visit.

## Verification and measurement

`npm test` exercises generated asset contracts without launching a browser. `npm run test:assets` is an explicit Linux-CI check of production font loading, CSS reuse, responsive image selection, and readable font failure. It records its baseline commit, browser, viewport/DPR, requests, response/cache evidence, and selected image URLs under `.cache/asset-evidence/`. This directory is not published.

The asset check does not inject substitute fonts. The separate reader check deliberately normalizes selected fonts for visual comparison; those screenshots cannot establish production font-loading behavior. Baseline Google Fonts requests are selectively allowed by the asset check, while unrelated third-party requests are blocked. If baseline font loading fails, the report marks that comparison unavailable rather than claiming zero bytes as a saving.

Keep these quantities separate when reviewing the report: source file sizes, gzip estimates, browser encoded transfer bytes, and cached responses. The loopback server's documented cache/compression behavior is a reproducible test condition, not a claim about every visitor's connection or the hosting provider. No Core Web Vitals improvement is inferred from asset sizes alone. Inspect screenshots and actual image selection as well as pass/fail results before merge.
