<script lang="ts">
	import '$lib/styles/app.css';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const FILTERS = [
		{ value: 'pending', label: 'Pending' },
		{ value: 'changes_requested', label: 'Needs changes' },
		{ value: 'approved', label: 'Approved' },
		{ value: 'rejected', label: 'Rejected' },
		{ value: 'all', label: 'All' }
	] as const;

	function queueHref(submissionId: string) {
		const p = new URLSearchParams();
		p.set('status', data.filter);
		if (data.search) p.set('q', data.search);
		p.set('submission', submissionId);
		return `/admin/reviews?${p}`;
	}
	function filterHref(status: string) {
		const p = new URLSearchParams();
		p.set('status', status);
		if (data.search) p.set('q', data.search);
		return `/admin/reviews?${p}`;
	}

	let submitting = $state<string | null>(null);
	// Seeded from the loaded suggestion, then kept in sync as the selection
	// changes — set from the effect only, never read here.
	let selectedProject = $state('');
	$effect(() => {
		selectedProject = data.detail?.suggestedProject ?? '';
	});
</script>

<svelte:head><title>Review queue · Expedition</title></svelte:head>

<main class="app-page review-page">
	<div class="wrap">
		<div class="app-head">
			<h1 class="app-title">Review queue</h1>
			<form method="GET" class="search-form">
				<input type="hidden" name="status" value={data.filter} />
				<input type="search" name="q" placeholder="Search participant or project" value={data.search} />
				<button class="btn btn-outline" type="submit">Search</button>
			</form>
		</div>

		{#if data.syncError}
			<p class="notice error">
				Couldn't sync from Hack Club's Airtable: {data.syncError}. Showing whatever was cached
				before. Check <code>AIRTABLE_API_KEY</code> is set.
			</p>
		{/if}

		<nav class="filters">
			{#each FILTERS as f (f.value)}
				<a href={filterHref(f.value)} class:active={data.filter === f.value}>{f.label}</a>
			{/each}
		</nav>

		<div class="review-layout">
			<!-- ---------- queue ---------- -->
			<aside class="queue">
				{#if data.queue.length}
					{#each data.queue as item (item.airtableRecordId)}
						<a
							class="queue-item"
							class:active={data.detail?.submission.airtable_record_id === item.airtableRecordId}
							href={queueHref(item.airtableRecordId)}>
							<span class="qi-name">{item.participant}</span>
							<span class="qi-project">{item.project ?? 'no project named'}</span>
							<span class="status status-{item.status}">{item.status.replace('_', ' ')}</span>
						</a>
					{/each}
				{:else}
					<p class="empty">Nothing here.</p>
				{/if}
			</aside>

			<!-- ---------- submission detail ---------- -->
			<section class="detail">
				{#if !data.detail}
					<p class="empty">Select a submission from the queue.</p>
				{:else}
					{@const s = data.detail.submission}
					<div class="detail-head">
						<h2>
							{[s.first_name, s.last_name].filter(Boolean).join(' ') || s.email || 'Unknown'}
						</h2>
						{#if !s.user_id}
							<p class="hint error">
								No matching Expedition account — their Hackatime ID ({s.hackatime_user_id ??
									'none given'}) didn't match a connected account.
							</p>
						{/if}
					</div>

					<dl class="fields">
						{#if s.github_username}
							<dt>GitHub</dt>
							<dd>{s.github_username}</dd>
						{/if}
						{#if s.code_url}
							<dt>Code</dt>
							<dd><a href={s.code_url} target="_blank" rel="noopener noreferrer">{s.code_url}</a></dd>
						{/if}
						{#if s.playable_url}
							<dt>Demo</dt>
							<dd>
								<a href={s.playable_url} target="_blank" rel="noopener noreferrer">{s.playable_url}</a
								>
							</dd>
						{/if}
						{#if s.project_names_raw}
							<dt>Claimed project(s)</dt>
							<dd>{s.project_names_raw}</dd>
						{/if}
						{#if s.airtable_created_at}
							<dt>Submitted</dt>
							<dd>{new Date(s.airtable_created_at).toLocaleString()}</dd>
						{/if}
						{#if s.airtable_status}
							<dt>Hack Club status</dt>
							<dd>{s.airtable_status}</dd>
						{/if}
					</dl>

					{#if s.description}
						<div class="description">
							<p class="section-label">Description</p>
							<p>{s.description}</p>
						</div>
					{/if}

					{#if data.detail.balance}
						<p class="hint" style="margin-top:1rem">
							Current balance: <strong>{data.detail.balance.hours_available}h</strong> available
							&middot; {data.detail.balance.hours_earned}h approved all-time.
						</p>
					{/if}
				{/if}
			</section>

			<!-- ---------- review controls ---------- -->
			<aside class="controls">
				{#if data.detail}
					{@const s = data.detail.submission}
					{#if !s.user_id}
						<p class="hint">Can't review this — no matching Expedition account.</p>
					{:else if !data.detail.hackatimeProjects.length}
						<p class="empty error">
							Couldn't reach Hackatime for this participant. Nothing to review against — try
							again shortly.
						</p>
					{:else}
						<form
							method="POST"
							action="?/save"
							use:enhance={({ submitter }) => {
								submitting = submitter?.getAttribute('value') ?? 'save';
								return async ({ update }) => {
									await update();
									submitting = null;
								};
							}}>
							<input type="hidden" name="airtable_record_id" value={s.airtable_record_id} />
							<input type="hidden" name="user_id" value={s.user_id} />

							<div class="field">
								<label for="hackatime_project">Hackatime project</label>
								<select id="hackatime_project" name="hackatime_project" bind:value={selectedProject}>
									<option value="">Choose&hellip;</option>
									{#each data.detail.hackatimeProjects as p (p.name)}
										<option value={p.name}>{p.name} — {p.tracked} tracked</option>
									{/each}
								</select>
							</div>

							<div class="field">
								<label for="approved_hours">
									Approved Expedition hours
									{#if data.detail.review?.submitted_hours != null}
										<span class="optional">
											({data.detail.review.submitted_hours}h submitted)
										</span>
									{/if}
								</label>
								<input
									id="approved_hours"
									name="approved_hours"
									type="number"
									step="0.25"
									min="0"
									value={data.detail.review?.approved_hours ?? ''} />
							</div>

							<div class="field">
								<label for="participant_feedback">Feedback to participant</label>
								<textarea
									id="participant_feedback"
									name="participant_feedback"
									rows="3"
									maxlength="4000">{data.detail.review?.participant_feedback ?? ''}</textarea>
							</div>

							<div class="field">
								<label for="internal_notes">Internal notes <span class="optional">not shown to them</span></label>
								<textarea id="internal_notes" name="internal_notes" rows="3" maxlength="4000"
									>{data.detail.review?.internal_notes ?? ''}</textarea>
							</div>

							{#if form?.message}
								<p class="hint error">{form.message}</p>
							{/if}

							<div class="decision-buttons">
								<button
									class="btn btn-outline"
									type="submit"
									name="status"
									value="pending"
									disabled={!!submitting}>
									Save Review
								</button>
								<button
									class="btn"
									type="submit"
									name="status"
									value="approved"
									disabled={!!submitting}>
									Approve
								</button>
								<button
									class="btn btn-outline"
									type="submit"
									name="status"
									value="changes_requested"
									disabled={!!submitting}>
									Needs Changes
								</button>
								<button
									class="btn btn-outline"
									type="submit"
									name="status"
									value="rejected"
									disabled={!!submitting}>
									Reject
								</button>
							</div>
						</form>
					{/if}
				{/if}
			</aside>
		</div>
	</div>
</main>

<style>
	.search-form {
		display: flex;
		gap: 0.6rem;
	}
	.search-form input[type='search'] {
		min-width: 16rem;
	}

	.filters {
		display: flex;
		gap: 1.4rem;
		margin-bottom: 1.6rem;
		border-bottom: 1.5px solid var(--rule);
		padding-bottom: 0.8rem;
	}
	.filters a {
		text-decoration: none;
		color: var(--muted);
		font-weight: 700;
		font-size: 0.9rem;
	}
	.filters a.active {
		color: var(--navy);
		border-bottom: 2px solid var(--navy);
		padding-bottom: 0.8rem;
		margin-bottom: -0.8rem;
	}

	.review-layout {
		display: grid;
		grid-template-columns: 260px 1fr 320px;
		gap: 1.5rem;
		align-items: start;
	}

	.queue {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: 75vh;
		overflow-y: auto;
	}
	.queue-item {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.7rem 0.8rem;
		border: 1.5px solid var(--rule);
		text-decoration: none;
		color: inherit;
	}
	.queue-item.active {
		border-color: var(--navy);
		background: var(--paper-soft);
	}
	.qi-name {
		font-weight: 800;
		font-size: 0.92rem;
	}
	.qi-project {
		font-size: 0.8rem;
		color: var(--muted);
	}

	.detail,
	.controls {
		border: 2px solid var(--rule);
		border-radius: 0;
		padding: 1.4rem;
		background: var(--white);
	}

	.detail-head h2 {
		font-size: 1.3rem;
		margin-bottom: 0.4rem;
	}

	.fields {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.4rem 1rem;
		margin: 1rem 0;
		font-size: 0.9rem;
	}
	.fields dt {
		color: var(--muted);
		font-weight: 700;
	}
	.fields dd {
		word-break: break-word;
	}

	.description {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1.5px solid var(--rule);
	}
	.description p:not(.section-label) {
		white-space: pre-wrap;
		font-size: 0.92rem;
	}

	.controls .field {
		margin-bottom: 1rem;
	}
	.optional {
		font-weight: 500;
		color: var(--muted);
		font-size: 0.82rem;
	}

	.decision-buttons {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-top: 1.2rem;
	}
	.decision-buttons .btn {
		width: 100%;
	}

	.error {
		color: var(--red);
	}

	@media (max-width: 1100px) {
		.review-layout {
			grid-template-columns: 1fr;
		}
		.queue {
			max-height: 300px;
		}
	}
</style>
