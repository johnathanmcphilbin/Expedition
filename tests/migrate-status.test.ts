import { describe, expect, it } from 'vitest';
import { redact } from '../deploy/migrate/app.mjs';

describe('migrate status redaction', () => {
	it('hides passwords in postgres URLs and env assignments', () => {
		const raw = [
			'postgres://exp:exp-local-only@127.0.0.1:5432/expedition',
			'postgresql://reader:s3cret@db.example:5432/db',
			'PGPASSWORD=hunter2',
			'password=nope leftover'
		].join('\n');
		const out = redact(raw);
		expect(out).not.toContain('exp-local-only');
		expect(out).not.toContain('s3cret');
		expect(out).not.toContain('hunter2');
		expect(out).not.toContain('nope');
		expect(out).toContain('exp:REDACTED@');
		expect(out).toContain('127.0.0.1:5432/expedition');
	});
});
