import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const socialFields = ["og:image", "og:image:secure_url", "twitter:image"];

async function inventory(directory, prefix = "") {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const name = `${prefix}${entry.name}`;
		if (entry.isDirectory()) files.push(...await inventory(path.join(directory, entry.name), `${name}/`));
		else if (entry.isFile()) files.push(name);
	}
	return files;
}

function decode(value) {
	return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)));
}

// These scans cover generated HTML attributes, not arbitrary HTML validation.
function attributes(tag) {
	return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
		.map(([, key, double, single]) => [key.toLowerCase(), decode(double ?? single)]));
}

export async function checkSite({ output = path.join(root, "_site"), origin = "https://danmu.nz", routes = [] } = {}) {
	const files = new Set(await inventory(output));
	const errors = [];
	const base = new URL(origin);
	function checkDestination(value, source, { asset = false } = {}) {
		let url;
		try {
			url = new URL(value, new URL(source === "index.html" ? "/" : `/${source.replace(/index\.html$/, "")}`, base));
		} catch {
			errors.push(`${source}: invalid URL ${value}`);
			return;
		}
		if (url.origin !== base.origin) return;
		let pathname;
		try { pathname = decodeURIComponent(url.pathname).slice(1); }
		catch { errors.push(`${source}: invalid URL encoding ${value}`); return; }
		const candidates = asset ? [pathname] : [pathname, `${pathname}${pathname.endsWith("/") || !pathname ? "" : "/"}index.html`];
		// Enumerating filenames also detects case errors on case-insensitive Macs.
		if (!candidates.some(candidate => files.has(candidate))) errors.push(`${source}: missing ${asset ? "social image" : "local destination"} ${value}`);
	}
	for (const route of routes) checkDestination(route.permalink, "public route baseline");
	for (const file of files) {
		if (/(^|\/)(copilot|\.obsidian|\.claude)(\/|$)/i.test(file)) errors.push(`${file}: editor-only content leaked into output`);
		if (!file.endsWith(".html")) continue;
		const html = (await readFile(path.join(output, file), "utf8")).replace(/<!--[\s\S]*?-->/g, "")
			.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
		for (const match of html.matchAll(/<(?:a|link)\b[^>]*>/gi)) {
			const { href } = attributes(match[0]);
			if (href && !href.startsWith("#")) checkDestination(href, file);
		}
		const images = new Map();
		for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
			const attrs = attributes(match[0]);
			const key = attrs.property ?? attrs.name;
			if (socialFields.includes(key)) {
				if (images.has(key)) errors.push(`${file}: duplicate ${key}`);
				images.set(key, attrs.content);
			}
		}
		for (const key of socialFields) {
			if (!images.get(key)) errors.push(`${file}: missing ${key}`);
			else checkDestination(images.get(key), file, { asset: true });
		}
		if (new Set(images.values()).size > 1) errors.push(`${file}: social image metadata disagrees`);
	}
	return { errors, htmlFiles: [...files].filter(file => file.endsWith(".html")).length, files: files.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const routes = JSON.parse(await readFile(path.join(root, "test/fixtures/public-routes.json"), "utf8"));
		const result = await checkSite({ routes });
		if (result.errors.length) {
			console.error(result.errors.join("\n"));
			process.exitCode = 1;
		} else console.log(`Site checks passed: ${result.htmlFiles} HTML pages, ${routes.length} preserved article routes, ${result.files} files.`);
	} catch (error) {
		console.error(`Site check failed: ${error.message}`);
		process.exitCode = 1;
	}
}
