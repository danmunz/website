import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import nunjucks from "nunjucks";
import puppeteer from "puppeteer";
import { cardDestination, manifestRelativePath } from "../_config/social-cards.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const renderOptions = { width: 1200, height: 630, deviceScaleFactor: 1, minimumTitleSize: 32, maximumTitleSize: 108 };
const fontFiles = [
	["Oswald", "@fontsource/oswald/files/oswald-latin-400-normal.woff2"],
	["Bricolage Grotesque", "@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-400-normal.woff2"],
];

export async function loadRenderInputs(root = projectRoot) {
	const template = await readFile(path.join(root, "_includes/og-image-template.html"), "utf8");
	const fonts = await Promise.all(fontFiles.map(async ([family, file]) => ({ family, bytes: await readFile(path.join(root, "node_modules", file)) })));
	const pkg = JSON.parse(await readFile(path.join(root, "node_modules/puppeteer/package.json"), "utf8"));
	return { template, fonts, options: renderOptions, rendererVersion: `cards-v1/puppeteer-${pkg.version}/${process.platform}/${process.arch}` };
}

export function cardFingerprint(card, inputs) {
	return createHash("sha256").update(JSON.stringify({ title: card.title, template: inputs.template,
		fonts: inputs.fonts.map(font => ({ family: font.family, bytes: font.bytes.toString("base64") })),
		options: inputs.options, rendererVersion: inputs.rendererVersion })).digest("hex");
}

export function renderCardHtml(card, inputs) {
	const env = new nunjucks.Environment(null, { autoescape: true, throwOnUndefined: true });
	return env.renderString(inputs.template, { title: card.title, fonts: inputs.fonts.map(font => ({ family: font.family, data: font.bytes.toString("base64") })) });
}

export function validatePng(bytes, { width, height } = renderOptions) {
	if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
		|| bytes.toString("ascii", 12, 16) !== "IHDR" || bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height) {
		throw new Error(`Expected a ${width}×${height} PNG social card.`);
	}
	const chunks = [];
	let offset = 8, ended = false, channels;
	while (offset + 12 <= bytes.length) {
		const size = bytes.readUInt32BE(offset);
		const end = offset + 12 + size;
		if (end > bytes.length) throw new Error("Truncated social-card PNG chunk.");
		const type = bytes.toString("ascii", offset + 4, offset + 8);
		const data = bytes.subarray(offset + 8, end - 4);
		let crc = 0xffffffff;
		for (const byte of bytes.subarray(offset + 4, end - 4)) {
			crc ^= byte;
			for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
		}
		if (((crc ^ 0xffffffff) >>> 0) !== bytes.readUInt32BE(end - 4)) throw new Error("Corrupt social-card PNG checksum.");
		if (type === "IHDR") {
			if (offset !== 8 || size !== 13 || data[8] !== 8 || ![2, 6].includes(data[9]) || data[10] || data[11] || data[12]) {
				throw new Error("Unsupported social-card PNG format.");
			}
			channels = data[9] === 6 ? 4 : 3;
		} else if (type === "IDAT") chunks.push(data);
		else if (type === "IEND") {
			if (size !== 0 || end !== bytes.length) throw new Error("Invalid social-card PNG ending.");
			ended = true;
		}
		offset = end;
	}
	if (!ended || !channels || !chunks.length) throw new Error("Incomplete social-card PNG.");
	const rowSize = width * channels + 1;
	const pixels = inflateSync(Buffer.concat(chunks), { maxOutputLength: rowSize * height });
	if (pixels.length !== rowSize * height) throw new Error("Incomplete social-card PNG pixels.");
	for (let row = 0; row < height; row++) if (pixels[row * rowSize] > 4) throw new Error("Invalid social-card PNG row filter.");
}

