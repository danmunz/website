export default {
	layout: "layouts/home.njk",
	eleventyComputed: {
		// A filename does not imply a generated card exists. Posts opt in explicitly.
		resolvedSocialImage: data => {
			const image = !data.generateSocialCards && data.socialImage?.startsWith("/og-images/")
				? "/img/share-img.png" : data.socialImage || "/img/share-img.png";
			return new URL(image, data.metadata.url).href;
		},
	},
};
