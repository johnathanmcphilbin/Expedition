<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import { enhance } from '$app/forms';
	import { TRAVEL_RATE, money } from '$lib/data';
	import GrantAmount from '$lib/components/GrantAmount.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const flashText: Record<string, string> = {
		connected: 'Hackatime connected. Now add the project you’re working on.',
		denied: 'Hackatime connection was cancelled.',
		failed: 'Hackatime connection failed. Try again.'
	};

	const firstName = $derived((data.user.display_name ?? '').split(' ')[0]);
	const available = $derived(Number(data.balance.hours_available));
	const nextDrop = $derived(data.unlocks.find((u) => u.state === 'locked') ?? null);
	const readyCount = $derived(data.unlocks.filter((u) => u.state === 'ready').length);

	// Hackatime lists every folder ever opened; show a handful and let
	// search find the rest.
	let adding = $state(false);
	let query = $state('');
	const suggestions = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (q) return data.others.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 12);
		return data.others.filter((p) => p.seconds >= 60).slice(0, 6);
	});
	const pickerOpen = $derived(adding || data.projects.length === 0);

	const travelHours = $derived(Number(data.balance.hours_travel));
	const travelLocked = $derived(!!data.balance.travel_locked_at);
	let moveHours = $state<number | null>(null);

	type Stage = 'building' | 'submitted' | 'approved' | 'changes' | 'rejected';
	function stageOf(p: (typeof data.projects)[number]): Stage {
		const st = p.review?.status;
		if (st === 'approved') return 'approved';
		if (st === 'changes_requested') return 'changes';
		if (st === 'rejected') return 'rejected';
		if (st || p.submitted) return 'submitted';
		return 'building';
	}
	const finalLabel: Record<Stage, string> = {
		building: 'Approved',
		submitted: 'Approved',
		approved: 'Approved',
		changes: 'Needs changes',
		rejected: 'Not approved'
	};

	function hoursToGo(h: number) {
		const n = Math.max(0, h - available);
		return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, '')}h to go`;
	}
</script>

<svelte:head><title>Dashboard · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<div>
				<h1 class="app-title">{firstName ? `Hey, ${firstName}` : 'Your expedition'}</h1>
				<p class="hint lead">Build, submit, get hours approved, spend them on gear.</p>
			</div>
			<div class="head-actions">
				{#if data.pendingReviews !== null}
					<a class="btn btn-outline" href="/admin/reviews">
						Review queue{data.pendingReviews ? ` (${data.pendingReviews})` : ''}
					</a>
				{/if}
				<a class="btn" href="/submit-to-hackclub">Submit a project</a>
			</div>
		</div>

		{#if data.flash && flashText[data.flash]}
			<p class="notice">{flashText[data.flash]}</p>
		{/if}

		<!-- ---------------- progress ---------------- -->
		<section class="panel progress">
			<div class="progress-main">
				<p class="section-label">Approved hours</p>
				<p class="big"><strong>{data.progress.hours_earned}</strong><span>h</span></p>
				<p class="hint">Build as much as you like. There's no cap.</p>
				<div class="milestone">
					<div class="milestone-head">
						<span class="milestone-k">{data.progress.hours_target}-hour prize</span>
						<span class="milestone-v">
							{#if data.progress.finished}Unlocked{:else}at {data.progress.hours_target}h{/if}
						</span>
					</div>
					<div
						class="meter"
						role="progressbar"
						aria-valuenow={data.progress.percent_complete}
						aria-valuemin="0"
						aria-valuemax="100"
						aria-label="Approved hours toward the 40-hour prize">
						<span class="meter-fill" style="width:{data.progress.percent_complete}%"></span>
					</div>
					<p class="hint">
						{#if data.progress.finished}
							You've unlocked the 40-hour prize. We'll be in touch about it.
						{:else}
							Something extra at {data.progress.hours_target} approved hours. We're keeping it quiet for now.
						{/if}
					</p>
				</div>
			</div>
			<dl class="mini-stats">
				<div><dt>To spend</dt><dd class="green">{data.balance.hours_available}h</dd></div>
				<div><dt>For Dublin</dt><dd>{travelHours}h</dd></div>
				<div><dt>Spent</dt><dd>{data.balance.hours_spent}h</dd></div>
				<a class="ledger-link" href="/your-hours">See every hour →</a>
			</dl>
		</section>

		<!-- ---------------- unlocks ---------------- -->
		<section class="block">
			<div class="block-head">
				<h2>What you've unlocked</h2>
				{#if readyCount}
					<a class="btn" href="/claim">Claim gear ({readyCount} ready)</a>
				{:else}
					<a class="text-link" href="/claim">See all drops →</a>
				{/if}
			</div>
			<p class="hint block-hint">
				{#if nextDrop}
					Next up: <strong>{nextDrop.name}</strong>, {hoursToGo(nextDrop.hours)}.
				{:else}
					Every drop is within reach.
				{/if}
			</p>
			<ol class="unlocks">
				{#each data.unlocks as u (u.hours)}
					<li class="unlock unlock-{u.state}">
						{#if u.image}<img class="u-img" src={u.image} alt="" loading="lazy" />{/if}
						<span class="u-tier">{u.hours}h</span>
						<span class="u-name">{u.name}</span>
						<span class="u-state">
							{#if u.state === 'claimed'}Claimed ✓{:else if u.state === 'ready'}Ready to claim{:else}{hoursToGo(u.hours)}{/if}
						</span>
					</li>
				{/each}
			</ol>
		</section>

		<!-- ---------------- travel fund ---------------- -->
		<section class="block" id="travel">
			<div class="block-head">
				<h2>Dublin travel fund</h2>
				<a class="text-link" href="/ireland">About Dublin →</a>
			</div>
			<p class="hint block-hint">
				Bank approved hours here instead of spending them on gear. Every hour you bank adds
				<strong>{money(TRAVEL_RATE)}</strong> to a travel grant for getting you to Dublin on December 5th.
			</p>
			<div class="panel travel">
				<div class="travel-total">
					<span class="t-dollars">{travelHours}h</span>
					<span class="t-hours">banked for Dublin</span>
					{#if travelHours > 0}
						<span class="t-grant">
							<GrantAmount reveal="{money(travelHours * TRAVEL_RATE)} travel grant so far" />
						</span>
					{/if}
				</div>

				{#if travelLocked}
					<p class="travel-note">
						Your fund is locked while your trip is being arranged. Talk to an organiser if something's changed.
					</p>
				{:else}
					<form
						class="travel-form"
						method="POST"
						action="?/travel"
						use:enhance={() =>
							async ({ update, result }) => {
								await update({ reset: false });
								if (result.type === 'success') moveHours = null;
							}}>
						<label class="sr-only" for="move-hours">Hours</label>
						<div class="travel-input">
							<input
								id="move-hours"
								name="hours"
								type="number"
								min="0.25"
								step="0.25"
								max={Math.max(available, travelHours)}
								placeholder="Hours"
								bind:value={moveHours}
								required />
						</div>
						<div class="travel-actions">
							<button class="btn" type="submit" name="direction" value="bank" disabled={available <= 0}>
								Bank for Dublin
							</button>
							{#if travelHours > 0}
								<button class="btn btn-outline" type="submit" name="direction" value="back">
									Move back to gear
								</button>
							{/if}
						</div>
						<p class="hint travel-avail">
							{available}h available to bank{#if available > 0}
								· <button type="button" class="text-link inline" onclick={() => (moveHours = available)}>use all</button>{/if}
						</p>
					</form>
				{/if}

				{#if form && 'travelMessage' in form && form.travelMessage}
					<p class="error-box travel-msg">{form.travelMessage}</p>
				{:else if form && 'travelMoved' in form && form.travelMoved}
					<p class="notice travel-msg">
						{form.travelMoved > 0
							? `Banked ${form.travelMoved}h for Dublin.`
							: `Moved ${-form.travelMoved}h back to your gear balance.`}
					</p>
				{/if}
			</div>
		</section>

		<!-- ---------------- projects ---------------- -->
		<section class="block">
			<div class="block-head">
				<h2>What you're working on</h2>
				{#if data.hackatime.connected && data.projects.length && !adding}
					<button type="button" class="btn btn-outline" onclick={() => (adding = true)}>+ Add a project</button>
				{/if}
			</div>

			{#if !data.hackatime.connected}
				<div class="panel connect-cta">
					<div>
						<p class="row-title">Connect Hackatime to get started</p>
						<p class="hint">
							Hackatime tracks your coding time. Once it's connected, pick the project you're
							building and its hours show up here.
						</p>
					</div>
					<a class="btn" href="/auth/hackatime">Connect Hackatime</a>
				</div>
			{:else if data.hackatimeUnavailable}
				<p class="error-box">Couldn't reach Hackatime just now. Try reloading in a moment.</p>
			{:else}
				{#if data.syncError}
					<p class="hint error">
						Couldn't refresh submission status from Hack Club just now, so statuses may be a little out of date.
					</p>
				{/if}

				{#if form && 'message' in form && form.message}
					<p class="error-box">{form.message}</p>
				{/if}

				{#if data.projects.length}
					<ul class="projects">
						{#each data.projects as p (p.name)}
							{@const stage = stageOf(p)}
							<li class="project">
								<div class="p-info">
									<span class="p-name">{p.name}</span>
									{#if p.languages.length}<span class="p-meta">{p.languages.join(', ')}</span>{/if}
									<ol class="stages" aria-label="Where this project is at">
										<li class="st done">Building</li>
										<li class="st" class:done={stage !== 'building'} class:now={stage === 'submitted'}>
											{stage === 'submitted' ? 'Submitted, in review' : 'Submitted'}
										</li>
										<li
											class="st st-final"
											class:done={stage === 'approved'}
											class:warn={stage === 'changes'}
											class:bad={stage === 'rejected'}>
											{finalLabel[stage]}{#if stage === 'approved' && p.review?.approved_hours} · {p.review.approved_hours}h{/if}
										</li>
									</ol>
								</div>
								<div class="p-total">
									<span class="p-total-n">{p.tracked}</span>
									<span class="p-total-k">tracked</span>
								</div>
								<div class="p-actions">
									{#if stage === 'building'}
										<a class="btn" href="/submit-to-hackclub?project={encodeURIComponent(p.name)}">Submit</a>
									{:else if stage === 'changes'}
										<a class="btn" href="/submit-to-hackclub?project={encodeURIComponent(p.name)}">Resubmit</a>
									{/if}
									{#if p.connected && stage === 'building'}
										<form method="POST" action="?/disconnect" use:enhance>
											<input type="hidden" name="project" value={p.name} />
											<button class="remove" type="submit" aria-label="Remove {p.name}" title="Remove">×</button>
										</form>
									{/if}
								</div>
								{#if p.review?.participant_feedback && p.review.status !== 'pending'}
									<p class="p-feedback">“{p.review.participant_feedback}”</p>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}

				{#if pickerOpen}
					<div class="picker panel">
						<p class="row-title">
							{data.projects.length ? 'Add another project' : 'Which project are you working on?'}
						</p>
						<p class="hint">Pick it from your Hackatime. You can add more later.</p>
						{#if data.others.length}
							<input
								class="picker-search"
								type="search"
								placeholder="Search all {data.others.length} Hackatime projects"
								aria-label="Search your Hackatime projects"
								bind:value={query} />
							<div class="picker-grid">
								{#each suggestions as s (s.name)}
									<form
										method="POST"
										action="?/connect"
										use:enhance={() =>
											async ({ update }) => {
												await update();
												adding = false;
												query = '';
											}}>
										<input type="hidden" name="project" value={s.name} />
										<button class="pick" type="submit">
											<span class="p-name">{s.name}</span>
											<span class="p-meta">{s.tracked} tracked</span>
										</button>
									</form>
								{:else}
									<p class="empty">No project called “{query}”.</p>
								{/each}
							</div>
						{:else}
							<p class="empty">
								Nothing tracked in Hackatime yet. Start coding with it running and your projects will show up here.
							</p>
						{/if}
						{#if data.projects.length}
							<button type="button" class="text-link cancel" onclick={() => ((adding = false), (query = ''))}>Cancel</button>
						{/if}
					</div>
				{/if}

				<p class="hint hackatime-line">
					Hackatime connected · <a href="/auth/hackatime">Reconnect</a>
				</p>
			{/if}
		</section>
	</div>
</main>
<Footer />

<style>
	.lead {
		margin-top: 0.5rem;
		font-size: 1rem;
	}
	.head-actions {
		display: flex;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.error {
		color: var(--red);
	}

	/* ---- progress ---- */
	.progress {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 1.5rem 3rem;
		flex-wrap: wrap;
		margin-bottom: 3rem;
	}
	.progress-main {
		flex: 1 1 320px;
	}
	.progress .section-label {
		margin-bottom: 0.3rem;
	}
	.big {
		margin: 0;
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		line-height: 1;
	}
	.big strong {
		font-size: clamp(2.6rem, 7vw, 3.6rem);
		font-weight: 800;
		letter-spacing: -0.04em;
		color: var(--navy);
	}
	.big span {
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--muted);
	}
	.milestone {
		margin-top: 1.2rem;
		padding-top: 1rem;
		border-top: 2px solid var(--rule);
		max-width: 520px;
	}
	.milestone-head {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		font-size: 0.8rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.milestone-k {
		color: var(--navy);
	}
	.milestone-v {
		color: var(--muted);
	}
	.meter {
		height: 8px;
		border: 1.5px solid var(--navy);
		margin: 0.5rem 0 0.5rem;
	}
	.meter-fill {
		display: block;
		height: 100%;
		background: var(--green);
		transition: width 200ms ease;
	}
	@media (prefers-reduced-motion: reduce) {
		.meter-fill {
			transition: none;
		}
	}
	.mini-stats {
		display: flex;
		align-items: flex-end;
		gap: 1.8rem;
		margin: 0;
		flex-wrap: wrap;
	}
	.mini-stats dt {
		font-size: 0.75rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--muted);
	}
	.mini-stats dd {
		margin: 0.15rem 0 0;
		font-size: 1.6rem;
		font-weight: 800;
		color: var(--navy);
	}
	.mini-stats dd.green {
		color: var(--green-dark);
	}
	.ledger-link,
	.text-link {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--blue-dark);
	}

	/* ---- sections ---- */
	.block {
		margin-bottom: 3rem;
	}
	.block-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 0.4rem;
	}
	.block-head h2 {
		font-size: 1.5rem;
	}
	.block-hint {
		margin-bottom: 1.1rem;
		font-size: 0.95rem;
	}

	/* ---- unlock track ---- */
	.unlocks {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 0.6rem;
	}
	.unlock {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.8rem 0.75rem;
		background: var(--white);
		border: 2px solid var(--rule);
		min-height: 128px;
	}
	.u-img {
		height: 56px;
		width: 100%;
		object-fit: contain;
		margin-bottom: 0.2rem;
	}
	.unlock-locked .u-img {
		opacity: 0.6;
	}
	.u-tier {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--muted);
	}
	.u-name {
		font-weight: 800;
		font-size: 0.92rem;
		line-height: 1.25;
		color: var(--navy);
		flex: 1;
	}
	.u-state {
		font-size: 0.75rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	.unlock-locked {
		background: rgba(255, 255, 255, 0.55);
	}
	.unlock-locked .u-name {
		color: var(--slate);
	}
	.unlock-ready {
		border-color: var(--green);
		box-shadow: inset 0 0 0 1px var(--green);
	}
	.unlock-ready .u-state {
		color: var(--green-dark);
	}
	.unlock-claimed {
		background: var(--navy);
		border-color: var(--navy);
	}
	.unlock-claimed .u-tier,
	.unlock-claimed .u-state {
		color: var(--sea);
	}
	.unlock-claimed .u-name {
		color: var(--white);
	}
	@media (max-width: 900px) {
		.unlocks {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	@media (max-width: 480px) {
		.unlocks {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.unlock {
			min-height: 0;
		}
	}

	/* ---- travel fund ---- */
	.travel {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 1.2rem 2.5rem;
	}
	.travel-total {
		display: flex;
		flex-direction: column;
	}
	.t-dollars {
		font-size: clamp(2.2rem, 6vw, 3rem);
		font-weight: 800;
		letter-spacing: -0.04em;
		line-height: 1;
		color: var(--navy);
	}
	.t-hours {
		margin-top: 0.3rem;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--muted);
	}
	.travel-form {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.travel-input {
		display: flex;
		align-items: center;
		gap: 0.8rem;
	}
	.travel-input input {
		max-width: 9rem;
	}
	.t-grant {
		margin-top: 0.35rem;
	}
	.travel-actions {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.travel-avail {
		margin: 0;
	}
	.inline {
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		text-decoration: underline;
		font-size: inherit;
	}
	.travel-note {
		margin: 0;
		font-weight: 600;
		color: var(--slate);
	}
	.travel-msg {
		grid-column: 1 / -1;
		margin: 0;
	}
	@media (max-width: 600px) {
		.travel {
			grid-template-columns: 1fr;
		}
	}

	/* ---- projects ---- */
	.connect-cta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.2rem;
		flex-wrap: wrap;
	}
	.connect-cta .hint {
		max-width: 52ch;
		margin-top: 0.3rem;
	}
	.projects {
		list-style: none;
		margin: 0.6rem 0 1.2rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.project {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 0.6rem 1.2rem;
		padding: 1rem 1.1rem;
		background: var(--white);
		border: 2px solid var(--rule);
	}
	.p-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.p-name {
		font-weight: 800;
		color: var(--navy);
		word-break: break-word;
	}
	.p-meta {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--muted);
	}
	.stages {
		list-style: none;
		margin: 0.55rem 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.st {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.15em 0.55em;
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border: 1.5px solid var(--rule);
		color: var(--muted);
		background: var(--white);
	}
	.st::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--rule-strong);
	}
	.st.done {
		border-color: var(--green);
		color: var(--green-dark);
	}
	.st.done::before {
		background: var(--green);
	}
	.st.now {
		border-color: var(--navy);
		color: var(--navy);
	}
	.st.now::before {
		background: var(--navy);
	}
	.st.warn {
		border-color: var(--orange);
		color: var(--orange-dark);
	}
	.st.warn::before {
		background: var(--orange);
	}
	.st.bad {
		border-color: var(--red);
		color: var(--red-dark);
	}
	.st.bad::before {
		background: var(--red);
	}
	.p-total {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		line-height: 1;
	}
	.p-total-n {
		font-size: 1.6rem;
		font-weight: 800;
		letter-spacing: -0.03em;
		color: var(--navy);
		white-space: nowrap;
	}
	.p-total-k {
		margin-top: 0.25rem;
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	.p-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.p-feedback {
		grid-column: 1 / -1;
		margin: 0;
		padding-left: 0.8rem;
		border-left: 3px solid var(--rule-strong);
		font-size: 0.9rem;
		color: var(--slate);
	}
	.remove {
		width: 2.2rem;
		height: 2.2rem;
		font-size: 1.3rem;
		line-height: 1;
		background: none;
		border: 2px solid var(--rule);
		color: var(--muted);
		cursor: pointer;
	}
	.remove:hover {
		border-color: var(--red);
		color: var(--red);
	}
	@media (max-width: 600px) {
		.project {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.p-total {
			align-items: flex-start;
			grid-column: 1;
		}
	}

	.picker {
		margin-top: 0.6rem;
	}
	.picker .hint {
		margin: 0.25rem 0 1rem;
	}
	.picker-search {
		max-width: 420px;
		margin-bottom: 0.9rem;
	}
	.picker-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.6rem;
	}
	.pick {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
		padding: 0.85rem 1rem;
		background: var(--white);
		border: 2px solid var(--rule-strong);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.pick:hover {
		border-color: var(--green);
	}
	.pick:focus-visible {
		outline: 3px solid var(--green);
		outline-offset: 2px;
	}
	.cancel {
		margin-top: 1rem;
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		text-decoration: underline;
	}
	.hackatime-line {
		margin-top: 1rem;
	}
</style>
