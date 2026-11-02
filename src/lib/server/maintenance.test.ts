import { describe, expect, it } from 'vitest';
import { writeFrozen } from './maintenance';

describe('maintenance write freeze', () => {
	it('allows reads unless the flag is on', () => {
		expect(writeFrozen('POST', undefined)).toBe(false);
		expect(writeFrozen('POST', '')).toBe(false);
		expect(writeFrozen('POST', '0')).toBe(false);
		expect(writeFrozen('POST', 'false')).toBe(false);
	});

	it('blocks every method except GET and HEAD while the flag is on', () => {
		for (const flag of ['1', 'true', 'yes', 'on', ' TRUE ']) {
			expect(writeFrozen('GET', flag)).toBe(false);
			expect(writeFrozen('HEAD', flag)).toBe(false);
			expect(writeFrozen('POST', flag)).toBe(true);
			expect(writeFrozen('PUT', flag)).toBe(true);
			expect(writeFrozen('PATCH', flag)).toBe(true);
			expect(writeFrozen('DELETE', flag)).toBe(true);
		}
	});
});
