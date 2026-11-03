/**
 * Write freeze for the cutover. GET and HEAD stay up so the site can be read
 * and files can still be viewed; every other method is refused.
 */
export function writeFrozen(method: string, flag: string | undefined): boolean {
	const on = !!flag && /^(1|true|yes|on)$/i.test(flag.trim());
	if (!on) return false;
	return method !== 'GET' && method !== 'HEAD';
}
