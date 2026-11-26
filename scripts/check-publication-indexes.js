import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseXml } from "@rgrove/parse-xml";
import { DateTime } from "luxon";

const feed = "feed/feed.xml";
const sitemap = "sitemap.xml";
const feedLimit = 10;
const sitemapPages = ["/", "/about/", "/blog/", "/tags/"];

const elements = (parent, name) => parent.children.filter(child => child.type === "element" && child.name === name);

export async function checkPublicationIndexes({ output, base, files, errors, checkDestination, articleUrls, routes, canonicalByFile }) {
	async function readRoot(file, name, namespace) {
		if (!files.has(file)) {
			errors.push(`${file}: missing publication index`);
			return;
		}
		let root;
		try {
			root = parseXml(await readFile(path.join(output, file), "utf8")).root;
		} catch (error) {
			errors.push(`${file}: ${error.message}`);
			return;
		}
		if (root?.name !== name || root.attributes.xmlns !== namespace) {
			errors.push(`${file}: expected ${name} in the ${namespace} namespace`);
			return;
		}
		return root;
	}

	function indexUrl(raw, file, field, relativeTo) {
		let url;
		try {
			if (raw) url = new URL(raw, relativeTo);
		} catch { /* Report missing and malformed values together. */ }
		if (!url || url.origin !== base.origin || url.search || url.hash || url.username || url.password) {
			errors.push(`${file}: expected an absolute local ${field} URL, got ${raw ?? "(missing)"}`);
			return;
		}
		return url.href;
	}

	function checkPage(url, file) {
		const destination = checkDestination(url, file);
		if (destination && !destination.endsWith(".html")) {
			errors.push(`${file}: expected a published page at ${url}`);
		}
		return destination;
	}

	const articles = articleUrls.map(url => indexUrl(url, "blog/index.html", "article", new URL("/blog/", base))).filter(Boolean);
	if (new Set(articles).size !== articles.length) errors.push("blog/index.html: duplicate archive article URLs");
	const preserved = routes.map(({ permalink }) => new URL(permalink, base).href);
	for (const url of preserved) {
		if (!articles.includes(url)) errors.push(`blog/index.html: preserved article missing from archive ${url}`);
	}

	const atom = await readRoot(feed, "feed", "http://www.w3.org/2005/Atom");
	if (atom) {
		const self = elements(atom, "link").filter(node => node.attributes.rel === "self");
		if (self.length !== 1 || self[0].attributes.href !== new URL(feed, base).href) {
			errors.push(`${feed}: expected one self link to /${feed}`);
		}
		const actual = elements(atom, "entry").map(entry => {
			const links = elements(entry, "link").filter(node => [undefined, "alternate"].includes(node.attributes.rel));
			const url = indexUrl(links.length === 1 ? links[0].attributes.href : undefined, feed, "entry link");
			if (!url) return;
			checkPage(url, feed);
			const ids = elements(entry, "id");
			if (ids.length !== 1 || ids[0].text.trim() !== url) errors.push(`${feed}: entry ID does not match ${url}`);
			for (const field of ["title", "updated", "content"]) {
				const nodes = elements(entry, field);
				if (nodes.length !== 1 || !nodes[0].text.trim()) errors.push(`${feed}: expected one nonempty ${field} for ${url}`);
			}
			return url;
		});
		const expected = articles.slice(0, feedLimit);
		if (actual.length !== expected.length || actual.some((url, i) => url !== expected[i])) {
			errors.push(`${feed}: expected the latest ${expected.length} archive articles in archive order`);
		}
	}

	const urlset = await readRoot(sitemap, "urlset", "http://www.sitemaps.org/schemas/sitemap/0.9");
	if (urlset) {
		const expected = new Set([...sitemapPages.map(route => new URL(route, base).href), ...articles].filter(url => {
			const destination = checkDestination(url, sitemap);
			return canonicalByFile.get(destination) === url;
		}));
		const seen = new Set();
		for (const entry of elements(urlset, "url")) {
			const locations = elements(entry, "loc");
			const url = indexUrl(locations.length === 1 ? locations[0].text.trim() : undefined, sitemap, "loc");
			if (!url) continue;
			if (seen.has(url)) errors.push(`${sitemap}: duplicate loc ${url}`);
			seen.add(url);
			const destination = checkPage(url, sitemap);
			if (destination && (canonicalByFile.get(destination) !== url || /^tags\/.+\//.test(destination))) {
				errors.push(`${sitemap}: unexpected loc ${url}`);
			}
			const dates = elements(entry, "lastmod");
			const date = dates[0]?.text.trim();
			if (dates.length > 1 || (dates.length === 1 && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !DateTime.fromISO(date).isValid))) {
				errors.push(`${sitemap}: invalid lastmod for ${url}`);
			}
		}
		for (const url of expected) {
			if (!seen.has(url)) errors.push(`${sitemap}: missing loc ${url}`);
		}
	}
}
