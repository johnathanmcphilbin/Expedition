<script lang="ts">
	import '$lib/styles/app.css';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const TABS = [
		{ value: 'pending', label: 'Waiting' },
		{ value: 'changes_requested', label: 'Needs changes' },
		{ value: 'rejected', label: 'Rejected' },
		{ value: 'sent', label: 'Sent to Hack Club' }
	] as const;

	const tabHref = (t: string) => `/admin/reviews/incoming?status=${t}`;
	const itemHref = (id: string) => `/admin/reviews/incoming?status=${data.tab}&id=${id}`;

	function ago(iso: string) {
		const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
		if (mins < 60) return `${Math.max(mins, 1)}m ago`;
		const hrs = Math.round(mins / 60);
		if (hrs < 48) return `${hrs}h ago`;
		return `${Math.round(hrs / 24)}d ago`;
	}

	let submitting = $state<string | null>(null);
	let hardware = $state(false);
	$effect(() => {
		hardware = data.detail?.row.hardware ?? false;
	});
</script>

<svelte:head><title>Incoming submissions · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<div>
				<h1 class="app-title">Incoming submissions</h1>
				<p class="hint lead">
					Nothing here has gone to Hack Club yet. Edit anything that needs fixing, then approve to
					send it on and credit their hours.
				</p>
			</div>
			<a class="text-link" href="/admin/reviews">Already sent / older submissions →</a>
		</div>

		<nav class="tabs" aria-label="Filter by status">
			{#each TABS as t (t.value)}
				<a href={tabHref(t.value)} class:active={data.tab === t.value}>
					{t.label}<span class="tab-count">{data.counts[t.value]}</span>
				</a>
			{/each}
		</nav>

		<div class="layout">
			<aside class="queue" aria-label="Submissions">
				{#each data.queue as item (item.id)}
					<a class="qi" class:active={data.detail?.row.id === item.id} href={itemHref(item.id)}>
						<span class="qi-top">
							<span class="qi-name">{item.name}</span>
							<span class="qi-time">{ago(item.createdAt)}</span>
						</span>
						<span class="qi-project">{item.project}</span>
						{#if item.hardware}<span class="tag">Hardware</span>{/if}
					</a>
				{:else}
					<p class="empty">Nothing here.</p>
				{/each}
			</aside>

			<section class="card">
				{#if !data.detail}
					<p class="empty">Pick a submission on the left.</p>
				{:else}
					{@const r = data.detail.row}
					{@const sent = r.status === 'sent'}

					<header class="card-head">
						<div>
							<h2>{r.first_name} {r.last_name}</h2>
							<p class="meta">
								{r.project_name} &middot; submitted {new Date(r.created_at).toLocaleDateString()}
								{#if data.detail.trackedHours !== null}&middot; <strong>{data.detail.trackedHours}h tracked</strong>{/if}
								&middot; {data.detail.balance.hours_earned}h approved so far
							</p>
						</div>
						<div class="links">
							<a class="link-btn" href={r.code_url} target="_blank" rel="noopener noreferrer">Code ↗</a>
							{#if r.playable_url !== r.code_url}
								<a class="link-btn" href={r.playable_url} target="_blank" rel="noopener noreferrer">Demo ↗</a>
							{/if}
						</div>
					</header>

					{#if data.detail.screenshot}
						<a class="shot" href={data.detail.screenshot} target="_blank" rel="noopener noreferrer">
							<img src={data.detail.screenshot} alt="Their screenshot" />
						</a>
					{/if}

					{#if sent}
						<p class="sent-note">
							Sent to Hack Club {r.sent_at ? new Date(r.sent_at).toLocaleString() : ''} with
							<strong>{r.approved_hours}h</strong> approved. Their address and birthday have been cleared
							from here.
							{#if r.airtable_record_id}
								<a href="/admin/reviews?status=all&submission={r.airtable_record_id}">See it in the sent queue →</a>
							{/if}
						</p>
						<p class="description">{r.description}</p>
					{:else}
						<form
							method="POST"
							action="?/save"
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
								<div class="grid-2 tight">
									<div class="field">
										<label for="project">Hackatime project</label>
										{#if data.detail.projects.length}
											<select id="project" name="project" value={r.project_name}>
												{#each data.detail.projects as p (p.name)}
													<option value={p.name}>{p.name} ({p.tracked})</option>
												{/each}
											</select>
										{:else}
											<input id="project" name="project" type="text" value={r.project_name} required />
											<span class="hint">Couldn't reach their Hackatime to list projects.</span>
										{/if}
									</div>
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

							<fieldset class="decision">
								<legend>Your review</legend>
								<div class="field hours">
									<label for="approved_hours">Hours to approve</label>
									<input id="approved_hours" name="approved_hours" type="number" step="0.25" min="0" value={r.approved_hours ?? ''} />
									{#if data.detail.trackedHours !== null}
										<span class="hint">{data.detail.trackedHours}h tracked on this project in Hackatime.</span>
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
				{/if}
			</section>
		</div>
	</div>
</main>

<style>
	.lead {
		margin-top: 0.5rem;
		max-width: 60ch;
	}
	.text-link {
		font-weight: 700;
		color: var(--blue-dark);
	}

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

	.layout {
		display: grid;
		grid-template-columns: 300px minmax(0, 1fr);
		gap: 1.5rem;
		align-items: start;
	}
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
	.tag {
		align-self: flex-start;
		padding: 0.1em 0.45em;
		font-size: 0.68rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border: 1.5px solid var(--orange);
		color: var(--orange-dark);
	}

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
		flex-wrap: wrap;
	}
	.card-head h2 {
		font-size: 1.5rem;
	}
	.meta {
		margin-top: 0.3rem;
		font-size: 0.88rem;
		color: var(--muted);
		font-weight: 600;
	}
	.links {
		display: flex;
		gap: 0.5rem;
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
	.description {
		white-space: pre-wrap;
		line-height: 1.55;
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
	.optional {
		font-weight: 500;
		color: var(--muted);
		font-size: 0.85em;
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
	.actions {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
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
	.error {
		color: var(--red);
		font-weight: 600;
		margin-bottom: 0.8rem;
	}
	.saved {
		color: var(--green-dark);
		font-weight: 700;
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
	}
</style>
