import assert from "node:assert/strict";
import test from "node:test";
import { summarizeResources, comparisonAvailability, missingRenderedFonts } from "../scripts/asset-metrics.js";

test("asset accounting separates types, cached responses and failed requests", () => {
	const resources = [
		{ type: "Font", encodedBytes: 123, finished: true },
		{ type: "Font", encodedBytes: 0, cached: true, finished: true },
		{ type: "Font", failure: "blocked" },
		{ type: "Stylesheet", encodedBytes: 50, status: 404 },
		{ type: "Script", encodedBytes: 999 },
	];
	assert.deepEqual(summarizeResources(resources).Font, { requests: 3, encodedBytes: 123, cachedResponses: 1, failures: 1 });
	assert.equal(summarizeResources(resources).Stylesheet.encodedBytes, 50);
	assert.equal(summarizeResources(resources).Document.encodedBytes, 0);
});

test("a failed or incomplete Google baseline is not claimed as savings", () => {
	const css = { url: "https://fonts.googleapis.com/css2?family=Example", type: "Stylesheet", finished: true, status: 200 };
	const font = { url: "https://fonts.gstatic.com/font.woff2", type: "Font", finished: true, status: 200 };
	assert.equal(comparisonAvailability([css, font]), "available");
	assert.match(comparisonAvailability([css]), /^unavailable/);
	assert.match(comparisonAvailability([css, { ...font, failure: "timeout" }]), /^unavailable/);
	assert.match(comparisonAvailability([{ ...css, finished: false }]), /^unavailable/);
	assert.equal(comparisonAvailability([{ ...font, url: "http://localhost/fonts/font.woff2" }]), "available");
});


test("production typography requires rendered custom fonts, not merely successful downloads", () => {
	const selectors = [".post-content > p", "main h1", "blockquote p", "code"];
	const families = ["Bricolage Grotesque", "Oswald", "IBM Plex Serif", "DM Mono"];
	const computed = selectors.map((selector, index) => ({ selector, rendered: [{ familyName: `${families[index]} Light`, isCustomFont: true, glyphCount: 10 }] }));
	assert.deepEqual(missingRenderedFonts(computed), [], "Instance suffixes are accepted");
	computed[2].rendered = [{ familyName: "Georgia", isCustomFont: false, glyphCount: 10 }];
	assert.deepEqual(missingRenderedFonts(computed), ["IBM Plex Serif"], "A system fallback fails even if the font request returned 200");
	computed[3].rendered[0].glyphCount = 0;
	assert.deepEqual(missingRenderedFonts(computed), ["IBM Plex Serif", "DM Mono"], "A face with no rendered glyphs does not establish use");
	assert.deepEqual(missingRenderedFonts([]), families);
});
