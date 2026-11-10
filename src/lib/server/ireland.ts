import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';
import {
	NOTIFY_RATE_LIMIT,
	NOTIFY_RATE_WINDOW_SECS,
	SIGNUP_RATE_LIMIT,
	SIGNUP_RATE_WINDOW_SECS,
	parseNotifyEmail,
	parseSignup,
	publicStatus,
	resolveIrelandSettings,
	splitLegalName,
	type IrelandSignupStatus,
	type PublicIrelandStatus,
	type SignupInput
} from '$lib/ireland';
import { attendConfigFromEnv, inviteParticipant, type AttendInviteResult } from './attend';
import { db } from './db';

export const FORM_COOKIE = 'ie_form_at';

export type IrelandSettings = ReturnType<typeof resolveIrelandSettings>;

export type IrelandSignupRow = {
	id: string;
	name: string;
	email: string;
	age: number;
	school: string;
	county: string;
	github_username: string | null;
	built_note: string | null;
	built_url: string | null;
	status: IrelandSignupStatus;
	attend_participant_event_id: string | null;
	attend_synced_at: string | null;
	attend_error: string | null;
	decided_at: string | null;
	created_at: string;
};

export type IrelandCounts = {
	approved: number;
	pending: number;
	waitlist: number;
	rejected: number;
	holding: number;
};

type RpcResult = {
	ok?: boolean;
	error?: string;
	id?: string;
	status?: string;
	approved?: number;
	capacity?: number;
	promoted?: number;
};

function asRpc(data: unknown): RpcResult {
	if (typeof data === 'string') {
		try {
			return JSON.parse(data) as RpcResult;
		} catch {
			throw new Error('Unexpected database response');
		}
	}
	if (data && typeof data === 'object') return data as RpcResult;
	throw new Error('Unexpected database response');
}

export function hashIrelandIp(ip: string, secret: string): string {
	return createHash('sha256').update(`ireland-signup:${secret}:${ip}`).digest('hex');
}

function ipSecret(): string {
	return env.POSTGREST_JWT_SECRET?.trim() || 'ireland-signup';
}

export function clientIpHash(ip: string | null): string | null {
	if (!ip) return null;
	return hashIrelandIp(ip, ipSecret());
}

export async function readIrelandSettings(): Promise<IrelandSettings> {
	const { data, error } = await db()
		.from('ireland_signup_settings')
		.select('signups_open, capacity')
		.eq('id', 1)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return resolveIrelandSettings({
		envOpen: env.IRELAND_SIGNUPS_OPEN,
		envCapacity: env.IRELAND_CAPACITY,
		dbOpen: data?.signups_open ?? null,
		dbCapacity: data?.capacity ?? null
	});
}

export async function countSignups(): Promise<IrelandCounts> {
	const { data, error } = await db().from('ireland_signups').select('status');
	if (error) throw new Error(error.message);
	const counts: IrelandCounts = { approved: 0, pending: 0, waitlist: 0, rejected: 0, holding: 0 };
	for (const row of data ?? []) {
		const status = row.status as IrelandSignupStatus;
		if (status === 'approved') counts.approved++;
		else if (status === 'pending') counts.pending++;
		else if (status === 'waitlist') counts.waitlist++;
		else if (status === 'rejected') counts.rejected++;
	}
	counts.holding = counts.approved + counts.pending;
	return counts;
}

export async function publicIreland(): Promise<PublicIrelandStatus> {
	const [settings, counts] = await Promise.all([readIrelandSettings(), countSignups()]);
	return publicStatus({ open: settings.open, capacity: settings.capacity, holding: counts.holding });
}

const SIGNUP_COLUMNS =
	'id, name, email, age, school, county, github_username, built_note, built_url, status, attend_participant_event_id, attend_synced_at, attend_error, decided_at, created_at';

