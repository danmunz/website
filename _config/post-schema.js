import { readFileSync } from "node:fs";
import frontMatter from "front-matter";
import { DateTime } from "luxon";

function invalid(sourcePath, field, message) {
	throw new Error(`${sourcePath}: ${field} ${message}`);
}

export function validateDraft(data, sourcePath = "content") {
	if (data.draft !== undefined && typeof data.draft !== "boolean") {
		invalid(sourcePath, "draft", "must be true or false (without quotes).");
	}
}

function validDate(value) {
	if (value instanceof Date) return Number.isFinite(value.getTime());
	return typeof value === "string"
		&& /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)
		&& DateTime.fromISO(value, { zone: "utc" }).isValid;
}

function localPath(value) {
	if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return false;
	if (/[\s\\?#]/.test(value)) return false;
	try {
		const decoded = decodeURIComponent(value);
		if (/[\s\\?#]/.test(decoded) || decoded.includes("//")) return false;
		if (decoded.split("/").some(segment => segment === "." || segment === "..")) return false;
		return new URL(value, "https://danmu.nz").pathname === value;
	} catch {
		return false;
	}
}

function absoluteUrl(value, protocols) {
	if (typeof value !== "string" || value !== value.trim()) return false;
	try {
		const url = new URL(value);
		return protocols.includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
	} catch {
		return false;
	}
}

/** Validate author-supplied fields, before Eleventy fills in dates or coerces tags. */
export function validatePostMetadata(attributes, {
	sourcePath = "content/blog/post.md",
	draft = attributes.draft,
	now = new Date(),
	warn = console.warn,
} = {}) {
	validateDraft({ draft }, sourcePath);
	if (attributes.updated !== undefined && !validDate(attributes.updated)) {
		invalid(sourcePath, "updated", "must be a valid ISO date or timestamp when supplied.");
	}
	if (attributes.canonicalUrl !== undefined && !absoluteUrl(attributes.canonicalUrl, ["https:", "http:"])) {
		invalid(sourcePath, "canonicalUrl", "must be an absolute HTTP(S) URL when supplied.");
	}
	if (attributes.socialImage !== undefined
		&& !(localPath(attributes.socialImage) && !attributes.socialImage.endsWith("/"))
		&& !absoluteUrl(attributes.socialImage, ["https:"])) {
		invalid(sourcePath, "socialImage", "must be a root-relative file path or absolute HTTPS URL when supplied.");
	}
	// An unfinished draft is a useful writing state, but its publication control must be valid.
	if (draft === true) return attributes;
	for (const field of ["title", "description"]) {
		if (typeof attributes[field] !== "string" || !attributes[field].trim()) {
			invalid(sourcePath, field, "must be a nonempty string.");
		}
	}
	if (!validDate(attributes.date)) {
		invalid(sourcePath, "date", "must be an explicit valid ISO date (YYYY-MM-DD) or timestamp in front matter.");
	}
	if (!Array.isArray(attributes.tags) || attributes.tags.some(tag => typeof tag !== "string" || !tag.trim())) {
		invalid(sourcePath, "tags", "must be an array of nonempty strings (use [] for no categories).");
	}
	if (!localPath(attributes.permalink) || attributes.permalink === "/" || !attributes.permalink.endsWith("/")) {
		invalid(sourcePath, "permalink", "must be a stable root-relative directory path with a trailing slash.");
	}
	const date = attributes.date instanceof Date
		? attributes.date : DateTime.fromISO(attributes.date, { zone: "utc" }).toJSDate();
	if (date > now) {
		warn(`${sourcePath}: date is in the future; this post will publish. Dates do not schedule publication; use draft: true to withhold it.`);
	}
	return { ...attributes, tags: [...new Set(attributes.tags.map(tag => tag.trim()))] };
}

/** Read the source to distinguish authored metadata from Eleventy's inferred/default values. */
export function validatePostSource(data, sourcePath, options = {}) {
	if (!/(?:^|\/)content\/blog\/.+\.md$/.test(sourcePath.replaceAll("\\", "/"))) return;
	const parsed = frontMatter(readFileSync(sourcePath, "utf8"));
	// YAML converts bare dates to Date objects, including calendar rollovers such as Feb 30.
	// Preserve the original ISO scalar for validation instead of accepting that rollover.
	for (const field of ["date", "updated"]) {
		const scalar = parsed.frontmatter?.match(new RegExp(`^${field}:\\s*(\\d{4}-\\d{2}-\\d{2}(?:T[^\\s#]+)?)\\s*(?:#.*)?$`, "m"));
		if (parsed.attributes[field] instanceof Date && !scalar) {
			invalid(sourcePath, field, "must use YYYY-MM-DD or a quoted ISO timestamp; implicit YAML timestamp syntax is not supported.");
		}
		if (scalar) parsed.attributes[field] = scalar[1];
	}
	const validated = validatePostMetadata(parsed.attributes, { ...options, sourcePath, draft: data.draft });
	if (Array.isArray(validated.tags)) {
		data.tags = [...new Set(["posts", ...validated.tags.map(tag => typeof tag === "string" ? tag.trim() : tag)])];
	}
}
