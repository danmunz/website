export default {
	layout: "layouts/home.njk",
	eleventyComputed: {
		// A filename does not imply a generated card exists. Posts opt in explicitly.
		resolvedSocialImage: data => new URL(data.socialImage || "/img/share-img.png", data.metadata.url).href,
	},
};
