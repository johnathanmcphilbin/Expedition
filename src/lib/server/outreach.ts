import { error } from '@sveltejs/kit';
import { db } from './supabase';
import { requireUser } from './guards';
import { getConnectedProjects } from './stats';
import { projectStages, stageKey } from './project-stages';

/**
 * Outreach: builders with a connected project of OUTREACH_HOURS+ tracked that
 * they haven't shipped, for someone to message on Slack. Admins see it, plus
 * anyone whose email an admin has added. Messaging someone is recorded, and
 * hours approved for them from then on count towards whoever messaged them.
 */
export const OUTREACH_HOURS = 5;
/** What an outreach person earns per approved hour from someone they messaged. */
export const OUTREACH_EUR_PER_HOUR = 1;

/** Admins, or someone an admin has added by email. 404 for anyone else. */
export async function requireOutreach(locals: App.Locals) {
	const user = requireUser(locals, '/admin/outreach');
	if (user.role === 'admin') return user;
	const email = user.email?.toLowerCase();
	if (email) {
		const { data } = await db().from('outreach_access').select('email').eq('email', email).maybeSingle();
		if (data) return user;
	}
	error(404, 'Not found');
}

export async function outreachList() {
	const [connected, { data: users }, { data: contacts }, { data: approvals }] = await Promise.all([
		getConnectedProjects(),
		db().from('users').select('id, display_name, slack_id, hackclub_id'),
		db().from('outreach_contacts').select('user_id, contacted_by, contacted_at, note'),
		db().from('hour_transactions').select('user_id, amount, created_at').eq('type', 'checkpoint_approved')
	]);
	const stages = await projectStages(connected.rows);
	const userBy = new Map((users ?? []).map((u) => [u.id, u]));
	const contactOf = new Map((contacts ?? []).map((c) => [c.user_id, c]));
	const r1 = (n: number) => Math.round(n * 10) / 10;

	// still building (never submitted) or sent back for changes, with enough hours
	const byBuilder = new Map<string, { project: string; hours: number; lastBeat: string | null; changes: boolean }[]>();
	for (const p of connected.rows) {
		const hours = (p.seconds ?? 0) / 3600;
		if (hours < OUTREACH_HOURS || !userBy.get(p.userId)?.hackclub_id?.startsWith('ident!')) continue;
		const stage = stages.get(stageKey(p.userId, p.project))?.stage ?? 'building';
		if (stage !== 'building' && stage !== 'changes') continue;
		const list = byBuilder.get(p.userId) ?? [];
		list.push({ project: p.project, hours: r1(hours), lastBeat: p.lastBeat, changes: stage === 'changes' });
		byBuilder.set(p.userId, list);
	}

	const builders = [...byBuilder.entries()]
		.map(([id, projects]) => {
			const u = userBy.get(id)!;
			const c = contactOf.get(id);
			return {
				id,
				name: u.display_name ?? 'Unnamed',
				slackId: u.slack_id,
				projects: projects.sort((a, b) => b.hours - a.hours),
				unshippedHours: r1(projects.reduce((t, p) => t + p.hours, 0)),
				lastBeat: projects.map((p) => p.lastBeat).filter(Boolean).sort().pop() ?? null,
				contacted: c ? { byId: c.contacted_by, by: c.contacted_by ? (userBy.get(c.contacted_by)?.display_name ?? 'Someone') : 'Someone', at: c.contacted_at, note: c.note } : null
			};
		})
		// not messaged yet first, then the most hours waiting to ship
		.sort((a, b) => Number(!!a.contacted) - Number(!!b.contacted) || b.unshippedHours - a.unshippedHours);

	// per outreach person: who they messaged, and the hours approved since
	const tally = new Map<string, { id: string; name: string; messaged: number; shipped: number; hours: number }>();
	for (const c of contacts ?? []) {
		if (!c.contacted_by) continue;
		const t = tally.get(c.contacted_by) ?? { id: c.contacted_by, name: userBy.get(c.contacted_by)?.display_name ?? 'Someone', messaged: 0, shipped: 0, hours: 0 };
		const since = (approvals ?? []).filter((a) => a.user_id === c.user_id && a.created_at >= c.contacted_at);
		const hours = since.reduce((s, a) => s + Number(a.amount), 0);
		t.messaged++;
		if (hours > 0) t.shipped++;
		t.hours = r1(t.hours + hours);
		tally.set(c.contacted_by, t);
	}
	const people = [...tally.values()]
		.map((t) => ({ ...t, eur: Math.round(t.hours * OUTREACH_EUR_PER_HOUR * 100) / 100 }))
		.sort((a, b) => b.hours - a.hours);

	return { builders, people, checkedAt: connected.checkedAt };
}
