/**
 * Irish student sign-ups for the Galway hackathon.
 *
 * Pure helpers only. The database and Attend live in `$lib/server`.
 * Nothing in here is personal data, and nothing here reads the environment.
 */

export const DEFAULT_CAPACITY = 30;
export const AGE_MIN = 13;
export const AGE_MAX = 18;

/** Per IP, per window. Kept in sync with the check inside `ireland_create_signup`. */
export const SIGNUP_RATE_LIMIT = 5;
export const SIGNUP_RATE_WINDOW_SECS = 60 * 60;
export const NOTIFY_RATE_LIMIT = 3;
export const NOTIFY_RATE_WINDOW_SECS = 60 * 60;

/** A form posted faster than this, when we saw the page load, is treated as a bot. */
export const MIN_FORM_MS = 2000;

/**
 * Counties on the island, so a student in the North isn't stuck.
 * "Derry" is stored as Derry; the form labels it Derry (Londonderry).
 */
export const COUNTIES = [
	'Antrim',
	'Armagh',
	'Carlow',
	'Cavan',
	'Clare',
	'Cork',
	'Derry',
	'Donegal',
	'Down',
	'Dublin',
	'Fermanagh',
	'Galway',
	'Kerry',
	'Kildare',
	'Kilkenny',
	'Laois',
	'Leitrim',
	'Limerick',
	'Longford',
	'Louth',
	'Mayo',
	'Meath',
	'Monaghan',
	'Offaly',
	'Roscommon',
	'Sligo',
	'Tipperary',
	'Tyrone',
	'Waterford',
	'Westmeath',
	'Wexford',
	'Wicklow'
] as const;

export type County = (typeof COUNTIES)[number];

export type IrelandSignupStatus = 'pending' | 'approved' | 'rejected' | 'waitlist';

/** What the public page is allowed to know. Counts only. No names, no emails. */
export type PublicIrelandStatus = {
	open: boolean;
	capacity: number;
	spotsLeft: number;
	acceptingWaitlist: boolean;
};

export type SignupInput = {
	name: string;
	email: string;
	age: number;
	school: string;
	county: County;
	github: string | null;
	builtNote: string | null;
	builtUrl: string | null;
};

export type AttendCsvRow = {
	name: string;
	email: string;
	age: number;
	school: string;
	county: string;
	github: string | null;
	builtNote: string | null;
	builtUrl: string | null;
	status: IrelandSignupStatus;
};

const ON = new Set(['1', 'true', 'yes', 'on']);
const OFF = new Set(['0', 'false', 'no', 'off']);

/** `null` when the variable is unset or not a recognised boolean. */
export function parseEnvFlag(value: string | undefined | null): boolean | null {
	if (value == null) return null;
	const v = value.trim().toLowerCase();
	if (!v) return null;
	if (ON.has(v)) return true;
	if (OFF.has(v)) return false;
	return null;
}

export function envFlagWasSet(value: string | undefined | null): boolean {
	return value != null && value.trim() !== '';
}

/** `null` when unset or not a whole number from 0 to 10000. */
export function parseEnvCapacity(value: string | undefined | null): number | null {
	if (value == null) return null;
	const v = value.trim();
	if (!/^\d+$/.test(v)) return null;
	const n = Number(v);
	if (!Number.isInteger(n) || n < 0 || n > 10000) return null;
	return n;
}

export function resolveIrelandSettings(args: {
	envOpen: string | undefined | null;
	envCapacity: string | undefined | null;
	dbOpen: boolean | null;
	dbCapacity: number | null;
}): {
	open: boolean;
	capacity: number;
	/** Values stored in the database, which the admin form edits. */
	dbOpen: boolean;
	dbCapacity: number;
	openSource: 'env' | 'database';
	capacitySource: 'env' | 'database';
	/** A non-empty IRELAND_SIGNUPS_OPEN that isn't true/false. Sign-ups stay closed. */
	envOpenUnrecognised: boolean;
} {
	const parsedOpen = parseEnvFlag(args.envOpen);
	const parsedCapacity = parseEnvCapacity(args.envCapacity);
	const envOpenUnrecognised = envFlagWasSet(args.envOpen) && parsedOpen === null;
	const dbOpen = args.dbOpen ?? false;
	const dbCapacity =
		args.dbCapacity != null && Number.isInteger(args.dbCapacity) && args.dbCapacity >= 0
			? args.dbCapacity
			: DEFAULT_CAPACITY;
	const capacity = parsedCapacity ?? dbCapacity;

	if (parsedOpen === null) {
		return {
			open: envOpenUnrecognised ? false : dbOpen,
			capacity,
			dbOpen,
			dbCapacity,
			openSource: envOpenUnrecognised ? 'env' : 'database',
			capacitySource: parsedCapacity === null ? 'database' : 'env',
			envOpenUnrecognised
		};
	}

	return {
		open: parsedOpen,
		capacity,
		dbOpen,
		dbCapacity,
		openSource: 'env',
		capacitySource: parsedCapacity === null ? 'database' : 'env',
		envOpenUnrecognised: false
	};
}

