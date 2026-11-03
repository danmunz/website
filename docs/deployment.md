# Deployment and recovery

The website continues to publish through the existing `gh-pages` branch. Repository Pages settings and the custom domain remain unchanged. Merging a change to `main` starts **Deploy 11ty to GitHub Pages**; pull requests run **Publishing checks** and never publish.

## Validation and publishing

Both workflows read Node 24 from `.nvmrc`, install the lockfile with `npm ci`, and run:

```sh
npm test
npm run test:cards
npm run build
npm run check:site
```

`npm test` covers unit and synthetic publication tests without starting a rendering browser. `test:cards` runs the real renderer regression on the Linux runner, including long and escaped titles. The production build cleans `_site`, asks Eleventy to validate/render content and produce the current published-card manifest, then generates only the cards that manifest requests. Finished-site checks verify links, public routes, and social-image references. Successful PR checks retain a `social-card-preview` artifact for three days containing production cards and the synthetic long-title preview, so generated PNGs can be inspected without launching a local browser. The synthetic preview is outside `_site` and is never deployed.

The production build job has read-only repository access. Its optional `WEBMENTION_IO_TOKEN` is available only to the trusted-main build step; absent credentials remain supported. Pull requests receive no deployment credentials or Webmentions secret. Checkouts do not persist Git credentials.

After validation, the build copies the repository's `CNAME` into `_site` and uploads that directory. The separate publish job downloads the exact artifact by ID and gives the pinned `peaceiris/actions-gh-pages` action only the repository write permission it needs. It does not check out source, install packages, or rerun the build. The artifact action rejects a digest mismatch by default. Site artifacts are retained for seven days for inspection, not used as an alternate unvalidated deployment path.

Duplicate builds for the same commit share a concurrency group; a retry can replace that duplicate build without canceling a newer commit's pipeline. Publish jobs share a separate concurrency group and finish one at a time without canceling an active push. Immediately before publishing, the workflow checks that the run's commit still equals current `main`. An old run or rerun skips publication instead of overwriting newer output. Manual dispatch is accepted only for `main`; selecting a feature branch skips the build and publish jobs. A failed check or build prevents publishing, leaving the previous `gh-pages` output intact.

## Caches and browser behavior

Actions caches npm downloads and `.cache/social-cards/`. Card cache restoration is scoped by operating system, runtime policy, and lockfile. Each card also has its own fingerprint covering its rendering inputs; a restored entry is not automatically eligible for publication. The current manifest decides which paths enter `_site`.

Neither `_site` nor `.cache/social-card-manifest.json` is restored from Actions cache. Generated PNGs are build artifacts rather than committed source images. Old cached cards may remain privately cached after an article is removed; they must not be copied into a later public artifact unless the current published collection requests them. To investigate suspected cache problems, remove the relevant Actions cache entry and dispatch a fresh main build. Deleting a cache is not required for routine withdrawal or renaming.

Fonts come from locked local font packages, and card capture waits for their readiness. The renderer keeps its browser sandbox enabled by default. The [first Linux verification run](https://github.com/danmunz/website/actions/runs/41737449394) failed at Chromium startup with `No usable sandbox!`, identifying the hosted Ubuntu user-namespace/AppArmor restriction. Both workflows therefore set `SOCIAL_CARDS_NO_SANDBOX=1` only for the browser-check and production-build steps. The renderer refuses this option without `CI=true`; it never changes host-wide sandbox or AppArmor settings. CI already executes repository code on an isolated runner, and these rendering steps accept repository titles as escaped text, use controlled local fonts, and block external browser requests. Reassess this exception when changing runners or accepting additional renderer inputs. Local fast HTML builds use the default social image and do not prove the full renderer works.

## Retry and rollback

1. Open the failed Actions run and locate the first failing step. Metadata/output failures need a source correction; dependency/browser errors may require a lockfile or runtime fix. A successful publish job means the checked artifact was pushed, while GitHub Pages may need additional time to serve it.
2. For a transient failure on current main, use **Run workflow** on **Deploy 11ty to GitHub Pages**, selecting `main`. Rerunning an older commit cannot publish after main advances; dispatch current main instead. GitHub does not guarantee ordering of pending concurrency jobs, so if a desired current-main publish was canceled while pending, dispatch main again.
3. To undo an unwanted published change, revert its commit or merged PR through the normal review process and merge the revert into main. This creates a new current commit that passes the same validation and deployment gates. Avoid force-pushing branch history or manually copying an old artifact to bypass checks.
4. Check the resulting workflow and representative public pages, including the changed article route and custom domain. Preserve existing public permalinks when correcting content. If withdrawal is intentional, confirm the old page and its generated card are absent from the new artifact.

Action revisions are pinned to verified upstream release commits with version comments. Review their release notes and update the SHA/comment together during dependency maintenance. The workflow files are the operational source of truth; no hosting migration or repository-secret change is required by this pipeline.
