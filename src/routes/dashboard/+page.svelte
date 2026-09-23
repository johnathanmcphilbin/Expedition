<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const flashText: Record<string, string> = {
		connected: 'Hackatime connected. Your coding time will show up for reviewers.',
		denied: 'Hackatime connection was cancelled.',
		failed: 'Hackatime connection failed. Try again.'
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
				<a class="btn" href="/projects/new">New project</a>
			</div>
		</div>

		{#if data.flash && flashText[data.flash]}
			<p class="notice">{flashText[data.flash]}</p>
		{/if}

		<!-- One expedition, however many projects. Progress is the sum of every
		     project's verified hours; spending gear does not move it back. -->
		<section class="progress">
			<div class="progress-head">
				<p class="section-label">Expedition progress</p>
				<p class="progress-figure">
					<strong>{data.progress.hours_earned}</strong> / {data.progress.hours_target}h
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
					Expedition complete — all {data.progress.hours_target} hours verified.
				{:else}
					{data.progress.hours_remaining}h left to reach Dublin. Hours from every project
					count towards the same journey.
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
				<span class="k">verified</span>
			</div>
			<div class="stat-big">
				<span class="n">{data.balance.hours_spent}h</span>
				<span class="k">spent</span>
			</div>
		</div>

		<div class="grid-2">
			<section>
				<p class="section-label">Hackatime</p>
				<div class="panel">
					{#if data.hackatime.connected}
						<p class="row-title">Connected</p>
						<p class="hint">
							Reviewers can see your tracked coding time as evidence. Hackatime never awards
							hours on its own.
						</p>
						<p style="margin-top:1rem">
							<a class="btn btn-outline" href="/auth/hackatime">Reconnect</a>
						</p>
					{:else}
						<p class="row-title">Not connected</p>
						<p class="hint">
							Connect Hackatime so reviewers can see the coding time behind your checkpoints.
						</p>
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
						Every approved checkpoint adds to your ledger. Nothing is ever removed unless you
						spend it.
					</p>
					<p style="margin-top:1rem">
						<a class="btn btn-outline" href="/your-hours">See the ledger</a>
					</p>
				</div>
			</section>

			<section>
				<p class="section-label">Submit to Hack Club</p>
				<div class="panel">
					<p class="hint">
						Separate from checkpoints — send a finished project to Hack Club's own review and
						reward pipeline. Doesn't touch your Expedition hours.
					</p>
					<p style="margin-top:1rem">
						<a class="btn btn-outline" href="/submit-to-hackclub">Submit a project</a>
					</p>
				</div>
			</section>
		</div>

		<section style="margin-top:2.5rem">
			<p class="section-label">Projects</p>
			{#if data.projects.length}
				<div class="row-list">
					{#each data.projects as p (p.id)}
						<a class="row" href="/projects/{p.id}">
							<span class="row-title">{p.title}</span>
							<span class="row-meta">
								{p.hours?.hours_earned ?? 0}h verified &middot;
								{p.hours?.checkpoints_approved ?? 0} checkpoints &middot;
								{p.hackatime_project ?? 'no Hackatime project'}
							</span>
						</a>
					{/each}
				</div>
			{:else}
				<p class="empty">No projects yet. Start one and log your first checkpoint.</p>
			{/if}
		</section>

		<section style="margin-top:2.5rem">
			<p class="section-label">Recent checkpoints</p>
			{#if data.submissions.length}
				<div class="row-list">
					{#each data.submissions.slice(0, 10) as s (s.id)}
						<div class="row">
							<span class="row-title">{s.projects?.title ?? 'Project'}</span>
							<span class="row-meta">
								{s.hours_requested}h requested · {new Date(s.submitted_at).toLocaleDateString()}
							</span>
							<span class="status status-{s.status}">{s.status.replace('_', ' ')}</span>
						</div>
					{/each}
				</div>
			{:else}
				<p class="empty">No checkpoints submitted yet.</p>
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
</style>
