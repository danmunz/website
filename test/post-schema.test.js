import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import frontMatter from "front-matter";
import { validateDraft, validatePostMetadata, validatePostSource } from "../_config/post-schema.js";

const valid = {
	title: "An article", description: "A description", date: "2025-01-01",
	tags: ["AI", "software engineering"], permalink: "/blog/Stable-Route/",
};
const settings = { sourcePath: "content/blog/example.md", now: new Date("2026-01-01"), warn() {} };

test("requires authored publication fields with source-specific errors", () => {
	for (const [field, badValues] of Object.entries({
		title: [undefined, "", "  ", 4],
		description: [undefined, "", "  ", false],
		date: [undefined, "nonsense", "2025-02-30", new Date(NaN), "last modified"],
		tags: [undefined, "AI", [""], ["  "], [2]],
		permalink: [undefined, false, "/", "blog/post/", "//example.com/", "/blog/post", "/blog/../post/", "/blog/%2e%2e/post/", "/blog/hello world/", "/blog/post/?q=x"],
	})) {
		for (const value of badValues) {
			assert.throws(() => validatePostMetadata({ ...valid, [field]: value }, settings),
				error => error.message.includes("content/blog/example.md") && error.message.includes(field));
		}
	}
});

test("optional fields are validated only when supplied", () => {
	assert.doesNotThrow(() => validatePostMetadata(valid, settings));
	assert.doesNotThrow(() => validatePostMetadata({ ...valid, updated: "2025-02-02", canonicalUrl: "https://example.com/article", socialImage: "/og-images/card.png" }, settings));
	assert.doesNotThrow(() => validatePostMetadata({ ...valid, socialImage: "https://example.com/card.png" }, settings));
	for (const [field, values] of Object.entries({
		updated: ["2025-02-30", "tomorrow", false, null],
		canonicalUrl: ["/local/", "javascript:alert(1)", "https://", 1, null],
		socialImage: ["card.png", "/directory/", "//example.com/image.png", "http://example.com/card.png", "/../card.png", false],
	})) {
		for (const value of values) {
			assert.throws(() => validatePostMetadata({ ...valid, [field]: value }, settings), new RegExp(field));
		}
	}
});

test("drafts can be incomplete but draft controls cannot be malformed", () => {
	assert.doesNotThrow(() => validatePostMetadata({ draft: true }, settings));
	assert.throws(() => validatePostMetadata({ draft: true, updated: "tomorrow" }, settings), /updated/);
	assert.throws(() => validatePostMetadata({ draft: true, canonicalUrl: "bad" }, settings), /canonicalUrl/);
	assert.throws(() => validatePostMetadata({ draft: true, socialImage: "bad" }, settings), /socialImage/);
	assert.doesNotThrow(() => validatePostMetadata({}, { ...settings, draft: true }));
	for (const draft of ["false", "true", 0, 1, null]) {
		assert.throws(() => validatePostMetadata({ draft }, settings), /draft/);
		assert.throws(() => validateDraft({ draft }, "utility.njk"), /utility\.njk: draft/);
	}
});

test("normalizes category whitespace without changing display case", () => {
	assert.deepEqual(validatePostMetadata({ ...valid, tags: [" AI ", "software engineering ", "AI"] }, settings).tags,
		["AI", "software engineering"]);
	assert.deepEqual(validatePostMetadata({ ...valid, tags: [] }, settings).tags, []);
});

test("future dates warn with source and publish rather than acting as a scheduler", () => {
	const messages = [];
	const result = validatePostMetadata({ ...valid, date: "2027-01-01" }, { ...settings, warn: message => messages.push(message) });
	assert.equal(result.date, "2027-01-01");
	assert.equal(messages.length, 1);
	assert.match(messages[0], /content\/blog\/example\.md.*will publish.*draft: true/);
});

test("source validation rejects inferred dates, normalized YAML rollovers, and coerced tags", () => {
	const dir = mkdtempSync(path.join(tmpdir(), "website-schema-"));
	const source = path.join(dir, "content/blog/post.md");
	mkdirSync(path.dirname(source), { recursive: true });
	try {
		for (const [metadata, expected] of [
			["tags: [AI]", /date/],
			["date: 2025-02-30\ntags: [AI]", /date/],
			["date: 2025-02-30 00:00:00Z\ntags: [AI]", /date/],
			['"date": 2025-02-30\ntags: [AI]', /date/],
			["date: !!timestamp 2025-02-30\ntags: [AI]", /date/],
			["date: 2025-01-01\nupdated: !!timestamp 2025-02-30\ntags: [AI]", /updated/],
			["date: 2025-01-01\ntags: AI", /tags/],
		]) {
			writeFileSync(source, `---\ntitle: Title\ndescription: Description\npermalink: /blog/stable/\n${metadata}\n---\nBody`);
			assert.throws(() => validatePostSource({ date: new Date(), page: { date: new Date() }, tags: ["posts", "AI"] }, source, settings), expected);
		}
		writeFileSync(source, "---\ntitle: Title\ndescription: Description\npermalink: /blog/stable/\ndate: 2025-01-01\ntags: [' AI ', 'software engineering ']\n---\nBody");
		const data = { tags: ["posts", " AI "] };
		validatePostSource(data, source, settings);
		assert.deepEqual(data.tags, ["posts", "AI", "software engineering"]);
		assert.doesNotThrow(() => validatePostSource({}, "content/about.md", settings));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("all nine existing posts explicitly retain their exact public routes and cards", () => {
	const routes = JSON.parse(readFileSync(new URL("./fixtures/public-routes.json", import.meta.url), "utf8"));
	assert.equal(routes.length, 9);
	assert.ok(routes.some(route => route.permalink === "/blog/WWDC-Apples-AI-device-strategy/"));
	for (const route of routes) {
		const parsed = frontMatter(readFileSync(route.source, "utf8"));
		assert.equal(parsed.attributes.permalink, route.permalink);
		assert.equal(parsed.attributes.socialImage, route.socialImage);
		assert.doesNotThrow(() => validatePostSource(parsed.attributes, route.source, settings));
	}
});
