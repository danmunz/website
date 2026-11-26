import { DateTime } from "luxon";

export function resolvePageUrls(pathname, canonicalUrl, origin) {
	const publicUrl = new URL(pathname, origin).href;
	return { publicUrl, canonicalUrl: canonicalUrl ? new URL(canonicalUrl).href : publicUrl };
}

export function sitemapEntries(collection, origin) {
	const entries = [];
	for (const { url, data } of collection) {
		if (!url || !/\/$|\.html$/.test(url)) continue;
		const { publicUrl, canonicalUrl } = resolvePageUrls(url, data.canonicalUrl, origin);
		if (publicUrl !== canonicalUrl) continue;
		const updated = data.updated;
		const date = updated instanceof Date ? DateTime.fromJSDate(updated, { zone: "utc" }) : updated && DateTime.fromISO(updated, { zone: "utc" });
		entries.push({ url: canonicalUrl, lastmod: date?.isValid ? date.toUTC().toISODate() : null });
	}
	return entries;
}
