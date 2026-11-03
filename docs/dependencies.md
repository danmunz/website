# Runtime and dependency maintenance

## Supported toolchain

Use Node 24 LTS with npm 11. `.nvmrc` selects Node 24, `package.json` supports `>=24 <25`, and both GitHub Actions workflows read `.nvmrc`. For an existing nvm installation:

```sh
nvm install
nvm use
npm ci
```

Node 24 was selected from the [official Node release schedule](https://nodejs.org/en/about/previous-releases). The November 2026 maintenance work was checked locally with Node 24.22.2 and npm 11.21.1. CI must also pass before merging a runtime or lockfile change. The lockfile, rather than a fresh unconstrained install, defines the resolved package graph.

Puppeteer supplies the browser used for social-card generation. Its exact installed version has an `allowScripts` entry in `package.json`, because recent npm 11 versions otherwise skip dependency install scripts. Review the installer when upgrading Puppeteer, then update that version-specific allowance with `npm install-scripts approve puppeteer`; do not approve all packages indiscriminately. The installed script downloads the matching browser. `npm ci` in Linux CI must keep that download enabled.

For a local HTML-only workflow, `PUPPETEER_SKIP_DOWNLOAD=true npm ci` skips the browser download while preserving the same locked dependencies. Then use `npm test` and `npm run build:html`. These checks do not prove actual browser rendering. The dedicated `npm run test:cards` and full production build exercise it in Linux CI.

## November 2026 dependency decisions

The project remains Eleventy-based. Package metadata now points to this website and repository. The original Eleventy Base Blog MIT copyright and permission notice remain in `LICENSE`.

| Change | Reason |
| --- | --- |
| Eleventy 3.1.7 | Update within the existing major line and receive its maintained template/parser dependency graph. |
| Eleventy Image 7.1.1 | Replace advisory-affected image-size/sharp dependencies with the current image plugin. Its Node 22 minimum is covered by Node 24. |
| Puppeteer 25.16.0 | Update the actual social-card renderer and browser installation dependencies; keep real browser validation in CI. |
| Direct `markdown-it` 14.3.3 | The Eleventy configuration imports this package directly, so it must be declared directly. Stay on Eleventy's supported major while taking security fixes. |
| Pinned Fontsource Oswald and Bricolage Grotesque 5.3.0 | Supply local, repeatable font bytes for cards instead of a runtime Google Fonts request. Both packages include their SIL Open Font License notices in `LICENSE`; renderer input uses Latin normal 400 WOFF2 files. |
| Remove `fs`, Playwright, unused OG plugin, mkdirp, glob, zod, and zod-validation-error | Node supplies `fs`; Playwright and the alternate card plugin were unused; the new renderer no longer scans with glob; the current validator no longer uses zod. |
| Retain Nunjucks, Prism, front-matter, and Webmentions | The renderer/templates/schema/config still use these packages. Webmentions remains optional, with its transitive sanitizer dependencies updated. |
| Retain RSS 2, cross-env 7, and dotenv 17 | No remaining audit finding requires an unrelated major API change. Compatible patches were resolved where applicable. |

The image and renderer major upgrades were selected from their published releases: [Eleventy Image 7.1.1](https://github.com/11ty/image/releases/tag/v7.1.1) and [Puppeteer 25.16.0](https://github.com/puppeteer/puppeteer/releases/tag/puppeteer-v25.16.0). Their compatibility is established by the project's tests and full Linux build, not version numbers alone.

## Audit disposition

A fresh `npm audit --json` on November 3, 2026 reported **0 vulnerabilities** in the updated lockfile, across all severity levels. The starting lockfile reported 31 affected packages: 2 critical, 24 high, 4 moderate, and 1 low. These are npm advisory results, not evidence of an attack or a claim that every package was exploitable by a website visitor.

The initial direct-package cleanup reduced the report to six affected transitive packages. Targeted updates of `js-yaml`, `nanoid`, `postcss`, `sanitize-html`, `source-map-js`, and `deepmerge` within their parents' existing version ranges resolved the remainder. No forced audit fix, cross-major override, ignored advisory, or removal of Webmentions was needed. There are therefore no remaining advisories requiring an exception at this snapshot.

Most packages execute during builds, not in the static site served to visitors. They still matter: parsers process repository content, the image pipeline consumes image files, the browser installer extracts downloads, and an enabled Webmentions integration processes external content. Reassess those input boundaries for new findings. A clean audit is a point-in-time registry result, not a general security guarantee.

## Monthly review

Review dependencies during the first week of each month and promptly when a relevant security advisory appears:

1. Start from an isolated feature branch and run `npm ci`, `npm outdated`, and `npm audit --json` on Node 24.
2. Inspect release notes and actual imports. Prefer compatible patches/minors; make each necessary major upgrade deliberate. Keep both manifests together and review the lockfile diff. Do not use `npm audit fix --force` as an upgrade strategy.
3. Review install-script changes, especially Puppeteer's browser download, and update any version-pinned `allowScripts` entry deliberately. Keep font package versions pinned; their bytes participate in card cache invalidation.
4. Run `npm test`. Linux CI must run `npm run test:cards`, `npm run build`, and `npm run check:site` before merge. Inspect a generated card when fonts, layout, or rendering versions change.
5. Record the audit date, counts, relevant input exposure, chosen remediation, and any remaining exception with a tracking issue. Update this document when the runtime policy or maintenance decisions change.

Do not cache `_site` or deploy an unvalidated dependency update. The [deployment guide](deployment.md) describes the build artifact and publication gates.
