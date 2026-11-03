# danmu.nz

My personal website, built with [Eleventy](https://www.11ty.dev/).

## Develop and verify

Use Node 24 (the version in `.nvmrc`), install the locked dependencies with `npm ci`, then use `npm start` for an incremental local preview. The Webmentions integration is optional: builds and previews work without `WEBMENTION_IO_TOKEN`. If a nonempty token is configured, the existing integration remains enabled. Never commit credentials.

```sh
npm test          # Metadata, routing, artifact checks, and isolated publication fixtures
npm run build    # Clean _site, compile with Eleventy, then generate current social cards
npm run check:site
```

The full build uses Puppeteer and local fonts for current published articles, reusing unchanged cards from a content-addressed cache. Generated cards are build artifacts. `npm run build:html` and `npm start` use the default share image and do not launch the card renderer. Pull-request checks run the full build and real renderer tests on Linux.

Read [the publishing guide](docs/publishing.md) before adding, renaming, or withdrawing an article. See also [social-card generation](docs/social-cards.md), [dependency maintenance](docs/dependencies.md), and [deployment and recovery](docs/deployment.md). Older implementation notes in `docs/spec.md` are historical where they conflict with these guides. The wider authoring-workflow cleanup remains separate backlog work.
