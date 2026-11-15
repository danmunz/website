// Network bytes are measured responses, never inferred from declared font faces.
export function summarizeResources(resources) {
	const selected = resources.filter(item => ["Font", "Stylesheet", "Document", "Image"].includes(item.type));
	return Object.fromEntries(["Font", "Stylesheet", "Document", "Image"].map(type => {
		const items = selected.filter(item => item.type === type);
		return [type, {
			requests: items.length,
			encodedBytes: items.reduce((sum, item) => sum + (item.encodedBytes || 0), 0),
			cachedResponses: items.filter(item => item.cached).length,
			failures: items.filter(item => item.failure || item.status >= 400).length,
		}];
	}));
}

export function comparisonAvailability(resources) {
	const google = resources.filter(item => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(item.url));
	if (google.some(item => item.failure || item.status >= 400 || !item.finished)) return "unavailable: baseline Google Fonts request failed or did not complete";
	if (google.length && !google.some(item => item.type === "Font" && item.finished)) return "unavailable: baseline Google stylesheet produced no measured font response";
	return "available";
}

const typographyFonts = [
	[".post-content > p", "Bricolage Grotesque"],
	["main h1", "Oswald"],
	["blockquote p", "IBM Plex Serif"],
	["code", "DM Mono"],
];

// HTTP 200 is insufficient: Chromium must actually use each retained web font.
// Platform family names can include an instance suffix such as "Light".
export function missingRenderedFonts(computed) {
	return typographyFonts.filter(([selector, family]) => {
		const fonts = computed.find(item => item.selector === selector)?.rendered || [];
		return !fonts.some(font => font.isCustomFont && font.glyphCount > 0
			&& (font.familyName === family || font.familyName.startsWith(`${family} `)));
	}).map(([, family]) => family);
}
