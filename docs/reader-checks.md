# Reader accessibility checks

The site keeps its existing typography and editorial layout while testing specific reader contracts: meaningful heading structure, legible link colors, mobile article titles and metadata, native keyboard navigation, reduced motion, and usable print output. These checks do not establish complete WCAG conformance or replace testing with assistive technology.

## Local checks and publication rules

On Node 24, run `npm test`, `npm run build:html`, and `npm run check:site` for checks without a rendering browser. The finished-output checker validates one page H1, logical heading progression within main content, unique IDs, and local fragment destinations alongside routes, assets, and social metadata. Synthetic tests cover same-date posts, repeated footnotes, and the existing published article heading IDs.

Post-list entries use IDs derived from the complete public URL. Each listing also retains one alias for each old date-based ID, at the first matching post in display order. An old date fragment that previously had multiple matching posts continues to reach the first one; it cannot identify a particular same-day post. New links should use the stable URL-based ID.

## Linux browser evidence

`npm run test:reader` is an explicit Linux-CI command using the existing Puppeteer dependency and documented runner sandbox exception. It compares the commit supplied in `READER_BASELINE_REF` with current source in temporary snapshots, serves them on loopback, and closes its server/browser resources after use. PR checks select the PR base SHA; deployment checks select the pre-push SHA when available; manual runs fall back to the current commit. The script itself defaults to `HEAD` and records the resolved full baseline SHA in its report. It does not read private writing or publish test fixtures. Default `npm test` never launches this browser command.

The command records computed contrast and background colors, target geometry, keyboard skip/footnote behavior, title and opening-paragraph positions, horizontal overflow, reduced-motion styles, and print behavior. It captures matching baseline/current views at 320px, 375px, and desktop widths, plus print evidence. Artifacts stay under `.cache/reader-evidence/`, outside the published `_site` tree.

Both snapshots use the same locally packaged Oswald and Bricolage Grotesque font faces for repeatable comparisons; external requests are blocked. Other font families retain their system fallbacks. This normalizes the evidence environment and does not change production font delivery.

The enlarged-text check scales root text to 200%; it is a reflow approximation, not a browser zoom or screen-reader test. Browser privacy masks actual visited-link colors, so visited palette rules are tested through a declared-style surrogate rather than a history-state claim. Review the generated measurements and screenshots as well as the pass/fail result.

Current mobile title size and horizontal overflow are checked on every run. A strict before/after reduction in the historical article's title height and opening-paragraph position is required only when its wording is unchanged and the baseline uses a larger title size. An already-correct baseline or a subsequent editorial title change does not require perpetual shrinkage. Synthetic interaction fixtures are added only after matched real-page captures, so their tags and post counts do not distort comparison screenshots.

## Contrast, targets, and preferences

Normal text links must reach at least 4.5:1 on their actual composited surfaces; large text uses its applicable 3:1 threshold. Tags have component-specific colors so a global link selector cannot accidentally override them. Keyboard focus has an outline as well as color feedback. See [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Navigation, tags, and footnote return links are evaluated against the 24px target minimum or spacing exception. Inline footnote references remain within the prose line and use the inline exception. This avoids a blanket oversized control treatment for inline text. See [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Reduced-motion preferences suppress nonessential transitions. Print styles preserve the article and footnotes while removing navigation and decorative controls. Browser print output is evidence of that stylesheet's behavior, not a guarantee for every printer.

Copy controls (#3), image alternatives (#28), external widgets (#33), and the broader validation backlog (#23) remain separate work. When changing templates or CSS, rerun the affected browser checks and inspect representative captures before merge.