export async function listSignups(): Promise<IrelandSignupRow[]> {
	const { data, error } = await db()
		.from('ireland_signups')
		.select(SIGNUP_COLUMNS)
		.order('created_at', { ascending: false });
	if (error) throw new Error(error.message);
	return (data ?? []) as IrelandSignupRow[];
}

export async function getSignup(id: string): Promise<IrelandSignupRow | null> {
	const { data, error } = await db().from('ireland_signups').select(SIGNUP_COLUMNS).eq('id', id).maybeSingle();
	if (error) throw new Error(error.message);
	return (data as IrelandSignupRow | null) ?? null;
}

export async function listNotifyEmails(): Promise<{ email: string; created_at: string }[]> {
	const { data, error } = await db()
		.from('ireland_notify_emails')
		.select('email, created_at')
		.order('created_at', { ascending: true });
	if (error) throw new Error(error.message);
	return data ?? [];
}

async function recentFromIp(table: 'ireland_signups' | 'ireland_notify_emails', ipHash: string, sinceIso: string): Promise<number> {
	const { count, error } = await db()
		.from(table)
		.select('email', { count: 'exact', head: true })
		.eq('ip_hash', ipHash)
		.gte('created_at', sinceIso);
	if (error) throw new Error(error.message);
	return count ?? 0;
}

export type CreateOutcome =
	| { ok: true; status: 'pending' | 'waitlist'; honeypot?: false }
	| { ok: true; honeypot: true }
	| { ok: false; error: 'closed' | 'duplicate' | 'rate' | 'invalid'; message: string };

export async function createSignup(
	fields: Parameters<typeof parseSignup>[0],
	ip: string | null
): Promise<CreateOutcome> {
	const parsed = parseSignup(fields);
	if ('honeypot' in parsed) return { ok: true, honeypot: true };
	if (!parsed.ok) return { ok: false, error: 'invalid', message: parsed.message };

	const settings = await readIrelandSettings();
	if (!settings.open) {
		return { ok: false, error: 'closed', message: "Sign-ups aren't open yet." };
	}

	const { data, error } = await db().rpc('ireland_create_signup', {
		p_name: parsed.value.name,
		p_email: parsed.value.email,
		p_age: parsed.value.age,
		p_school: parsed.value.school,
		p_county: parsed.value.county,
		p_github: parsed.value.github,
		p_built_note: parsed.value.builtNote,
		p_built_url: parsed.value.builtUrl,
		p_ip_hash: clientIpHash(ip),
		p_capacity: settings.capacity,
		p_open: settings.open,
		p_rate_limit: SIGNUP_RATE_LIMIT,
		p_window_secs: SIGNUP_RATE_WINDOW_SECS
	});
	if (error) throw new Error(error.message);
	const result = asRpc(data);
	if (result.ok && (result.status === 'pending' || result.status === 'waitlist')) {
		return { ok: true, status: result.status };
	}
	if (result.error === 'duplicate') {
		return { ok: false, error: 'duplicate', message: 'This email is already signed up.' };
	}
	if (result.error === 'rate') {
		return { ok: false, error: 'rate', message: 'Too many sign-ups from this network. Try again in an hour.' };
	}
	if (result.error === 'closed') {
		return { ok: false, error: 'closed', message: "Sign-ups aren't open yet." };
	}
	throw new Error('Could not save the sign-up');
}

export type NotifyOutcome =
	| { ok: true; honeypot?: boolean }
	| { ok: false; error: 'rate' | 'invalid'; message: string };

