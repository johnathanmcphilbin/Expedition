/** Only http(s) links get rendered as links: anything else (javascript:, data:) is dropped. */
export function safeUrl(u: string | null | undefined): string | null {
	if (!u) return null;
	try {
		const p = new URL(u);
		return p.protocol === 'http:' || p.protocol === 'https:' ? p.toString() : null;
	} catch {
		return null;
	}
}
