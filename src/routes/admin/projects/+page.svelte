<script lang="ts">
	import '$lib/styles/app.css';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Row = (typeof data.projects)[number];

	const STAGES = [
		{ value: 'all', label: 'All' },
		{ value: 'building', label: 'Building' },
		{ value: 'waiting', label: 'Waiting for review' },
		{ value: 'changes', label: 'Needs changes' },
		{ value: 'approved', label: 'Approved' },
		{ value: 'rejected', label: 'Rejected' }
	] as const;
	const STAGE_LABEL: Record<string, string> = {
		building: 'Building',
		waiting: 'Waiting',
		changes: 'Needs changes',
		approved: 'Approved',
		rejected: 'Rejected'
	};
	const ACTIVITY = [
		{ value: 'any', label: 'Any time' },
		{ value: 'now', label: 'Right now (15 min)' },
		{ value: 'today', label: 'Today (24h)' },
		{ value: 'week', label: 'This week' },
		{ value: 'quiet', label: 'Quiet for a week+' }
	] as const;
	const SORTS = [
		{ value: 'hours', label: 'Most hours' },
		{ value: 'recent', label: 'Most recently active' },
		{ value: 'project', label: 'Project A–Z' },
		{ value: 'builder', label: 'Builder A–Z' }
	] as const;

	let search = $state('');
	let stage = $state<string>('all');
	let activity = $state<string>('any');
	let sort = $state<string>('hours');
	let minHours = $state<number | null>(null);

	const MIN = 60 * 1000;
	const age = (r: Row) => (r.lastBeat ? Date.now() - new Date(r.lastBeat).getTime() : Infinity);

	const stageCounts = $derived(
		Object.fromEntries(STAGES.map((s) => [s.value, s.value === 'all' ? data.projects.length : data.projects.filter((p) => p.stage === s.value).length]))
	);

	const shown = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const rows = data.projects.filter((r) => {
			if (q && !`${r.project} ${r.builder} ${r.languages.join(' ')}`.toLowerCase().includes(q)) return false;
			if (stage !== 'all' && r.stage !== stage) return false;
			if (minHours !== null && (r.hours ?? 0) < minHours) return false;
			const a = age(r);
			if (activity === 'now' && a > 15 * MIN) return false;
			if (activity === 'today' && a > 24 * 60 * MIN) return false;
			if (activity === 'week' && a > 7 * 24 * 60 * MIN) return false;
			if (activity === 'quiet' && a <= 7 * 24 * 60 * MIN) return false;
			return true;
		});
		const by: Record<string, (a: Row, b: Row) => number> = {
			hours: (a, b) => (b.hours ?? -1) - (a.hours ?? -1),
			recent: (a, b) => age(a) - age(b),
			project: (a, b) => a.project.localeCompare(b.project),
			builder: (a, b) => a.builder.localeCompare(b.builder)
		};
		return rows.sort(by[sort]);
	});
	const shownHours = $derived(Math.round(shown.reduce((s, r) => s + (r.hours ?? 0), 0) * 10) / 10);

	function ago(iso: string | null) {
		if (!iso) return 'never';
		const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
		if (mins < 2) return 'right now';
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.round(mins / 60);
		if (hrs < 48) return `${hrs}h ago`;
		return `${Math.round(hrs / 24)}d ago`;
	}
	const isLive = (r: Row) => age(r) <= 15 * MIN;

	function reset() {
		search = '';
		stage = 'all';
		activity = 'any';
		sort = 'hours';
		minHours = null;
	}
</script>

