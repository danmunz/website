// Explicit Linux CI only: real production fonts, unlike normalized reader evidence.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import puppeteer from "puppeteer";
import { comparisonAvailability, missingRenderedFonts, summarizeResources } from "./asset-metrics.js";

if (process.platform !== "linux" || process.env.CI !== "true") throw new Error("Asset browser checks run only in Linux CI. Use npm test locally.");
const root = fileURLToPath(new URL("../", import.meta.url));
const evidence = path.join(root, ".cache/asset-evidence");
const temporary = await mkdtemp(path.join(os.tmpdir(), "website-assets-"));
const baselineRef = process.env.ASSET_BASELINE_REF || "HEAD";
const report = {
	baselineRef, visits: [], images: [], failures: [],
	method: "Unnormalized production font CSS. CDP Network.loadingFinished encodedDataLength counts actual response transfers including protocol headers; cache hits can be zero. Local text responses use gzip and Cache-Control public,max-age=600; HTML no-cache. These controlled cache headers are not a claim about live hosting. Cold context then warm second page, cache enabled. External requests allow only baseline Google Fonts; other external requests blocked. Filesystem bytes/gzip estimates and metadata-only share image are separate. No Core Web Vitals claim.",
};
const expect = (condition, message) => { if (!condition) report.failures.push(message); };
const servers = [];
let browser;
function command(executable, args, cwd = root) {
	const result = spawnSync(executable, args, { cwd, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
		env: { ...process.env, WEBMENTION_IO_TOKEN: "", SOCIAL_CARDS: "", DOTENV_CONFIG_PATH: path.join(temporary, "no-env") } });
	assert.equal(result.status, 0, `${executable} ${args.join(" ")}\n${result.error || ""}\n${result.stdout}\n${result.stderr}`);
	return result.stdout;
}
async function serve(directory) {
	const server = http.createServer(async (request, response) => {
		try {
			let target = path.resolve(directory, `.${decodeURIComponent(new URL(request.url, "http://localhost").pathname)}`);
			if (target !== directory && !target.startsWith(`${directory}${path.sep}`)) throw new Error("Invalid path");
			if ((await stat(target)).isDirectory()) target = path.join(target, "index.html");
			const extension = path.extname(target);
			const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".avif": "image/avif", ".webp": "image/webp", ".svg": "image/svg+xml" };
			const headers = { "Content-Type": mime[extension] || "application/octet-stream", "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=600" };
			let body = await readFile(target);
			if ([".html", ".css", ".js", ".svg"].includes(extension) && request.headers["accept-encoding"]?.includes("gzip")) {
				body = gzipSync(body); headers["Content-Encoding"] = "gzip"; headers.Vary = "Accept-Encoding";
			}
			response.writeHead(200, { ...headers, "Content-Length": body.length }); response.end(body);
		} catch { response.writeHead(404); response.end("Not found"); }
	});
	await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
	servers.push(server);
	return `http://127.0.0.1:${server.address().port}`;
}
async function openSession(origin, { baseline = false, blockFonts = false, width = 1280, dpr = 1 } = {}) {
	const context = await browser.createBrowserContext();
	const page = await context.newPage();
	await page.setViewport({ width, height: 900, deviceScaleFactor: dpr });
	const client = await page.createCDPSession();
	const resources = new Map();
	await client.send("Network.enable");
	await client.send("Network.setCacheDisabled", { cacheDisabled: false });
	await client.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
	client.on("Fetch.requestPaused", async event => {
		const url = event.request.url;
		const allowed = url.startsWith(`${origin}/`) || url.startsWith("data:") || (baseline && /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url));
		try {
			await client.send(allowed && !(blockFonts && event.resourceType === "Font") ? "Fetch.continueRequest" : "Fetch.failRequest",
				allowed && !(blockFonts && event.resourceType === "Font") ? { requestId: event.requestId } : { requestId: event.requestId, errorReason: "BlockedByClient" });
		} catch { /* Context may close after the final response. */ }
	});
	client.on("Network.requestWillBeSent", event => resources.set(event.requestId, { url: event.request.url, type: event.type, encodedBytes: 0, cached: false, finished: false }));
	client.on("Network.requestServedFromCache", event => { const item = resources.get(event.requestId); if (item) item.cached = true; });
	client.on("Network.responseReceived", event => {
		const item = resources.get(event.requestId);
		if (item) Object.assign(item, { status: event.response.status, mime: event.response.mimeType, cached: item.cached || !!event.response.fromDiskCache || !!event.response.fromServiceWorker });
	});
	client.on("Network.loadingFinished", event => { const item = resources.get(event.requestId); if (item) Object.assign(item, { finished: true, encodedBytes: event.encodedDataLength }); });
	client.on("Network.loadingFailed", event => { const item = resources.get(event.requestId); if (item) Object.assign(item, { finished: true, failure: event.errorText }); });
	return { page, context, client, resources, origin, width, dpr, baseline };
}
async function visit(session, route, label) {
	session.resources.clear();
	try { await session.page.goto(`${session.origin}${route}`, { waitUntil: "networkidle0", timeout: 30_000 }); }
	catch (error) {
		if (!session.baseline || error.name !== "TimeoutError") throw error;
		// A stalled third-party baseline font must not suppress current measurements.
	}
	await session.page.evaluate(async () => {
		await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 10_000))]);
	});
	const result = { label, route, width: session.width, dpr: session.dpr, resources: [...session.resources.values()] };
	result.summary = summarizeResources(result.resources);
	result.fonts = await session.page.evaluate(() => {
		const selectors = ["body", ".home-link", "main h1", ".post-tag", ".post-date", ".post-content > p", "blockquote", "blockquote p", "blockquote strong", "blockquote em", ".post-content strong", ".post-content em", "code", ".token.comment", ".token.function"];
		return { computed: selectors.flatMap(selector => {
			const el = document.querySelector(selector); if (!el) return [];
			const style = getComputedStyle(el);
			return [{ selector, family: style.fontFamily, weight: style.fontWeight, style: style.fontStyle, size: style.fontSize, opticalSizing: style.fontOpticalSizing }];
		}), declared: [...document.fonts].map(font => ({ family: font.family, weight: font.weight, style: font.style, status: font.status })) };
	});
	// CDP reports actual fonts used for rendered text, including synthetic fallback.
	await session.client.send("DOM.enable"); await session.client.send("CSS.enable");
	const { root: documentNode } = await session.client.send("DOM.getDocument");
	for (const item of result.fonts.computed) {
		const { nodeId } = await session.client.send("DOM.querySelector", { nodeId: documentNode.nodeId, selector: item.selector });
		if (nodeId) item.rendered = (await session.client.send("CSS.getPlatformFontsForNode", { nodeId })).fonts;
	}
	report.visits.push(result);
	return result;
}
try {
	await rm(evidence, { recursive: true, force: true }); await mkdir(evidence, { recursive: true });
	assert.match(baselineRef, /^(?:HEAD|[a-f0-9]{7,40})$/i, "Asset baseline must be HEAD or a commit SHA");
	report.baselineCommit = command("git", ["rev-parse", "--verify", `${baselineRef}^{commit}`]).trim();
	const directories = { baseline: path.join(temporary, "baseline"), current: path.join(temporary, "current") };
	await mkdir(directories.baseline);
	const archive = path.join(temporary, "baseline.tar");
	command("git", ["archive", report.baselineCommit, "--output", archive]); command("tar", ["-xf", archive, "-C", directories.baseline]);
	await cp(root, directories.current, { recursive: true, filter: source => !path.relative(root, source).split(path.sep).some(part => [".git", "node_modules", "_site", ".cache"].includes(part) || part.startsWith(".env")) });
	const fixture = `---\nlayout: layouts/post.njk\ntitle: Asset typography fixture\ndescription: Synthetic evidence, never published.\ndate: 2020-01-02\npermalink: /asset-fixture/\neleventyExcludeFromCollections: true\n---\nBody with **strong text**, *emphasis*, and \`inline code\`.\n\n> Quotation, **strong quotation**, and *italic quotation*.\n\n\`\`\`js\n// A comment\nfunction example() { return true; }\n\`\`\`\n`;
	const origins = {};
	report.files = {};
	for (const [variant, directory] of Object.entries(directories)) {
		await symlink(path.join(root, "node_modules"), path.join(directory, "node_modules"), "dir");
		await writeFile(path.join(directory, "content/asset-fixture.md"), fixture);
		command(process.execPath, ["node_modules/@11ty/eleventy/cmd.cjs", "--quiet"], directory);
		const output = path.join(directory, "_site");
		const html = await readFile(path.join(output, "index.html"));
		report.files[variant] = { homeHtmlBytes: html.length, homeHtmlGzipEstimate: gzipSync(html).length, shareImageBytes: (await stat(path.join(output, "img/share-img.png"))).size };
		await cp(path.join(output, "img/share-img.png"), path.join(evidence, `share-${variant}.png`));
		origins[variant] = await serve(output);
	}
	browser = await puppeteer.launch({ args: process.env.SOCIAL_CARDS_NO_SANDBOX === "1" ? ["--no-sandbox", "--disable-setuid-sandbox"] : [] });
	report.browser = await browser.version();
	for (const variant of ["baseline", "current"]) {
		const session = await openSession(origins[variant], { baseline: variant === "baseline" });
		const cold = await visit(session, "/", `${variant}-cold-home`);
		await session.page.screenshot({ path: path.join(evidence, `${variant}-home.png`) });
		const warm = await visit(session, "/blog/chat-gpt-historian-prompt/", `${variant}-warm-article`);
		if (variant === "current") {
			const coldStyles = cold.resources.filter(item => item.type === "Stylesheet" && item.status === 200);
			expect(coldStyles.length > 0, "Current home has no external shared stylesheet");
			for (const stylesheet of coldStyles) expect(warm.resources.some(item => item.url === stylesheet.url && item.cached), `Shared stylesheet was not reused from cache: ${stylesheet.url}`);
		}
		await session.context.close();
		const typography = await openSession(origins[variant], { baseline: variant === "baseline", width: 375 });
		const typographyVisit = await visit(typography, "/asset-fixture/", `${variant}-cold-typography`);
		if (variant === "current") {
			const missing = missingRenderedFonts(typographyVisit.fonts.computed);
			expect(missing.length === 0, `Production typography silently falls back or fails to render: ${missing.join(", ")}`);
		}
		await typography.page.screenshot({ path: path.join(evidence, `${variant}-typography.png`), fullPage: true });
		await typography.context.close();
	}
	const baselineResources = report.visits.filter(item => item.label.startsWith("baseline-")).flatMap(item => item.resources);
	report.fontComparison = comparisonAvailability(baselineResources);
	const currentResources = report.visits.filter(item => item.label.startsWith("current-")).flatMap(item => item.resources);
	expect(currentResources.some(item => item.type === "Font" && item.status === 200), "No production self-hosted font was measured");
	expect(!currentResources.some(item => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(item.url)), "Current production requests Google Fonts");
	for (const item of currentResources) if (["Font", "Stylesheet"].includes(item.type)) expect(!item.failure && item.status === 200, `Current asset failed: ${item.url}`);
	for (const variant of ["baseline", "current"]) for (const dpr of [1, 2]) for (const width of [320, 1280]) {
		const session = await openSession(origins[variant], { baseline: variant === "baseline", width, dpr });
		await visit(session, "/blog/from-pdf-to-platform/", `${variant}-image-${width}-${dpr}`);
		// The lead article image is the compendium screenshot in both versions.
		const selector = ".post-content img";
		await session.page.$eval(selector, image => image.scrollIntoView({ block: "center" }));
		await session.page.waitForFunction(selector => { const image = document.querySelector(selector); return image?.complete && image.naturalWidth > 0; }, {}, selector);
		const sample = await session.page.$eval(selector, image => {
			const box = image.getBoundingClientRect();
			return { currentSrc: image.currentSrc, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, intrinsicWidth: image.getAttribute("width"), intrinsicHeight: image.getAttribute("height"), sizes: image.sizes, sizesMathSupported: CSS.supports("width", image.sizes), srcset: image.srcset, renderedWidth: box.width, renderedHeight: box.height, loading: image.loading, decoding: image.decoding };
		});
		// naturalWidth may be density-corrected. Decode the selected bytes separately.
		const selected = await session.page.evaluate(async url => { const blob = await (await fetch(url)).blob(); const bitmap = await createImageBitmap(blob); const result = { width: bitmap.width, height: bitmap.height, bodyBytes: blob.size }; bitmap.close(); return result; }, sample.currentSrc);
		report.images.push({ variant, viewportWidth: width, dpr, ...sample, selected, resources: [...session.resources.values()] });
		if (variant === "current") {
			expect(sample.sizes.length > 0 && sample.srcset.length > 0, "Responsive screenshot lacks sizes/srcset");
			expect(sample.sizesMathSupported, `Browser does not support the image sizes math: ${sample.sizes}`);
			if (width === 1280 && dpr === 1) expect(selected.width <= 960, "Desktop image selection ignores the bounded 608px reading column");
			expect(Number(sample.intrinsicWidth) > 0 && Number(sample.intrinsicHeight) > 0, "Screenshot lacks intrinsic dimensions");
			expect(selected.width <= 1916, "Screenshot was upscaled");
			expect(sample.loading === "lazy" && sample.decoding === "async", "Screenshot lost lazy/async policy");
			expect(sample.renderedWidth <= width && Math.abs(sample.renderedHeight / sample.renderedWidth - 1210 / 1916) < 0.01, "Screenshot has incorrect geometry");
		}
		if (dpr === 1) await session.page.screenshot({ path: path.join(evidence, `${variant}-image-${width}.png`) });
		await session.context.close();
	}
	for (const dpr of [1, 2]) {
		const samples = report.images.filter(item => item.variant === "current" && item.dpr === dpr);
		const mobile = samples.find(item => item.viewportWidth === 320);
		const desktop = samples.find(item => item.viewportWidth === 1280);
		expect(Boolean(mobile && desktop), `Responsive-image evidence is incomplete at DPR ${dpr}`);
		expect(mobile.selected.width < desktop.selected.width, `Mobile screenshot did not select a smaller candidate at DPR ${dpr}`);
	}
	const reddit = await openSession(origins.current);
	const redditVisit = await visit(reddit, "/blog/ai-thinking-fast-and-slow/", "current-reddit-reference-blocked-third-parties");
	report.redditReference = await reddit.page.$eval(".post-content", article => {
		const link = article.querySelector('a[href*="/comments/1m4lsso/"]');
		return {
			visibleSource: Boolean(link?.getClientRects().length),
			visibleSummary: article.innerText.includes("a Replit coding agent deleted a production database and tried to cover it up"),
			hasEmbed: Boolean(article.querySelector('iframe, script[src*="reddit.com"], .reddit-embed-bq')),
		};
	});
	expect(report.redditReference.visibleSource && report.redditReference.visibleSummary && !report.redditReference.hasEmbed,
		"Reddit reference does not render as a visible summary and source link");
	expect(!redditVisit.resources.some(({ url }) => /^https?:\/\/(?:[^/]+\.)?reddit\.com\//i.test(url)),
		"Article requested a Reddit resource before the reader followed a link");
	await reddit.context.close();
	const fallback = await openSession(origins.current, { blockFonts: true, width: 320 });
	await visit(fallback, "/asset-fixture/", "current-fonts-blocked");
	await fallback.page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
	report.fallback = await fallback.page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, visibleText: [...document.querySelectorAll("main p, main h1, .nav a")].every(el => { const style = getComputedStyle(el); return style.visibility !== "hidden" && style.display !== "none" && el.getBoundingClientRect().height > 0; }) }));
	expect(!report.fallback.overflow && report.fallback.visibleText, "Blocked-font fallback is hidden or overflows at 320px/200% text");
	await fallback.page.screenshot({ path: path.join(evidence, "current-fonts-blocked-200-percent.png"), fullPage: true });
	await fallback.context.close();
} catch (error) { report.failures.push(error.stack || String(error)); }
finally {
	const cleanup = await Promise.allSettled([
		browser?.close(),
		...servers.map(server => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))),
		rm(temporary, { recursive: true, force: true }),
	]);
	for (const result of cleanup) if (result.status === "rejected") report.failures.push(`Cleanup: ${result.reason}`);
	await mkdir(evidence, { recursive: true });
	await writeFile(path.join(evidence, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(`Asset evidence: ${report.visits.length} visits, ${report.images.length} image selections; ${report.fontComparison || "comparison incomplete"}`);
assert.equal(report.failures.length, 0, report.failures.join("\n"));
