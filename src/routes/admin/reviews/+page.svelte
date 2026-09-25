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

	const STATUS_LABEL: Record<string, string> = {
		pending: 'Pending',
		in_review: 'Pending',
		changes_requested: 'Needs changes',
		approved: 'Approved',
		rejected: 'Rejected'
	};

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
</script>

<svelte:head><title>Review queue · Expedition</title></svelte:head>

<main class="app-page review-page">
	<div class="wrap">
		<div class="app-head">
			<h1 class="app-title">Review queue</h1>
			<form method="GET" class="search-form">
				<input type="hidden" name="status" value={data.filter} />
				<input type="search" name="q" placeholder="Search name, email or project" value={data.search} aria-label="Search submissions" />
			</form>
		</div>

		{#if data.syncError}
			<p class="sync-error">
				Couldn't refresh from Airtable, so this may be out of date. <span class="hint">({data.syncError})</span>
			</p>
		{/if}

		<nav class="tabs" aria-label="Filter by status">
			{#each FILTERS as f (f.value)}
				<a href={filterHref(f.value)} class:active={data.filter === f.value}>
					{f.label}<span class="tab-count">{data.counts[f.value]}</span>
				</a>
			{/each}
		</nav>

		<div class="layout">
			<!-- ---------- queue ---------- -->
			<aside class="queue" aria-label="Submissions">
				{#each data.queue as item (item.airtableRecordId)}
					<a
						class="qi"
						class:active={data.detail?.submission.airtable_record_id === item.airtableRecordId}
						href={queueHref(item.airtableRecordId)}>
						<span class="qi-top">
							<span class="qi-name">{item.participant}</span>
							<span class="qi-time">{ago(item.submittedAt)}</span>
						</span>
						<span class="qi-project">{item.project ?? 'No project named'}</span>
						<span class="qi-tags">
							<span class="tag tag-{item.status}">{STATUS_LABEL[item.status]}</span>
							{#if !item.matched}<span class="tag tag-warn">No account</span>{/if}
						</span>
					</a>
				{:else}
					<p class="empty">{data.search ? `Nothing matches “${data.search}”.` : 'Nothing here.'}</p>
				{/each}
			</aside>

			<!-- ---------- the submission and its review ---------- -->
			<section class="card">
				{#if !data.detail}
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

					<div class="links">
						{#if s.code_url}<a class="link-btn" href={s.code_url} target="_blank" rel="noopener noreferrer">Code ↗</a>{/if}
						{#if s.playable_url}<a class="link-btn" href={s.playable_url} target="_blank" rel="noopener noreferrer">Demo ↗</a>{/if}
						{#if s.github_username}<span class="link-plain">GitHub: {s.github_username}</span>{/if}
					</div>

					{#if s.description}
						<p class="description">{s.description}</p>
					{/if}

					<div class="review">
						{#if !s.user_id}
							<p class="row-title">Link this submission to an account</p>
							<p class="hint">
								It didn't match anyone automatically. Find the participant, link them, then review as normal.
							</p>
							<form method="GET" class="link-search">
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
										<input id="approved_hours" name="approved_hours" type="number" step="0.25" min="0" value={data.detail.review?.approved_hours ?? ''} />
										<span class="hint">
											{#if data.detail.review?.submitted_hours != null}{data.detail.review.submitted_hours}h tracked on this project.{/if}
											{#if data.detail.balance}They've had {data.detail.balance.hours_earned}h approved so far.{/if}
										</span>
									</div>
								</div>

								<div class="field">
									<label for="participant_feedback">Feedback to them</label>
									<textarea id="participant_feedback" name="participant_feedback" rows="3" maxlength="4000">{data.detail.review?.participant_feedback ?? ''}</textarea>
								</div>
								<div class="field">
									<label for="internal_notes">Private notes <span class="optional">only organisers see these</span></label>
									<textarea id="internal_notes" name="internal_notes" rows="2" maxlength="4000">{data.detail.review?.internal_notes ?? ''}</textarea>
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
									<button class="save-draft" type="submit" name="status" value="pending" disabled={!!submitting}>
										{submitting === 'pending' ? 'Saving…' : 'Save draft'}
									</button>
								</div>
							</form>
						{/if}
					</div>
				{/if}
			</section>
		</div>
	</div>
</main>

<style>
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
