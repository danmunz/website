import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const manifestRelativePath = ".cache/social-card-manifest.json";

export function cardDestination(value, source = "social card") {
	if (typeof value !== "string" || !value.startsWith("/og-images/")) return undefined;
	const relative = value.slice("/og-images/".length);
	if (!relative.endsWith(".png") || !relative.split("/").every(part => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part))) {
		throw new Error(`${source}: socialImage must name a PNG below /og-images/ using letters, numbers, dots, underscores or hyphens.`);
	}
	return relative;
}

export function publishedCards(posts) {
	const destinations = new Map();
	const cards = [];
	for (const post of posts) {
		if (post.data.draft) continue;
		const destination = cardDestination(post.data.socialImage, post.inputPath);
		if (!destination) continue; // Default, hand-authored, and external images are supplied separately.
		if (destinations.has(destination)) throw new Error(`${post.inputPath}: socialImage duplicates ${destinations.get(destination)} at /og-images/${destination}`);
		destinations.set(destination, post.inputPath);
		cards.push({ title: post.data.title, permalink: post.url, socialImage: post.data.socialImage, source: post.inputPath });
	}
	return cards.sort((a, b) => a.socialImage.localeCompare(b.socialImage));
}

export default function socialCardsPlugin(eleventyConfig, { root = process.cwd() } = {}) {
	let posts = [];
	root = path.resolve(root);
	const manifest = path.join(root, manifestRelativePath);
	eleventyConfig.addGlobalData("generateSocialCards", process.env.SOCIAL_CARDS === "generate");
	// Explicitly share the existing collection with templates and the feed. No second Markdown scan.
	eleventyConfig.addCollection("posts", collection => {
		posts = collection.getFilteredByTag("posts");
		return posts;
	});
	eleventyConfig.on("eleventy.before", async () => {
		posts = [];
		await rm(manifest, { force: true });
	});
	eleventyConfig.on("eleventy.after", async ({ dir, outputMode }) => {
		if (outputMode !== "fs") return;
		const body = { version: 1, root, output: path.resolve(root, dir.output), cards: publishedCards(posts) };
		await mkdir(path.dirname(manifest), { recursive: true });
		const temporary = `${manifest}.tmp`;
		try {
			await writeFile(temporary, `${JSON.stringify(body, null, 2)}\n`);
			await rename(temporary, manifest);
		} finally {
			await rm(temporary, { force: true });
		}
	});
}
