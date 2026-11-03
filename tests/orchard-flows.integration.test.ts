import { describe, it, expect, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { upsertUser } from '$lib/server/hca';
import { createSession, destroySession, readSession } from '$lib/server/session';
import { connectProject, disconnectProject, listConnectedProjects, claimReward, cancelClaim, moveTravelHours, getBalance, getProgress, getTravelBuckets, grantHours } from '$lib/server/queries';
import { postCheckpoint, listProjectCheckpoints, moderate, setOwnSharing } from '$lib/server/checkpoints';
import { queueSubmission, decideQueued, reopenQueued, getQueued, listQueue, countQueuePending } from '$lib/server/queue';
import { downloadObject, removeObjects, uploadObject } from '$lib/server/files';
import { decideFileAccess } from '$lib/server/files-access';
import { submitReview } from '$lib/server/review';
import { handleJoin, attachReferralOnSignup, logAdminAction, referralAdmin } from '$lib/server/referrals';
import { listUsersWithBalances } from '$lib/server/queries';
import type { UserRow } from '$lib/server/database.types';

/**
 * Main flows against PostgREST (staging Orchard, or a local PostgREST).
 * Writes only go to POSTGREST_URL. Supabase URLs are refused.
 * Rows are tagged orchard-test- and removed afterwards on that database only.
 */
const url = process.env.POSTGREST_URL ?? '';
const RUN = process.env.RUN_ORCHARD_TESTS === '1';
if (RUN && /supabase\.(co|com)|ulmowedmbobncmcriszs/i.test(url)) {
	throw new Error('Refusing to run Orchard write tests against Supabase');
}
const d = RUN ? describe : describe.skip;

const tag = `orchard-test-${randomBytes(4).toString('hex')}`;
const created: string[] = [];

class Jar {
	store = new Map<string, string>();
	get = (name: string) => this.store.get(name);
	set = (name: string, value: string) => void this.store.set(name, value);
	delete = (name: string) => void this.store.delete(name);
	getAll = () => [...this.store].map(([name, value]) => ({ name, value }));
	serialize = () => '';
}
const cookies = () => new Jar() as unknown as Cookies;

function png(name: string, bytes: number[]) {
	return new File([Uint8Array.from(bytes)], name, { type: 'image/png' });
}

async function taggedUser(suffix: string, role: 'participant' | 'admin' = 'participant'): Promise<UserRow> {
	const { user } = await upsertUser({
		sub: `${tag}-${suffix}`,
		email: `${tag}-${suffix}@example.com`,
		name: `[orchard-test] ${suffix}`
	});
	created.push(user.id);
	if (role !== 'participant') {
		const updated = await db().from('users').update({ role }).eq('id', user.id).select('*').single();
		if (updated.error) throw updated.error;
		return updated.data as UserRow;
	}
	return user;
}

d('orchard flows', () => {
	let admin: UserRow;
	let builder: UserRow;
	let referrer: UserRow;
	let reviewId = '';
	let claimId = '';
	let rewardId = '';

	afterAll(async () => {
		if (!RUN || !created.length) return;
		const ids = [...new Set(created)];
		for (const id of ids) {
			const shots = await db().from('submission_queue').select('screenshot_path').eq('user_id', id);
			const shotsPaths = (shots.data ?? []).map((row) => row.screenshot_path).filter((path): path is string => !!path);
			const cps = await db().from('checkpoints').select('image_path').eq('user_id', id);
			const cpPaths = (cps.data ?? []).map((row) => row.image_path).filter((path): path is string => !!path);
			await removeObjects('submission-screenshots', shotsPaths);
			await removeObjects('checkpoint-images', cpPaths);
			await removeObjects('submission-evidence', [`${id}/evidence.bin`]);
		}
		const codes = await db().from('referral_codes').select('code').in('user_id', ids);
		const codeList = (codes.data ?? []).map((row) => row.code as string);
		if (codeList.length) await db().from('referral_events').delete().in('code', codeList);
		await db().from('sessions').delete().in('user_id', ids);
		await db().from('checkpoints').delete().in('user_id', ids);
		await db().from('submission_queue').delete().in('user_id', ids);
		await db().from('expedition_projects').delete().in('user_id', ids);
		await db().from('daily_project_coding').delete().in('user_id', ids);
		await db().from('review_claims').delete().in('reviewer_id', ids);
		await db().from('admin_actions').delete().in('admin_id', ids);
		await db().from('referral_attributions').delete().in('referred_id', ids);
		await db().from('hackclub_submissions').delete().in('user_id', ids);
		await db().from('submission_reviews').delete().in('user_id', ids);
		await db().from('reward_claims').delete().in('user_id', ids);
		// hour_transactions is append-only, so a paid test user cannot be removed.
		const leftover = await db().from('users').delete().in('id', ids).select('id');
		if (leftover.error) {
			await db()
				.from('users')
				.update({ display_name: '[orchard-test] leftover ledger row' })
				.in('id', ids);
		}
	});

	it('signs a user in, keeps a session, and updates the profile without touching role', async () => {
		builder = await taggedUser('builder');
		expect(builder.role).toBe('participant');
		expect(builder.display_name).toBe('[orchard-test] builder');
		const code = await db().from('referral_codes').select('code').eq('user_id', builder.id).single();
		expect(code.data?.code).toMatch(/^[a-z0-9]{8}$/);

		const jar = cookies();
		await createSession(jar, builder.id, { userAgent: 'orchard-test', ip: '127.0.0.1' });
		const seen = await readSession(jar);
		expect(seen?.id).toBe(builder.id);
		await destroySession(jar);
		expect(await readSession(jar)).toBeNull();

		const again = await upsertUser({ sub: `${tag}-builder`, name: '[orchard-test] builder renamed', email: builder.email ?? undefined });
		expect(again.created).toBe(false);
		expect(again.user.role).toBe('participant');
		expect(again.user.display_name).toBe('[orchard-test] builder renamed');
		admin = await taggedUser('admin', 'admin');
		expect(admin.role).toBe('admin');
		const row = await db().from('users').select('updated_at, created_at').eq('id', builder.id).single();
		expect(new Date(row.data!.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(row.data!.created_at).getTime());
	});

	it('rejects an unknown role enum', async () => {
		const bad = await db().from('users').insert({ hackclub_id: `${tag}-bogus`, role: 'superuser' as 'admin' });
		expect(bad.error).toBeTruthy();
	});

	it('connects, renames, and disconnects a project', async () => {
		await connectProject(builder.id, `${tag}-game`);
		expect(await listConnectedProjects(builder.id)).toContain(`${tag}-game`);
		await connectProject(builder.id, `${tag}-game-2`);
		await disconnectProject(builder.id, `${tag}-game`);
		const left = await listConnectedProjects(builder.id);
		expect(left).toContain(`${tag}-game-2`);
		expect(left).not.toContain(`${tag}-game`);
	});

	it('records daily coding hours and reads them back', async () => {
		const row = {
			user_id: builder.id,
			day: '2026-11-01',
			project: `${tag}-game-2`,
			seconds: 5400,
			fetched_at: new Date().toISOString()
		};
		const up = await db().from('daily_project_coding').upsert(row, { onConflict: 'user_id,day,project' }).select('seconds').single();
		expect(up.error).toBeNull();
		const read = await db()
			.from('daily_project_coding')
			.select('seconds')
			.eq('user_id', builder.id)
			.eq('day', '2026-11-01')
			.eq('project', `${tag}-game-2`)
			.single();
		expect(read.data?.seconds).toBe(5400);
	});

	it('uploads a checkpoint image into public.files and reads the bytes back', async () => {
		const posted = await postCheckpoint({
			userId: builder.id,
			project: `${tag}-game-2`,
			number: 1,
			trackedHours: 5,
			workedOn: '[orchard-test] checkpoint',
			nextUp: null,
			videoUrl: null,
			image: png('checkpoint.png', [9, 8, 7, 6]),
			share: true
		});
		expect(posted).toEqual({ ok: true });
		const listed = await listProjectCheckpoints(builder.id, `${tag}-game-2`);
		expect(listed).toHaveLength(1);
		expect(listed[0].image_url).toMatch(/^\/files\/checkpoint-images\//);
		const path = listed[0].image_path!;
		const file = await downloadObject('checkpoint-images', path);
		expect(Array.from(file?.bytes ?? [])).toEqual([9, 8, 7, 6]);
		expect(
			decideFileAccess({
				bucket: 'checkpoint-images',
				viewer: null,
				checkpoint: { user_id: builder.id, visibility: 'private' },
				submission: null,
				fileExists: true
			}).ok
		).toBe(false);
		await setOwnSharing(builder.id, listed[0].id, true);
		await moderate(listed[0].id, admin.id, 'shown');
		const shown = await db().from('checkpoints').select('visibility').eq('id', listed[0].id).single();
		expect(shown.data?.visibility).toBe('shown');
		if (process.env.APP_ORIGIN && listed[0].image_url) {
			const res = await fetch(new URL(listed[0].image_url, process.env.APP_ORIGIN));
			expect(res.status).toBe(200);
			expect(new Uint8Array(await res.arrayBuffer())).toEqual(Uint8Array.from([9, 8, 7, 6]));
		}
	});

	it('queues a submission screenshot and a legacy evidence object', async () => {
		const queued = await queueSubmission(
			builder.id,
			`${tag}-hackatime`,
			{
				project_name: `${tag}-game-2`,
				hackatime_projects: [`${tag}-game-2`],
				hardware: false,
				code_url: 'https://example.com/code',
				playable_url: 'https://example.com/play',
				description: '[orchard-test] submission',
				first_name: 'Orchard',
				last_name: 'Test',
				email: `${tag}-builder@example.com`,
				github_username: 'orchardtest',
				birthday: '2008-01-02',
				address_line1: '1 Test St',
				address_line2: null,
				city: 'Dublin',
				state: 'D',
				country: 'IE',
				zip: 'D02',
				heard_about: null,
				doing_well: null,
				improve: null
			},
			png('screen.png', [4, 5, 6]),
			false,
			{},
			3
		);
		expect(queued.screenshot_path).toBeTruthy();
		const shot = await downloadObject('submission-screenshots', queued.screenshot_path!);
		expect(Array.from(shot?.bytes ?? [])).toEqual([4, 5, 6]);
		const evidence = await uploadObject('submission-evidence', `${builder.id}/evidence.bin`, Uint8Array.from([1, 1, 1]), 'application/octet-stream');
		expect(evidence.error).toBeNull();
		const back = await downloadObject('submission-evidence', `${builder.id}/evidence.bin`);
		expect(Array.from(back?.bytes ?? [])).toEqual([1, 1, 1]);
		expect(await countQueuePending()).toBeGreaterThan(0);
		expect((await listQueue()).some((row) => row.id === queued.id)).toBe(true);

		await decideQueued(queued.id, admin.id, 'changes_requested', null, 'internal', 'please fix');
		expect((await getQueued(queued.id))?.status).toBe('changes_requested');
		await reopenQueued(queued.id);
		expect((await getQueued(queued.id))?.status).toBe('pending');
	});

	it('runs every rpc the app calls', async () => {
		referrer = await taggedUser('referrer');
		const rec = `recT${tag.replace(/-/g, '').slice(-10)}`.slice(0, 17);
		const hc = await db().from('hackclub_submissions').insert({
			airtable_record_id: rec,
			user_id: builder.id,
			project_names_raw: `${tag}-game-2`
		});
		expect(hc.error).toBeNull();
		const review = await db()
			.from('submission_reviews')
			.insert({
				airtable_record_id: rec,
				user_id: builder.id,
				hackatime_project: `${tag}-game-2`,
				hackatime_projects: [`${tag}-game-2`],
				status: 'pending'
			})
			.select('id')
			.single();
		expect(review.error).toBeNull();
		reviewId = review.data!.id as string;

		const approved = await submitReview({
			reviewId,
			reviewerId: admin.id,
			status: 'approved',
			approvedHours: 4,
			internalNotes: '[orchard-test]',
			participantFeedback: null,
			submittedHours: 4
		});
		expect(approved.ok).toBe(true);

		const balance = await getBalance(builder.id);
		expect(Number(balance.hours_available)).toBeGreaterThanOrEqual(4);
		const progress = await getProgress(builder.id);
		expect(Number(progress.hours_earned)).toBeGreaterThanOrEqual(4);

		const claim = await claimReward({
			userId: builder.id,
			rewardKey: `${tag}-sticker`,
			rewardName: '[orchard-test] sticker',
			hoursCost: 1,
			note: null
		});
		expect(claim.ok).toBe(true);
		if (claim.ok) claimId = claim.claimId;

		const moved = await moveTravelHours(builder.id, 1, 'flights');
		expect(moved.ok).toBe(true);
		const buckets = await getTravelBuckets(builder.id);
		expect(Number(buckets.flights)).toBeGreaterThan(0);

		const won = await db().rpc('award_challenge', {
			p_user_id: builder.id,
			p_key: `${tag}-prize`,
			p_name: '[orchard-test] prize',
			p_spots: 5,
			p_spend: 1,
			p_since: '2020-01-01T00:00:00Z'
		});
		expect(won.error).toBeNull();
		expect(won.data).toBe(true);

		const cancelled = await cancelClaim(claimId, admin.id, '[orchard-test] cancel');
		expect(cancelled.ok).toBe(true);

		const refCode = (await db().from('referral_codes').select('code').eq('user_id', referrer.id).single()).data!.code as string;
		const jar = cookies();
		expect((await handleJoin(jar, null, refCode)).valid).toBe(true);
		const joined = await taggedUser('friend');
		await attachReferralOnSignup(jar, joined);
		const attr = await db().from('referral_attributions').select('referrer_id').eq('referred_id', joined.id).single();
		expect(attr.data?.referrer_id).toBe(referrer.id);

		const rec2 = `recU${tag.replace(/-/g, '').slice(-10)}`.slice(0, 17);
		await db().from('hackclub_submissions').insert({ airtable_record_id: rec2, user_id: joined.id, project_names_raw: 'friend' });
		const review2 = await db()
			.from('submission_reviews')
			.insert({
				airtable_record_id: rec2,
				user_id: joined.id,
				hackatime_project: 'friend',
				status: 'pending'
			})
			.select('id')
			.single();
		await db().rpc('review_hackclub_submission', {
			p_review_id: review2.data!.id,
			p_reviewer_id: admin.id,
			p_status: 'approved',
			p_approved_hours: 3
		});
		const paid = await db().rpc('referral_pay_for_review', { p_review_id: review2.data!.id });
		expect(paid.error).toBeNull();
		// referral_reconcile() pays every approved review of a referred user that
		// has no reward row yet. On a database that already has real rows, call
		// it only when every such review belongs to this run.
		const [approvedRows, rewardRows, attributionRows] = await Promise.all([
			db().from('submission_reviews').select('id, user_id').eq('status', 'approved'),
			db().from('referral_rewards').select('review_id'),
			db().from('referral_attributions').select('referred_id')
		]);
		expect(approvedRows.error).toBeNull();
		expect(rewardRows.error).toBeNull();
		expect(attributionRows.error).toBeNull();
		const paidReviews = new Set((rewardRows.data ?? []).map((row) => row.review_id));
		const referred = new Set((attributionRows.data ?? []).map((row) => row.referred_id));
		const outsiders = (approvedRows.data ?? []).filter(
			(row) => referred.has(row.user_id) && !paidReviews.has(row.id) && !created.includes(row.user_id)
		);
		if (outsiders.length) {
			console.log(`referral_reconcile not called: ${outsiders.length} non-test approvals would be paid`);
			expect(outsiders.length).toBeGreaterThan(0);
		} else {
			const reconciled = await db().rpc('referral_reconcile');
			expect(reconciled.error).toBeNull();
			expect(typeof reconciled.data).toBe('number');
		}
		const reward = await db().from('referral_rewards').select('id').eq('referred_id', joined.id).maybeSingle();
		rewardId = reward.data?.id ?? '';
		if (rewardId) {
			const reversed = await db().rpc('referral_reverse', {
				p_reward_id: rewardId,
				p_admin_id: admin.id,
				p_note: '[orchard-test] reverse'
			});
			expect(reversed.error).toBeNull();
			expect(reversed.data).toBe(true);
		}

		const rec3 = `recV${tag.replace(/-/g, '').slice(-10)}`;
		await db().from('hackclub_submissions').insert({
			airtable_record_id: rec3,
			user_id: joined.id,
			project_names_raw: 'other'
		});
		const rejected = await db()
			.from('submission_reviews')
			.insert({
				airtable_record_id: rec3,
				user_id: joined.id,
				hackatime_project: 'other',
				status: 'pending'
			})
			.select('id')
			.single();
		await db().rpc('review_hackclub_submission', {
			p_review_id: rejected.data!.id,
			p_reviewer_id: admin.id,
			p_status: 'rejected'
		});
		const reopened = await db().rpc('reopen_review', { p_review_id: rejected.data!.id, p_admin_id: admin.id });
		expect(reopened.error).toBeNull();
		const status = await db().from('submission_reviews').select('status').eq('id', rejected.data!.id).single();
		expect(status.data?.status).toBe('pending');

		const blocked = await db().from('hour_transactions').update({ note: 'nope' }).eq('user_id', builder.id);
		expect(blocked.error?.message).toMatch(/append-only/);
	});

	it('records an admin action and lists the admin roster', async () => {
		await logAdminAction(admin.id, 'orchard-test', builder.id, '[orchard-test] note');
		const row = await db().from('admin_actions').select('action, note').eq('admin_id', admin.id).eq('action', 'orchard-test').maybeSingle();
		expect(row.data?.note).toBe('[orchard-test] note');
		const roster = await listUsersWithBalances();
		expect(roster.some((user) => user.id === builder.id)).toBe(true);
		const adminView = await referralAdmin();
		expect(adminView.config).toBeTruthy();
		await grantHours(builder.id, 0.01, 'manual_adjustment', '[orchard-test] grant');
		const tx = await db().from('hour_transactions').select('id').eq('user_id', builder.id).eq('note', '[orchard-test] grant');
		expect(tx.data?.length).toBe(1);
	});

	it('advances a sequence and does not rewind it when the row is removed', async () => {
		const code = (await db().from('referral_codes').select('code').eq('user_id', builder.id).single()).data!.code as string;
		const before = await db().rpc('referral_reconcile');
		expect(before.error).toBeNull();
		const inserted = await db().from('referral_events').insert({ code, type: 'click', visitor_hash: tag }).select('id').single();
		expect(inserted.error).toBeNull();
		const id = Number(inserted.data!.id);
		expect(id).toBeGreaterThan(0);
		await db().from('referral_events').delete().eq('id', id);
		const next = await db().from('referral_events').insert({ code, type: 'click', visitor_hash: `${tag}-2` }).select('id').single();
		expect(Number(next.data!.id)).toBeGreaterThan(id);
		await db().from('referral_events').delete().eq('id', next.data!.id);
	});
});
