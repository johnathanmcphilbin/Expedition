<script lang="ts">
	// Review form fields use defaultValue, not value: they start from what's
	// saved, and nothing re-rendering on this page (status text, the Hardware
	// tick, the flag box) can put them back to that mid-review. Each submission
	// gets a fresh form via {#key}, so the defaults are always current.
	import '$lib/styles/app.css';
	import { enhance, deserialize } from '$app/forms';
	import LapseVideos from '$lib/components/LapseVideos.svelte';
	import ReviewHistory from '$lib/components/ReviewHistory.svelte';
	import { safeUrl } from '$lib/safe-url';
	import { invalidateAll } from '$app/navigation';
	import CheckpointTimeline from '$lib/components/CheckpointTimeline.svelte';
	import JustificationFields from '$lib/components/JustificationFields.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const FILTERS = [
		{ value: 'hardware', label: 'Hardware' },
		{ value: 'pending', label: 'Pending' },
		{ value: 'changes_requested', label: 'Needs changes' },
		{ value: 'approved', label: 'Approved' },
		{ value: 'rejected', label: 'Rejected' },
		{ value: 'all', label: 'All' },
		{ value: 'stats', label: 'Stats' }
	] as const;

	const STATUS_LABEL: Record<string, string> = {
		pending: 'Pending',
		in_review: 'Pending',
		changes_requested: 'Needs changes',
		approved: 'Approved',
		rejected: 'Rejected'
	};

	function queueHref(item: { kind: 'hc' | 'new'; key: string }) {
		const p = new URLSearchParams();
		if (data.track !== 'all') p.set('track', data.track);
		p.set('status', data.filter);
		if (data.search) p.set('q', data.search);
		p.set(item.kind === 'new' ? 'new' : 'submission', item.key);
		return `/admin/reviews?${p}`;
	}
	// a reviewer can only edit a waiting submission once they've claimed it
	const locked = $derived(!data.isAdmin && data.selectedWaiting && !data.selectedClaim?.mine);
	const isSelected = (item: { kind: string; key: string }) =>
		data.selected?.kind === item.kind && data.selected?.key === item.key;
	function filterHref(status: string) {
		const p = new URLSearchParams();
		if (data.track !== 'all') p.set('track', data.track);
		p.set('status', status);
		if (data.search) p.set('q', data.search);
		return `/admin/reviews?${p}`;
	}

	function ago(iso: string | null) {
		if (!iso) return '';
		const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
		if (mins < 60) return `${Math.max(mins, 1)}m ago`;
		const hrs = Math.round(mins / 60);
		if (hrs < 48) return `${hrs}h ago`;
		return `${Math.round(hrs / 24)}d ago`;
	}

	let submitting = $state<string | null>(null);
	// Seeded from the loaded suggestion whenever the selection changes.
	let selectedProject = $state('');
	$effect(() => {
		selectedProject = data.detail?.suggestedProject ?? '';
	});
	let hardware = $state(false);
	let flagging = $state(false);

	// ---- autosave: whatever's typed is saved a moment after you stop, so a
	// review can be picked up later (by you or another reviewer)
	const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

	function autosave(
		node: HTMLFormElement,
		opts: { action: string; kind?: 'new' | 'hc'; delay?: number }
	) {
		// The status is written straight into the form's own [data-autosave] span,
		// not through component state: a state change re-runs the template and
		// would put the inputs back to their loaded values mid-typing.
		const label = node.querySelector<HTMLElement>('[data-autosave]');
		const status = (text: string) => {
			if (label) label.textContent = text;
		};
		let timer: ReturnType<typeof setTimeout> | null = null;
		let inflight = Promise.resolve();
		const run = () => {
			timer = null;
			const body = new FormData(node);
			if (opts.kind) body.set('kind', opts.kind);
			status('Saving…');
			inflight = inflight.then(async () => {
				try {
					// keepalive: a save sent as you leave the page still arrives
					const res = await fetch(opts.action, { method: 'POST', body, keepalive: true, headers: { 'x-sveltekit-action': 'true' } });
					const result = deserialize(await res.text());
					if (result.type === 'success') status(`Saved ${clock()}`);
					else if (result.type === 'failure') {
						const d = result.data as { autosave?: string; justMessage?: string } | undefined;
						status(`Not saved: ${d?.autosave ?? d?.justMessage ?? 'try again'}`);
					} else status('Not saved: try again');
				} catch {
					status('Not saved: offline?');
				}
			});
		};
		const schedule = () => {
			if (timer) clearTimeout(timer);
			status('Unsaved changes…');
			timer = setTimeout(run, opts.delay ?? 1200);
		};
		// a real decision submits everything itself; don't race it
		const cancel = () => {
			if (timer) clearTimeout(timer);
			timer = null;
		};
		// leaving the page (or this submission) with a save pending: send it now
		const flush = () => {
			if (timer) {
				clearTimeout(timer);
				run();
			}
		};
		node.addEventListener('input', schedule);
		node.addEventListener('change', schedule);
		node.addEventListener('submit', cancel);
		window.addEventListener('pagehide', flush);
		return {
			destroy() {
				flush();
				node.removeEventListener('input', schedule);
				node.removeEventListener('change', schedule);
				node.removeEventListener('submit', cancel);
				window.removeEventListener('pagehide', flush);
			}
		};
	}
	// close a half-written flag when moving to another submission
	$effect(() => {
		void data.selected?.key;
		flagging = false;
	});
	let hardwareNote = $state<string | null>(null);

	// ticking Hardware saves straight away and moves it to the right tab,
	// without needing the rest of the form to be valid
	async function saveHardware(id: string, value: boolean) {
		hardwareNote = 'Saving…';
		const body = new FormData();
		body.set('id', id);
		body.set('hardware', value ? 'yes' : 'no');
		try {
			const res = await fetch('?/setHardware', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
			const result = deserialize(await res.text());
			if (result.type !== 'success') throw new Error();
			await invalidateAll();
			hardwareNote = value ? 'Saved: now in the Hardware tab' : 'Saved: now in Pending';
		} catch {
			hardwareNote = "Couldn't save that. Try again.";
			hardware = !value;
		}
	}
	$effect(() => {
		hardware = data.queuedDetail?.row.hardware ?? false;
	});
</script>

{#snippet claimBar(kind: 'hc' | 'new', key: string)}
	{#if !data.selectedWaiting && data.selectedClaim?.held}
		{@const c = data.selectedClaim}
		<div class="claim-bar held">
			<span><strong>{c.mine ? "It's yours when they resubmit." : `Held for ${c.by}.`}</strong> Sent back for changes, so the resubmission goes to {c.mine ? 'you' : 'them'} first, with {data.claimRules.resubmitHours}h to pick it up.</span>
			{#if c.mine || data.isAdmin}
				<form method="POST" action="?/unclaim" use:enhance={() => async ({ update }) => update({ reset: false })}>
					<input type="hidden" name="kind" value={kind} />
					<input type="hidden" name="key" value={key} />
					<button class="text-btn" type="submit">{c.mine ? 'Let anyone take it' : `Release ${c.by}'s hold`}</button>
				</form>
			{/if}
		</div>
	{:else if data.selectedWaiting}
		{@const c = data.selectedClaim}
		<div class="claim-bar" class:mine={c?.mine} class:taken={c && !c.mine}>
			{#if c?.mine}
				<span><strong>You've claimed this one.</strong> Nobody else can review it while you do. It's released if you leave it {data.claimRules.hours}h without saving.</span>
			{:else if c}
				<span><strong>{c.by} is reviewing this</strong> (claimed {ago(c.at)}).{#if !data.isAdmin} Pick another one.{/if}</span>
			{:else}
				<span>Nobody's reviewing this yet.{#if !data.isAdmin} Claim it to start; you can hold {data.claimRules.max} at once ({data.myClaims} now).{/if}</span>
			{/if}
			<form method="POST" action={c && (c.mine || data.isAdmin) ? '?/unclaim' : '?/claim'} use:enhance={() => async ({ update }) => update({ reset: false })}>
				<input type="hidden" name="kind" value={kind} />
				<input type="hidden" name="key" value={key} />
				{#if c?.mine}
					<button class="text-btn" type="submit">Release it</button>
				{:else if c && data.isAdmin}
					<button class="text-btn" type="submit">Release {c.by}'s claim</button>
				{:else if !c}
					<button class="btn" type="submit">Claim this review</button>
				{/if}
			</form>
			{#if form && 'claimMessage' in form && form.claimMessage}<p class="error">{form.claimMessage}</p>{/if}
		</div>
	{/if}
{/snippet}

{#snippet flagPanel(kind: 'hc' | 'new', key: string)}
	<div class="flag-panel" class:on={!!data.selectedFlag}>
		{#if data.selectedFlag}
			<p>
				<strong>⚑ Flagged as possible fraud</strong>
				{#if data.selectedFlag.reason}<span>{data.selectedFlag.reason}</span>{/if}
				<span class="hint">{new Date(data.selectedFlag.at).toLocaleDateString()}</span>
			</p>
			{#if data.isAdmin}
				<form method="POST" action="?/flag" use:enhance={() => async ({ update }) => update({ reset: false })}>
					<input type="hidden" name="kind" value={kind} />
					<input type="hidden" name="key" value={key} />
					<input type="hidden" name="on" value="no" />
					<button class="text-btn" type="submit">Remove flag</button>
				</form>
			{/if}
		{:else if flagging}
			<form
				method="POST"
				action="?/flag"
				class="flag-form"
				use:enhance={() => async ({ update }) => {
					await update({ reset: false });
					flagging = false;
				}}>
				<input type="hidden" name="kind" value={kind} />
				<input type="hidden" name="key" value={key} />
				<input type="hidden" name="on" value="yes" />
				<input name="reason" maxlength="500" placeholder="Why? e.g. hours don't match commits, copied repo" />
				<button class="btn flag-btn" type="submit">⚑ Flag it</button>
				<button class="text-btn" type="button" onclick={() => (flagging = false)}>Cancel</button>
			</form>
		{:else}
			<button class="text-btn flag-open" type="button" onclick={() => (flagging = true)}>⚑ Flag as possible fraud</button>
		{/if}
	</div>
{/snippet}

<svelte:head><title>Review queue · Expedition</title></svelte:head>

<main class="app-page review-page">
	<div class="wrap">
		<div class="app-head">
			<div>
				<h1 class="app-title">Reviews</h1>
				<p class="hint">
					Everything in one place. Ones marked <strong>Not sent yet</strong> only go to Hack Club when you
					approve them.
				</p>
			</div>
			<form method="GET" class="search-form">
				<input type="hidden" name="track" value={data.track} />
				<input type="hidden" name="status" value={data.filter} />
				<input type="search" name="q" placeholder="Search name, email or project" value={data.search} aria-label="Search submissions" />
			</form>
		</div>

		{#if data.syncError}
			<p class="sync-error">
				Couldn't refresh from Airtable, so this may be out of date. <span class="hint">({data.syncError})</span>
			</p>
		{/if}

		{#if !data.isAdmin}
			<p class="shadow-note">Hi {data.reviewerName}! Your decisions are signed "Reviewed by {data.reviewerName}" in the notes and in Hack Club's Additional Justification. Your own projects don't show up here.
				{#if data.earnings}You earn ${data.earnings.per.toFixed(2)}{data.earnings.cash ? ', paid by an organiser,' : ' in hours'} for each submission you decide, and <strong>${data.bigPay.big.toFixed(2)} when you approve a project with more than {data.bigPay.hours}h tracked</strong>, so the big projects are worth picking up: <strong>{data.earnings.reviews} so far (${data.earnings.usd.toFixed(2)})</strong>.{/if}</p>
		{/if}

		{#if data.isAdmin}
			<details class="claims-panel" open={data.allClaims.length > 0}>
				<summary>Being reviewed now ({data.allClaims.length})</summary>
				{#if data.allClaims.length}
					<table>
						<thead><tr><th>Submission</th><th>Claimed by</th><th>Since</th><th></th></tr></thead>
						<tbody>
							{#each data.allClaims as c (c.kind + c.key)}
								<tr>
									<td><a href={queueHref(c)}>{c.participant}</a>{#if c.project}<span class="hint"> · {c.project}</span>{/if}{#if c.held}<span class="hint"> · waiting on their changes</span>{:else if !c.waiting}<span class="hint"> · already decided</span>{/if}</td>
									<td>{c.by}</td>
									<td>{ago(c.claimedAt)}</td>
									<td>
										<form method="POST" action="?/unclaim" use:enhance>
											<input type="hidden" name="kind" value={c.kind} />
											<input type="hidden" name="key" value={c.key} />
											<button class="text-btn" type="submit">Release</button>
										</form>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else}
					<p class="hint">Nobody has claimed a submission right now. Claims lapse after {data.claimRules.hours}h without a save.</p>
				{/if}
			</details>
		{/if}

		<nav class="tabs" aria-label="Filter by status">
			{#each FILTERS as f (f.value)}
				<a href={filterHref(f.value)} class:active={data.filter === f.value}>
					{f.label}{#if f.value !== 'stats'}<span class="tab-count">{data.counts[f.value]}</span>{/if}
				</a>
			{/each}
		</nav>

		{#if data.filter === 'stats'}
			{@render statsView()}
		{:else}
		<div class="layout">
			<!-- ---------- queue ---------- -->
			<aside class="queue" aria-label="Submissions">
				{#each data.queue as item (item.kind + item.key)}
					<a class="qi" class:active={isSelected(item)} class:flagged={!!item.flag} href={queueHref(item)} title={item.flag ? `Possible fraud${item.flag.reason ? `: ${item.flag.reason}` : ''}` : undefined}>
						<span class="qi-top">
							<span class="qi-name">{#if item.flag}<span class="qi-flag" aria-label="Flagged as possible fraud">⚑</span>{/if}{item.participant}</span>
							<span class="qi-time">{ago(item.submittedAt)}</span>
						</span>
						<span class="qi-project">{item.project ?? 'No project named'}</span>
						<span class="qi-tags">
							{#if item.hardware}<span class="tag tag-hw">Hardware</span>{/if}
							<span class="tag tag-{item.status}">{STATUS_LABEL[item.status]}</span>
							{#if item.kind === 'new' && item.status === 'pending'}<span class="tag tag-new">Not sent yet</span>{/if}
							{#if item.trackedHours !== null && item.trackedHours > data.bigPay.hours && (item.status === 'pending' || item.status === 'in_review')}<span class="tag tag-big" title="Over {data.bigPay.hours}h tracked: approving it pays a reviewer ${data.bigPay.big.toFixed(2)}">${data.bigPay.big.toFixed(2)}</span>{/if}
							{#if item.claim}<span class="tag tag-claim" class:mine={item.claim.mine}>{item.claim.held ? (item.claim.mine ? 'Held for you' : `Held for ${item.claim.by}`) : item.claim.mine ? 'Yours' : `Claimed by ${item.claim.by}`}</span>{/if}
							{#if !item.matched}<span class="tag tag-warn">No account</span>{/if}
							{#if item.gone}<span class="tag tag-warn">Gone from Airtable</span>{/if}
						</span>
					</a>
				{:else}
					<p class="empty">{data.search ? `Nothing matches “${data.search}”.` : 'Nothing here.'}</p>
				{/each}
			</aside>

			<!-- ---------- the submission and its review ---------- -->
			<section class="card">
				<!-- keyed per submission: a fresh form each time, so nothing typed for the last one carries over -->
				{#key `${data.selected?.kind}:${data.selected?.key}`}
				{#if data.queuedDetail}
					{@const r = data.queuedDetail.row}
					{@const sent = r.status === 'sent'}

					<header class="card-head">
						<div>
							<h2>{r.first_name} {r.last_name}</h2>
							<p class="meta">
								{r.project_name} &middot; submitted {new Date(r.created_at).toLocaleDateString()}
								{#if data.queuedDetail.trackedHours !== null}&middot; <strong>{data.queuedDetail.trackedHours}h tracked</strong>{/if}
								&middot; {data.queuedDetail.balance.hours_earned}h approved so far
							</p>
						</div>
						<div class="links">
							<a class="link-btn" href={safeUrl(r.code_url)} target="_blank" rel="noopener noreferrer">Code ↗</a>
							{#if r.playable_url !== r.code_url}
								<a class="link-btn" href={safeUrl(r.playable_url)} target="_blank" rel="noopener noreferrer">Demo ↗</a>
							{/if}
						</div>
					</header>
					{@render flagPanel('new', r.id)}
					{@render claimBar('new', r.id)}
					{#if r.changes_made && r.status === 'pending'}
						<div class="changes-made">
							<strong>Resubmitted. What they changed:</strong>
							<p>{r.changes_made}</p>
							<span class="hint">The feedback they were given is in the private notes below.</span>
						</div>
					{/if}

					{#if data.queuedDetail.screenshot}
						<a class="shot" href={data.queuedDetail.screenshot} target="_blank" rel="noopener noreferrer">
							<!-- keyed: a new element per submission, so the last one's image never lingers while this one loads -->
							{#key r.id}<img src={data.queuedDetail.screenshot} alt="Their screenshot" />{/key}
						</a>
					{/if}

{#if data.queuedDetail.priorApprovals.length}
						<div class="prior-warn" role="alert">
							<strong>⚠ Hours already approved on this project:</strong>
							{#each data.queuedDetail.priorApprovals as a (a.recordId)}
								<span>{a.hours}h on {a.projects.join(', ')}{a.reviewedAt ? ` (${new Date(a.reviewedAt).toLocaleDateString()})` : ''}</span>
							{/each}
							<em>Only approve time tracked since then. The Hackatime total above includes it.</em>
						</div>
					{/if}
					<LapseVideos items={data.queuedDetail.lapses} />
					<ReviewHistory items={data.queuedDetail.history} />
					<CheckpointTimeline items={data.queuedDetail.checkpoints} unlocked={data.queuedDetail.checkpointsUnlocked} />

					{#if data.isAdmin && (r.status === 'rejected' || r.status === 'changes_requested')}
						<form class="reopen" method="POST" action="?/reopenNew" use:enhance>
							<input type="hidden" name="id" value={r.id} />
							<span>{r.status === 'rejected' ? 'Rejected' : 'Waiting on changes'}. Changed your mind?</span>
							<button class="btn btn-outline" type="submit">Move back to queue</button>
						</form>
					{/if}

					{#if sent}
						<p class="sent-note">
							Sent to Hack Club {r.sent_at ? new Date(r.sent_at).toLocaleString() : ''} with
							<strong>{r.approved_hours}h</strong> approved. Their address and birthday have been cleared
							from here.
							{#if r.airtable_record_id}
								<a href="/admin/reviews?status=all&submission={r.airtable_record_id}">Open the sent submission →</a>
							{/if}
						</p>
						<p class="description">{r.description}</p>
					{:else}
						<form
							class:claim-locked={locked}
							inert={locked}
							method="POST"
							action="?/saveNew"
							use:autosave={{ action: '?/autosave', kind: 'new' }}
							use:enhance={({ submitter }) => {
								submitting = submitter?.getAttribute('value') ?? 'draft';
								return async ({ update }) => {
									await update({ reset: false });
									submitting = null;
								};
							}}>
							<input type="hidden" name="id" value={r.id} />

							<fieldset>
								<legend>Project</legend>
								<div class="field">
									<span class="field-label">Hackatime projects</span>
									{#if data.queuedDetail.projects.length}
										<div class="proj-list">
											{#each data.queuedDetail.projects.filter((p) => data.queuedDetail?.picked.includes(p.name)) as p (p.name)}
												<label class="proj"><input type="checkbox" name="project" value={p.name} checked /> {p.name} <span class="hint">{p.tracked}</span></label>
											{/each}
										</div>
										<details class="proj-more">
											<summary>Add another of their Hackatime projects</summary>
											<div class="proj-list">
												{#each data.queuedDetail.projects.filter((p) => !data.queuedDetail?.picked.includes(p.name)) as p (p.name)}
													<label class="proj"><input type="checkbox" name="project" value={p.name} /> {p.name} <span class="hint">{p.tracked}</span></label>
												{/each}
											</div>
										</details>
									{:else}
										{#each data.queuedDetail.picked as name (name)}
											<input type="hidden" name="project" value={name} />
										{/each}
										<p>{data.queuedDetail.picked.join(', ')}</p>
										<span class="hint">Couldn't reach their Hackatime to list projects.</span>
									{/if}
								</div>
								{#if !data.queuedDetail.picked.length}
									<div class="field">
										<label for="project_title">Project name <span class="optional">hardware, not tracked in Hackatime</span></label>
										<input id="project_title" name="project_title" type="text" maxlength="200" defaultValue={r.project_name} />
										<span class="hint">No Hackatime project: check their JOURNAL.md for the hours. If they've linked Lapse timelapses, tick the Hackatime project those were recorded on.</span>
									</div>
								{/if}
								<div class="grid-2 tight">
									<label class="check">
										<input
											type="checkbox"
											name="hardware"
											value="yes"
											bind:checked={hardware}
											onchange={() => saveHardware(r.id, hardware)} />
										Hardware project
										{#if hardwareNote}<span class="hint">{hardwareNote}</span>{/if}
									</label>
									<div class="field">
										<label for="code_url">Code link</label>
										<input id="code_url" name="code_url" type="url" required defaultValue={r.code_url} />
									</div>
									<div class="field">
										<label for="playable_url">Demo link {#if hardware}<span class="optional">optional</span>{/if}</label>
										<input id="playable_url" name="playable_url" type="url" required={!hardware} defaultValue={r.playable_url} />
									</div>
								</div>
								<div class="field">
									<label for="description">Description</label>
									<textarea id="description" name="description" rows="4" required minlength="20" maxlength="4000" defaultValue={r.description}></textarea>
								</div>
							</fieldset>

							<fieldset>
								<legend>Person</legend>
								<div class="grid-2 tight">
									<div class="field"><label for="first_name">First name</label><input id="first_name" name="first_name" type="text" required defaultValue={r.first_name} /></div>
									<div class="field"><label for="last_name">Last name</label><input id="last_name" name="last_name" type="text" required defaultValue={r.last_name} /></div>
									<div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required defaultValue={r.email} /></div>
									<div class="field"><label for="github_username">GitHub</label><input id="github_username" name="github_username" type="text" required defaultValue={r.github_username} /></div>
									<div class="field"><label for="birthday">Birthday</label><input id="birthday" name="birthday" type="date" required defaultValue={r.birthday ?? ''} /></div>
								</div>
							</fieldset>

							{#if data.isAdmin}
							<fieldset>
								<legend>Address</legend>
								<div class="field"><label for="address_line1">Address</label><input id="address_line1" name="address_line1" type="text" required defaultValue={r.address_line1 ?? ''} /></div>
								<div class="field"><label for="address_line2">Line 2 <span class="optional">optional</span></label><input id="address_line2" name="address_line2" type="text" defaultValue={r.address_line2 ?? ''} /></div>
								<div class="grid-2 tight">
									<div class="field"><label for="city">City</label><input id="city" name="city" type="text" required defaultValue={r.city ?? ''} /></div>
									<div class="field"><label for="state">State / province</label><input id="state" name="state" type="text" required defaultValue={r.state ?? ''} /></div>
									<div class="field"><label for="zip">Postal code</label><input id="zip" name="zip" type="text" required defaultValue={r.zip ?? ''} /></div>
									<div class="field"><label for="country">Country</label><input id="country" name="country" type="text" required defaultValue={r.country ?? ''} /></div>
								</div>
							</fieldset>
							{:else}
								<fieldset>
									<legend>Address</legend>
									<p class="hint">Hidden for reviewers. It's on file and goes to Hack Club automatically when you approve.</p>
								</fieldset>
							{/if}

							<details class="extra">
								<summary>Their feedback for Hack Club</summary>
								<div class="field"><label for="heard_about">How did you hear about this?</label><input id="heard_about" name="heard_about" type="text" defaultValue={r.heard_about ?? ''} /></div>
								<div class="field"><label for="doing_well">What are we doing well?</label><textarea id="doing_well" name="doing_well" rows="2" defaultValue={r.doing_well ?? ''}></textarea></div>
								<div class="field"><label for="improve">How can we improve?</label><textarea id="improve" name="improve" rows="2" defaultValue={r.improve ?? ''}></textarea></div>
							</details>

							<details class="justify" open>
								<summary>Hack Club justification <span class="optional">sent to Hack Club when you approve</span></summary>
								<JustificationFields fields={data.justificationFields} values={data.queuedDetail.justifications} />
							</details>

							<fieldset class="decision">
								<legend>Your review</legend>
								<div class="field hours">
									<label for="approved_hours">Hours to approve</label>
									<input id="approved_hours" name="approved_hours" type="number" step="0.25" min="0" defaultValue={r.approved_hours ?? ''} />
									{#if data.queuedDetail.trackedHours !== null}
										<span class="hint">{data.queuedDetail.trackedHours}h tracked on this project in Hackatime.</span>
									{/if}
									<span class="hint big-pay">Projects with more than {data.bigPay.hours}h tracked pay {data.earnings ? 'you' : 'a reviewer'} ${data.bigPay.big.toFixed(2)} instead of ${data.bigPay.per.toFixed(2)} when approved.</span>
								</div>
								<div class="field">
									<label for="participant_feedback">Feedback to them <span class="optional">required, it's the message they get</span></label>
									<textarea id="participant_feedback" name="participant_feedback" rows="3" maxlength="4000" required defaultValue={r.participant_feedback ?? ''}></textarea>
								</div>
								<div class="field">
									<label for="internal_notes">Private notes <span class="optional">only organisers see these</span></label>
									<textarea id="internal_notes" name="internal_notes" rows="2" maxlength="4000" defaultValue={r.internal_notes ?? ''}></textarea>
								</div>

								{#if form && 'message' in form && form.message}
									<p class="error">{form.message}</p>
								{:else if form && 'saved' in form && form.saved}
									<p class="saved">Saved.</p>
								{/if}

								<div class="actions">
									<button class="btn" type="submit" name="decision" value="approve" disabled={!!submitting}>
										{submitting === 'approve' ? 'Sending…' : 'Approve & send to Hack Club'}
									</button>
									<button class="btn btn-outline" type="submit" name="decision" value="changes_requested" disabled={!!submitting}>Needs changes</button>
									<button class="btn btn-outline" type="submit" name="decision" value="rejected" disabled={!!submitting}>Reject</button>
									<button class="save-draft" formnovalidate type="submit" name="decision" value="draft" disabled={!!submitting}>
										{submitting === 'draft' ? 'Saving…' : 'Save edits'}
									</button>
									<span class="autosave-status" aria-live="polite" data-autosave>Changes save automatically</span>
								</div>
							</fieldset>
						</form>
					{/if}
				{:else if !data.detail}
					<p class="empty">Pick a submission on the left.</p>
				{:else}
					{@const s = data.detail.submission}
					{@const status = data.detail.review?.status ?? 'pending'}

					<header class="card-head">
						<div>
							<h2>{[s.first_name, s.last_name].filter(Boolean).join(' ') || s.email || 'Unknown'}</h2>
							<p class="meta">
								{s.project_names_raw ?? 'No project named'}
								{#if s.airtable_created_at}&middot; submitted {new Date(s.airtable_created_at).toLocaleDateString()}{/if}
								{#if s.email}&middot; {s.email}{/if}
							</p>
						</div>
						<span class="tag tag-{status}">{STATUS_LABEL[status]}</span>
					</header>
					{@render flagPanel('hc', s.airtable_record_id)}
					{@render claimBar('hc', s.airtable_record_id)}
					{#if data.detail.review?.status === 'approved' || (form && 'airtableResend' in form)}
						<div class="airtable-sync" class:bad={!!(data.airtableError || (form && 'airtableResend' in form && form.airtableResend))}>
							{#if form && 'airtableResent' in form && form.airtableResent}
								<p>✓ Hours and feedback sent to Hack Club's Airtable.</p>
							{:else if form && 'airtableResend' in form && form.airtableResend}
								<p><strong>Airtable didn't take the hours:</strong> {form.airtableResend}</p>
							{:else if data.airtableError}
								<p><strong>Approved and hours credited here, but Airtable didn't take the hours:</strong> {data.airtableError}</p>
							{/if}
							<form method="POST" action="?/resendAirtable" use:enhance={() => async ({ update }) => update({ reset: false, invalidateAll: false })}>
								<input type="hidden" name="airtable_record_id" value={s.airtable_record_id} />
								<button class="text-btn" type="submit">Resend hours to Airtable</button>
								<span class="hint">Writes {data.detail.review?.approved_hours ?? '?'}h to "Override Hours Spent" and the feedback to Additional Justification.</span>
							</form>
						</div>
					{/if}
					{#if data.detail.gone}
						<p class="error-box">
							This submission has been deleted from Hack Club's Airtable, so it can't be approved, rejected or edited here any more.
							It's kept so its history isn't lost. If they've resubmitted, review the new one instead.
						</p>
					{/if}

					<div class="links">
						<!-- these come from Hack Club's Airtable, so only http(s) links are linked -->
						{#if safeUrl(s.code_url)}<a class="link-btn" href={safeUrl(s.code_url)} target="_blank" rel="noopener noreferrer">Code ↗</a>{/if}
						{#if safeUrl(s.playable_url)}<a class="link-btn" href={safeUrl(s.playable_url)} target="_blank" rel="noopener noreferrer">Demo ↗</a>{/if}
						{#if s.github_username}<span class="link-plain">GitHub: {s.github_username}</span>{/if}
					</div>

					{#if s.description}
						<p class="description">{s.description}</p>
					{/if}
					<LapseVideos items={data.detail.lapses} />
					<ReviewHistory items={data.detail.history} />

					{#if s.user_id}
{#if data.detail.priorApprovals.length}
							<div class="prior-warn" role="alert">
								<strong>⚠ Hours already approved on this project:</strong>
								{#each data.detail.priorApprovals as a (a.recordId)}
									<span>{a.hours}h on {a.projects.join(', ')}{a.reviewedAt ? ` (${new Date(a.reviewedAt).toLocaleDateString()})` : ''}</span>
								{/each}
								<em>Only approve time tracked since then. The Hackatime total above includes it.</em>
							</div>
						{/if}
						<CheckpointTimeline items={data.detail.checkpoints} />
					{/if}

					{#if data.isAdmin && data.detail.review?.status === 'rejected'}
						<form class="reopen" method="POST" action="?/reopen" use:enhance>
							<input type="hidden" name="review_id" value={data.detail.review.id} />
							<input type="hidden" name="airtable_record_id" value={s.airtable_record_id} />
							<span>Rejected. Changed your mind?</span>
							<button class="btn btn-outline" type="submit">Move back to queue</button>
						</form>
					{/if}

					<div class="review">
						{#if !s.user_id && !data.isAdmin}
							<p class="hint">This submission isn't linked to an account yet. An admin needs to link it before it can be reviewed.</p>
						{:else if !s.user_id}
							<p class="row-title">Link this submission to an account</p>
							<p class="hint">
								It didn't match anyone automatically. Find the participant, link them, then review as normal.
							</p>
							<form method="GET" class="link-search">
								<input type="hidden" name="track" value={data.track} />
								<input type="hidden" name="status" value={data.filter} />
								{#if data.search}<input type="hidden" name="q" value={data.search} />{/if}
								<input type="hidden" name="submission" value={s.airtable_record_id} />
								<input type="search" name="link_q" placeholder="Name, email or Hack Club ID" value={data.linkQuery} aria-label="Find participant" />
								<button class="btn btn-outline" type="submit">Find</button>
							</form>
							{#if data.detail.linkCandidates.length}
								<ul class="candidates">
									{#each data.detail.linkCandidates as c (c.id)}
										<li>
											<span>{c.display_name ?? c.hackclub_id}{c.email ? ` · ${c.email}` : ''}</span>
											<form method="POST" action="?/link" use:enhance>
												<input type="hidden" name="airtable_record_id" value={s.airtable_record_id} />
												<input type="hidden" name="user_id" value={c.id} />
												<button class="btn btn-outline" type="submit">Link</button>
											</form>
										</li>
									{/each}
								</ul>
							{:else if data.linkQuery}
								<p class="hint">Nobody found for “{data.linkQuery}”.</p>
							{/if}
						{:else if !data.detail.hackatimeProjects.length}
							<p class="error">Couldn't reach this participant's Hackatime, so there's nothing to review against yet. Try again shortly.</p>
						{:else}
							<form
								class:claim-locked={locked}
								inert={locked}
								method="POST"
								action="?/save"
								use:autosave={{ action: '?/autosave', kind: 'hc' }}
								use:enhance={({ submitter }) => {
									submitting = submitter?.getAttribute('value') ?? 'save';
									return async ({ update }) => {
										await update();
										submitting = null;
									};
								}}>
								<input type="hidden" name="airtable_record_id" value={s.airtable_record_id} />
								<input type="hidden" name="user_id" value={s.user_id} />

								<div class="form-grid">
									<div class="field">
										<label for="hackatime_project">Hackatime project</label>
										<select id="hackatime_project" name="hackatime_project" bind:value={selectedProject}>
											<option value="">Choose…</option>
											{#each data.detail.hackatimeProjects as p (p.name)}
												<option value={p.name}>{p.name} ({p.tracked})</option>
											{/each}
										</select>
									</div>
									<div class="field">
										<label for="approved_hours">Hours to approve</label>
										<input id="approved_hours" name="approved_hours" type="number" step="0.25" min="0" defaultValue={data.detail.review?.approved_hours ?? ''} />
										<span class="hint">
											{#if data.detail.review?.submitted_hours != null}{data.detail.review.submitted_hours}h tracked on this project.{/if}
											{#if data.detail.balance}They've had {data.detail.balance.hours_earned}h approved so far.{/if}
										</span>
										<span class="hint big-pay">Projects with more than {data.bigPay.hours}h tracked pay {data.earnings ? 'you' : 'a reviewer'} ${data.bigPay.big.toFixed(2)} instead of ${data.bigPay.per.toFixed(2)} when approved.</span>
									</div>
								</div>

								<div class="field">
									<label for="participant_feedback">Feedback to them <span class="optional">required, it's the message they get</span></label>
									<textarea id="participant_feedback" name="participant_feedback" rows="3" maxlength="4000" required defaultValue={data.detail.review?.participant_feedback ?? ''}></textarea>
								</div>
								<div class="field">
									<label for="internal_notes">Private notes <span class="optional">only organisers see these</span></label>
									<textarea id="internal_notes" name="internal_notes" rows="2" maxlength="4000" defaultValue={data.detail.review?.internal_notes ?? ''}></textarea>
								</div>

								{#if form?.message}
									<p class="error">{form.message}</p>
								{/if}

								<div class="actions">
									<button class="btn" type="submit" name="status" value="approved" disabled={!!submitting}>
										{submitting === 'approved' ? 'Approving…' : 'Approve'}
									</button>
									<button class="btn btn-outline" type="submit" name="status" value="changes_requested" disabled={!!submitting}>Needs changes</button>
									<button class="btn btn-outline" type="submit" name="status" value="rejected" disabled={!!submitting}>Reject</button>
									<button class="save-draft" formnovalidate type="submit" name="status" value="pending" disabled={!!submitting}>
										{submitting === 'pending' ? 'Saving…' : 'Save draft'}
									</button>
									<span class="autosave-status" aria-live="polite" data-autosave>Changes save automatically</span>
								</div>
							</form>
						{/if}
					</div>

					<details class="justify" open>
						<summary>Hack Club justification <span class="optional">saved straight to their Airtable</span></summary>
						{#if data.detail.justifications}
							<form
								class:claim-locked={locked}
								inert={locked}
								method="POST"
								action="?/saveJustification"
								use:autosave={{ action: '?/saveJustification', delay: 2500 }}
								use:enhance={() => async ({ update }) => update({ reset: false })}>
								<input type="hidden" name="airtable_record_id" value={s.airtable_record_id} />
								<JustificationFields fields={data.justificationFields} values={data.detail.justifications} />
								{#if form && 'justMessage' in form && form.justMessage}
									<p class="error">{form.justMessage}</p>
								{:else if form && 'justSaved' in form && form.justSaved}
									<p class="saved">Saved to Hack Club's Airtable.</p>
								{/if}
								<button class="btn btn-outline" type="submit">Save to Hack Club</button>
								<span class="autosave-status" aria-live="polite" data-autosave>Saves to Airtable automatically as you type</span>
							</form>
						{:else}
							<p class="error">Couldn't load it from Airtable: {data.detail.justificationsError}</p>
						{/if}
					</details>
				{/if}
				{/key}
			</section>
		</div>
		{/if}
	</div>
</main>

{#snippet statsView()}
	{@const st = data.stats}
	{#if !st}
		<p class="error-box">Couldn't load the stats just now. Try again in a minute.</p>
	{:else}
		{@const pct = (n: number | null) => (n === null ? '–' : `${n}%`)}
		{@const fmtWait = (h: number) => (h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h * 10) / 10}h` : `${Math.round((h / 24) * 10) / 10}d`)}
		{@const maxDay = Math.max(1, ...st.perDay.map((d) => d.approved + d.other))}
		<section class="stats-block">
			<h2 class="section-label">In the queue now</h2>
			<div class="stat-tiles">
				<div><span class="n">{st.queue.projects}</span><span class="k">projects waiting<br /><em>{st.queue.software} software · {st.queue.hardware} hardware</em></span></div>
				<div><span class="n">{st.queue.trackedHours}h</span><span class="k">tracked hours waiting{#if st.queue.unknownHours}<br /><em>+ {st.queue.unknownHours} with no tracked hours (hardware journals)</em>{/if}</span></div>
				<div><span class="n">{st.queue.waitingOnBuilders}</span><span class="k">sent back for changes<br /><em>waiting on the builder</em></span></div>
				<div><span class="n">{st.queue.oldestDays === null ? '–' : `${st.queue.oldestDays}d`}</span><span class="k">oldest has waited<br /><em>since it was last submitted or resubmitted</em></span></div>
			</div>
		</section>

		<section class="stats-block">
			<h2 class="section-label">Reviewing so far</h2>
			<div class="stat-tiles">
				<div><span class="n">{st.totals.reviews}</span><span class="k">reviews done<br /><em>{st.totals.week} in the last 7 days</em></span></div>
				<div><span class="n">{pct(st.totals.approvalRate)}</span><span class="k">approved<br /><em>{st.totals.approved} approved · {st.totals.changes} changes · {st.totals.rejected} rejected</em></span></div>
				<div><span class="n">{st.totals.hoursApproved}h</span><span class="k">hours approved</span></div>
				<div><span class="n">{st.wait.all ? fmtWait(st.wait.all.averageHours) : '–'}</span><span class="k">average wait for a review<br /><em>{#if st.wait.all}median {fmtWait(st.wait.all.medianHours)}{#if st.wait.week} · last 7 days {fmtWait(st.wait.week.averageHours)}{/if}{:else}from submitting or resubmitting to a decision{/if}</em></span></div>
				<div><span class="n">{pct(st.totals.cutPercent)}</span><span class="k">of tracked time cut<br /><em>on approvals where both are known</em></span></div>
			</div>
			<p class="hint">Software: {st.software.reviews} reviews, {pct(st.software.approvalRate)} approved, {st.software.hoursApproved}h. Hardware: {st.hardware.reviews} reviews, {pct(st.hardware.approvalRate)} approved, {st.hardware.hoursApproved}h.</p>

			<div class="day-bars" role="img" aria-label="Reviews per day over the last 14 days">
				{#each st.perDay as d (d.day)}
					{@const label = new Date(d.day + 'T00:00:00Z').toLocaleDateString('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
					<div class="day" title="{label}: {d.approved} approved, {d.other} changes or rejected">
						<span class="bar">
							<span class="seg other" style="height:{(d.other / maxDay) * 100}%"></span>
							<span class="seg approved" style="height:{(d.approved / maxDay) * 100}%"></span>
						</span>
						<span class="day-n">{d.approved + d.other || ''}</span>
						<span class="day-k">{label}</span>
					</div>
				{/each}
			</div>
			<p class="legend"><span><i class="sw approved"></i>Approved</span><span><i class="sw other"></i>Needs changes or rejected</span> <span class="hint">last 14 days</span></p>
		</section>

		<section class="stats-block">
			<h2 class="section-label">Leaderboard</h2>
			{#if st.leaderboard.length}
				<div class="table-wrap">
					<table class="board">
						<thead><tr><th>#</th><th>Reviewer</th><th>Reviews</th><th>Last 7 days</th><th>Approved</th><th>Changes</th><th>Rejected</th><th>Approval rate</th><th>Hours approved</th></tr></thead>
						<tbody>
							{#each st.leaderboard as r, i (r.id)}
								<tr class:me={r.me}>
									<td>{i + 1}</td>
									<th>{r.name}{#if r.me} <span class="you">you</span>{/if}</th>
									<td><strong>{r.reviews}</strong></td>
									<td>{r.week}</td>
									<td>{r.approved}</td>
									<td>{r.changes}</td>
									<td>{r.rejected}</td>
									<td>{pct(r.approvalRate)}</td>
									<td>{r.hoursApproved}h</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="hint">Every decision counts, including ones later resubmitted. Drafts don't.</p>
			{:else}
				<p class="hint">No reviews logged yet.</p>
			{/if}
		</section>
	{/if}
{/snippet}

<style>
	.prior-warn {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.8rem;
		margin: 1rem 0;
		padding: 0.8rem 1rem;
		background: #fff4e5;
		border: 2px solid #c25e00;
		color: #5c2c00;
		font-size: 0.9rem;
	}
	.prior-warn strong,
	.prior-warn em {
		flex-basis: 100%;
	}
	.prior-warn em {
		font-style: normal;
		font-size: 0.85rem;
	}
	.tag.tag-hw {
		background: #a34a00;
		border-color: #a34a00;
		color: #fff;
	}
	.tag.tag-big {
		border-color: var(--green);
		color: var(--green-dark);
	}
	.big-pay {
		display: block;
		color: var(--green-dark);
		font-weight: 700;
	}
	.justify {
		margin-top: 1.5rem;
		padding-top: 1.2rem;
		border-top: 2px solid var(--rule);
	}
	.justify summary {
		cursor: pointer;
		font-weight: 800;
		color: var(--navy);
		margin-bottom: 1rem;
	}
	.reopen {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-top: 1.2rem;
		padding: 0.7rem 1rem;
		border-left: 4px solid var(--orange);
		background: var(--paper);
		font-weight: 700;
		color: var(--navy);
	}
	.shot {
		display: block;
		margin: 1.2rem 0;
	}
	.shot img {
		display: block;
		max-width: 100%;
		max-height: 340px;
		object-fit: contain;
		border: 2px solid var(--rule);
	}
	.sent-note {
		margin: 1.2rem 0;
		padding: 0.8rem 1rem;
		border-left: 4px solid var(--green);
		background: var(--paper);
		font-weight: 600;
	}
	.sent-note a {
		display: block;
		margin-top: 0.4rem;
		color: var(--navy);
	}
	fieldset {
		margin: 1.4rem 0 0;
		padding: 1.2rem 0 0;
		border: 0;
		border-top: 2px solid var(--rule);
	}
	legend {
		padding: 0 0.5rem 0 0;
		font-size: 0.78rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--muted);
	}
	.grid-2.tight {
		gap: 0 1.2rem;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 700;
		color: var(--navy);
		align-self: center;
	}
	.check input {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: var(--green);
	}
	input[type='date'] {
		font: inherit;
		font-weight: 500;
		color: var(--ink);
		background: var(--white);
		border: 2px solid var(--rule-strong);
		padding: 0.6em 0.85em;
		width: 100%;
	}
	.extra {
		margin-top: 1.2rem;
	}
	.extra summary {
		cursor: pointer;
		font-weight: 700;
		color: var(--navy);
		margin-bottom: 0.8rem;
	}
	.decision {
		border-top-color: var(--navy);
	}
	.hours {
		max-width: 18rem;
	}
	.saved {
		color: var(--green-dark);
		font-weight: 700;
		margin-bottom: 0.8rem;
	}
	.proj-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-height: 220px;
		overflow-y: auto;
	}
	.proj {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		color: var(--navy);
	}
	.proj input {
		accent-color: var(--green);
	}
	.proj-more summary {
		margin: 0.5rem 0;
		cursor: pointer;
		font-size: 0.88rem;
		font-weight: 700;
		color: var(--blue-dark);
	}
	.tag-new {
		border-color: var(--blue);
		color: var(--blue-dark);
	}
	.search-form input[type='search'] {
		min-width: 18rem;
	}

	.sync-error {
		margin-bottom: 1.2rem;
		padding: 0.6rem 0.9rem;
		border-left: 4px solid var(--orange);
		background: var(--white);
		font-weight: 600;
		font-size: 0.9rem;
	}

	/* ---- tabs ---- */
	.tabs {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-bottom: 1.4rem;
	}
	.tabs a {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.45rem 0.8rem;
		border: 2px solid var(--rule-strong);
		background: var(--white);
		text-decoration: none;
		font-weight: 700;
		font-size: 0.88rem;
		color: var(--slate);
	}
	.tabs a.active {
		border-color: var(--navy);
		background: var(--navy);
		color: var(--white);
	}
	.tab-count {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		opacity: 0.75;
	}

	/* ---- layout ---- */
	.layout {
		display: grid;
		grid-template-columns: 300px minmax(0, 1fr);
		gap: 1.5rem;
		align-items: start;
	}

	/* ---- queue ---- */
	.queue {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: 78vh;
		overflow-y: auto;
		position: sticky;
		top: 110px;
	}
	.qi {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.75rem 0.9rem;
		background: var(--white);
		border: 2px solid var(--rule);
		border-left-width: 5px;
		text-decoration: none;
		color: inherit;
	}
	.autosave-status {
		align-self: center;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.airtable-sync {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin: 0.8rem 0 1rem;
		padding: 0.6rem 0.9rem;
		background: #f4f7fa;
		border-left: 4px solid #338eda;
		font-size: 0.9rem;
	}
	.airtable-sync.bad {
		background: #fdecec;
		border-left-color: #c81e1e;
		color: #7f1d1d;
	}
	.airtable-sync p {
		margin: 0;
	}
	.airtable-sync form {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.3rem 0.8rem;
	}
	.stats-block {
		margin-bottom: 1.6rem;
	}
	.stat-tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
		gap: 0.8rem;
		margin: 0.6rem 0;
	}
	.stat-tiles div {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.8rem 0.9rem;
		background: #fff;
		border: 1.5px solid var(--rule-strong);
	}
	.stat-tiles .n {
		font-size: 1.6rem;
		font-weight: 800;
		color: var(--navy);
	}
	.stat-tiles .k {
		font-size: 0.85rem;
		color: var(--slate);
	}
	.stat-tiles em {
		font-style: normal;
		font-size: 0.78rem;
		color: var(--muted);
	}
	.day-bars {
		display: grid;
		grid-template-columns: repeat(14, 1fr);
		gap: 0.3rem;
		align-items: end;
		height: 150px;
		margin-top: 1rem;
	}
	.day-bars .day {
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
		min-width: 0;
	}
	.day-bars .bar {
		display: flex;
		flex-direction: column-reverse;
		justify-content: flex-start;
		width: 100%;
		max-width: 28px;
		flex: 1;
	}
	.day-bars .seg {
		display: block;
		width: 100%;
	}
	.seg.approved,
	.sw.approved {
		background: var(--green);
	}
	.seg.other,
	.sw.other {
		background: #d98e04;
	}
	.day-bars .seg.other + .seg.approved {
		border-bottom: 2px solid #fff;
	}
	.day-n {
		font-size: 0.75rem;
		font-weight: 800;
		min-height: 1em;
	}
	.day-k {
		font-size: 0.65rem;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		max-width: 100%;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1rem;
		font-size: 0.8rem;
		margin-top: 0.4rem;
	}
	.legend .sw {
		display: inline-block;
		width: 10px;
		height: 10px;
		margin-right: 0.3rem;
	}
	.table-wrap {
		overflow-x: auto;
	}
	.board {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
		background: #fff;
	}
	.board th,
	.board td {
		padding: 0.45rem 0.6rem;
		text-align: left;
		border-bottom: 1px solid var(--rule-strong);
		white-space: nowrap;
	}
	.board thead th {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	.board tr.me {
		background: #ecf8ef;
	}
	.board .you {
		font-size: 0.7rem;
		font-weight: 800;
		color: var(--green-dark);
	}
	.changes-made {
		margin: 0 0 1rem;
		padding: 0.7rem 0.9rem;
		background: #fff8ec;
		border-left: 4px solid #e0a040;
		font-size: 0.9rem;
	}
	.changes-made p {
		margin: 0.3rem 0;
		white-space: pre-wrap;
	}
	.claim-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		margin: 0 0 1rem;
		padding: 0.7rem 0.9rem;
		background: #eef5fc;
		border-left: 4px solid #338eda;
		font-size: 0.9rem;
	}
	.claim-bar.mine {
		background: #ecf8ef;
		border-left-color: var(--green);
	}
	.claim-bar.taken {
		background: #fff6e5;
		border-left-color: #d98e04;
	}
	.claim-bar.held {
		background: #f3f0fa;
		border-left-color: #7a5cc2;
	}
	.claim-bar form {
		margin: 0;
	}
	.claim-bar .error {
		flex-basis: 100%;
		margin: 0;
	}
	.claim-locked {
		opacity: 0.45;
	}
	.tag.tag-claim {
		border-color: #d98e04;
		color: #8a5a00;
	}
	.tag.tag-claim.mine {
		border-color: var(--green);
		color: var(--green-dark);
	}
	.claims-panel {
		margin-bottom: 1rem;
		padding: 0.6rem 0.9rem;
		border: 1.5px solid var(--rule-strong);
		font-size: 0.9rem;
	}
	.claims-panel summary {
		cursor: pointer;
		font-weight: 800;
	}
	.claims-panel table {
		width: 100%;
		margin-top: 0.5rem;
		border-collapse: collapse;
	}
	.claims-panel th,
	.claims-panel td {
		padding: 0.35rem 0.5rem 0.35rem 0;
		text-align: left;
		border-bottom: 1px solid var(--rule-strong);
	}
	.claims-panel form {
		margin: 0;
	}
	.shadow-note {
		margin-bottom: 1rem;
		padding: 0.6rem 0.9rem;
		background: #eef5fc;
		border-left: 4px solid #338eda;
		font-size: 0.9rem;
		color: var(--slate);
	}
	.qi.flagged {
		border-color: #c81e1e;
		border-left: 6px solid #c81e1e;
		background: #fdecec;
	}
	.qi.flagged.active {
		border-color: #9b1c1c;
		box-shadow: inset 0 0 0 1px #9b1c1c;
	}
	.qi-flag {
		margin-right: 0.35rem;
		color: #c81e1e;
	}
	.flag-panel {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		margin: 0.8rem 0 1rem;
	}
	.flag-panel.on {
		padding: 0.7rem 0.9rem;
		background: #fdecec;
		border: 2px solid #c81e1e;
		color: #7f1d1d;
	}
	.flag-panel.on p {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 0.7rem;
		margin: 0;
	}
	.flag-open {
		color: #9b1c1c;
	}
	.flag-form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		flex: 1;
	}
	.flag-form input {
		flex: 1;
		min-width: 220px;
		padding: 0.45rem 0.6rem;
		border: 2px solid #c81e1e;
		font: inherit;
	}
	.flag-btn {
		background: #c81e1e;
		border-color: #c81e1e;
	}
	.qi:hover {
		border-color: var(--rule-strong);
	}
	.qi.active {
		border-color: var(--navy);
	}
	.qi-top {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.qi-name {
		font-weight: 800;
		font-size: 0.95rem;
		color: var(--navy);
	}
	.qi-time {
		font-size: 0.75rem;
		color: var(--muted);
		white-space: nowrap;
	}
	.qi-project {
		font-size: 0.82rem;
		color: var(--slate);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.qi-tags {
		display: flex;
		gap: 0.35rem;
		margin-top: 0.2rem;
	}

	/* ---- tags ---- */
	.tag {
		display: inline-block;
		align-self: flex-start;
		padding: 0.15em 0.5em;
		font-size: 0.7rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border: 1.5px solid var(--rule-strong);
		color: var(--muted);
		white-space: nowrap;
	}
	.tag-approved {
		border-color: var(--green);
		color: var(--green-dark);
	}
	.tag-changes_requested {
		border-color: var(--orange);
		color: var(--orange-dark);
	}
	.tag-rejected {
		border-color: var(--red);
		color: var(--red-dark);
	}
	.tag-warn {
		border-color: var(--orange);
		background: #fff4ea;
		color: var(--orange-dark);
	}

	/* ---- card ---- */
	.card {
		background: var(--white);
		border: 2px solid var(--rule);
		padding: clamp(1.2rem, 3vw, 2rem);
	}
	.card-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
	}
	.card-head h2 {
		font-size: 1.5rem;
	}
	.meta {
		margin-top: 0.3rem;
		font-size: 0.88rem;
		color: var(--muted);
		font-weight: 600;
		word-break: break-word;
	}
	.links {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin: 1.1rem 0;
	}
	.link-btn {
		padding: 0.4rem 0.8rem;
		border: 2px solid var(--navy);
		font-weight: 700;
		font-size: 0.88rem;
		color: var(--navy);
		text-decoration: none;
	}
	.link-btn:hover {
		background: var(--navy);
		color: var(--white);
	}
	.link-plain {
		font-size: 0.88rem;
		color: var(--slate);
		font-weight: 600;
	}
	.description {
		white-space: pre-wrap;
		line-height: 1.55;
		color: var(--ink);
		max-width: 68ch;
	}

	/* ---- review form ---- */
	.review {
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 2px solid var(--rule);
	}
	.form-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
		gap: 0 1.2rem;
	}
	.form-grid .hint {
		font-size: 0.8rem;
	}
	.optional {
		font-weight: 500;
		color: var(--muted);
		font-size: 0.82rem;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-top: 0.4rem;
	}
	.save-draft {
		margin-left: auto;
		background: none;
		border: 0;
		padding: 0.4rem 0;
		font: inherit;
		font-weight: 700;
		font-size: 0.9rem;
		color: var(--muted);
		text-decoration: underline;
		cursor: pointer;
	}
	.save-draft:hover {
		color: var(--navy);
	}

	/* ---- linking an unmatched submission ---- */
	.link-search {
		display: flex;
		gap: 0.6rem;
		margin: 0.9rem 0;
		max-width: 520px;
	}
	.candidates {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 520px;
	}
	.candidates li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.5rem 0.7rem;
		border: 2px solid var(--rule);
		font-size: 0.9rem;
	}

	.error {
		color: var(--red);
		font-weight: 600;
		margin-bottom: 0.8rem;
	}

	@media (max-width: 900px) {
		.layout {
			grid-template-columns: 1fr;
		}
		.queue {
			position: static;
			max-height: 320px;
		}
		.form-grid {
			grid-template-columns: 1fr;
		}
		.search-form input[type='search'] {
			min-width: 0;
			width: 100%;
		}
	}
</style>
