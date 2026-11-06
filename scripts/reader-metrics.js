export function colorChannels(css) {
	const values = css.match(/[\d.]+/g)?.map(Number);
	if (!values || values.length < 3) throw new Error(`Unsupported computed color: ${css}`);
	return [...values.slice(0, 3), values[3] ?? 1];
}

export function composite(foreground, background) {
	const alpha = foreground[3] ?? 1;
	return foreground.slice(0, 3).map((value, index) => value * alpha + background[index] * (1 - alpha));
}

export function contrast(foreground, background) {
	const luminance = channels => channels.slice(0, 3).map(value => {
		const channel = value / 255;
		return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
	}).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
	const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
	return (light + 0.05) / (dark + 0.05);
}

// WCAG 2.5.8: a sub-24px target can qualify via nonintersecting 24px circles.
export function targetAssessment(target, peers) {
	if (peers.some(peer => peer !== target && target.x < peer.x + peer.width && target.x + target.width > peer.x
		&& target.y < peer.y + peer.height && target.y + target.height > peer.y)) return "overlap";
	if (target.width >= 24 && target.height >= 24) return "size";
	const center = rect => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
	const own = center(target);
	for (const peer of peers) {
		if (peer === target) continue;
		if (peer.width < 24 || peer.height < 24) {
			const other = center(peer);
			if (Math.hypot(own.x - other.x, own.y - other.y) < 24) return "fail";
		} else {
			const nearestX = Math.max(peer.x, Math.min(own.x, peer.x + peer.width));
			const nearestY = Math.max(peer.y, Math.min(own.y, peer.y + peer.height));
			if (Math.hypot(own.x - nearestX, own.y - nearestY) < 12) return "fail";
		}
	}
	return "spacing";
}
