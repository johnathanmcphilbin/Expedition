import { db } from './supabase';
import type { CheckpointRow, CheckpointVisibility } from './database.types';

/**
 * Checkpoints: a quick update every 5 tracked Hackatime hours on a project.
 * Evidence for the review, never a source of hours. See migration 0011.
 */

export const CHECKPOINT_EVERY_HOURS = 5;
const BUCKET = 'checkpoint-images';

export type CheckpointWithImage = CheckpointRow & { image_url: string | null };

/** How many checkpoints this many tracked hours has unlocked. */
export function unlockedCount(trackedHours: number): number {
	return Math.floor(trackedHours / CHECKPOINT_EVERY_HOURS);
}

async function withImages(rows: CheckpointRow[]): Promise<CheckpointWithImage[]> {
	const paths = rows.map((r) => r.image_path).filter((p): p is string => !!p);
	const urls = new Map<string, string>();
	if (paths.length) {
		const { data } = await db().storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
		for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
	}
	return rows.map((r) => ({ ...r, image_url: r.image_path ? (urls.get(r.image_path) ?? null) : null }));
}

/** Everything one participant has posted, newest first. Empty if the table isn't there yet. */
export async function listOwnCheckpoints(userId: string): Promise<CheckpointRow[]> {
	const { data, error } = await db()
		.from('checkpoints')
		.select('*')
		.eq('user_id', userId)
		.order('created_at', { ascending: false });
	if (error) {
		console.error('listOwnCheckpoints', error.message);
		return [];
	}
	return (data ?? []) as CheckpointRow[];
}

/** One project's checkpoints, oldest first, with image links — for the participant and for reviewers. */
export async function listProjectCheckpoints(userId: string, project: string): Promise<CheckpointWithImage[]> {
	const { data, error } = await db()
		.from('checkpoints')
		.select('*')
		.eq('user_id', userId)
		.eq('hackatime_project', project)
		.order('number', { ascending: true });
	if (error) {
		console.error('listProjectCheckpoints', error.message);
		return [];
	}
	return withImages((data ?? []) as CheckpointRow[]);
}

export async function postCheckpoint(params: {
	userId: string;
	project: string;
	number: number;
	trackedHours: number;
	workedOn: string;
	nextUp: string | null;
	videoUrl: string | null;
	image: File | null;
	share: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
	let imagePath: string | null = null;
	if (params.image) {
		const ext = (params.image.name.match(/\.(\w{2,5})$/)?.[1] ?? 'jpg').toLowerCase();
		imagePath = `${params.userId}/${crypto.randomUUID()}.${ext}`;
		const up = await db()
			.storage.from(BUCKET)
			.upload(imagePath, await params.image.arrayBuffer(), { contentType: params.image.type, upsert: false });
		if (up.error) {
			console.error('postCheckpoint upload', up.error.message);
			return { ok: false, message: "Couldn't upload your screenshot. Try again." };
		}
	}

	const { error } = await db().from('checkpoints').insert({
		user_id: params.userId,
		hackatime_project: params.project,
		number: params.number,
		tracked_hours: Math.round(params.trackedHours * 100) / 100,
		worked_on: params.workedOn,
		next_up: params.nextUp,
		video_url: params.videoUrl,
		image_path: imagePath,
		visibility: params.share ? 'waiting' : 'private'
	});
	if (error) {
		if (imagePath) await db().storage.from(BUCKET).remove([imagePath]);
		if (error.code === '23505') return { ok: false, message: "You've already posted that checkpoint." };
		console.error('postCheckpoint insert', error.message);
		return { ok: false, message: "Couldn't save your checkpoint. Try again." };
	}
	return { ok: true };
}

/** The participant's own share toggle. Unsharing always works; sharing waits for an OK again. */
export async function setOwnSharing(userId: string, id: string, share: boolean): Promise<void> {
	const { error } = await db()
		.from('checkpoints')
		.update(share ? { visibility: 'waiting', moderated_by: null, moderated_at: null } : { visibility: 'private' })
		.eq('id', id)
		.eq('user_id', userId);
	if (error) throw new Error(error.message);
}

// ---------------------------------------------------------- organisers ----

export async function listForModeration(): Promise<
	(CheckpointWithImage & { owner_name: string | null })[]
> {
	const { data, error } = await db()
		.from('checkpoints')
		.select('*, users!checkpoints_user_id_fkey(display_name)')
		.in('visibility', ['waiting', 'shown', 'hidden'])
		.order('created_at', { ascending: false })
		.limit(200);
	if (error) {
		console.error('listForModeration', error.message);
		return [];
	}
	const rows = (data ?? []) as unknown as (CheckpointRow & { users: { display_name: string | null } | null })[];
	const withImg = await withImages(rows.map(({ users: _u, ...r }) => r));
	return withImg.map((r, i) => ({ ...r, owner_name: rows[i].users?.display_name ?? null }));
}

export async function moderate(id: string, moderatorId: string, visibility: Extract<CheckpointVisibility, 'shown' | 'hidden'>) {
	const { error } = await db()
		.from('checkpoints')
		.update({ visibility, moderated_by: moderatorId, moderated_at: new Date().toISOString() })
		.eq('id', id)
		.in('visibility', ['waiting', 'shown', 'hidden']);
	if (error) throw new Error(error.message);
}

export async function countAwaitingModeration(): Promise<number> {
	const { count, error } = await db()
		.from('checkpoints')
		.select('id', { count: 'exact', head: true })
		.eq('visibility', 'waiting');
	if (error) return 0;
	return count ?? 0;
}

// -------------------------------------------------------------- public ----

/**
 * OK'd, shared checkpoints for the public log. Only a first name goes out,
 * never an email, surname or account id.
 */
export async function listPublicCheckpoints(limit = 60): Promise<
	{ id: string; first_name: string; project: string; number: number; worked_on: string; next_up: string | null; video_url: string | null; image_url: string | null; created_at: string }[]
> {
	const { data, error } = await db()
		.from('checkpoints')
		.select('*, users!checkpoints_user_id_fkey(display_name)')
		.eq('visibility', 'shown')
		.order('created_at', { ascending: false })
		.limit(limit);
	if (error) {
		console.error('listPublicCheckpoints', error.message);
		return [];
	}
	const rows = (data ?? []) as unknown as (CheckpointRow & { users: { display_name: string | null } | null })[];
	const withImg = await withImages(rows.map(({ users: _u, ...r }) => r));
	return withImg.map((r, i) => ({
		id: r.id,
		first_name: (rows[i].users?.display_name ?? 'A builder').split(' ')[0],
		project: r.hackatime_project,
		number: r.number,
		worked_on: r.worked_on,
		next_up: r.next_up,
		video_url: r.video_url,
		image_url: r.image_url,
		created_at: r.created_at
	}));
}
