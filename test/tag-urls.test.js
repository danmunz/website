import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Eleventy from "@11ty/eleventy";
import filters from "../_config/filters.js";

const root = fileURLToPath(new URL("../", import.meta.url));

test("discovery pages link to existing topic routes, the feed, and 404 recovery destinations", async () => {
	const temporary = await mkdtemp(path.join(os.tmpdir(), "website-tags-"));
	try {
		const input = path.join(temporary, "content");
		await mkdir(path.join(input, "_includes/layouts"), { recursive: true });
		for (const [source, destination] of [
			["content/blog.njk", "blog.njk"],
			["content/404.md", "404.md"],
			["content/tags.njk", "tags.njk"],
			["content/tag-pages.njk", "tag-pages.njk"],
			["_includes/layouts/post.njk", "_includes/layouts/post.njk"],
			["_includes/postslist.njk", "_includes/postslist.njk"],
		]) {
			await writeFile(path.join(input, destination), await readFile(path.join(root, source)));
		}
		await writeFile(path.join(input, "_includes/layouts/base.njk"), '<head><title>{{ title }}</title><meta name="description" content="{{ description }}"></head><body>{{ content | safe }}</body>');
		await writeFile(path.join(input, "tags.11tydata.json"), JSON.stringify({ layout: "layouts/base.njk" }));
		await writeFile(path.join(input, "404.11tydata.json"), JSON.stringify({ layout: "layouts/base.njk" }));
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
		const topics = byUrl.get("/tags/");
		assert.ok(topics.includes("<title>Topics | Dan Munz</title>"));
		assert.ok(topics.includes('<meta name="description" content="Browse the topics Dan Munz writes about.">'));
		assert.doesNotMatch(topics, /title: Topics|description: Browse/);
		assert.match(topics, /<h1 id="tags">Topics<\/h1>/);
		const archive = byUrl.get("/blog/");
		assert.match(archive, /<h2 id="categories">Topics<\/h2>/);
		assert.match(archive, /<a href="\/feed\/feed\.xml">feed address<\/a> into an RSS or Atom reader/);
		const notFound = byUrl.get("/404.html");
		assert.match(notFound, /<title>Page not found \| Dan Munz<\/title>/);
		assert.match(notFound, /<a href="\/">go home<\/a> or <a href="\/blog\/">browse the writing archive<\/a>/);
		const expected = new Map([
			["AI", "/tags/ai/"],
			["Apple", "/tags/apple/"],
			["ChatGPT", "/tags/chatgpt/"],
			["LLMs", "/tags/llms/"],
			["software engineering", "/tags/software-engineering/"],
		]);
		for (const [label, url] of expected) {
			const detail = byUrl.get(url);
			assert.ok(detail, `Missing generated tag page: ${url}`);
			assert.ok(detail.includes(`<h1 id="tagged-${url.split("/")[2]}">Topic: ${label}</h1>`), url);
			assert.match(detail, /<a href="\/tags\/">all topics<\/a>/);
			for (const source of ["/blog/", "/article/", "/tags/"]) {
				assert.ok(byUrl.get(source)?.includes(`href="${url}" class="post-tag">${label}</a>`), `${source} must preserve label ${label} and link to ${url}`);
			}
		}
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
});
