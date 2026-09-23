<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const flashText: Record<string, string> = {
		connected: 'Hackatime connected. Your coding time will show up here.',
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
</script>

<svelte:head><title>Dashboard · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<div>
				<h1 class="app-title">{data.user.display_name ?? 'Your expedition'}</h1>
				<p class="hint">Signed in as {data.user.email ?? 'Hack Club account'}</p>
			</div>
			<div class="head-actions">
				{#if data.pendingReviews !== null}
					<a class="btn btn-outline" href="/admin/reviews">
						Review queue{data.pendingReviews ? ` (${data.pendingReviews})` : ''}
					</a>
				{/if}
				<a class="btn" href="/submit-to-hackclub">Submit project</a>
			</div>
		</div>

		{#if data.flash && flashText[data.flash]}
			<p class="notice">{flashText[data.flash]}</p>
		{/if}

		<!-- Approved hours only — this is the ledger, not raw Hackatime time.
		     Spending gear does not move it back. -->
		<section class="progress">
			<div class="progress-head">
				<p class="section-label">Expedition progress</p>
				<p class="progress-figure">
					<strong>{data.progress.hours_earned}</strong> / {data.progress.hours_target}h approved
					&middot; checkpoint {data.progress.checkpoints_reached} of {data.progress
						.checkpoints_total}
				</p>
			</div>
			<div
				class="meter"
				role="progressbar"
				aria-valuenow={data.progress.percent_complete}
				aria-valuemin="0"
				aria-valuemax="100"
				aria-label="Expedition progress">
				<span class="meter-fill" style="width:{data.progress.percent_complete}%"></span>
			</div>
			<p class="hint">
				{#if data.progress.finished}
					Expedition complete — all {data.progress.hours_target} hours approved.
				{:else}
					{data.progress.hours_remaining}h left to reach Dublin, once approved.
				{/if}
			</p>
		</section>

		<div class="stat-row">
			<div class="stat-big green">
				<span class="n">{data.balance.hours_available}h</span>
				<span class="k">banked</span>
			</div>
			<div class="stat-big">
				<span class="n">{data.balance.hours_earned}h</span>
				<span class="k">approved</span>
			</div>
			<div class="stat-big">
				<span class="n">{data.balance.hours_spent}h</span>
				<span class="k">spent</span>
			</div>
		</div>
		<p class="hint" style="margin-top:0.6rem; margin-bottom:2rem">
			Only <strong>approved</strong> hours count here — see below for tracked and submitted time
			on each project.
		</p>

		<div class="grid-2">
			<section>
				<p class="section-label">Hackatime</p>
				<div class="panel">
					{#if data.hackatime.connected}
						<p class="row-title">Connected</p>
						<p class="hint">Your projects and tracked time below come straight from here.</p>
						<p style="margin-top:1rem">
							<a class="btn btn-outline" href="/auth/hackatime">Reconnect</a>
						</p>
					{:else}
						<p class="row-title">Not connected</p>
						<p class="hint">Connect Hackatime so Expedition can show your projects and hours.</p>
						<p style="margin-top:1rem">
							<a class="btn" href="/auth/hackatime">Connect Hackatime</a>
						</p>
					{/if}
				</div>
			</section>

			<section>
				<p class="section-label">Your hours</p>
				<div class="panel">
					<p class="hint">
						Every approved review adds to your ledger. Nothing is ever removed unless you spend
						it.
					</p>
					<p class="head-actions" style="margin-top:1rem">
						<a class="btn btn-outline" href="/your-hours">See the ledger</a>
						<a class="btn btn-outline" href="/claim">Spend hours</a>
					</p>
				</div>
			</section>
		</div>

		<section style="margin-top:2.5rem">
			<p class="section-label">Your projects</p>
			<p class="hint" style="margin-bottom:1rem">
				From Hackatime, live. <strong>Tracked</strong> is time logged; <strong>submitted</strong>
				means a Hack Club submission mentions it; <strong>approved</strong> is what an Expedition
				reviewer accepted — only that counts toward your balance above.
			</p>

			{#if data.syncError}
				<p class="hint error" style="margin-bottom:1rem">
					Couldn't refresh submission status from Hack Club just now — "submitted" below may be
					out of date.
				</p>
			{/if}

			{#if !data.hackatime.connected}
				<p class="empty">Connect Hackatime above to see your projects.</p>
			{:else if data.hackatimeUnavailable}
				<p class="empty error">Couldn't reach Hackatime just now. Try reloading in a moment.</p>
			{:else if data.projects.length}
				<div class="row-list">
					{#each data.projects as p (p.name)}
						<div class="row project-row">
							<span class="row-title">{p.name}</span>
							<span class="row-meta">{p.tracked} tracked</span>
							<span class="row-meta">
								{#if p.review}
									{p.review.approved_hours ?? 0}h approved &middot; {statusLabel[p.review.status]}
								{:else if p.submitted}
									Submitted, awaiting review
								{:else}
									Not submitted
								{/if}
							</span>
							{#if !p.submitted}
								<a
									class="btn btn-outline"
									href="/submit-to-hackclub?project={encodeURIComponent(p.name)}">
									Submit
								</a>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="empty">
					Nothing tracked in Hackatime yet — start coding with it running and your projects will
					show up here.
				</p>
			{/if}
		</section>

		<form method="POST" action="/auth/logout" style="margin-top:3rem">
			<button class="btn btn-outline" type="submit">Log out</button>
		</form>
	</div>
</main>
<Footer />

<style>
	.progress {
		margin: 2rem 0 1.5rem;
	}
	.progress-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.progress-figure {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--slate);
		margin: 0;
	}
	.progress-figure strong {
		color: var(--navy);
	}
	/* A survey rule, not a rounded progress pill. */
	.meter {
		height: 10px;
		border: 1.5px solid var(--navy);
		background: transparent;
		margin: 0.6rem 0 0.5rem;
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

	.head-actions {
		display: flex;
		gap: 0.8rem;
		flex-wrap: wrap;
	}

	.project-row {
		flex-wrap: wrap;
		gap: 0.6rem 1rem;
	}
	.error {
		color: var(--red);
	}
</style>
