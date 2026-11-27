# Website implementation notes

Start with the [README](../README.md) for setup, local preview, and verification. Use these guides for the maintained publishing and deployment instructions.

- [Publishing articles](publishing.md) covers the Markdown template, drafts, stable permalinks, tags, footnotes, and image conventions.
- [Deployment and recovery](deployment.md) covers the GitHub Pages workflow, checking an artifact, retries, and rollback.
- [Asset delivery](assets.md) and [social-card generation](social-cards.md) describe fonts, styles, images, and generated previews.
- [Dependency maintenance](dependencies.md) and [reader checks](reader-checks.md) describe the runtime and verification tools.

Eleventy reads the Markdown and templates in `content/`, using layouts and partials in `_includes/`. The build writes the publishable site to `_site/`, including the archive, a topic index and topic pages, the Atom feed, and the sitemap. GitHub Actions checks the generated files before publishing to GitHub Pages.
