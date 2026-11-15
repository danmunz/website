import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Eleventy from "@11ty/eleventy";
import contentData from "../content/content.11tydata.js";
import { fontCss, fontFaces, fontPassthrough } from "../_config/fonts.js";

const root = fileURLToPath(new URL("../", import.meta.url));

test("real base layout uses one explicit or fallback image independent of source filename", async () => {
	const temporary = await mkdtemp(path.join(os.tmpdir(), "website-social-"));
	try {
		const input = path.join(temporary, "content");
		await mkdir(path.join(input, "_includes/layouts"), { recursive: true });
		await mkdir(path.join(input, "_includes/css"), { recursive: true });
		await mkdir(path.join(input, "_includes/node_modules/@zachleat/heading-anchors"), { recursive: true });
		await mkdir(path.join(input, "nested"), { recursive: true });
		await writeFile(path.join(input, "_includes/layouts/base.njk"), await readFile(path.join(root, "_includes/layouts/base.njk")));
		for (const include of ["css/index.css", "css/prism-custom-theme.css", "node_modules/@zachleat/heading-anchors/heading-anchors.js"]) {
			await writeFile(path.join(input, "_includes", include), "");
		}
		for (const name of ["about", "archive", "tags", "tag-detail", "404", "nested/no-card"]) {
			await writeFile(path.join(input, `${name}.njk`), "---\nlayout: layouts/base.njk\n---\nFixture page");
		}
		await writeFile(path.join(input, "nested/renamed-post.njk"), "---\nlayout: layouts/base.njk\npermalink: /blog/original-route/\nsocialImage: /og-images/original-card.png\n---\nFixture post");
		await writeFile(path.join(input, "external-image.njk"), "---\nlayout: layouts/base.njk\nsocialImage: https://images.example.com/card.png\n---\nFixture post");
		const eleventy = new Eleventy(input, path.join(temporary, "output"), {
			configPath: false,
			config: config => {
				config.addGlobalData("metadata", { url: "https://danmu.nz/", title: "Dan Munz", language: "en" });
				config.addGlobalData("generateSocialCards", true);
				config.addGlobalData("fontCss", fontCss);
				config.addGlobalData("eleventyComputed", contentData.eleventyComputed);
				config.addFilter("eleventyNavigation", () => []);
				config.addPlugin(initialized => {
					initialized.addBundle("css");
					initialized.addBundle("js");
				});
				config.addShortcode("currentBuildDate", () => "");
			},
			quietMode: true,
		});
		const pages = await eleventy.toJSON();
		assert.equal(pages.length, 8);
		for (const page of pages) {
			const expected = page.url === "/blog/original-route/"
				? "https://danmu.nz/og-images/original-card.png"
				: page.url === "/external-image/" ? "https://images.example.com/card.png" : "https://danmu.nz/img/share-img.png";
			const images = [...page.content.matchAll(/<meta (?:property|name)="(?:og:image|og:image:secure_url|twitter:image)" content="([^"]+)"/g)].map(match => match[1]);
			assert.deepEqual(images, [expected, expected, expected], page.url);
		}
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});

test("base layout emits reusable, change-sensitive CSS with local fonts and page-specific styles", async () => {
	const temporary = await mkdtemp(path.join(os.tmpdir(), "website-css-"));
	try {
		const input = path.join(temporary, "content");
		let output;
		let buildNumber = 0;
		const includes = path.join(input, "_includes");
		for (const directory of ["layouts", "css", "node_modules/@zachleat/heading-anchors"]) {
			await mkdir(path.join(includes, directory), { recursive: true });
		}
		for (const filename of ["layouts/base.njk", "css/index.css", "css/prism-custom-theme.css"]) {
			const source = filename.startsWith("layouts/") ? `_includes/${filename}` : filename;
			await writeFile(path.join(includes, filename), await readFile(path.join(root, source)));
		}
		await writeFile(path.join(includes, "node_modules/@zachleat/heading-anchors/heading-anchors.js"), "");
		for (const name of ["first", "second", "custom"]) {
			await writeFile(path.join(input, `${name}.njk`), `---\nlayout: layouts/base.njk\n---\n<h1>${name}</h1>${name === "custom" ? '<style>.page-specific { color: rebeccapurple; }</style>{% css %}.shortcode-specific { color: navy; }{% endcss %}' : ""}`);
		}
		const fixtureConfig = path.join(temporary, "eleventy.config.mjs");
		await writeFile(fixtureConfig, `export default function(config) {
			config.addGlobalData("metadata", { title: "Fixture", language: "en" });
			config.addGlobalData("fontCss", ${JSON.stringify(fontCss)});
			config.addFilter("eleventyNavigation", () => []);
			config.addShortcode("currentBuildDate", () => "");
			config.addBundle("css", { toFileDirectory: "dist", bundleHtmlContentFromSelector: "style" });
			config.addBundle("js", { toFileDirectory: "dist" });
			config.addPassthroughCopy(${JSON.stringify(Object.fromEntries(Object.entries(fontPassthrough).map(([source, target]) => [path.join(root, source), target])))});
		}`);
		async function build() {
			output = path.join(temporary, `output-${++buildNumber}`);
			// A fresh process matches production builds and avoids engine/module caches.
			await promisify(execFile)(process.execPath, [path.join(root, "node_modules/@11ty/eleventy/cmd.cjs"), `--input=${input}`, `--output=${output}`, `--config=${fixtureConfig}`, "--quiet"], { cwd: root });
			const result = {};
			for (const name of ["first", "second", "custom"]) {
				const html = await readFile(path.join(output, name, "index.html"), "utf8");
				const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)];
				assert.equal(links.length, 1, `${name} has one stylesheet`);
				assert.doesNotMatch(html, /<style|fonts\.googleapis|fonts\.gstatic|rel="preload"/);
				const url = links[0][1];
				result[name] = { url, css: await readFile(path.join(output, url), "utf8") };
			}
			return result;
		}
		const first = await build();
		assert.equal(first.first.url, first.second.url);
		assert.notEqual(first.first.url, first.custom.url);
		assert.match(first.custom.css, /\.page-specific\s*\{/);
		assert.match(first.custom.css, /\.shortcode-specific\s*\{/);
		assert.match(first.first.css, /\.token\.comment/);
		assert.match(first.first.css, /prefers-reduced-motion/);
		assert.match(first.first.css, /@media print/);
		assert.equal((first.first.css.match(/@font-face/g) || []).length, fontFaces.length);
		assert.equal((first.first.css.match(/font-display: swap/g) || []).length, fontFaces.length);
		for (const [source, destination] of Object.entries(fontPassthrough)) {
			const original = await readFile(path.join(root, source));
			assert.deepEqual(await readFile(path.join(output, destination)), original);
			if (destination.endsWith(".woff2")) {
				assert.equal(original.toString("ascii", 0, 4), "wOF2", source);
				assert.ok(first.first.css.includes(`/${destination}`), destination);
			} else assert.match(original.toString(), /SIL OPEN FONT LICENSE/i);
		}
		const second = await build();
		assert.equal(second.first.url, first.first.url, "unchanged fresh build keeps URL");
		assert.equal(second.custom.url, first.custom.url);
		const cssPath = path.join(includes, "css/index.css");
		await writeFile(cssPath, `${await readFile(cssPath, "utf8")}\n.changed-fixture { color: maroon; }\n`);
		const changed = await build();
		assert.notEqual(changed.first.url, first.first.url, "CSS edit invalidates URL");
		assert.equal(changed.first.url, changed.second.url);
		assert.match(changed.custom.css, /\.changed-fixture/);
		assert.match(changed.custom.css, /\.page-specific/);
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});
