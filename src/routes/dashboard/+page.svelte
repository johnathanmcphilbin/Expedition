<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const flashText: Record<string, string> = {
		connected: 'Hackatime connected. Now add the project you’re working on.',
		denied: 'Hackatime connection was cancelled.',
		failed: 'Hackatime connection failed. Try again.'
	};

	const statusLabel: Record<string, string> = {
		pending: 'Submitted, awaiting review',
		in_review: 'In review',
		approved: 'Approved',
		changes_requested: 'Needs changes',
		rejected: 'Not approved'
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
				<p class="big">
					<strong>{data.progress.hours_earned}</strong><span>/ {data.progress.hours_target}h</span>
				</p>
				<div
					class="meter"
					role="progressbar"
					aria-valuenow={data.progress.percent_complete}
					aria-valuemin="0"
					aria-valuemax="100"
					aria-label="Approved hours toward 40">
					<span class="meter-fill" style="width:{data.progress.percent_complete}%"></span>
				</div>
				<p class="hint">
					{#if data.progress.finished}
						All {data.progress.hours_target} hours approved. You finished the Expedition.
					{:else}
						{data.progress.hours_remaining}h more to finish the Expedition.
					{/if}
				</p>
			</div>
			<dl class="mini-stats">
				<div><dt>Banked</dt><dd class="green">{data.balance.hours_available}h</dd></div>
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
					Next up: <strong>{nextDrop.name}</strong> — {hoursToGo(nextDrop.hours)} of banked hours.
				{:else}
					Every drop is within reach.
				{/if}
			</p>
			<ol class="unlocks">
				{#each data.unlocks as u (u.hours)}
					<li class="unlock unlock-{u.state}">
						<span class="u-tier">{u.hours}h</span>
						<span class="u-name">{u.name}</span>
						<span class="u-state">
							{#if u.state === 'claimed'}Claimed ✓{:else if u.state === 'ready'}Ready to claim{:else}{hoursToGo(u.hours)}{/if}
						</span>
					</li>
				{/each}
			</ol>
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
						Couldn't refresh submission status from Hack Club just now — statuses may be a little out of date.
					</p>
				{/if}

				{#if form && 'message' in form && form.message}
					<p class="error-box">{form.message}</p>
				{/if}

				{#if data.projects.length}
					<ul class="projects">
						{#each data.projects as p (p.name)}
							<li class="project">
								<div class="p-info">
									<span class="p-name">{p.name}</span>
									<span class="p-meta">
										{p.tracked} tracked{#if p.languages.length}&nbsp;· {p.languages.join(', ')}{/if}
									</span>
								</div>
								<div class="p-status">
									{#if p.review}
										<span class="status status-{p.review.status}">{statusLabel[p.review.status]}</span>
										{#if p.review.approved_hours}<span class="p-hours">{p.review.approved_hours}h approved</span>{/if}
									{:else if p.submitted}
										<span class="status status-pending">Submitted</span>
									{/if}
								</div>
								<div class="p-actions">
									{#if !p.submitted && !p.review}
										<a class="btn" href="/submit-to-hackclub?project={encodeURIComponent(p.name)}">Submit</a>
									{:else if p.review?.status === 'changes_requested'}
										<a class="btn" href="/submit-to-hackclub?project={encodeURIComponent(p.name)}">Resubmit</a>
									{/if}
									{#if p.connected && !p.submitted && !p.review}
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
								Nothing tracked in Hackatime yet — start coding with it running and your projects will show up here.
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
	.meter {
		height: 12px;
		border: 1.5px solid var(--navy);
		margin: 0.9rem 0 0.6rem;
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
		grid-template-columns: repeat(8, minmax(0, 1fr));
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
	.p-status {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.p-hours {
		font-weight: 800;
		color: var(--green-dark);
		font-size: 0.9rem;
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
		.p-status {
			grid-column: 1 / -1;
			grid-row: 2;
			justify-content: flex-start;
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
