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

## Dates, drafts, and withdrawal

A valid future date does **not** schedule publication. A non-draft future-dated article still publishes, and validation warns about the date. Keep `draft: true` until the article should be public.

`npm start` is a local development preview and can render draft content. Ordinary Eleventy builds and production commands exclude draft article HTML. A folder name alone does not establish draft status: use the boolean field or an explicit inherited directory-data setting.

`npm run build` cleans `_site` before generating the production artifact. Changing a formerly published article to `draft: true`, or deleting it, removes its HTML from the next clean output, listings, feed, and sitemap. The old route will no longer exist after deployment. If an explanation or redirect is desired, create it deliberately instead of relying on stale HTML. Incremental previews may retain old files; use `npm run build:html` for a clean preview artifact. Directly invoking Eleventy is not the clean production build command.

This cleanup does not delete committed files from `og-images/`. Their separate lifecycle, including obsolete cards and root-level draft title cards produced by the old generator, remains tracked in [#22](https://github.com/danmunz/website/issues/22). Do not assume withholding an article also removes or withholds every generated asset.

## What becomes public

`content/` is publishable source. `.eleventyignore` explicitly excludes the Copilot helper tree (`content/copilot/`), Obsidian configuration directories, and editor trash. Those files must not produce pages, feed items, sitemap entries, or navigation links. Keep other private notes outside `content/` unless an explicit, tested publication exclusion protects them.

Git ignores control version tracking; Eleventy exclusions control publishing. Being untracked or absent from navigation does not make a file private. `eleventyExcludeFromCollections` alone is also insufficient: it can hide a page from lists while still generating HTML.

## Social previews and verification

Existing articles explicitly identify their social cards using `socialImage`; pages without an assigned card use `/img/share-img.png`. Open Graph and Twitter derive their image URL from the same value. An explicit local social-image reference must exist in the finished output. Do not assume a source slug implies a card exists, particularly for nested posts or source renames. The current generator's broader publication-aware redesign remains #22.

The output check verifies social-image files and local page links. Required article-body images and external asset failures remain tracked in [#33](https://github.com/danmunz/website/issues/33). `canonicalUrl` is validated when supplied, but rendering complete canonical metadata remains [#34](https://github.com/danmunz/website/issues/34).

Before submitting changes, run `npm test`, `npm run build`, and `npm run check:site`. Tests use disposable synthetic content rather than private local writing. Transition fixtures exercise repeated clean HTML builds without regenerating cards; the full build separately verifies the real Puppeteer generation path. Linux PR checks verify the case-sensitive filesystem behavior that macOS can conceal.

No Webmentions credentials are required to build or preview. With a configured nonempty `WEBMENTION_IO_TOKEN`, the existing integration runs as before. Optional credential support does not settle the separate decision about retaining Webmentions.

These checks cover the initial publishing-correctness changes. Broader delivery checks, complete authoring-workflow documentation, and a replacement for the historical implementation spec remain in the backlog.