export async function saveNotifyEmail(
	fields: Parameters<typeof parseNotifyEmail>[0],
	ip: string | null
): Promise<NotifyOutcome> {
	const parsed = parseNotifyEmail(fields);
	if ('honeypot' in parsed) return { ok: true, honeypot: true };
	if (!parsed.ok) return { ok: false, error: 'invalid', message: parsed.message };

	const ipHash = clientIpHash(ip);
	if (ipHash) {
		const since = new Date(Date.now() - NOTIFY_RATE_WINDOW_SECS * 1000).toISOString();
		const recent = await recentFromIp('ireland_notify_emails', ipHash, since);
		if (recent >= NOTIFY_RATE_LIMIT) {
			return { ok: false, error: 'rate', message: 'Too many requests from this network. Try again in an hour.' };
		}
	}

	const { error } = await db().from('ireland_notify_emails').insert({ email: parsed.email, ip_hash: ipHash });
	if (error) {
		if (error.code === '23505') return { ok: true };
		throw new Error(error.message);
	}
	return { ok: true };
}

export async function saveIrelandSettings(args: { open: boolean; capacity: number }): Promise<IrelandSettings> {
	const capacity = Math.min(10000, Math.max(0, Math.trunc(args.capacity)));
	const { error } = await db()
		.from('ireland_signup_settings')
		.update({ signups_open: args.open, capacity })
		.eq('id', 1);
	if (error) throw new Error(error.message);
	const settings = await readIrelandSettings();
	await db().rpc('ireland_fill_waitlist', { p_capacity: settings.capacity });
	return settings;
}

export type StatusOutcome =
	| { ok: true; promoted: number }
	| { ok: false; error: 'missing' | 'capacity' | 'status'; approved?: number; capacity?: number };

export async function setSignupStatus(args: {
	id: string;
	status: 'approved' | 'rejected';
	override: boolean;
	adminId: string;
	capacity: number;
}): Promise<StatusOutcome> {
	const { data, error } = await db().rpc('ireland_set_status', {
		p_id: args.id,
		p_status: args.status,
		p_override: args.override,
		p_admin: args.adminId,
		p_capacity: args.capacity
	});
	if (error) throw new Error(error.message);
	const result = asRpc(data);
	if (result.ok) return { ok: true, promoted: result.promoted ?? 0 };
	if (result.error === 'capacity') {
		return { ok: false, error: 'capacity', approved: result.approved, capacity: result.capacity };
	}
	if (result.error === 'missing') return { ok: false, error: 'missing' };
	return { ok: false, error: 'status' };
}

export function attendConfig() {
	return attendConfigFromEnv({
		ATTEND_API_TOKEN: env.ATTEND_API_TOKEN,
		ATTEND_EVENT_ID: env.ATTEND_EVENT_ID,
		ATTEND_API_BASE: env.ATTEND_API_BASE
	});
}

async function markAttend(id: string, result: AttendInviteResult): Promise<void> {
	if (result.ok) {
		const { error } = await db()
			.from('ireland_signups')
			.update({
				attend_synced_at: new Date().toISOString(),
				attend_error: null,
				attend_participant_event_id: result.participantEventId
			})
			.eq('id', id);
		if (error) throw new Error(error.message);
		return;
	}
	const { error } = await db()
		.from('ireland_signups')
		.update({ attend_error: result.error, attend_synced_at: null })
		.eq('id', id);
	if (error) throw new Error(error.message);
}

/** Invite one approved person. No-op when Attend isn't configured. Does not change approval. */
export async function syncSignupToAttend(row: IrelandSignupRow): Promise<AttendInviteResult | null> {
	const config = attendConfig();
	if (!config) return null;
	if (row.status !== 'approved') return { ok: false, error: 'Only approved people are sent to Attend.' };
	const { firstName, lastName } = splitLegalName(row.name);
	const result = await inviteParticipant(config, {
		email: row.email,
		firstName,
		lastName,
		county: row.county
	});
	await markAttend(row.id, result);
	return result;
}

export function signupToDraft(row: IrelandSignupRow): SignupInput {
	return {
		name: row.name,
		email: row.email,
		age: row.age,
		school: row.school,
		county: row.county as SignupInput['county'],
		github: row.github_username,
		builtNote: row.built_note,
		builtUrl: row.built_url
	};
}
