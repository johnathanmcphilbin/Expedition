/**
 * Lapse (lapse.hackclub.com), Hack Club's timelapse recorder. Participants
 * paste links to their timelapses; reviewers get the videos inline. Uses the
 * public `timelapse/query` endpoint, so only public or unlisted timelapses
 * resolve; nothing is sent but the timelapse ID.
 */

const API = 'https://api.lapse.hackclub.com/api';
const LINK = /(?:https?:\/\/)?(?:www\.)?lapse\.hackclub\.com\/timelapse\/([A-Za-z0-9_-]{6,40})/g;
/** where Lapse serves its videos; anything else isn't played */
const MEDIA_HOST = 'lookout.hackclub.com';

export const LAPSE_FIELD = 'Justification - Lapse Links, comma-separated';

/** Every distinct Lapse timelapse ID in a block of text, in order. */
export function lapseIds(text: string | null | undefined): string[] {
	if (!text) return [];
	return [...new Set([...text.matchAll(LINK)].map((m) => m[1]))];
}

export const lapseUrl = (id: string) => `https://lapse.hackclub.com/timelapse/${id}`;

/**
 * Turn whatever someone typed (one per line, commas, spaces) into the clean
 * comma-separated list Hack Club's field expects, or throw if a link isn't
 * a Lapse timelapse.
 */
export function normaliseLapseLinks(raw: string | null): string | null {
	const parts = (raw ?? '')
		.split(/[\s,]+/)
		.map((p) => p.trim())
		.filter(Boolean);
	if (!parts.length) return null;
	const ids: string[] = [];
	for (const p of parts) {
		const found = lapseIds(p);
		if (!found.length) throw new Error(`"${p.slice(0, 60)}" isn't a Lapse timelapse link (lapse.hackclub.com/timelapse/…)`);
		ids.push(...found);
	}
	return [...new Set(ids)].slice(0, 20).map(lapseUrl).join(', ');
}

export type Lapse =
	| {
			id: string;
			url: string;
			ok: true;
			name: string;
			video: string | null;
			thumbnail: string | null;
			/** seconds of video */
			duration: number | null;
			owner: string | null;
			ownerHackatimeId: string | null;
			processing: boolean;
	  }
	| { id: string; url: string; ok: false; error: string };

const cache = new Map<string, { at: number; value: Lapse }>();
const TTL = 10 * 60 * 1000;

const onMediaHost = (u: unknown) => {
	if (typeof u !== 'string') return null;
	try {
		const parsed = new URL(u);
		return parsed.protocol === 'https:' && parsed.hostname === MEDIA_HOST ? parsed.toString() : null;
	} catch {
		return null;
	}
};

export async function fetchLapse(id: string): Promise<Lapse> {
	const hit = cache.get(id);
	if (hit && Date.now() - hit.at < TTL) return hit.value;
	const url = lapseUrl(id);
	let value: Lapse;
	try {
		const res = await fetch(`${API}/timelapse/query?id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(8000) });
		const json = (await res.json()) as {
			ok: boolean;
			message?: string;
			data?: {
				timelapse: {
					name?: string;
					playbackUrl?: string | null;
					thumbnailUrl?: string | null;
					duration?: number | null;
					visibility?: string;
					owner?: { handle?: string; displayName?: string; hackatimeId?: string | null };
				};
			};
		};
		if (!json.ok || !json.data) {
			value = { id, url, ok: false, error: json.message ?? "Couldn't find it (it may be private or deleted)" };
		} else {
			const t = json.data.timelapse;
			const video = onMediaHost(t.playbackUrl);
			value = {
				id,
				url,
				ok: true,
				name: t.name || 'Untitled timelapse',
				video,
				thumbnail: onMediaHost(t.thumbnailUrl),
				duration: typeof t.duration === 'number' ? t.duration : null,
				owner: t.owner?.displayName || t.owner?.handle || null,
				ownerHackatimeId: t.owner?.hackatimeId ?? null,
				processing: !video && t.visibility !== 'FAILED_PROCESSING'
			};
		}
	} catch {
		value = { id, url, ok: false, error: "Couldn't reach Lapse just now" };
	}
	cache.set(id, { at: Date.now(), value });
	return value;
}

/** Every timelapse linked in a submission's justification text. */
export async function lapsesFor(text: string | null | undefined): Promise<Lapse[]> {
	return Promise.all(lapseIds(text).slice(0, 20).map(fetchLapse));
}
