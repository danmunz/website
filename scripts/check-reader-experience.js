// Explicit Linux-CI browser command; never imported or discovered by npm test.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { colorChannels, composite, contrast, targetAssessment } from "./reader-metrics.js";

if (process.platform !== "linux" || process.env.CI !== "true") {
	throw new Error("Reader browser checks run only in Linux CI. Use npm test for local checks.");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const baselineRef = process.env.READER_BASELINE_REF || "HEAD";
const evidence = path.join(root, ".cache/reader-evidence");
const temporary = await mkdtemp(path.join(os.tmpdir(), "website-reader-"));
const report = {
	baselineRef,
	normalization: "Both snapshots use packaged Latin Oswald 400/500 and Bricolage Grotesque 300/400/500/600. External requests blocked; other faces use their existing system fallback. Enlarged-text check sets root font size to 200%; it is not browser zoom or assistive-technology certification.",
	visitedMethod: "A surrogate class applies declared :visited rules; browser history and privacy-masked computed visited styles are not tested.",
	viewports: [], contrast: [], targets: [], keyboard: [], failures: [],
};
const expect = (condition, message) => { if (!condition) report.failures.push(message); };
const servers = [];
let browser;

function command(executable, args, cwd = root) {
	const result = spawnSync(executable, args, {
		cwd, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
		env: { ...process.env, WEBMENTION_IO_TOKEN: "", SOCIAL_CARDS: "", DOTENV_CONFIG_PATH: path.join(temporary, "no-env") },
	});
	assert.equal(result.status, 0, `${executable} ${args.join(" ")}\n${result.error || ""}\n${result.stdout}\n${result.stderr}`);
	return result.stdout;
}

async function serve(directory) {
	const server = http.createServer(async (request, response) => {
		try {
			const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
			let target = path.resolve(directory, `.${pathname}`);
			if (!target.startsWith(`${directory}${path.sep}`) && target !== directory) throw new Error("Invalid path");
			if ((await stat(target)).isDirectory()) target = path.join(target, "index.html");
			const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".avif": "image/avif", ".webp": "image/webp", ".jpg": "image/jpeg" };
			response.writeHead(200, { "Content-Type": mime[path.extname(target)] || "application/octet-stream" });
			response.end(await readFile(target));
		} catch { response.writeHead(404); response.end("Not found"); }
	});
	await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
	servers.push(server);
	return `http://127.0.0.1:${server.address().port}`;
}

async function fontStyles() {
	let css = "";
	for (const [slug, family, weights] of [["oswald", "Oswald", [400, 500]], ["bricolage-grotesque", "Bricolage Grotesque", [300, 400, 500, 600]]]) {
		for (const weight of weights) {
			const bytes = await readFile(path.join(root, `node_modules/@fontsource/${slug}/files/${slug}-latin-${weight}-normal.woff2`));
			css += `@font-face { font-family: '${family}'; font-style: normal; font-weight: ${weight}; src: url(data:font/woff2;base64,${bytes.toString("base64")}) format('woff2'); }\n`;
		}
	}
	return css;
}

async function geometry(page) {
	return page.evaluate(() => {
		const box = selector => {
			const el = document.querySelector(selector);
			if (!el) return null;
			const r = el.getBoundingClientRect();
			return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom, fontSize: getComputedStyle(el).fontSize, text: el.textContent.trim() };
		};
		const scrollWidth = document.documentElement.scrollWidth;
		const overflow = scrollWidth > innerWidth + 1 ? [...document.querySelectorAll("main *")].flatMap(el => {
			const rect = el.getBoundingClientRect();
			const style = getComputedStyle(el);
			if (rect.width <= 1 || !(rect.right > innerWidth + 1 || rect.left < -1 || (style.overflowX === "visible" && el.scrollWidth > el.clientWidth + 1))) return [];
			return [{ tag: el.tagName.toLowerCase(), id: el.id, classes: el.className, text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 100), left: rect.left, right: rect.right, width: rect.width, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, overflowX: style.overflowX, whiteSpace: style.whiteSpace, overflowWrap: style.overflowWrap }];
		}).sort((a, b) => b.right - a.right).slice(0, 25) : [];
		return { width: innerWidth, scrollWidth, overflow, title: box("main h1"), opening: box(".post-content > p"), date: box(".post-date"), tags: box(".tag-list") };
	});
}

