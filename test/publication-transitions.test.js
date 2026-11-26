import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));

test("clean HTML builds exclude helpers and remove withdrawn, deleted, and renamed pages", { timeout: 180_000 }, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "website-publication-"));
  const checkout = path.join(temporary, "website");
  try {
    await cp(root, checkout, {
      recursive: true,
      filter: (source) => {
        const relative = path.relative(root, source);
        return !relative.split(path.sep).some((part) =>
          [".git", "node_modules", "_site", ".cache"].includes(part) || part.startsWith(".env"));
      },
    });
    await symlink(path.join(root, "node_modules"), path.join(checkout, "node_modules"), "dir");
    const defaultImagePath = path.join(checkout, "public/img/share-img.png");
    const defaultImageBefore = await readFile(defaultImagePath);

    const env = { ...process.env, WEBMENTION_IO_TOKEN: "", DOTENV_CONFIG_PATH: path.join(temporary, "no-env") };
    const run = (...args) => {
      const result = spawnSync(process.execPath, args, {
        cwd: checkout, env, encoding: "utf8", timeout: 45_000, maxBuffer: 8 * 1024 * 1024,
      });
      assert.equal(result.status, 0, `${args.join(" ")}\n${result.error || ""}\n${result.stdout}\n${result.stderr}`);
    };
    const build = () => {
      // The same clean step as production, without expensive card regeneration.
      // Linux CI separately exercises the complete npm run build path.
      run("scripts/clean.js");
      run("node_modules/@11ty/eleventy/cmd.cjs", "--quiet");
    };
    const fixture = path.join(checkout, "content/blog/Publication-Fixture.md");
    const writePost = async (draft = false, permalink = "/blog/Publication-Fixture/") => {
      // Keep the synthetic post inside the ten-entry feed as real articles grow.
      // This also exercises the documented publish-with-warning future-date policy.
      await writeFile(fixture, `---\ntitle: Publication fixture\ndescription: A synthetic publication transition fixture.\ndate: 2099-01-02\ntags: [Fixture]\npermalink: ${permalink}\ndraft: ${draft}\n---\nSynthetic article body.\n`);
    };
    const exists = async (relative) => {
      try { await readFile(path.join(checkout, "_site", relative)); return true; }
      catch (error) { if (error.code === "ENOENT") return false; throw error; }
    };
    const assertNotListed = async () => {
      for (const relative of ["index.html", "blog/index.html", "feed/feed.xml", "sitemap.xml"]) {
        assert.doesNotMatch(await readFile(path.join(checkout, "_site", relative), "utf8"), /\/blog\/Publication-Fixture\//);
      }
    };
    const assertIdentity = async () => {
      const feed = await readFile(path.join(checkout, "_site/feed/feed.xml"), "utf8");
      const sitemap = await readFile(path.join(checkout, "_site/sitemap.xml"), "utf8");
      assert.match(feed, /https:\/\/danmu\.nz\/blog\/Publication-Fixture\//);
      assert.match(sitemap, /<loc>https:\/\/danmu\.nz\/blog\/Publication-Fixture\/<\/loc>/);
      assert.doesNotMatch(`${feed}\n${sitemap}`, /\/blog\/publication-fixture\//);
      const article = await readFile(path.join(checkout, "_site/blog/Publication-Fixture/index.html"), "utf8");
      assert.match(article, /rel="canonical" href="https:\/\/danmu\.nz\/blog\/Publication-Fixture\/"/);
      const previous = article.match(/class="links-nextprev-prev"[^>]*>[^<]*<br>\s*<a href="([^"]+)"/)?.[1];
      assert.ok(previous?.startsWith("/blog/"), "previous link uses a published article route");
      const neighbor = await readFile(path.join(checkout, "_site", previous, "index.html"), "utf8");
      assert.match(neighbor, /class="links-nextprev-next"[^>]*>[^<]*<br>\s*<a href="\/blog\/Publication-Fixture\/"/);
      // Enumerated names are case-sensitive even on a case-insensitive filesystem.
      assert.ok((await readdir(path.join(checkout, "_site/blog"))).includes("Publication-Fixture"));
    };

    await mkdir(path.join(checkout, "content/copilot/copilot-custom-prompts"), { recursive: true });
    await writeFile(path.join(checkout, "content/copilot/copilot-custom-prompts/Generate glossary.md"), "EDITOR_HELPER_SENTINEL\n");
    await writePost();
    build();
    assert.equal(await exists("blog/Publication-Fixture/index.html"), true);
    await assertIdentity();
    const sitemap = await readFile(path.join(checkout, "_site/sitemap.xml"), "utf8");
    assert.match(sitemap, /<loc>https:\/\/danmu\.nz\/blog\/ai-is-a-software-uncrisis\/<\/loc>\s*<lastmod>2026-03-03<\/lastmod>/);
    assert.match(sitemap, /<loc>https:\/\/danmu\.nz\/about\/<\/loc>\s*<\/url>/);
    assert.doesNotMatch(sitemap, /\/feed\/feed\.xml|\/tags\/ai\/|\/404\.html/);
    assert.match(await readFile(path.join(checkout, "_site/robots.txt"), "utf8"), /^Sitemap: https:\/\/danmu\.nz\/sitemap\.xml$/m);
    const notFound = await readFile(path.join(checkout, "_site/404.html"), "utf8");
    assert.match(notFound, /<meta name="robots" content="noindex">/);
    assert.doesNotMatch(notFound, /rel="canonical"/);
    assert.equal((await readdir(path.join(checkout, "_site"))).includes("copilot"), false);
    for (const relative of ["feed/feed.xml", "sitemap.xml", "index.html", "blog/index.html"]) {
      assert.doesNotMatch(await readFile(path.join(checkout, "_site", relative), "utf8"), /copilot|EDITOR_HELPER_SENTINEL/);
    }

    await writePost(true);
    build();
    assert.equal(await exists("blog/Publication-Fixture/index.html"), false);
    await assertNotListed();

    // A one-shot serve-mode compilation exercises preview rules without opening
    // a server or browser. Drafts appear locally, while editor helpers never do.
    run("--input-type=module", "-e", "import Eleventy from '@11ty/eleventy'; await new Eleventy(undefined, undefined, { runMode: 'serve', quietMode: true }).write();");
    assert.equal(await exists("blog/Publication-Fixture/index.html"), true);
    assert.equal((await readdir(path.join(checkout, "_site"))).includes("copilot"), false);

    await writePost();
    build();
    const intermediate = path.join(checkout, "content/blog/temporary-case-rename.md");
    const lowercase = path.join(checkout, "content/blog/publication-fixture.md");
    await rename(fixture, intermediate);
    await rename(intermediate, lowercase);
    build();
    assert.equal(await exists("blog/Publication-Fixture/index.html"), true);
    await assertIdentity();

    await rename(lowercase, intermediate);
    await rename(intermediate, fixture);
    await writePost(false, "/blog/Moved-Fixture/");
    build();
    assert.equal(await exists("blog/Publication-Fixture/index.html"), false);
    assert.equal(await exists("blog/Moved-Fixture/index.html"), true);
    await assertNotListed();

    await rm(fixture);
    build();
    assert.equal(await exists("blog/Publication-Fixture/index.html"), false);
    assert.equal(await exists("blog/Moved-Fixture/index.html"), false);
    await assertNotListed();
    for (const relative of ["feed/feed.xml", "sitemap.xml"]) {
      assert.doesNotMatch(await readFile(path.join(checkout, "_site", relative), "utf8"), /\/blog\/Moved-Fixture\//);
    }
    assert.deepEqual(await readFile(defaultImagePath), defaultImageBefore, "clean builds preserve source images");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