export async function createBrowserRenderer(options = renderOptions) {
	const noSandbox = process.env.SOCIAL_CARDS_NO_SANDBOX === "1";
	if (noSandbox && process.env.CI !== "true") throw new Error("SOCIAL_CARDS_NO_SANDBOX is restricted to the trusted CI renderer.");
	const browser = await puppeteer.launch({ args: noSandbox ? ["--no-sandbox", "--disable-setuid-sandbox"] : [] });
	let page;
	try {
		page = await browser.newPage();
		await page.setViewport({ width: options.width, height: options.height, deviceScaleFactor: options.deviceScaleFactor });
		await page.setRequestInterception(true);
		page.on("request", request => /^(data:|about:)/.test(request.url()) ? request.continue() : request.abort());
	} catch (error) {
		await browser.close();
		throw error;
	}
	return {
		get closed() { return !browser.connected && page.isClosed(); },
		async render(html, destination) {
			await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
			const diagnostics = await page.evaluate(async ({ minimumTitleSize, maximumTitleSize }) => {
				await Promise.all([document.fonts.load('400 108px "Oswald"'), document.fonts.load('400 48px "Bricolage Grotesque"')]);
				await document.fonts.ready;
				const fontFaces = [...document.fonts];
				if (fontFaces.length !== 2 || fontFaces.some(font => font.status !== "loaded")) throw new Error("Social-card fonts did not load.");
				const title = document.querySelector("h1");
				let size = maximumTitleSize;
				title.style.fontSize = `${size}px`;
				while ((title.scrollHeight > 430 || title.scrollWidth > 1040) && size > minimumTitleSize) {
					title.style.fontSize = `${--size}px`;
				}
				const bounds = document.querySelector(".container").getBoundingClientRect();
				if (title.scrollHeight > 430 || title.scrollWidth > 1040 || bounds.top < 0 || bounds.bottom > 630) {
					throw new Error("Social-card title cannot fit within 1200×630; shorten the title or adjust the template.");
				}
				return { title: title.textContent, titleSize: size, fontsReady: true, top: bounds.top, bottom: bounds.bottom };
			}, options);
			await page.screenshot({ path: destination, type: "png" });
			return diagnostics;
		},
		async close() {
			try { await page.close(); } finally { await browser.close(); }
		},
	};
}

export async function generateSocialImages({ root = projectRoot, inputs, rendererFactory = createBrowserRenderer } = {}) {
	root = path.resolve(root);
	const manifest = JSON.parse(await readFile(path.join(root, manifestRelativePath), "utf8"));
	const output = path.join(root, "_site");
	if (manifest.version !== 1 || path.resolve(manifest.root) !== root || path.resolve(manifest.output) !== output || !Array.isArray(manifest.cards)) {
		throw new Error("Social-card manifest does not belong to this checkout and _site output. Run a fresh build.");
	}
	const destinations = new Set();
	for (const card of manifest.cards) {
		const destination = cardDestination(card.socialImage, card.source);
		if (!destination || typeof card.title !== "string" || !card.title.trim() || destinations.has(destination)) throw new Error(`Invalid or duplicate social-card manifest entry: ${card.source}`);
		destinations.add(destination);
	}
	inputs ??= await loadRenderInputs(root);
	const publicCards = path.join(output, "og-images");
	const cache = path.join(root, ".cache/social-cards");
	// This namespace is exclusively generated. The current manifest alone controls publication.
	await rm(publicCards, { recursive: true, force: true });
	await mkdir(publicCards, { recursive: true });
	await mkdir(cache, { recursive: true });
	let renderer;
	const result = { rendered: 0, cached: 0, diagnostics: [] };
	try {
		for (const card of manifest.cards) {
			const cachedFile = path.join(cache, `${cardFingerprint(card, inputs)}.png`);
			let hit = false;
			let cachedBytes;
			try { cachedBytes = await readFile(cachedFile); }
			catch (error) { if (error.code !== "ENOENT") throw error; }
			if (cachedBytes) {
				try { validatePng(cachedBytes, inputs.options); hit = true; }
				catch { /* An incomplete or corrupt cache entry is regenerated. */ }
			}
			if (!hit) {
				renderer ??= await rendererFactory(inputs.options);
				const temporary = `${cachedFile}.${randomUUID()}.tmp`;
				try {
					result.diagnostics.push(await renderer.render(renderCardHtml(card, inputs), temporary));
					validatePng(await readFile(temporary), inputs.options);
					await rename(temporary, cachedFile);
					result.rendered++;
				} finally { await rm(temporary, { force: true }); }
			} else result.cached++;
			const destination = path.join(publicCards, cardDestination(card.socialImage));
			await mkdir(path.dirname(destination), { recursive: true });
			await copyFile(cachedFile, destination);
		}
	} catch (error) {
		await rm(publicCards, { recursive: true, force: true });
		throw error;
	} finally { if (renderer) await renderer.close(); }
	return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const result = await generateSocialImages();
		console.log(`Social cards: ${result.rendered} rendered, ${result.cached} reused from cache.`);
	} catch (error) {
		console.error(`Social-card generation failed: ${error.message}`);
		process.exitCode = 1;
	}
}
