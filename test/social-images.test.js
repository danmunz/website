import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Eleventy from "@11ty/eleventy";
import contentData from "../content/content.11tydata.js";

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
