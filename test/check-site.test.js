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
