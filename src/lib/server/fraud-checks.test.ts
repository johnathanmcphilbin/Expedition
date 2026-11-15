import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { approvalHoldsForFraudCheck, approvalWasWaiting, clearanceProblem, failedCheckReason } from './fraud-checks';

describe('fraud check rules', () => {
	it('holds an approval instead of sending it', () => {
		expect(approvalHoldsForFraudCheck('approve')).toBe(true);
		expect(approvalHoldsForFraudCheck('approved')).toBe(true);
		expect(approvalHoldsForFraudCheck('fraud')).toBe(true);
		for (const other of ['draft', 'pending', 'in_review', 'changes_requested', 'rejected', '', null]) {
			expect(approvalHoldsForFraudCheck(other)).toBe(false);
		}
	});

	it('lets a different reviewer clear and stops the original approver', () => {
		const base = { checkerId: 'b', approvedBy: 'a', ownerId: 'owner', referred: false, clearing: true };
		expect(clearanceProblem(base)).toBeNull();
		expect(clearanceProblem({ ...base, checkerId: 'a', approvedBy: 'a' })).toMatch(/someone else/);
		expect(clearanceProblem({ ...base, checkerId: 'admin', approvedBy: 'admin' })).toMatch(/someone else/);
		// turning down your own hold is allowed; clearing it is not
		expect(clearanceProblem({ ...base, checkerId: 'a', approvedBy: 'a', clearing: false })).toBeNull();
	});

	it('blocks the participant and their referrer from either decision', () => {
		const own = { checkerId: 'owner', approvedBy: 'a', ownerId: 'owner', referred: false, clearing: true };
		expect(clearanceProblem(own)).toMatch(/own project/);
		expect(clearanceProblem({ ...own, clearing: false })).toMatch(/own project/);
		expect(clearanceProblem({ ...own, checkerId: 'ref', referred: true, clearing: true })).toMatch(/referred/);
		expect(clearanceProblem({ ...own, checkerId: 'ref', referred: true, clearing: false })).toMatch(/referred/);
	});

	it('pays the original approver only for a round that was still waiting', () => {
		expect(approvalWasWaiting('new', 'pending')).toBe(true);
		expect(approvalWasWaiting('new', 'changes_requested')).toBe(false);
		expect(approvalWasWaiting('new', 'rejected')).toBe(false);
		expect(approvalWasWaiting('hc', 'pending')).toBe(true);
		expect(approvalWasWaiting('hc', 'in_review')).toBe(true);
		expect(approvalWasWaiting('hc', 'changes_requested')).toBe(false);
		expect(approvalWasWaiting('hc', 'approved')).toBe(false);
	});

	it('flags a turned-down check, with the reason when there is one', () => {
		expect(failedCheckReason(null)).toBe('Failed fraud check');
		expect(failedCheckReason('copied repo')).toBe('Failed fraud check: copied repo');
	});
});

describe('fraud_checks migration', () => {
	const sql = readFileSync(new URL('../../../supabase/migrations/0048_fraud_checks.sql', import.meta.url), 'utf8');
	const code = sql.replace(/--.*$/gm, '');

	it('only adds fraud_checks', () => {
		expect(code.toLowerCase()).not.toMatch(/\bdrop\b/);
		expect(code.toLowerCase()).not.toMatch(/\btruncate\b/);
		expect(code.toLowerCase()).not.toMatch(/\bdelete from\b/);
		expect(code.toLowerCase()).not.toMatch(/\balter table (?!fraud_checks\b)/);
		expect(code).toMatch(/create table if not exists fraud_checks/i);
	});

	it('uses the review_flags key and Expedition users', () => {
		expect(code).toMatch(/item_kind\s+text not null check \(item_kind in \('hc', 'new'\)\)/);
		expect(code).toMatch(/primary key \(item_kind, item_key\)/);
		expect(code).toMatch(/approved_by\s+uuid not null references users \(id\) on delete cascade/);
		expect(code).toMatch(/approved_hours\s+numeric\(6, 2\) not null check \(approved_hours > 0\)/);
		expect(code).toMatch(/tracked_hours\s+numeric\(7, 2\)/);
		expect(code).toMatch(/participant_feedback\s+text not null/);
		expect(code).toMatch(/alter table fraud_checks enable row level security/);
		expect(code).toMatch(/revoke all on fraud_checks from anon, authenticated/);
	});
});

describe('review actions hold, then clear as the approver', () => {
	const source = readFileSync(new URL('../../routes/admin/reviews/+page.server.ts', import.meta.url), 'utf8');

	it('does not send a queued approval straight to Hack Club', () => {
		const saveNew = source.slice(source.indexOf('saveNew:'), source.indexOf('\treopen:'));
		expect(saveNew).toContain('approvalHoldsForFraudCheck');
		expect(saveNew).toContain('holdForFraudCheck');
		expect(saveNew).not.toContain('sendQueued');
	});

	it('clears by sending and crediting as the original approver', () => {
		const clear = source.slice(source.indexOf('clearFraud:'), source.indexOf('failFraud:'));
		expect(clear).toContain('sendQueued');
		expect(clear).toContain('reviewer: approver');
		expect(clear).toContain('reviewerId: approver.id');
		expect(clear).toContain("status: 'approved'");
		expect(clear).toContain('approvalWasWaiting');
	});

	it('puts a no back in the queue with a flag', () => {
		const fail = source.slice(source.indexOf('failFraud:'), source.indexOf('setHardware:'));
		expect(fail).toContain('takeFraudCheck');
		expect(fail).toContain('failedCheckReason');
		expect(fail).toContain("from('review_flags')");
	});
});
