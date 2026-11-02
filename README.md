# danmu.nz

My personal website, built with [Eleventy](https://www.11ty.dev/).

## Develop and verify

Install the locked dependencies with `npm ci`, then use `npm start` for an incremental local preview. The Webmentions integration is optional: builds and previews work without `WEBMENTION_IO_TOKEN`. If a nonempty token is configured, the existing integration remains enabled. Never commit credentials.

```sh
npm test          # Metadata, routing, artifact checks, and isolated publication fixtures
npm run build    # Clean _site, regenerate social cards, then compile with Eleventy
npm run check:site
```

The full build uses Puppeteer and its installed browser to regenerate the existing social cards. `npm run build:html` cleans and compiles HTML using the existing card files; it is useful for a quick check but does not verify card generation. Pull-request checks run the full build on Linux.

Read [the publishing guide](docs/publishing.md) before adding, renaming, or withdrawing an article. This is the current publication contract; older implementation notes in `docs/spec.md` are historical where they conflict with this guide. Runtime/dependency modernization and the wider authoring-workflow cleanup remain separate backlog work.
