# danmu.nz

My personal website, built with [Eleventy](https://www.11ty.dev/).

## Local preview

Use Node 24 and npm 11. If you use nvm, run `nvm install` and `nvm use` from the repository root to select the version in `.nvmrc`.

```sh
npm ci
npm start
```

Open the local URL printed by Eleventy. This preview renders drafts and uses the default share image in place of generated cards. Webmentions are opt-in through `WEBMENTION_IO_TOKEN`. Keep credentials out of Git.

## Write and publish

Copy the [new-post template](docs/publishing.md#create-a-post-with-a-persistent-address) into a Markdown file under `content/blog/`. Pick a permalink you can keep and leave `draft: true` while writing. Markdown and front matter are the supported authoring workflow. A post generator or CMS can wait until the manual workflow becomes a bottleneck.

To publish, set `draft: false`. If you store drafts under `content/blog/drafts/`, move the finished file into a tracked directory before committing. The [publishing guide](docs/publishing.md) covers inherited draft settings, tags, image and social-card conventions, and files that should stay private.

```sh
npm test
npm run build
npm run check:site
```

The full build cleans `_site/`, excludes drafts, and generates the current social cards with Puppeteer. For a quicker local check of the HTML output, run `npm run build:html` followed by `npm run check:site`. That build also excludes drafts and uses the default share image in place of generated cards.

Open a pull request and wait for **Publishing checks**. Merging to `main` starts **Deploy 11ty to GitHub Pages**, which verifies the built site and publishes it to `gh-pages`. Confirm the workflow succeeds and check the changed pages on danmu.nz.

## Recover a deployment

For a transient failure, run **Deploy 11ty to GitHub Pages** again for current `main`. To undo a published change, open and merge a revert PR, then verify the new deployment. The [deployment and recovery guide](docs/deployment.md#retry-and-rollback) has the exact steps.

See [implementation notes](docs/spec.md) for the guide to assets, social cards, reader checks, and dependency maintenance.