async function linkSample(page, selector, state) {
	await page.mouse.move(0, 0);
	await page.$eval(selector, el => { el.blur(); el.classList.remove("reader-visited"); });
	if (state === "hover") await page.hover(selector);
	if (state === "focus") { await page.keyboard.press("Tab"); await page.focus(selector); }
	if (state === "visited-declaration") await page.$eval(selector, el => el.classList.add("reader-visited"));
	// Allow the actual link transition to settle before reading its final color.
	await new Promise(resolve => setTimeout(resolve, 350));
	const sample = await page.$eval(selector, el => {
		const style = getComputedStyle(el);
		const layers = [];
		for (let node = el; node; node = node.parentElement) layers.push(getComputedStyle(node).backgroundColor);
		return { foreground: style.color, layers, outline: { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor }, text: el.textContent.trim().slice(0, 60) };
	});
	let background = [255, 255, 255];
	for (const layer of sample.layers.toReversed()) background = composite(colorChannels(layer), background);
	const foreground = composite(colorChannels(sample.foreground), background);
	const ratio = contrast(foreground, background);
	report.contrast.push({ selector, state, ...sample, background, ratio });
	expect(ratio >= 4.5, `${selector} ${state} contrast ${ratio.toFixed(2)} < 4.5`);
	if (state === "focus") {
		expect(sample.outline.style !== "none" && parseFloat(sample.outline.width) >= 2, `${selector} lacks visible focus outline`);
		let adjacentBackground = [255, 255, 255];
		for (const layer of sample.layers.slice(1).toReversed()) adjacentBackground = composite(colorChannels(layer), adjacentBackground);
		const outlineRatio = contrast(composite(colorChannels(sample.outline.color), adjacentBackground), adjacentBackground);
		report.contrast.at(-1).outlineRatio = outlineRatio;
		expect(outlineRatio >= 3, `${selector} focus outline lacks 3:1 contrast against its adjacent surface`);
	}
	await page.$eval(selector, el => { el.blur(); el.classList.remove("reader-visited"); });
}

