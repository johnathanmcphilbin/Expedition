import { describe, it, expect } from 'vitest';
import { signRef, readRef, chooseRef, normaliseEmail, samePerson, rewardHours, isCode } from './core';

const SECRET = 'test-secret';
const DAY = 24 * 3600 * 1000;

describe('referral codes', () => {
	it('accepts 8 lowercase letters/digits only', () => {
		expect(isCode('ab12cd34')).toBe(true);
		for (const bad of ['AB12CD34', 'ab12cd3', 'ab12cd345', 'ab12-d34', '', null, 12345678]) expect(isCode(bad)).toBe(false);
	});
});

describe('referral cookie', () => {
	it('survives a round trip (attribution surviving login)', () => {
		const now = Date.now();
		expect(readRef(signRef('ab12cd34', now, SECRET), SECRET, 30, now)).toEqual({ code: 'ab12cd34', clickedAt: now });
	});
	it('expires after the window', () => {
		const clicked = Date.now() - 31 * DAY;
		expect(readRef(signRef('ab12cd34', clicked, SECRET), SECRET, 30)).toBeNull();
		const recent = Date.now() - 29 * DAY;
		expect(readRef(signRef('ab12cd34', recent, SECRET), SECRET, 30)).not.toBeNull();
	});
	it('rejects tampering: another code, another time, another secret', () => {
		const now = Date.now();
		const v = signRef('ab12cd34', now, SECRET);
		const [, at, sig] = v.split('.');
		expect(readRef(`zz99zz99.${at}.${sig}`, SECRET, 30)).toBeNull();
		expect(readRef(`ab12cd34.${now - 1000}.${sig}`, SECRET, 30)).toBeNull();
		expect(readRef(v, 'other-secret', 30)).toBeNull();
		expect(readRef('garbage', SECRET, 30)).toBeNull();
		expect(readRef(undefined, SECRET, 30)).toBeNull();
	});
	it('rejects a click dated in the future', () => {
		expect(readRef(signRef('ab12cd34', Date.now() + DAY, SECRET), SECRET, 30)).toBeNull();
	});
});

describe('first-touch attribution', () => {
	it('keeps the first valid click when another link is clicked', () => {
		const first = { code: 'first111', clickedAt: Date.now() - DAY };
		expect(chooseRef(first, 'second22')).toEqual({ ...first, replaced: false });
	});
	it('takes the new click when there is none (or it expired)', () => {
		const r = chooseRef(null, 'second22', 123);
		expect(r).toEqual({ code: 'second22', clickedAt: 123, replaced: true });
	});
});

describe('same person', () => {
	it('ignores +tags and Gmail dots', () => {
		expect(normaliseEmail('Sam.Smith+expedition@Gmail.com')).toBe('samsmith@gmail.com');
		expect(normaliseEmail('s.am@googlemail.com')).toBe('sam@gmail.com');
		expect(normaliseEmail('sam.smith+x@school.ie')).toBe('sam.smith@school.ie');
		expect(normaliseEmail(null)).toBeNull();
	});
	it('matches on email or Slack ID', () => {
		expect(samePerson({ email: 'a.b@gmail.com', slack_id: null }, { email: 'ab+2@gmail.com', slack_id: null })).toBe(true);
		expect(samePerson({ email: 'x@a.ie', slack_id: 'U1' }, { email: 'y@a.ie', slack_id: 'U1' })).toBe(true);
		expect(samePerson({ email: 'x@a.ie', slack_id: 'U1' }, { email: 'y@a.ie', slack_id: 'U2' })).toBe(false);
		expect(samePerson({ email: null, slack_id: null }, { email: null, slack_id: null })).toBe(false);
	});
});

describe('reward amounts', () => {
	it('$1 at $8/h comes to exactly $1 per reward over any run', () => {
		let total = 0;
		for (let n = 1; n <= 40; n++) {
			total = Math.round((total + rewardHours(n, 100, 800)) * 100) / 100;
			// running total in dollars stays within half a cent of n dollars
			expect(Math.abs(total * 8 - n)).toBeLessThanOrEqual(0.05);
		}
		expect(total).toBe(5); // 40 rewards = $40 = 5h
	});
	it('each payout is 0.12 or 0.13h', () => {
		for (let n = 1; n <= 20; n++) expect([0.12, 0.13]).toContain(rewardHours(n, 100, 800));
	});
});
