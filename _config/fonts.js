import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Keep this selection aligned with css/index.css and the syntax theme. Fontsource
// packages contain many other subsets/formats; only these Latin WOFF2s publish.
const families = [
	{ slug: "oswald", name: "Oswald", weights: [400, 500], styles: ["normal"] },
	// Standard retains opsz, wdth and wght; the default wght entry point does not.
	{ slug: "bricolage-grotesque", name: "Bricolage Grotesque", variable: true, weights: ["200 800"], styles: ["normal"] },
	{ slug: "ibm-plex-serif", name: "IBM Plex Serif", weights: [400, 600, 700], styles: ["normal", "italic"] },
	// DM Mono has no native 600: the syntax theme's request maps to 500, as it
	// did with Google Fonts. Bricolage emphasis likewise retains synthetic italic.
	{ slug: "dm-mono", name: "DM Mono", weights: [300, 400, 500], styles: ["normal", "italic"] },
];

export const fontFaces = [];
export const fontPassthrough = {};

for (const family of families) {
	const packageName = `@fontsource${family.variable ? "-variable" : ""}/${family.slug}`;
	const { version } = require(`${packageName}/package.json`);
	const unicodeRange = require(`${packageName}/unicode.json`).latin;
	fontPassthrough[`node_modules/${packageName}/LICENSE`] = `fonts/licenses/${family.slug}.txt`;
	for (const weight of family.weights) for (const style of family.styles) {
		const filename = `${family.slug}-latin-${family.variable ? "standard" : weight}-${style}.woff2`;
		const source = `node_modules/${packageName}/files/${filename}`;
		const output = `fonts/${version}/${filename}`;
		fontPassthrough[source] = output;
		fontFaces.push({ family: family.name, weight, style, unicodeRange, source, url: `/${output}`, ...(family.variable ? { stretch: "75% 100%" } : {}) });
	}
}

export const fontCss = fontFaces.map(face => `@font-face {
	font-family: "${face.family}";
	font-style: ${face.style};
	font-weight: ${face.weight};${face.stretch ? `\n\tfont-stretch: ${face.stretch};` : ""}
	font-display: swap;
	src: url("${face.url}") format("woff2");
	unicode-range: ${face.unicodeRange};
}`).join("\n");