/** Approved + pending are holding a spot. At the cap, new people wait. */
export function intakeStatus(holding: number, capacity: number): 'pending' | 'waitlist' {
	return holding >= capacity ? 'waitlist' : 'pending';
}

export function publicStatus(args: {
	open: boolean;
	capacity: number;
	holding: number;
}): PublicIrelandStatus {
	const spotsLeft = Math.max(0, args.capacity - args.holding);
	return {
		open: args.open,
		capacity: args.capacity,
		spotsLeft,
		acceptingWaitlist: args.open && spotsLeft === 0
	};
}

/**
 * `currentlyApproved` does not include this person.
 * Someone already approved can be approved again (a no-op) without the override.
 */
export function canApprove(args: {
	currentlyApproved: number;
	alreadyApproved: boolean;
	capacity: number;
	override: boolean;
}): boolean {
	if (args.alreadyApproved) return true;
	if (args.currentlyApproved < args.capacity) return true;
	return args.override;
}

export function tooFast(cookieValue: string | undefined, now: number, minMs = MIN_FORM_MS): boolean {
	if (!cookieValue) return false;
	const at = Number(cookieValue);
	if (!Number.isFinite(at)) return false;
	const elapsed = now - at;
	return elapsed >= 0 && elapsed < minMs;
}

export function overRate(recentCount: number, limit: number): boolean {
	return recentCount >= limit;
}

/**
 * Attend requires a first and last name. A single given name is stored with
 * Attend's own placeholder last name ("Unknown"), which it replaces when the
 * person signs in. A surname particle (Ní, Ó, Mac, …) starts the last name.
 */
const SURNAME_PARTICLES = new Set(['ní', 'nic', 'uí', 'ó', 'o', "o'", 'mac', 'mc', 'de']);

