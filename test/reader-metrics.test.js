import assert from "node:assert/strict";
import test from "node:test";
import { colorChannels, composite, contrast, targetAssessment } from "../scripts/reader-metrics.js";

test("contrast uses linearized colors and composites translucent backgrounds", () => {
	assert.equal(contrast([0, 0, 0], [255, 255, 255]), 21);
	assert.equal(contrast([255, 255, 255], [255, 255, 255]), 1);
	assert.deepEqual(composite(colorChannels("rgba(0, 0, 0, 0.5)"), [255, 255, 255]), [127.5, 127.5, 127.5]);
	assert.ok(contrast([18, 99, 163], [252, 253, 254]) > 6);
	assert.throws(() => colorChannels("transparent"), /Unsupported/);
});

test("target assessment distinguishes dimensions, spacing, and conflicting targets", () => {
	const small = { x: 0, y: 0, width: 20, height: 20 };
	assert.equal(targetAssessment({ x: 0, y: 0, width: 24, height: 24 }, []), "size");
	assert.equal(targetAssessment(small, [small, { ...small, x: 24 }]), "spacing");
	assert.equal(targetAssessment(small, [small, { ...small, x: 23 }]), "fail");
	assert.equal(targetAssessment(small, [small, { x: 21, y: 0, width: 30, height: 30 }]), "fail");
	const large = { x: 0, y: 0, width: 32, height: 32 };
	assert.equal(targetAssessment(large, [large, { ...large, x: 31 }]), "overlap", "large controls cannot overlap just because each meets size");
	assert.equal(targetAssessment(large, [large, { ...large, x: 32 }]), "size", "touching edges do not overlap");
});
