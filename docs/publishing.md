# Publishing articles

## Create a post with a persistent address

Articles live under `content/blog/`. Keep the body as Markdown and provide explicit metadata:

```yaml
---
title: A useful article title
description: A short description for readers and previews.
date: 2026-11-02
tags:
  - Software engineering
permalink: /blog/a-useful-article/
draft: true
---
```

Published articles require a nonempty title and description, an explicit valid date, a tag array, and a valid stable permalink. Write dates as plain `YYYY-MM-DD` values or quoted ISO timestamps; implicit or tagged YAML timestamp values are rejected to prevent calendar rollovers. A date inferred from the filename or filesystem does not meet this contract. Use a boolean `draft`, not the string `"false"`. Validation failures name the source and field. Incomplete draft prose is allowed; malformed publication controls or supplied optional fields are errors even in drafts.

The permalink is the article's persistent public identity. Changing the filename, its capitalization, or the title must not change this URL. Existing articles retain their current addresses, including `/blog/WWDC-Apples-AI-device-strategy/`. If a public URL must change deliberately, preserve the old incoming address through an explicit redirect or compatibility page and test both routes. Source-file URLs and public permalinks are separate identifiers.

Optional fields are `updated` (a valid date), `canonicalUrl` (a valid canonical URL), and `socialImage` (an explicit image URL or site-local image path). Supplying an optional field requires a valid value. Utility pages such as the feed, sitemap, and 404 do not require article metadata.

Tag labels keep their display casing; tag routes use the shared lowercase, hyphenated URL rule with a trailing slash. For example, `Software engineering` links to `/tags/software-engineering/`. Avoid changing an established tag label just to fix a link.

## Headings and footnotes

The article layout renders the front-matter title as the page's H1. Start body sections with `##` (H2), using `###` (H3) for subsections; avoid skipping levels. Listing templates choose H2 or H3 according to their surrounding section. The output checker rejects missing/duplicate page H1s, skipped heading levels, duplicate IDs, and broken local fragment links. Preserve established heading wording or provide compatible anchors when changing a published fragment.

Use ordinary Markdown footnotes such as `[^source]` with a matching definition. The renderer gives references and return links meaningful names and keeps separate return targets for repeated references. Footnotes remain native links that work without a navigation library. See [reader checks](reader-checks.md) for the tested behavior and limits.

## Dates, drafts, and withdrawal

A valid future date does **not** schedule publication. A non-draft future-dated article still publishes, and validation warns about the date. Keep `draft: true` until the article should be public.

`npm start` is a local development preview and can render draft content. Ordinary Eleventy builds and production commands exclude draft article HTML. A folder name alone does not establish draft status: use the boolean field or an explicit inherited directory-data setting.

`npm run build` cleans `_site` before generating the production artifact. Changing a formerly published article to `draft: true`, or deleting it, removes its HTML from the next clean output, listings, feed, and sitemap. The old route will no longer exist after deployment. If an explanation or redirect is desired, create it deliberately instead of relying on stale HTML. Incremental previews may retain old files; use `npm run build:html` for a clean preview artifact. Directly invoking Eleventy is not the clean production build command.

Social cards are generated build artifacts under `_site/og-images/`. The current validated published-post collection determines which cards are copied into the output. Withholding or deleting an article removes its generated card on the next production build, even if its old cached image remains under `.cache/social-cards/`. This policy applies to generated cards; separately supplied images under `public/` retain their own source-file lifecycle.

## What becomes public

`content/` is publishable source. `.eleventyignore` explicitly excludes the Copilot helper tree (`content/copilot/`), Obsidian configuration directories, and editor trash. Those files must not produce pages, feed items, sitemap entries, or navigation links. Keep other private notes outside `content/` unless an explicit, tested publication exclusion protects them.

Git ignores control version tracking; Eleventy exclusions control publishing. Being untracked or absent from navigation does not make a file private. `eleventyExcludeFromCollections` alone is also insufficient: it can hide a page from lists while still generating HTML.

## Social previews and verification

Articles opt into generated cards with an explicit `socialImage` path under `/og-images/`, for example `/og-images/a-useful-article.png`. The full production build generates those paths from the same validated published collection used by the site, including nested articles and inherited draft settings. Keep an existing card path stable when renaming a source file. Other local paths and external HTTPS images are supplied separately; pages without an assigned card use `/img/share-img.png`. Open Graph and Twitter derive their image URL from the same value, and an explicit local image must exist in the finished output.

Fast HTML builds and development previews use `/img/share-img.png` for generated-card references. They do not launch a browser or require old committed cards. See [social-card generation](social-cards.md) for cache invalidation, local font provenance, and renderer checks.

The output check verifies social-image files and local page links. Required article-body images and external asset failures remain tracked in [#33](https://github.com/danmunz/website/issues/33). `canonicalUrl` is validated when supplied, but rendering complete canonical metadata remains [#34](https://github.com/danmunz/website/issues/34).

Before submitting changes, run `npm test`, `npm run build`, and `npm run check:site` on Node 24. Tests use disposable synthetic content rather than private local writing. Default tests do not launch a browser; Linux PR checks additionally run `npm run test:cards` for real rendering, then a complete production build. Transition fixtures cover withdrawal, rename, deletion, and case-sensitive route preservation. See [deployment and recovery](deployment.md) for the checked-artifact publishing process.

No Webmentions credentials are required to build or preview. With a configured nonempty `WEBMENTION_IO_TOKEN`, the existing integration runs as before. Optional credential support does not settle the separate decision about retaining Webmentions.

These checks cover the initial publishing-correctness changes. Broader delivery checks, complete authoring-workflow documentation, and a replacement for the historical implementation spec remain in the backlog.
