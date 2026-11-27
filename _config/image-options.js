// The reading column is the 40rem body minus 1rem of main padding per side.
// min() follows the root font size even when readers enlarge their text.
export const imageOptions = {
	formats: ["avif", "webp", "auto"],
	widths: [320, 640, 960, 1280],
	// Eleventy caps raster candidates at their source width; never upscale them.
	failOnError: true,
	cacheOptions: { duration: "7d", timeout: "10s" },
	htmlOptions: {
		imgAttributes: {
			loading: "lazy",
			decoding: "async",
			sizes: "min(38rem, calc(100vw - 2rem))",
		},
	},
	sharpOptions: { animated: true },
};
