import { describe, expect, it } from 'vitest';
import { signRoleJwt as signTs } from '$lib/server/postgrest-jwt';
import { signRoleJwt as signMjs } from '../scripts/lib/postgrest.mjs';

describe('PostgREST JWT', () => {
	const secret = 'local-test-secret-at-least-32-characters';

	it('signs the same token in the app and in the fare script', () => {
		expect(signTs(secret, 'expedition', 1_700_000_000, 3000)).toBe(signMjs(secret, 'expedition', 1_700_000_000, 3000));
	});

	it('puts the expedition role in the payload', () => {
		const token = signTs(secret, 'expedition', 1_700_000_000, 3000);
		const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
		expect(payload).toMatchObject({ role: 'expedition', iat: 1_700_000_000, exp: 1_700_003_000 });
	});

	it('refuses a short secret and a JSON secret', () => {
		expect(() => signTs('too-short')).toThrow(/32/);
		expect(() => signTs('{' + 'x'.repeat(40))).toThrow(/JSON/);
	});
});