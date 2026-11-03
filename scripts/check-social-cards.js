// Opt-in Linux CI integration check. The normal npm test suite never starts a browser.
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBrowserRenderer, generateSocialImages, loadRenderInputs, validatePng } from "./generate-og-images.js";
import { manifestRelativePath } from "../_config/social-cards.js";

if (process.platform !== "linux" || process.env.CI !== "true") {
	throw new Error("Real social-card browser checks run only in Linux CI. Use npm test for local fixture checks.");
}
const project = fileURLToPath(new URL("../", import.meta.url));
const root = await mkdtemp(path.join(os.tmpdir(), "social-card-browser-"));
const renderers = [];
const rendererFactory = async options => {
	const renderer = await createBrowserRenderer(options);
	renderers.push(renderer);
	return renderer;
};
try {
	await mkdir(path.join(root, ".cache"));
	const inputs = await loadRenderInputs(project);
	const title = 'A long title about public institutions, software, and the human work of making things useful: <script>not executable</script>, "quoted words", & a practical path to better services for everyone';
	const card = { title, permalink: "/fixture/", socialImage: "/og-images/long-title.png", source: "synthetic fixture" };
	const manifest = async cards => writeFile(path.join(root, manifestRelativePath), JSON.stringify({ version: 1, root, output: path.join(root, "_site"), cards }));
	await manifest([card]);
	const first = await generateSocialImages({ root, inputs, rendererFactory });
	assert.equal(first.rendered, 1);
	assert.equal(first.diagnostics[0].title, title);
	assert.equal(first.diagnostics[0].fontsReady, true);
	assert.ok(first.diagnostics[0].titleSize >= 32 && first.diagnostics[0].titleSize < 108);
	assert.ok(first.diagnostics[0].top >= 0 && first.diagnostics[0].bottom <= 630);
	assert.ok(renderers.every(renderer => renderer.closed), "Chrome and its page close after successful rendering");
	const output = path.join(root, "_site/og-images/long-title.png");
	validatePng(await readFile(output));
	// Keep one explicit, ignored preview for CI artifact inspection; never in the deployed site.
	await mkdir(path.join(project, ".cache"), { recursive: true });
	await copyFile(output, path.join(project, ".cache/social-card-test-preview.png"));
	const second = await generateSocialImages({ root, inputs, rendererFactory });
	assert.equal(second.cached, 1);
	assert.equal(renderers.length, 1, "Warm cache must not launch another browser");
	await manifest([{ ...card, title: "A deliberately impossible title ".repeat(1000) }]);
	await assert.rejects(generateSocialImages({ root, inputs, rendererFactory }), /cannot fit/);
	assert.ok(renderers.every(renderer => renderer.closed), "Chrome and its page close after rendering failure");
	assert.ok((await readdir(path.join(root, ".cache/social-cards"))).every(file => file.endsWith(".png")), "No incomplete cache files remain");
	await assert.rejects(readdir(path.join(root, "_site/og-images")), { code: "ENOENT" });
	console.log("Real social-card checks passed: local fonts, escaped long title, 1200×630 PNG, warm cache, and failure cleanup.");
} finally {
	await rm(root, { recursive: true, force: true });
}
