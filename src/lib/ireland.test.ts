import { describe, expect, it } from 'vitest';
import {
	AGE_MAX,
	AGE_MIN,
	ATTEND_CSV_HEADERS,
	DEFAULT_CAPACITY,
	canApprove,
	intakeStatus,
	normaliseGithub,
	parseEnvCapacity,
	parseEnvFlag,
	parseNotifyEmail,
	parseSignup,
	publicStatus,
	resolveIrelandSettings,
	rowsToAttendCsv,
	splitLegalName,
	tooFast,
	overRate,
	type AttendCsvRow
} from './ireland';

const valid = {
	name: 'Aoife Ní Bhriain',
	email: 'Aoife@School.ie',
	age: '16',
	school: "St Mary's, Galway",
	county: 'Galway',
	github: '',
	built: '',
	built_url: '',
	hp: ''
};

describe('Ireland sign-up settings', () => {
	it('defaults to closed and 30 spots when nothing is set', () => {
		const settings = resolveIrelandSettings({
			envOpen: undefined,
			envCapacity: undefined,
			dbOpen: null,
			dbCapacity: null
		});
		expect(settings.open).toBe(false);
		expect(settings.capacity).toBe(DEFAULT_CAPACITY);
		expect(settings.openSource).toBe('database');
		expect(settings.capacitySource).toBe('database');
	});

	it('uses the database toggle when the env var is unset', () => {
		const settings = resolveIrelandSettings({
			envOpen: '  ',
			envCapacity: '',
			dbOpen: true,
			dbCapacity: 12
		});
		expect(settings.open).toBe(true);
		expect(settings.capacity).toBe(12);
	});

	it('lets the env var force the door shut or open', () => {
		expect(parseEnvFlag(' YES ')).toBe(true);
		expect(parseEnvFlag('0')).toBe(false);
		expect(parseEnvFlag(undefined)).toBe(null);
		const shut = resolveIrelandSettings({
			envOpen: 'false',
			envCapacity: null,
			dbOpen: true,
			dbCapacity: 30
		});
		expect(shut.open).toBe(false);
		expect(shut.openSource).toBe('env');
		const open = resolveIrelandSettings({
			envOpen: '1',
			envCapacity: null,
			dbOpen: false,
			dbCapacity: 30
		});
		expect(open.open).toBe(true);
	});

	it('treats an unrecognised open flag as closed', () => {
		const settings = resolveIrelandSettings({
			envOpen: 'soon',
			envCapacity: null,
			dbOpen: true,
			dbCapacity: 30
		});
		expect(settings.open).toBe(false);
		expect(settings.envOpenUnrecognised).toBe(true);
		expect(settings.openSource).toBe('env');
	});

	it('uses a whole-number capacity from the env and ignores junk', () => {
		expect(parseEnvCapacity('30')).toBe(30);
		expect(parseEnvCapacity('0')).toBe(0);
		expect(parseEnvCapacity('30.5')).toBe(null);
		expect(parseEnvCapacity('-1')).toBe(null);
		expect(parseEnvCapacity('lots')).toBe(null);
		const settings = resolveIrelandSettings({
			envOpen: null,
			envCapacity: '18',
			dbOpen: false,
			dbCapacity: 30
		});
		expect(settings.capacity).toBe(18);
		expect(settings.capacitySource).toBe('env');
		const fallback = resolveIrelandSettings({
			envOpen: null,
			envCapacity: 'nope',
			dbOpen: false,
			dbCapacity: 22
		});
		expect(fallback.capacity).toBe(22);
		expect(fallback.capacitySource).toBe('database');
	});
});

describe('spots and approval', () => {
	it('waitlists once approved plus pending fills the cap', () => {
		expect(intakeStatus(29, 30)).toBe('pending');
		expect(intakeStatus(30, 30)).toBe('waitlist');
		expect(intakeStatus(31, 30)).toBe('waitlist');
	});

	it('publishes only the count, and says when new people wait', () => {
		const open = publicStatus({ open: true, capacity: 30, holding: 12 });
		expect(open).toEqual({ open: true, capacity: 30, spotsLeft: 18, acceptingWaitlist: false });
		expect(Object.keys(open).sort()).toEqual(['acceptingWaitlist', 'capacity', 'open', 'spotsLeft']);
		expect(publicStatus({ open: true, capacity: 30, holding: 30 }).acceptingWaitlist).toBe(true);
		expect(publicStatus({ open: false, capacity: 30, holding: 30 }).acceptingWaitlist).toBe(false);
		expect(publicStatus({ open: true, capacity: 30, holding: 40 }).spotsLeft).toBe(0);
	});

	it('refuses an approval past capacity unless override is explicit', () => {
		expect(canApprove({ currentlyApproved: 29, alreadyApproved: false, capacity: 30, override: false })).toBe(true);
		expect(canApprove({ currentlyApproved: 30, alreadyApproved: false, capacity: 30, override: false })).toBe(false);
		expect(canApprove({ currentlyApproved: 30, alreadyApproved: false, capacity: 30, override: true })).toBe(true);
		expect(canApprove({ currentlyApproved: 30, alreadyApproved: true, capacity: 30, override: false })).toBe(true);
	});
});

