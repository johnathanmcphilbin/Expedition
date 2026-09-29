<script lang="ts">
	import '$lib/styles/app.css';
	import { enhance } from '$app/forms';
	import CheckpointTimeline from '$lib/components/CheckpointTimeline.svelte';
	import JustificationFields from '$lib/components/JustificationFields.svelte';
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

	function queueHref(item: { kind: 'hc' | 'new'; key: string }) {
		const p = new URLSearchParams();
		p.set('status', data.filter);
		if (data.search) p.set('q', data.search);
		p.set(item.kind === 'new' ? 'new' : 'submission', item.key);
		return `/admin/reviews?${p}`;
	}
	const isSelected = (item: { kind: string; key: string }) =>
		data.selected?.kind === item.kind && data.selected?.key === item.key;
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
	let hardware = $state(false);
	$effect(() => {
		hardware = data.queuedDetail?.row.hardware ?? false;
	});
</script>

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
				{#each data.queue as item (item.kind + item.key)}
					<a class="qi" class:active={isSelected(item)} href={queueHref(item)}>
						<span class="qi-top">
							<span class="qi-name">{item.participant}</span>
							<span class="qi-time">{ago(item.submittedAt)}</span>
						</span>
						<span class="qi-project">{item.project ?? 'No project named'}</span>
						<span class="qi-tags">
							<span class="tag tag-{item.status}">{STATUS_LABEL[item.status]}</span>
							{#if item.kind === 'new'}<span class="tag tag-new">Not sent yet</span>{/if}
							{#if item.hardware}<span class="tag tag-warn">Hardware</span>{/if}
							{#if !item.matched}<span class="tag tag-warn">No account</span>{/if}
						</span>
					</a>
				{:else}
					<p class="empty">{data.search ? `Nothing matches “${data.search}”.` : 'Nothing here.'}</p>
				{/each}
			</aside>

			<!-- ---------- the submission and its review ---------- -->
			<section class="card">
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
							<a class="link-btn" href={r.code_url} target="_blank" rel="noopener noreferrer">Code ↗</a>
							{#if r.playable_url !== r.code_url}
								<a class="link-btn" href={r.playable_url} target="_blank" rel="noopener noreferrer">Demo ↗</a>
							{/if}
						</div>
					</header>

					{#if data.queuedDetail.screenshot}
						<a class="shot" href={data.queuedDetail.screenshot} target="_blank" rel="noopener noreferrer">
							<img src={data.queuedDetail.screenshot} alt="Their screenshot" />
						</a>
					{/if}

					<CheckpointTimeline items={data.queuedDetail.checkpoints} unlocked={data.queuedDetail.checkpointsUnlocked} />

					{#if r.status === 'rejected' || r.status === 'changes_requested'}
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
							method="POST"
							action="?/saveNew"
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
								<div class="grid-2 tight">
									<label class="check">
										<input type="checkbox" name="hardware" value="yes" bind:checked={hardware} />
										Hardware project
									</label>
									<div class="field">
										<label for="code_url">Code link</label>
										<input id="code_url" name="code_url" type="url" required value={r.code_url} />
									</div>
									<div class="field">
										<label for="playable_url">Demo link {#if hardware}<span class="optional">optional</span>{/if}</label>
										<input id="playable_url" name="playable_url" type="url" required={!hardware} value={r.playable_url} />
									</div>
								</div>
								<div class="field">
									<label for="description">Description</label>
									<textarea id="description" name="description" rows="4" required minlength="20" maxlength="4000">{r.description}</textarea>
								</div>
							</fieldset>

							<fieldset>
								<legend>Person</legend>
								<div class="grid-2 tight">
									<div class="field"><label for="first_name">First name</label><input id="first_name" name="first_name" type="text" required value={r.first_name} /></div>
									<div class="field"><label for="last_name">Last name</label><input id="last_name" name="last_name" type="text" required value={r.last_name} /></div>
									<div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required value={r.email} /></div>
									<div class="field"><label for="github_username">GitHub</label><input id="github_username" name="github_username" type="text" required value={r.github_username} /></div>
									<div class="field"><label for="birthday">Birthday</label><input id="birthday" name="birthday" type="date" required value={r.birthday ?? ''} /></div>
								</div>
							</fieldset>

							<fieldset>
								<legend>Address</legend>
								<div class="field"><label for="address_line1">Address</label><input id="address_line1" name="address_line1" type="text" required value={r.address_line1 ?? ''} /></div>
								<div class="field"><label for="address_line2">Line 2 <span class="optional">optional</span></label><input id="address_line2" name="address_line2" type="text" value={r.address_line2 ?? ''} /></div>
								<div class="grid-2 tight">
									<div class="field"><label for="city">City</label><input id="city" name="city" type="text" required value={r.city ?? ''} /></div>
									<div class="field"><label for="state">State / province</label><input id="state" name="state" type="text" required value={r.state ?? ''} /></div>
									<div class="field"><label for="zip">Postal code</label><input id="zip" name="zip" type="text" required value={r.zip ?? ''} /></div>
									<div class="field"><label for="country">Country</label><input id="country" name="country" type="text" required value={r.country ?? ''} /></div>
								</div>
							</fieldset>

							<details class="extra">
								<summary>Their feedback for Hack Club</summary>
								<div class="field"><label for="heard_about">How did you hear about this?</label><input id="heard_about" name="heard_about" type="text" value={r.heard_about ?? ''} /></div>
								<div class="field"><label for="doing_well">What are we doing well?</label><textarea id="doing_well" name="doing_well" rows="2">{r.doing_well ?? ''}</textarea></div>
								<div class="field"><label for="improve">How can we improve?</label><textarea id="improve" name="improve" rows="2">{r.improve ?? ''}</textarea></div>
							</details>

							<details class="justify" open>
								<summary>Hack Club justification <span class="optional">sent to Hack Club when you approve</span></summary>
								<JustificationFields fields={data.justificationFields} values={data.queuedDetail.justifications} />
							</details>

							<fieldset class="decision">
								<legend>Your review</legend>
								<div class="field hours">
									<label for="approved_hours">Hours to approve</label>
									<input id="approved_hours" name="approved_hours" type="number" step="0.25" min="0" value={r.approved_hours ?? ''} />
									{#if data.queuedDetail.trackedHours !== null}
										<span class="hint">{data.queuedDetail.trackedHours}h tracked on this project in Hackatime.</span>
									{/if}
								</div>
								<div class="field">
									<label for="participant_feedback">Feedback to them</label>
									<textarea id="participant_feedback" name="participant_feedback" rows="3" maxlength="4000">{r.participant_feedback ?? ''}</textarea>
								</div>
								<div class="field">
									<label for="internal_notes">Private notes <span class="optional">only organisers see these</span></label>
									<textarea id="internal_notes" name="internal_notes" rows="2" maxlength="4000">{r.internal_notes ?? ''}</textarea>
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
									<button class="save-draft" type="submit" name="decision" value="draft" disabled={!!submitting}>
										{submitting === 'draft' ? 'Saving…' : 'Save edits'}
									</button>
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

					<div class="links">
						{#if s.code_url}<a class="link-btn" href={s.code_url} target="_blank" rel="noopener noreferrer">Code ↗</a>{/if}
						{#if s.playable_url}<a class="link-btn" href={s.playable_url} target="_blank" rel="noopener noreferrer">Demo ↗</a>{/if}
						{#if s.github_username}<span class="link-plain">GitHub: {s.github_username}</span>{/if}
					</div>

					{#if s.description}
						<p class="description">{s.description}</p>
					{/if}

					{#if s.user_id}
						<CheckpointTimeline items={data.detail.checkpoints} />
					{/if}

					{#if data.detail.review?.status === 'rejected'}
						<form class="reopen" method="POST" action="?/reopen" use:enhance>
							<input type="hidden" name="review_id" value={data.detail.review.id} />
							<input type="hidden" name="airtable_record_id" value={s.airtable_record_id} />
							<span>Rejected. Changed your mind?</span>
							<button class="btn btn-outline" type="submit">Move back to queue</button>
						</form>
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

					<details class="justify" open>
						<summary>Hack Club justification <span class="optional">saved straight to their Airtable</span></summary>
						{#if data.detail.justifications}
							<form method="POST" action="?/saveJustification" use:enhance={() => async ({ update }) => update({ reset: false })}>
								<input type="hidden" name="airtable_record_id" value={s.airtable_record_id} />
								<JustificationFields fields={data.justificationFields} values={data.detail.justifications} />
								{#if form && 'justMessage' in form && form.justMessage}
									<p class="error">{form.justMessage}</p>
								{:else if form && 'justSaved' in form && form.justSaved}
									<p class="saved">Saved to Hack Club's Airtable.</p>
								{/if}
								<button class="btn btn-outline" type="submit">Save to Hack Club</button>
							</form>
						{:else}
							<p class="error">Couldn't load it from Airtable: {data.detail.justificationsError}</p>
						{/if}
					</details>
				{/if}
			</section>
		</div>
	</div>
</main>

<style>
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
