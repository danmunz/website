import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Eleventy from "@11ty/eleventy";
import filters from "../_config/filters.js";

const root = fileURLToPath(new URL("../", import.meta.url));

test("archive, post and tag-index links resolve to the same generated tag pages", async () => {
	const temporary = await mkdtemp(path.join(os.tmpdir(), "website-tags-"));
	try {
		const input = path.join(temporary, "content");
		await mkdir(path.join(input, "_includes/layouts"), { recursive: true });
		for (const [source, destination] of [
			["content/blog.njk", "archive.njk"],
			["content/tags.njk", "tags.njk"],
			["content/tag-pages.njk", "tag-pages.njk"],
			["_includes/layouts/post.njk", "_includes/layouts/post.njk"],
			["_includes/postslist.njk", "_includes/postslist.njk"],
		]) {
			await writeFile(path.join(input, destination), await readFile(path.join(root, source)));
		}
		await writeFile(path.join(input, "_includes/layouts/base.njk"), "{{ content | safe }}");
		await writeFile(path.join(input, "article.md"), `---
title: Fixture article
description: A public article.
date: 2020-01-01
tags: [posts, AI, Apple, ChatGPT, LLMs, software engineering]
layout: layouts/post.njk
---
Fixture content.
`);
		const eleventy = new Eleventy(input, path.join(temporary, "output"), {
			configPath: false,
			config: config => config.addPlugin(filters),
			quietMode: true,
		});
		const pages = await eleventy.toJSON();
		const byUrl = new Map(pages.map(page => [page.url, page.content]));
		const expected = new Map([
			["AI", "/tags/ai/"],
			["Apple", "/tags/apple/"],
			["ChatGPT", "/tags/chatgpt/"],
			["LLMs", "/tags/llms/"],
			["software engineering", "/tags/software-engineering/"],
		]);
		for (const [label, url] of expected) {
			assert.ok(byUrl.has(url), `Missing generated tag page: ${url}`);
			for (const source of ["/archive/", "/article/", "/tags/"]) {
				assert.ok(byUrl.get(source)?.includes(`href="${url}" class="post-tag">${label}</a>`), `${source} must preserve label ${label} and link to ${url}`);
			}
		}
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});