describe('sign-up validation', () => {
	it('accepts a minimal sign-up and keeps the optional fields empty', () => {
		const parsed = parseSignup(valid);
		expect(parsed).toMatchObject({
			ok: true,
			value: {
				name: 'Aoife Ní Bhriain',
				email: 'aoife@school.ie',
				age: 16,
				school: "St Mary's, Galway",
				county: 'Galway',
				github: null,
				builtNote: null,
				builtUrl: null
			}
		});
	});

	it('treats a filled honeypot as spam and does not validate the rest', () => {
		expect(parseSignup({ ...valid, name: '', hp: 'acme' })).toEqual({ honeypot: true });
		expect(parseNotifyEmail({ email: 'not-an-email', hp: 'x' })).toEqual({ honeypot: true });
	});

	it('rejects ages outside 13 to 18, unknown counties, and bad optional fields', () => {
		expect(parseSignup({ ...valid, age: '12' })).toMatchObject({ ok: false, field: 'age' });
		expect(parseSignup({ ...valid, age: '19' })).toMatchObject({ ok: false, field: 'age' });
		expect(parseSignup({ ...valid, age: '16.5' })).toMatchObject({ ok: false, field: 'age' });
		expect(AGE_MIN).toBe(13);
		expect(AGE_MAX).toBe(18);
		expect(parseSignup({ ...valid, county: 'Galway City' })).toMatchObject({ ok: false, field: 'county' });
		expect(parseSignup({ ...valid, github: 'not a user' })).toMatchObject({ ok: false, field: 'github' });
		expect(parseSignup({ ...valid, built_url: 'javascript:alert(1)' })).toMatchObject({ ok: false, field: 'built_url' });
		expect(parseSignup({ ...valid, email: 'aoife' })).toMatchObject({ ok: false, field: 'email' });
		expect(parseSignup({ ...valid, school: ' ' })).toMatchObject({ ok: false, field: 'school' });
	});

	it('cleans a GitHub username and accepts a real link', () => {
		expect(normaliseGithub(' @HackClub ')).toBe('HackClub');
		expect(normaliseGithub('https://github.com/hackclub/')).toBe('hackclub');
		const parsed = parseSignup({
			...valid,
			github: 'https://github.com/aoife',
			built: 'A tide logger',
			built_url: 'https://example.com/tide'
		});
		expect(parsed).toMatchObject({
			ok: true,
			value: { github: 'aoife', builtNote: 'A tide logger', builtUrl: 'https://example.com/tide' }
		});
	});

	it('flags a form that was posted immediately after the page loaded', () => {
		expect(tooFast(undefined, 10_000)).toBe(false);
		expect(tooFast('9000', 10_000)).toBe(true);
		expect(tooFast('1000', 10_000)).toBe(false);
		expect(tooFast('nope', 10_000)).toBe(false);
		expect(overRate(4, 5)).toBe(false);
		expect(overRate(5, 5)).toBe(true);
	});
});

describe('Attend CSV', () => {
	const row = (over: Partial<AttendCsvRow> = {}): AttendCsvRow => ({
		name: 'Aoife Ní Bhriain',
		email: 'aoife@school.ie',
		age: 16,
		school: "St Mary's, Galway",
		county: 'Galway',
		github: null,
		builtNote: null,
		builtUrl: null,
		status: 'approved',
		...over
	});

	it('uses Attend’s exact headers and only includes approved people', () => {
		const csv = rowsToAttendCsv([
			row(),
			row({ email: 'wait@school.ie', status: 'waitlist' }),
			row({ email: 'no@school.ie', status: 'rejected' }),
			row({ name: 'Sam', email: 'sam@school.ie', status: 'pending' })
		]);
		const [header, line, extra] = csv.trimEnd().split('\n');
		expect(header).toBe(ATTEND_CSV_HEADERS.join(','));
		expect(line).toContain('aoife@school.ie');
		expect(line?.startsWith('aoife@school.ie,Aoife,Ní Bhriain,Ireland,Galway,16,')).toBe(true);
		expect(extra).toBeUndefined();
		expect(csv).not.toContain('wait@school.ie');
		expect(csv).not.toContain('sam@school.ie');
	});

	it('quotes commas and neutralises spreadsheet formulas in the free-text columns', () => {
		const csv = rowsToAttendCsv([
			row({
				school: "St Mary's, Galway",
				builtNote: '=1+1',
				builtUrl: 'https://example.com/a,b',
				github: 'aoife'
			})
		]);
		expect(csv).toContain(`"St Mary's, Galway"`);
		expect(csv).toContain(",'=1+1,");
		expect(csv).toContain('"https://example.com/a,b"');
		expect(splitLegalName('Sam')).toEqual({ firstName: 'Sam', lastName: 'Unknown' });
		expect(splitLegalName('Mary Ann O’Brien')).toEqual({ firstName: 'Mary Ann', lastName: 'O’Brien' });
	});
});
