import { validateDraft } from "../_config/post-schema.js";

export default function(data) {
	validateDraft(data, data.page?.inputPath);
}