<svelte:head><title>Projects · Admin · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<p class="back"><a href="/admin">← Admin</a></p>
		<div class="app-head">
			<div>
				<h1 class="app-title">Projects</h1>
				<p class="hint lead">
					Every Hackatime project connected to Expedition. Hours are live from Hackatime, checked
					{ago(data.checkedAt)}.
				</p>
			</div>
		</div>

		<nav class="tabs" aria-label="Filter by stage">
			{#each STAGES as s (s.value)}
				<button type="button" class:active={stage === s.value} onclick={() => (stage = s.value)}>
					{s.label}<span class="tab-count">{stageCounts[s.value]}</span>
				</button>
			{/each}
		</nav>

		<div class="filters">
			<input class="f-search" type="search" placeholder="Search project, builder or language" aria-label="Search" bind:value={search} />
			<label class="f">
				<span>Active</span>
				<select bind:value={activity}>
					{#each ACTIVITY as a (a.value)}<option value={a.value}>{a.label}</option>{/each}
				</select>
			</label>
			<label class="f">
				<span>At least</span>
				<input class="f-hours" type="number" min="0" step="1" placeholder="0" bind:value={minHours} />
				<span>h</span>
			</label>
			<label class="f">
				<span>Sort</span>
				<select bind:value={sort}>
					{#each SORTS as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
				</select>
			</label>
			<button type="button" class="f-reset" onclick={reset}>Reset</button>
		</div>

		<p class="summary">
			<strong>{shown.length}</strong> of {data.projects.length} projects · <strong>{shownHours}h</strong> tracked
		</p>

		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Project</th>
						<th>Builder</th>
						<th class="num">Tracked</th>
						<th>Last active</th>
						<th>Stage</th>
						<th class="num">Checkpoints</th>
					</tr>
				</thead>
				<tbody>
					{#each shown as r (r.id)}
						<tr>
							<td>
								<span class="p-name">{r.project}</span>
								{#if r.languages.length}<span class="p-lang">{r.languages.join(', ')}</span>{/if}
							</td>
							<td class="builder">{r.builder}</td>
							<td class="num hours">{#if r.hours === null}<span class="muted" title={r.reachable ? 'Not in their Hackatime any more' : "Couldn't reach their Hackatime"}>–</span>{:else}{r.hours}h{/if}</td>
							<td class="when" class:live={isLive(r)}>
								{#if isLive(r)}<span class="dot" aria-hidden="true"></span>{/if}{ago(r.lastBeat)}
							</td>
							<td>
								{#if r.link}
									<a class="stage stage-{r.stage}" href={r.link}>{STAGE_LABEL[r.stage]}{#if r.stage === 'approved' && r.approved} · {r.approved}h{/if}</a>
								{:else}
									<span class="stage stage-{r.stage}">{STAGE_LABEL[r.stage]}</span>
								{/if}
							</td>
							<td class="num" class:behind={r.checkpoints < r.checkpointsUnlocked}>
								{r.checkpoints}/{r.checkpointsUnlocked}
							</td>
						</tr>
					{:else}
						<tr><td colspan="6" class="empty">Nothing matches those filters. <button type="button" class="f-reset" onclick={reset}>Reset</button></td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</main>

<style>
	.back a {
		font-weight: 700;
		color: var(--navy);
	}
	.lead {
		margin-top: 0.4rem;
	}

	.tabs {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}
	.tabs button {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.45rem 0.8rem;
		border: 2px solid var(--rule-strong);
		background: var(--white);
		font: inherit;
		font-weight: 700;
		font-size: 0.88rem;
		color: var(--slate);
		cursor: pointer;
	}
	.tabs button.active {
		border-color: var(--navy);
		background: var(--navy);
		color: var(--white);
	}
	.tab-count {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		opacity: 0.75;
	}

	.filters {
		display: flex;
		align-items: center;
		gap: 0.6rem 1rem;
		flex-wrap: wrap;
		padding: 0.8rem 1rem;
		background: var(--white);
		border: 2px solid var(--rule);
	}
	.f-search {
		flex: 1 1 260px;
	}
	.f {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--muted);
	}
	.f select {
		width: auto;
		padding: 0.45em 0.6em;
		font-size: 0.9rem;
	}
	.f-hours {
		width: 5rem;
		padding: 0.45em 0.6em;
		font-size: 0.9rem;
	}
	.f-reset {
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		font-size: 0.88rem;
		font-weight: 700;
		color: var(--blue-dark);
		text-decoration: underline;
		cursor: pointer;
	}

	.summary {
		margin: 1rem 0 0.6rem;
		font-size: 0.92rem;
		color: var(--slate);
	}

	.table-wrap {
		overflow-x: auto;
		background: var(--white);
		border: 3px solid var(--navy);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.92rem;
	}
	th {
		position: sticky;
		top: 0;
		padding: 0.65rem 0.9rem;
		background: var(--navy);
		color: var(--white);
		text-align: left;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	td {
		padding: 0.6rem 0.9rem;
		border-top: 1px solid var(--rule);
		vertical-align: middle;
	}
	tbody tr:nth-child(even) td {
		background: #f7f9fb;
	}
	tbody tr:hover td {
		background: var(--paper);
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.p-name {
		display: block;
		font-weight: 800;
		color: var(--navy);
		word-break: break-word;
	}
	.p-lang {
		display: block;
		font-size: 0.78rem;
		color: var(--muted);
	}
	.builder {
		font-weight: 600;
		white-space: nowrap;
	}
	.hours {
		font-weight: 800;
		color: var(--navy);
	}
	.muted {
		color: var(--muted);
	}
	.when {
		white-space: nowrap;
		color: var(--slate);
	}
	.when.live {
		font-weight: 800;
		color: var(--green-dark);
	}
	.dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		margin-right: 0.4rem;
		border-radius: 50%;
		background: var(--green);
	}
	.stage {
		display: inline-block;
		padding: 0.15em 0.5em;
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border: 1.5px solid var(--rule-strong);
		color: var(--muted);
		text-decoration: none;
		white-space: nowrap;
	}
	a.stage:hover {
		border-color: var(--navy);
		color: var(--navy);
	}
	.stage-waiting {
		border-color: var(--blue);
		color: var(--blue-dark);
	}
	.stage-changes {
		border-color: var(--orange);
		color: var(--orange-dark);
	}
	.stage-approved {
		border-color: var(--green);
		color: var(--green-dark);
	}
	.stage-rejected {
		border-color: var(--red);
		color: var(--red-dark);
	}
	.behind {
		color: var(--orange-dark);
		font-weight: 700;
	}
	.empty {
		padding: 1.5rem;
		text-align: center;
		color: var(--muted);
		font-weight: 600;
	}
</style>
