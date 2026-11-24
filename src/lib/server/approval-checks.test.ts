import { describe, expect, it } from 'vitest';
import { heldFieldProblem, rejectHeldEdit } from './approval-checks';

describe('admin check edits', () => {
	it('lets an admin save fields on a held approval and blocks everyone else', () => {
		expect(rejectHeldEdit('admin', true, true)).toBeNull();
		expect(rejectHeldEdit('admin', false, false)).toBeNull();
		expect(rejectHeldEdit('reviewer', false, true)).toBeNull();
		expect(rejectHeldEdit('participant', false, true)).toBeNull();

		const blocked = "This one's waiting on an admin's check.";
		expect(rejectHeldEdit('reviewer', true, true)).toBe(blocked);
		expect(rejectHeldEdit('participant', true, true)).toBe(blocked);
		// approving, rejecting, or sending back still goes through the check buttons
		expect(rejectHeldEdit('admin', true, false)).toBe(blocked);
	});

	it('keeps hours and feedback valid, since clearing the check sends them', () => {
		expect(heldFieldProblem(4, 'Looks good.')).toBeNull();
		expect(heldFieldProblem(null, 'Looks good.')).toMatch(/hours/i);
		expect(heldFieldProblem(0, 'Looks good.')).toMatch(/hours/i);
		expect(heldFieldProblem(-1, 'Looks good.')).toMatch(/hours/i);
		expect(heldFieldProblem(2, null)).toMatch(/feedback/i);
		expect(heldFieldProblem(2, '   ')).toMatch(/feedback/i);
	});
});
