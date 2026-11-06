import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Eleventy, { IdAttributePlugin } from "@11ty/eleventy";
import configure from "../eleventy.config.js";
import filters from "../_config/filters.js";

const project = fileURLToPath(new URL("../", import.meta.url));

async function markdownLibrary() {
	let markdown;
	await configure({
		addGlobalData() {}, addPreprocessor() {}, addBundle() {}, addShortcode() {}, addPlugin() {},
		addPassthroughCopy() { return this; },
		setLibrary(name, library) { if (name === "md") markdown = library; },
	});
	return markdown;
}

async function fixture(t) {
	const temporary = await mkdtemp(path.join(os.tmpdir(), "website-semantics-"));
	t.after(() => rm(temporary, { recursive: true, force: true }));
	const input = path.join(temporary, "content");
	await mkdir(input);
	await cp(path.join(project, "_includes"), path.join(input, "_includes"), { recursive: true });
	await writeFile(path.join(input, "_includes/layouts/base.njk"), "<main>{{ content | safe }}</main>");
	const md = await markdownLibrary();
	return {
		input,
		build: () => new Eleventy(input, path.join(temporary, "output"), {
			configPath: false, quietMode: true,
			config: config => {
				config.addPlugin(filters);
				config.addPlugin(IdAttributePlugin);
				config.setLibrary("md", md);
			},
		}).toJSON(),
	};
}

test("shared lists use contextual headings and stable unique IDs for same-day articles", async t => {
	const { input, build } = await fixture(t);
	for (const [source, destination] of [["index.njk", "index.njk"], ["blog.njk", "archive.njk"], ["tag-pages.njk", "tag-pages.njk"]]) {
		await cp(path.join(project, "content", source), path.join(input, destination));
	}
	for (const name of ["first", "second"]) {
		await writeFile(path.join(input, `${name}.md`), `---\ntitle: ${name}\ndescription: Description\ndate: 2020-01-02\npermalink: /blog/${name}/\ntags: [posts, Example]\n---\nContent`);
	}
	let pages = new Map((await build()).map(page => [page.url, page.content]));
	const stableIds = {};
	for (const [url, level] of [["/", 2], ["/archive/", 3], ["/tags/example/", 2]]) {
		const html = pages.get(url);
		assert.equal([...html.matchAll(/<h1\b/g)].length, 1, url);
		assert.equal([...html.matchAll(new RegExp(`<h${level}\\b[^>]*class="postlist-title"`, "g"))].length, 2, url);
		const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
		assert.equal(new Set(ids).size, ids.length, `IDs must be unique on ${url}`);
		assert.equal(ids.filter(id => id === "post-02012020").length, 1, "Keep one legacy date fragment");
		stableIds[url] = [...html.matchAll(/<li class="postlist-item[^>]*id="([^"]+)"/g)].map(match => match[1]).sort();
		assert.equal(stableIds[url].length, 2);
		assert.notEqual(stableIds[url][0], stableIds[url][1]);
	}
	const renamed = (await readFile(path.join(input, "first.md"), "utf8")).replace("title: first", "title: A renamed title").replace("date: 2020-01-02", "date: 2020-02-03");
	await rm(path.join(input, "first.md"));
	await writeFile(path.join(input, "RENAMED.md"), renamed);
	pages = new Map((await build()).map(page => [page.url, page.content]));
	for (const [url, expected] of Object.entries(stableIds)) {
		const ids = [...pages.get(url).matchAll(/<li class="postlist-item[^>]*id="([^"]+)"/g)].map(match => match[1]).sort();
		assert.deepEqual(ids, expected, `A title/date/source rename must preserve stable IDs on ${url}`);
	}
});

test("article heading corrections preserve existing fragment IDs and form a logical outline", async t => {
	const { input, build } = await fixture(t);
	const expected = JSON.parse(await readFile(new URL("./fixtures/article-heading-ids.json", import.meta.url), "utf8"));
	await writeFile(path.join(input, "content.11tydata.json"), JSON.stringify({ layout: "layouts/post.njk", tags: ["posts"] }));
	for (const name of Object.keys(expected)) {
		await cp(path.join(project, "content/blog", `${name}.md`), path.join(input, `${name}.md`));
	}
	for (const page of await build()) {
		const name = page.url.split("/").filter(Boolean).at(-1);
		const headings = [...page.content.matchAll(/<h([1-6])\b[^>]*\bid="([^"]+)"[^>]*>/g)];
		assert.deepEqual(headings.map(match => match[2]), expected[name], `Fragments changed for ${name}`);
		assert.equal(headings.filter(match => match[1] === "1").length, 1);
		assert.ok(headings.slice(1).every(match => match[1] === "2"), `${name} sections start at H2`);
	}
});

test("repeated footnotes have named references, focusable notes, and exact return destinations", async () => {
	const md = await markdownLibrary();
	const html = md.render("First reference[^one], repeated[^one], and another note[^two].\n\n[^one]: First note.\n[^two]: Second note.");
	for (const [reference, note, label] of [
		["fnref1", "fn1", "Read footnote 1"],
		["fnref1:1", "fn1", "Read footnote 1, reference 2"],
		["fnref2", "fn2", "Read footnote 2"],
	]) {
		assert.ok(html.includes(`href="#${note}" id="${reference}" role="doc-noteref" aria-label="${label}"`));
		assert.ok(html.includes(`href="#${reference}" class="footnote-backref" role="doc-backlink" aria-label="Return to reference`));
	}
	assert.ok(html.includes('aria-label="Return to reference 1 for footnote 1"'));
	assert.ok(html.includes('aria-label="Return to reference 2 for footnote 1"'));
	assert.ok(html.includes('id="fn1" class="footnote-item" tabindex="-1"'));
	assert.ok(html.includes('id="fn2" class="footnote-item" tabindex="-1"'));
	const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
	assert.equal(new Set(ids).size, ids.length);
	const inline = md.render("An inline note ^[Note text.]");
	assert.ok(inline.includes('aria-label="Read footnote 1"'));
	assert.ok(inline.includes('aria-label="Return to reference 1 for footnote 1"'));
});
