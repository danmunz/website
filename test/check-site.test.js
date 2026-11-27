import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkSite } from "../scripts/check-site.js";

const metadata = (image = "/img/share.png") => `<meta property="og:image" content="${image}"><meta property="og:image:secure_url" content="${image}"><meta name="twitter:image" content="${image}"><h1>Fixture</h1>`;
async function fixture(t, entries) {
	const output = await mkdtemp(path.join(os.tmpdir(), "site-check-"));
	t.after(() => rm(output, { recursive: true, force: true }));
	for (const [name, contents] of Object.entries(entries)) {
		await mkdir(path.dirname(path.join(output, name)), { recursive: true });
		await writeFile(path.join(output, name), contents);
	}
	return output;
}

test("accepts existing links, valid fragments, and aligned social assets while ignoring external URLs", async t => {
	const output = await fixture(t, {
		"index.html": `${metadata()}<main id='main'><a href='/tags/ai/?sort=new'>AI</a><a href='https://example.com/no-local-file'>External</a><a href='#main'>Skip</a><a href='mailto:hello@example.com'>Email</a></main>`,
		"tags/ai/index.html": metadata("https://danmu.nz/img/share.png"),
		"img/share.png": "fixture",
	});
	assert.deepEqual((await checkSite({ output, routes: [{ permalink: "/tags/ai/" }] })).errors, []);
});

test("rejects case-mismatched tag links and baseline routes even on macOS", async t => {
	const output = await fixture(t, {
		"index.html": `${metadata()}<a href='/tags/AI/'>AI</a>`,
		"tags/ai/index.html": metadata(),
		"img/share.png": "fixture",
	});
	const { errors } = await checkSite({ output, routes: [{ permalink: "/tags/AI/" }] });
	assert.equal(errors.length, 2);
	assert.ok(errors.every(error => error.includes("missing local destination /tags/AI/")));
});

test("rejects absent, inconsistent, and duplicate social metadata", async t => {
	const output = await fixture(t, {
		"index.html": `${metadata("/missing.png")}<meta property='og:image' content='/other.png'>`,
		"about/index.html": "<h1>About</h1>",
	});
	const { errors } = await checkSite({ output });
	assert.ok(errors.some(error => error.includes("missing social image /missing.png")));
	assert.ok(errors.some(error => error.includes("duplicate og:image")));
	assert.ok(errors.some(error => error.includes("metadata disagrees")));
	assert.equal(errors.filter(error => error.startsWith("about/")).length, 3);
});

test("rejects editor helper output", async t => {
	const output = await fixture(t, { "copilot/helper with spaces/index.html": metadata(), "img/share.png": "fixture" });
	assert.ok((await checkSite({ output })).errors.some(error => error.includes("editor-only or cached content leaked")));
});

test("rejects orphan generated cards and private cache files in public output", async t => {
	const output = await fixture(t, {
		"index.html": metadata("/og-images/current.png"),
		"og-images/current.png": "current card fixture",
		"og-images/withdrawn.png": "stale card fixture",
		".cache/social-card-manifest.json": "{}",
	});
	const { errors } = await checkSite({ output });
	assert.equal(errors.length, 2);
	assert.ok(errors.some(error => error.includes("withdrawn.png: generated card has no current page")));
	assert.ok(errors.some(error => error.includes(".cache/social-card-manifest.json")));
});

test("checks same-page and cross-page fragments and accepts text-fragment directives", async t => {
	const output = await fixture(t, {
		"index.html": `${metadata()}<a href='/about/#colophon'>About</a><a href='#fn1'>Note</a><a href='#:~:text=Fixture'>Text selection</a><p id='fn1'>Footnote</p><a href='#absent'>Broken</a>`,
		"about/index.html": `${metadata()}<h2 id='colophon'>Colophon</h2><a href='/#absent'>Broken return</a>`,
		"img/share.png": "fixture",
	});
	const { errors } = await checkSite({ output });
	assert.equal(errors.length, 2);
	assert.ok(errors.every(error => error.includes("missing local fragment") && error.includes("#absent")));
});

test("rejects duplicate IDs, skipped heading levels, and missing or duplicate page H1s", async t => {
	const output = await fixture(t, {
		"index.html": `${metadata()}<h3 id='same'>Skipped</h3><p id='same'>Duplicate target</p>`,
		"about/index.html": `${metadata()}<h1>Second title</h1>`,
		"empty/index.html": metadata().replace("<h1>Fixture</h1>", ""),
		"img/share.png": "fixture",
	});
	const { errors } = await checkSite({ output });
	assert.equal(errors.length, 4);
	assert.ok(errors.some(error => error.includes("duplicate id same")));
	assert.ok(errors.some(error => error.includes("skips from h1 to h3")));
	assert.equal(errors.filter(error => error.includes("expected one page-level h1")).length, 2);
});

test("checks local image sources and responsive candidates without requesting external URLs", async t => {
	const output = await fixture(t, {
		"index.html": `${metadata()}<picture><source srcset='/img/share.png 320w, /img/missing.avif 640w'><img alt='A fixture image' src='/img/Missing.png' srcset='data:image/png;base64,AAAA 1x, https://example.com/remote.png 2x'></picture>`,
		"img/share.png": "fixture",
	});
	assert.deepEqual((await checkSite({ output })).errors.sort(), [
		"index.html: missing local media asset /img/Missing.png",
		"index.html: missing local media asset /img/missing.avif",
	]);
});

