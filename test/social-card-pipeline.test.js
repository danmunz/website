import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { manifestRelativePath, publishedCards } from "../_config/social-cards.js";
import { cardFingerprint, generateSocialImages, renderCardHtml, validatePng } from "../scripts/generate-og-images.js";
import contentData from "../content/content.11tydata.js";

const inputs = { template: "<h1>{{ title }}</h1>", fonts: [{ family: "Fixture", bytes: Buffer.from("font") }],
	options: { width: 1200, height: 630 }, rendererVersion: "fixture-v1" };
const card = { title: 'An <escaped> "title" & text', permalink: "/blog/stable/", socialImage: "/og-images/stable.png", source: "content/blog/post.md" };
// A valid transparent PNG fixture; actual visual rendering is the Linux-only browser suite.
const fixturePng = await readFile(new URL("./fixtures/social-card.png", import.meta.url));
function png() { return fixturePng; }
async function fixture(t) {
	const root = await mkdtemp(path.join(os.tmpdir(), "social-cards-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(path.join(root, ".cache"));
	const manifest = async cards => writeFile(path.join(root, manifestRelativePath), JSON.stringify({ version: 1, root, output: path.join(root, "_site"), cards }));
	return { root, manifest };
}

test("fingerprints cover text, template, fonts, options and renderer version; title HTML is escaped", () => {
	const original = cardFingerprint(card, inputs);
	for (const changed of [
		{ ...inputs, template: `${inputs.template} changed` },
		{ ...inputs, fonts: [{ family: "Fixture", bytes: Buffer.from("new font") }] },
		{ ...inputs, options: { ...inputs.options, width: 900 } },
		{ ...inputs, rendererVersion: "v2" },
	]) assert.notEqual(cardFingerprint(card, changed), original);
	assert.notEqual(cardFingerprint({ ...card, title: "New title" }, inputs), original);
	assert.equal(cardFingerprint({ ...card, socialImage: "/og-images/renamed.png" }, inputs), original);
	assert.equal(renderCardHtml(card, inputs), "<h1>An &lt;escaped&gt; &quot;title&quot; &amp; text</h1>");
});

test("cache reuse avoids browser startup and only current manifest cards become public", async t => {
	const { root, manifest } = await fixture(t);
	let launches = 0, closed = 0;
	const rendererFactory = async () => {
		launches++;
		return { async render(html, file) { await writeFile(file, png()); }, async close() { closed++; } };
	};
	await manifest([card]);
	assert.equal((await generateSocialImages({ root, inputs, rendererFactory })).rendered, 1);
	assert.equal((await generateSocialImages({ root, inputs, rendererFactory })).cached, 1);
	assert.equal(launches, 1);
	assert.equal(closed, 1);
	await manifest([{ ...card, socialImage: "/og-images/nested/renamed.png" }]);
	assert.equal((await generateSocialImages({ root, inputs, rendererFactory })).cached, 1);
	await assert.rejects(readFile(path.join(root, "_site/og-images/stable.png")), { code: "ENOENT" });
	assert.ok((await readFile(path.join(root, "_site/og-images/nested/renamed.png"))).length);
	await manifest([]); // Withdrawal/deletion must not republish reusable private cached content.
	await generateSocialImages({ root, inputs, rendererFactory });
	assert.deepEqual(await readdir(path.join(root, "_site/og-images")), []);
	assert.equal((await readdir(path.join(root, ".cache/social-cards"))).length, 1);
});

test("renderer failure closes resources and removes temporary cache and public output", async t => {
	const { root, manifest } = await fixture(t);
	await manifest([card]);
	let closed = false;
	await assert.rejects(generateSocialImages({ root, inputs, rendererFactory: async () => ({
		async render(html, file) { await writeFile(file, "partial"); throw new Error("synthetic screenshot failure"); },
		async close() { closed = true; },
	}) }), /synthetic screenshot failure/);
	assert.equal(closed, true);
	assert.deepEqual(await readdir(path.join(root, ".cache/social-cards")), []);
	await assert.rejects(readdir(path.join(root, "_site/og-images")), { code: "ENOENT" });
});

test("truncated or corrupted cached images are never reused", async t => {
	assert.doesNotThrow(() => validatePng(fixturePng));
	for (const truncated of [fixturePng.subarray(0, 24), fixturePng.subarray(0, fixturePng.length - 12)]) assert.throws(() => validatePng(truncated));
	const corrupted = Buffer.from(fixturePng);
	corrupted[50] ^= 1;
	assert.throws(() => validatePng(corrupted));
	const { root, manifest } = await fixture(t);
	await manifest([card]);
	await mkdir(path.join(root, ".cache/social-cards"));
	await writeFile(path.join(root, ".cache/social-cards", `${cardFingerprint(card, inputs)}.png`), fixturePng.subarray(0, 24));
	const result = await generateSocialImages({ root, inputs, rendererFactory: async () => ({ async render(html, file) { await writeFile(file, fixturePng); }, async close() {} }) });
	assert.equal(result.rendered, 1);
	assert.equal(result.cached, 0);
});

test("rejects unsafe paths, duplicate destinations and a manifest from a different checkout", async t => {
	for (const socialImage of ["/og-images/../outside.png", "/og-images/%2e%2e/out.png", "/og-images/a//b.png", "/og-images/not-png.jpg"]) {
		assert.throws(() => publishedCards([{ inputPath: "post.md", url: "/post/", data: { ...card, socialImage } }]), /socialImage/);
	}
	assert.throws(() => publishedCards([1, 2].map(number => ({ inputPath: `${number}.md`, data: card }))), /duplicates/);
	const { root, manifest } = await fixture(t);
	await manifest([card, card]);
	await assert.rejects(generateSocialImages({ root, inputs }), /duplicate/);
	await writeFile(path.join(root, manifestRelativePath), JSON.stringify({ version: 1, root: "/different", output: path.join(root, "_site"), cards: [] }));
	await assert.rejects(generateSocialImages({ root, inputs }), /does not belong/);
});

test("fast preview resolves generated mappings to fallback but preserves supplied image URLs", () => {
	const resolve = contentData.eleventyComputed.resolvedSocialImage;
	const data = { metadata: { url: "https://danmu.nz/" }, socialImage: "/og-images/card.png" };
	assert.equal(resolve(data), "https://danmu.nz/img/share-img.png");
	assert.equal(resolve({ ...data, generateSocialCards: true }), "https://danmu.nz/og-images/card.png");
	assert.equal(resolve({ ...data, socialImage: "/img/custom.png" }), "https://danmu.nz/img/custom.png");
	assert.equal(resolve({ ...data, socialImage: "https://example.com/card.png" }), "https://example.com/card.png");
});

test("manifest uses real validated collection membership with nested and inherited drafts", async t => {
	const { root } = await fixture(t);
	const input = path.join(root, "content");
	await mkdir(path.join(input, "blog/nested"), { recursive: true });
	await mkdir(path.join(input, "blog/private"), { recursive: true });
	await writeFile(path.join(input, "blog/blog.11tydata.json"), JSON.stringify({ tags: ["posts"] }));
	await writeFile(path.join(input, "blog/private/private.11tydata.json"), JSON.stringify({ draft: true }));
	const post = (name, draft = false) => `---\ntitle: ${name}\ndescription: Fixture\ndate: 2020-01-01\ntags: []\npermalink: /blog/${name}/\nsocialImage: /og-images/${name}.png\ndraft: ${draft}\n---\nBody`;
	await writeFile(path.join(input, "blog/nested/published.md"), post("published"));
	await writeFile(path.join(input, "blog/root-draft.md"), post("root-draft", true));
	await writeFile(path.join(input, "blog/private/inherited.md"), "---\nsocialImage: /og-images/inherited.png\n---\nUnfinished draft");
	await writeFile(path.join(root, "build.mjs"), `
import Eleventy from ${JSON.stringify(new URL("../node_modules/@11ty/eleventy/src/Eleventy.js", import.meta.url).href)};
import socialCardsPlugin from ${JSON.stringify(new URL("../_config/social-cards.js", import.meta.url).href)};
import { validatePostSource } from ${JSON.stringify(new URL("../_config/post-schema.js", import.meta.url).href)};
await new Eleventy("content", "_site", { configPath: false, quietMode: true, config: config => {
	config.addPreprocessor("metadata", "md", function(data) { validatePostSource(data, this.inputPath); });
	config.addPreprocessor("drafts", "*", data => data.draft ? false : undefined);
	config.addPlugin(socialCardsPlugin);
} }).write();
`);
	const build = () => spawnSync(process.execPath, ["build.mjs"], { cwd: root, encoding: "utf8", timeout: 30_000 });
	let execution = build();
	assert.equal(execution.status, 0, execution.stderr);
	let manifest = JSON.parse(await readFile(path.join(root, manifestRelativePath), "utf8"));
	assert.deepEqual(manifest.cards.map(card => card.socialImage), ["/og-images/published.png"]);
	await writeFile(path.join(input, "blog/nested/published.md"), post("published", true));
	execution = build();
	assert.equal(execution.status, 0, execution.stderr);
	manifest = JSON.parse(await readFile(path.join(root, manifestRelativePath), "utf8"));
	assert.deepEqual(manifest.cards, []);
	await writeFile(path.join(input, "blog/nested/invalid.md"), "---\ntitle: Missing required metadata\n---\nBody");
	assert.notEqual(build().status, 0);
	await assert.rejects(readFile(path.join(root, manifestRelativePath)), { code: "ENOENT" });
});