try {
	await rm(evidence, { recursive: true, force: true });
	await mkdir(evidence, { recursive: true });
	const current = path.join(temporary, "current");
	const baseline = path.join(temporary, "baseline");
	await cp(root, current, {
		recursive: true,
		filter: source => !path.relative(root, source).split(path.sep).some(part => [".git", "node_modules", "_site", ".cache"].includes(part) || part.startsWith(".env")),
	});
	await mkdir(baseline);
	const archive = path.join(temporary, "baseline.tar");
	assert.match(baselineRef, /^(?:HEAD|[a-f0-9]{7,40})$/i, "Reader baseline must be HEAD or a commit SHA");
	report.baselineCommit = command("git", ["rev-parse", "--verify", `${baselineRef}^{commit}`]).trim();
	command("git", ["archive", report.baselineCommit, "--output", archive]);
	command("tar", ["-xf", archive, "-C", baseline]);
	for (const directory of [baseline, current]) {
		await symlink(path.join(root, "node_modules"), path.join(directory, "node_modules"), "dir");
	}
	const interactionFixture = `---\ntitle: Reader interaction fixture\ndescription: Synthetic browser evidence.\ndate: 2020-01-02\npermalink: /reader-fixture/\ntags: [Accessibility, software engineering]\n---\nA sentence with a [normal link](/about/) and a first reference.[^repeat] Another reference to the same note.[^repeat]\n\n<div class="note"><a href="/about/">Note link</a></div>\n\n> A quotation with a [quote link](/about/).\n\n## Reading section\n\n[^repeat]: A footnote with a [footnote link](/about/).\n`;
	for (const directory of [baseline, current]) command(process.execPath, ["node_modules/@11ty/eleventy/cmd.cjs", "--quiet"], directory);
	const origins = { baseline: await serve(path.join(baseline, "_site")), current: await serve(path.join(current, "_site")) };
	const fonts = await fontStyles();
	const noSandbox = process.env.SOCIAL_CARDS_NO_SANDBOX === "1";
	browser = await puppeteer.launch({ args: noSandbox ? ["--no-sandbox", "--disable-setuid-sandbox"] : [] });
	const context = await browser.createBrowserContext();
	const page = await context.newPage();
	await page.setRequestInterception(true);
	page.on("request", request => {
		const url = request.url();
		if (url.startsWith("data:") || Object.values(origins).some(origin => url.startsWith(`${origin}/`))) request.continue();
		else request.abort();
	});
	const navigate = async (variant, route) => {
		await page.goto(`${origins[variant]}${route}`, { waitUntil: "load", timeout: 30_000 });
		await page.addStyleTag({ content: fonts });
		await page.evaluate(async () => {
			await Promise.all([document.fonts.load('400 40px "Oswald"'), document.fonts.load('500 24px "Oswald"'), ...[300, 400, 500, 600].map(weight => document.fonts.load(`${weight} 18px "Bricolage Grotesque"`))]);
			await document.fonts.ready;
			if ([...document.fonts].some(face => face.status !== "loaded")) throw new Error("Evidence fonts failed to load");
		});
	};
	const routes = [
		["home", "/"], ["archive", "/blog/"], ["historian", "/blog/chat-gpt-historian-prompt/"],
		["uncrisis", "/blog/ai-is-a-software-uncrisis/"], ["tag", "/tags/ai/"],
	];
	for (const width of [320, 375, 1280]) {
		await page.setViewport({ width, height: width < 500 ? 812 : 900, deviceScaleFactor: 1 });
		for (const [name, route] of routes) {
			const measurements = {};
			for (const variant of ["baseline", "current"]) {
				await navigate(variant, route);
				measurements[variant] = await geometry(page);
				await page.screenshot({ path: path.join(evidence, `${name}-${width}-${variant}.png`) });
				if (variant === "current") {
					expect(measurements.current.scrollWidth <= width + 1, `${name} overflows at ${width}px`);
					const redundantAnchors = await page.$$eval(".postlist-title .ha, .postlist-title .ha-placeholder", elements => elements.length);
					expect(redundantAnchors === 0, `${name} adds redundant fragment controls to article links at ${width}px`);
				}
			}
			if (name === "historian" && width < 500) {
				expect(parseFloat(measurements.current.title.fontSize) <= 48, `Historical title exceeds deliberate mobile scale at ${width}px`);
				if (measurements.current.title.text === measurements.baseline.title.text
					&& parseFloat(measurements.baseline.title.fontSize) > parseFloat(measurements.current.title.fontSize)) {
					expect(measurements.current.title.height < measurements.baseline.title.height, `Historical title did not shrink at ${width}px`);
					expect(measurements.current.opening.y < measurements.baseline.opening.y, `Opening copy did not move up at ${width}px`);
				}
			}
			const { date, tags } = measurements.current;
			if (date && tags) expect(date.bottom <= tags.y + 1 || date.right <= tags.x + 1 || tags.right <= date.x + 1, `${name} metadata overlaps at ${width}px`);
			report.viewports.push({ name, width, ...measurements });
		}
	}

	// Add synthetic interactions only after matched real-page screenshots: otherwise
	// its categories/post count would confound the archive and homepage comparison.
	await writeFile(path.join(current, "content/blog/reader-fixture.md"), interactionFixture);
	command(process.execPath, ["node_modules/@11ty/eleventy/cmd.cjs", "--quiet"], current);
	await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
	await navigate("current", "/reader-fixture/");
	const visitedCss = await page.evaluate(() => {
		const read = rules => [...rules].flatMap(rule => {
			if (rule.selectorText?.includes(":visited")) return `${rule.selectorText.replaceAll(":visited", ".reader-visited")} { ${rule.style.cssText} }`;
			if (rule.cssRules && (!rule.conditionText || matchMedia(rule.conditionText).matches)) return read(rule.cssRules);
			return [];
		});
		return [...document.styleSheets].flatMap(sheet => { try { return read(sheet.cssRules); } catch { return []; } }).join("\n");
	});
	expect(visitedCss.length > 0, "No declared visited styles found for palette verification");
	await page.addStyleTag({ content: visitedCss });
	for (const selector of [".nav a", ".post-tag", ".post-content > p a", ".note a", "blockquote a", ".footnotes p a:not(.footnote-backref)", ".footnote-ref a", ".footnote-backref", "footer a"]) {
		for (const state of ["default", "hover", "focus", "visited-declaration"]) await linkSample(page, selector, state);
	}
	const targets = await page.$$eval(".nav a, .post-tag, .footnote-backref", elements => elements.map(el => {
		const rect = el.getBoundingClientRect();
		return { text: el.getAttribute("aria-label") || el.textContent.trim(), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
	}));
	for (const target of targets) {
		const result = targetAssessment(target, targets);
		report.targets.push({ ...target, result });
		expect(result !== "fail" && result !== "overlap", `Target lacks size/spacing or overlaps: ${target.text}`);
	}
	report.targets.push({ selector: ".footnote-ref a", result: "inline exception", reason: "Inline references sit within sentence line height; no blanket 44px requirement applied." });

	await navigate("current", "/reader-fixture/");
	await page.keyboard.press("Tab");
	const skip = await page.evaluate(() => ({ id: document.activeElement.id, box: document.activeElement.getBoundingClientRect().toJSON() }));
	expect(skip.id === "skip-link" && skip.box.width > 1 && skip.box.height > 1, "Skip link is not visible as first keyboard target");
	await page.keyboard.press("Enter");
	await page.keyboard.press("Tab");
	const insideMain = await page.evaluate(() => Boolean(document.activeElement.closest("main")));
	expect(insideMain, "Skip link does not continue keyboard navigation inside main");
	report.keyboard.push({ check: "skip link", firstTarget: skip.id, continuesInsideMain: insideMain });
	for (const referenceId of ["fnref1", "fnref1:1"]) {
		await page.evaluate(id => document.getElementById(id).focus(), referenceId);
		const label = await page.evaluate(() => document.activeElement.getAttribute("aria-label"));
		expect(label?.startsWith("Read footnote 1"), `Missing reference label ${referenceId}`);
		await page.keyboard.press("Enter");
		const destination = await page.evaluate(() => document.activeElement.id);
		expect(destination === "fn1", `${referenceId} did not focus the footnote destination`);
		const back = await page.$(`.footnote-backref[href="#${referenceId}"]`);
		expect(Boolean(back), `Missing return destination for ${referenceId}`);
		if (back) {
			await back.focus();
			const backLabel = await back.evaluate(el => el.getAttribute("aria-label"));
			expect(backLabel?.includes("Return to reference"), `Missing return label for ${referenceId}`);
			await page.keyboard.press("Enter");
			const returned = await page.evaluate(() => document.activeElement.id);
			expect(returned === referenceId, `Footnote return did not focus ${referenceId}`);
			report.keyboard.push({ referenceId, label, destination, backLabel, returned });
		}
	}

	await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
	const motion = await page.evaluate(() => {
		const link = getComputedStyle(document.querySelector(".post-content a"));
		const transition = getComputedStyle(document.documentElement, "::view-transition-old(root)");
		return { transitionDuration: link.transitionDuration, animationDuration: link.animationDuration, viewAnimation: transition.animationName, scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior };
	});
	expect(motion.transitionDuration.split(",").every(value => parseFloat(value) <= 0.001), "Reduced motion retains link transition");
	expect(motion.animationDuration.split(",").every(value => parseFloat(value) <= 0.001), "Reduced motion retains link animation");
	expect(motion.scrollBehavior !== "smooth", "Reduced motion retains smooth scrolling");
	expect(motion.viewAnimation === "none", "Reduced motion retains root view-transition animation");
	report.reducedMotion = motion;
	await page.emulateMediaFeatures([]);
	for (const width of [320, 375]) {
		await page.setViewport({ width, height: 812, deviceScaleFactor: 1 });
		await navigate("current", "/blog/chat-gpt-historian-prompt/");
		await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
		const enlarged = await geometry(page);
		expect(enlarged.scrollWidth <= width + 1, `200% root text overflows at ${width}px`);
		report.viewports.push({ name: "historian-200-percent-root-text", width, current: enlarged });
		await page.screenshot({ path: path.join(evidence, `historian-${width}-text200.png`) });
	}
	await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
	await navigate("current", "/blog/chat-gpt-historian-prompt/");
	await page.emulateMediaType("print");
	const print = await page.evaluate(() => ({
		header: getComputedStyle(document.querySelector("header")).display,
		footer: getComputedStyle(document.querySelector("footer")).display,
		article: getComputedStyle(document.querySelector(".post-content")).display,
		footnotes: getComputedStyle(document.querySelector(".footnotes")).display,
		width: document.documentElement.scrollWidth,
	}));
	expect(print.header === "none" && print.footer === "none", "Print retains distracting site navigation/footer");
	expect(print.article !== "none" && print.footnotes !== "none", "Print hides article or footnotes");
	report.print = print;
	await page.pdf({ path: path.join(evidence, "historian-print.pdf"), format: "A4", printBackground: true, margin: { top: "15mm", bottom: "15mm", left: "15mm", right: "15mm" } });
	await page.screenshot({ path: path.join(evidence, "historian-print.png") });
	await context.close();
} catch (error) {
	report.failures.push(error.stack || error.message);
} finally {
	const cleanup = await Promise.allSettled([
		...(browser ? [browser.close()] : []),
		...servers.map(server => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); }),
	]);
	for (const result of cleanup) if (result.status === "rejected") report.failures.push(`Cleanup: ${result.reason}`);
	try { await writeFile(path.join(evidence, "report.json"), JSON.stringify(report, null, 2)); }
	finally { await rm(temporary, { recursive: true, force: true }); }
}
if (report.failures.length) throw new Error(report.failures.join("\n"));
console.log(`Reader checks passed: ${report.viewports.length} layout comparisons, ${report.contrast.length} contrast samples, keyboard/targets/motion/print. Evidence: .cache/reader-evidence/`);