test("requires an alt attribute on images and accepts an explicit decorative alternative", async t => {
	const output = await fixture(t, {
		"index.html": `${metadata()}<img src='/img/share.png' alt=''><img src='https://example.com/photo.png' data-alt='A photo'>`,
		"img/share.png": "fixture",
	});
	assert.deepEqual((await checkSite({ output })).errors, [
		"index.html: image missing alt attribute (https://example.com/photo.png)",
	]);
});

const atomEntry = url => `<entry><id>${url}</id><link href="${url}"/><title>Article</title><updated>2026-01-02T00:00:00Z</updated><content type="html">&lt;p&gt;Article body&lt;/p&gt;</content></entry>`;
const sitemapEntry = url => `<url><loc>${url}</loc></url>`;
const atom = entries => `<feed xmlns="http://www.w3.org/2005/Atom"><link rel="self" href="https://danmu.nz/feed/feed.xml"/>${entries.map(atomEntry).join("")}</feed>`;
const sitemap = entries => `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(sitemapEntry).join("")}</urlset>`;

async function publicationFixture(t, syndicated = false) {
	const paths = ["/blog/Original-Case/", ...Array.from({ length: 10 }, (_, i) => `/blog/post-${i}/`)];
	const articleUrls = paths.map(route => `https://danmu.nz${route}`);
	const page = (route, url = `https://danmu.nz${route}`) => `<link rel="canonical" href="${url}">${metadata()}`;
	const sitemapUrls = [...articleUrls.slice(syndicated ? 1 : 0), ...["/", "/about/", "/blog/", "/tags/"].map(route => `https://danmu.nz${route}`)];
	const output = await fixture(t, {
		"index.html": page("/"),
		"about/index.html": page("/about/"),
		"tags/index.html": page("/tags/"),
		"blog/index.html": page("/blog/") + paths.map(route => `<a class="postlist-link" href="${route}">Article</a>`).join(""),
		...Object.fromEntries(paths.map((route, i) => [`${route.slice(1)}index.html`, page(route, syndicated && i === 0 ? "https://example.com/original/" : undefined)])),
		"img/share.png": "fixture",
		"feed/feed.xml": atom(articleUrls.slice(0, 10)),
		"sitemap.xml": sitemap(sitemapUrls),
	});
	return { output, articleUrls, sitemapUrls, options: { output, routes: [{ permalink: paths[0] }], checkIndexes: true } };
}

test("checks the latest ten feed entries and all sitemap articles including preserved mixed-case URLs", async t => {
	const { options } = await publicationFixture(t);
	assert.deepEqual((await checkSite(options)).errors, []);
});

test("accepts a syndicated local feed URL and excludes it from the sitemap", async t => {
	const { output, articleUrls, sitemapUrls, options } = await publicationFixture(t, true);
	assert.deepEqual((await checkSite(options)).errors, []);
	await writeFile(path.join(output, "sitemap.xml"), sitemap([articleUrls[0], ...sitemapUrls])
		.replace("</loc>", "</loc><lastmod>2026-02-30</lastmod>"));
	const { errors } = await checkSite(options);
	assert.ok(errors.includes(`sitemap.xml: unexpected loc ${articleUrls[0]}`));
	assert.ok(errors.includes(`sitemap.xml: invalid lastmod for ${articleUrls[0]}`));
});

test("rejects malformed XML and case-mismatched, missing, or duplicate index destinations", async t => {
	const { output, articleUrls, sitemapUrls, options } = await publicationFixture(t);
	await writeFile(path.join(output, "feed/feed.xml"), '<feed xmlns="http://www.w3.org/2005/Atom"><entry></feed>');
	await writeFile(path.join(output, "sitemap.xml"), sitemap([articleUrls[0].toLowerCase(), sitemapUrls[1], ...sitemapUrls.slice(1)]));
	const { errors } = await checkSite(options);
	assert.ok(errors.some(error => error.startsWith("feed/feed.xml: ") && error.includes("line 1")), errors.join("\n"));
	assert.ok(errors.includes(`sitemap.xml: missing local destination ${articleUrls[0].toLowerCase()}`));
	assert.ok(errors.includes(`sitemap.xml: missing loc ${articleUrls[0]}`));
	assert.ok(errors.includes(`sitemap.xml: duplicate loc ${sitemapUrls[1]}`));
});

test("rejects feed entries outside the latest archive articles and reports missing indexes", async t => {
	const { output, articleUrls, options } = await publicationFixture(t);
	await writeFile(path.join(output, "feed/feed.xml"), atom([...articleUrls.slice(1, 9), articleUrls[0], "https://example.com/foreign/"]));
	await rm(path.join(output, "sitemap.xml"));
	const { errors } = await checkSite(options);
	assert.ok(errors.includes("feed/feed.xml: expected the latest 10 archive articles in archive order"));
	assert.ok(errors.includes("feed/feed.xml: expected an absolute local entry link URL, got https://example.com/foreign/"));
	assert.ok(errors.includes("sitemap.xml: missing publication index"));
});
