import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Eleventy from "@11ty/eleventy";
import Image, { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import { imageOptions } from "../_config/image-options.js";

async function raster(width, height, format = "png") {
	const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#468b9c"/><path d="M0 0L${width} ${height}" stroke="#ff981d" stroke-width="8"/></svg>`);
	const result = await Image(svg, { formats: [format], widths: ["auto"], dryRun: true });
	return result[format][0].buffer;
}

async function fixture(t, markup, files = {}) {
	const temporary = await mkdtemp(path.join(os.tmpdir(), "website-images-"));
	t.after(() => rm(temporary, { recursive: true, force: true }));
	const input = path.join(temporary, "input");
	const output = path.join(temporary, "output");
	await mkdir(input);
	await writeFile(path.join(input, "index.html"), markup);
	for (const [name, bytes] of Object.entries(files)) await writeFile(path.join(input, name), bytes);
	await new Eleventy(input, output, {
		configPath: false, quietMode: true,
		config: config => config.addPlugin(eleventyImageTransformPlugin, {
			...imageOptions,
			transformOnRequest: false,
			cacheOptions: { directory: path.join(temporary, "cache") },
		}),
	}).write();
	return { html: await readFile(path.join(output, "index.html"), "utf8"), output };
}

function attributes(tag) {
	return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
}

async function assertCandidates(html, output, expectedWidths, ratio) {
	const tags = [...html.matchAll(/<(?:img|source)\b[^>]*>/g)].map(match => attributes(match[0]));
	assert.ok(tags.length > 0, "The transform emits image markup");
	for (const tag of tags) {
		if (expectedWidths.length > 1) assert.equal(tag.sizes, "min(38rem, calc(100vw - 2rem))");
		const candidates = tag.srcset
			? tag.srcset.split(",").map(entry => {
				const [url, width] = entry.trim().split(/\s+/);
				// A single source needs no width descriptor in HTML.
				if (!width) assert.equal(expectedWidths.length, 1);
				return [url, width ?? `${expectedWidths[0]}w`];
			})
			: [[tag.src, `${tag.width}w`]];
		assert.deepEqual(candidates.map(([, width]) => Number(width.slice(0, -1))), expectedWidths);
		for (const [url, width] of candidates) {
			assert.ok(url.startsWith("/"), "Remote sources are emitted as local assets");
			const file = path.join(output, url);
			assert.ok((await readFile(file)).length > 0, `Asset exists: ${url}`);
			const metadata = await Image(file, { formats: ["auto"], widths: ["auto"], statsOnly: true, dryRun: true });
			const actual = Object.values(metadata)[0][0];
			assert.equal(actual.width, Number(width.slice(0, -1)), "Descriptor matches encoded width");
			assert.equal(actual.height, Math.round(actual.width / ratio), "Aspect ratio is preserved");
		}
	}
	const img = tags.find(tag => tag.src);
	assert.equal(img.loading, "lazy");
	assert.equal(img.decoding, "async");
	assert.equal(Number(img.width), expectedWidths.at(-1));
	assert.equal(Number(img.height), Math.round(Number(img.width) / ratio));
	assert.equal(img.alt, "Fixture image");
}

test("large local images emit bounded responsive formats with truthful asset dimensions", async t => {
	const { html, output } = await fixture(t, '<img src="./large.png" alt="Fixture image">', { "large.png": await raster(1600, 800) });
	assert.match(html, /<picture>/);
	assert.match(html, /type="image\/avif"/);
	assert.match(html, /type="image\/webp"/);
	await assertCandidates(html, output, [320, 640, 960, 1280], 2);
});

test("small sources are never upscaled to the candidate ladder", async t => {
	const { html, output } = await fixture(t, '<img src="./small.png" alt="Fixture image">', { "small.png": await raster(200, 100) });
	await assertCandidates(html, output, [200], 2);
});

test("a source between candidate widths supplies its original width without upscaling", async t => {
	const { html, output } = await fixture(t, '<img src="./medium.png" alt="Fixture image">', { "medium.png": await raster(850, 425) });
	await assertCandidates(html, output, [320, 640, 850], 2);
});

test("remote WebP can remain a single img while supplying local responsive candidates", async t => {
	const bytes = await raster(1000, 500, "webp");
	let requests = 0;
	const server = createServer((_request, response) => {
		requests++;
		response.writeHead(200, { "Content-Type": "image/webp" });
		response.end(bytes);
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	t.after(() => new Promise(resolve => server.close(resolve)));
	const url = `http://127.0.0.1:${server.address().port}/fixture.webp`;
	const { html, output } = await fixture(t, `<img src="${url}" alt="Fixture image" eleventy:formats="webp">`);
	assert.ok(requests > 0, "Fixture was fetched through the real remote image path");
	assert.doesNotMatch(html, /<picture/);
	// Image avoids a near-duplicate 1000px candidate beside the 960px one.
	await assertCandidates(html, output, [320, 640, 960], 2);
});

test("default social image remains a decodable 1200 by 630 PNG", async () => {
	const bytes = await readFile(new URL("../public/img/share-img.png", import.meta.url));
	assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
	const metadata = await Image(bytes, { formats: ["auto"], widths: ["auto"], statsOnly: true, dryRun: true });
	assert.equal(metadata.png[0].width, 1200);
	assert.equal(metadata.png[0].height, 630);
});