export function splitLegalName(name: string): { firstName: string; lastName: string } {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return { firstName: 'Unknown', lastName: 'Unknown' };
	if (parts.length === 1) return { firstName: parts[0], lastName: 'Unknown' };
	const particle = parts.findIndex(
		(part, i) => i > 0 && SURNAME_PARTICLES.has(part.toLowerCase().replace(/’/g, "'"))
	);
	if (particle > 0) {
		return { firstName: parts.slice(0, particle).join(' '), lastName: parts.slice(particle).join(' ') };
	}
	return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME = /^\p{L}[\p{L}\p{M}\s'’.\-]{0,79}$/u;
const GITHUB = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export function normaliseGithub(raw: string): string | null {
	let v = raw.trim();
	if (!v) return null;
	v = v.replace(/^@+/, '');
	v = v.replace(/^https?:\/\/(www\.)?github\.com\//i, '');
	v = v.split(/[/?#]/)[0] ?? '';
	v = v.replace(/\/+$/, '');
	return v || null;
}

export type ParseResult =
	| { honeypot: true }
	| { ok: false; message: string; field?: string }
	| { ok: true; value: SignupInput };

function blank(value: string | null | undefined): string {
	return (value ?? '').trim();
}

export function parseSignup(fields: {
	name?: string | null;
	email?: string | null;
	age?: string | null;
	school?: string | null;
	county?: string | null;
	github?: string | null;
	built?: string | null;
	built_url?: string | null;
	hp?: string | null;
}): ParseResult {
	if (blank(fields.hp)) return { honeypot: true };

	const name = blank(fields.name).replace(/\s+/g, ' ');
	if (name.length < 2) return { ok: false, field: 'name', message: 'Tell us your name.' };
	if (name.length > 80 || !NAME.test(name)) {
		return { ok: false, field: 'name', message: 'Use the name you’d put on a form, letters and spaces.' };
	}

	const email = blank(fields.email).toLowerCase();
	if (!email) return { ok: false, field: 'email', message: 'Email is required.' };
	if (email.length > 320 || !EMAIL.test(email)) {
		return { ok: false, field: 'email', message: 'That email doesn’t look right.' };
	}

	const ageRaw = blank(fields.age);
	if (!/^\d+$/.test(ageRaw)) return { ok: false, field: 'age', message: 'Age needs to be a whole number.' };
	const age = Number(ageRaw);
	if (age < AGE_MIN || age > AGE_MAX) {
		return {
			ok: false,
			field: 'age',
			message: `This sign-up is for ages ${AGE_MIN} to ${AGE_MAX}.`
		};
	}

	const school = blank(fields.school).replace(/\s+/g, ' ');
	if (school.length < 2) return { ok: false, field: 'school', message: 'Which school do you go to?' };
	if (school.length > 120) return { ok: false, field: 'school', message: 'That school name is too long.' };

	const county = blank(fields.county);
	if (!COUNTIES.includes(county as County)) {
		return { ok: false, field: 'county', message: 'Pick a county.' };
	}

	let github: string | null = null;
	if (blank(fields.github)) {
		github = normaliseGithub(fields.github ?? '');
		if (!github || github.length > 39 || !GITHUB.test(github)) {
			return {
				ok: false,
				field: 'github',
				message: 'That GitHub username doesn’t look right. Leave it blank if you don’t have one.'
			};
		}
	}

	const builtNoteRaw = blank(fields.built);
	if (builtNoteRaw.length > 2000) {
		return { ok: false, field: 'built', message: 'Keep what you’ve built under 2000 characters.' };
	}
	const builtNote = builtNoteRaw || null;

	const linkRaw = blank(fields.built_url);
	let builtUrl: string | null = null;
	if (linkRaw) {
		if (linkRaw.length > 2000) return { ok: false, field: 'built_url', message: 'That link is too long.' };
		let parsed: URL;
		try {
			parsed = new URL(linkRaw);
		} catch {
			return { ok: false, field: 'built_url', message: 'That link needs to be a full URL, like https://…' };
		}
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			return { ok: false, field: 'built_url', message: 'That link needs to start with http:// or https://.' };
		}
		builtUrl = parsed.toString();
	}

	return {
		ok: true,
		value: { name, email, age, school, county: county as County, github, builtNote, builtUrl }
	};
}

export type NotifyParse =
	| { honeypot: true }
	| { ok: false; message: string; field?: string }
	| { ok: true; email: string };

export function parseNotifyEmail(fields: { email?: string | null; hp?: string | null }): NotifyParse {
	if (blank(fields.hp)) return { honeypot: true };
	const email = blank(fields.email).toLowerCase();
	if (!email) return { ok: false, field: 'email', message: 'Email is required.' };
	if (email.length > 320 || !EMAIL.test(email)) {
		return { ok: false, field: 'email', message: 'That email doesn’t look right.' };
	}
	return { ok: true, email };
}

/**
 * Headers Attend's CSV importer maps exactly (`CsvImportService::COLUMN_MAPPING`).
 * Later columns are for us. Attend ignores headers it doesn't know.
 */
export const ATTEND_CSV_HEADERS = [
	'Email',
	'First Name',
	'Last Name',
	'Country',
	'State',
	'Age',
	'School',
	'County',
	'GitHub',
	'Something built',
	'Built link'
] as const;

function csvCell(value: string | number | null | undefined, formulaGuard: boolean): string {
	let s = value == null ? '' : String(value);
	if (formulaGuard && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
	return s;
}

/** Approved rows only. Caller filters; this drops anyone who isn't approved. */
export function rowsToAttendCsv(rows: readonly AttendCsvRow[]): string {
	const lines = [ATTEND_CSV_HEADERS.join(',')];
	for (const row of rows) {
		if (row.status !== 'approved') continue;
		const { firstName, lastName } = splitLegalName(row.name);
		const cells = [
			csvCell(row.email, false),
			csvCell(firstName, false),
			csvCell(lastName, false),
			csvCell('Ireland', false),
			csvCell(row.county, false),
			csvCell(row.age, false),
			csvCell(row.school, true),
			csvCell(row.county, false),
			csvCell(row.github, true),
			csvCell(row.builtNote, true),
			csvCell(row.builtUrl, true)
		];
		lines.push(cells.join(','));
	}
	return lines.join('\n') + '\n';
}
