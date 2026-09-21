<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let decision = $state<'approved' | 'changes_requested' | 'rejected'>('approved');
	let submitting = $state(false);
</script>

<svelte:head><title>Review · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap" style="max-width:860px">
		<div class="app-head">
			<div>
				<h1 class="app-title">{data.submission.users?.display_name ?? 'Participant'}</h1>
				<p class="hint">{data.submission.projects?.title ?? 'Project'}</p>
			</div>
			<span class="status status-{data.submission.status}">
				{data.submission.status.replace('_', ' ')}
			</span>
		</div>

		{#if form?.message}<p class="error-box">{form.message}</p>{/if}

		{#if data.isOwnSubmission}
			<p class="error-box">
				This is your own submission. You cannot review it, and the database will refuse.
			</p>
		{/if}

		<div class="panel" style="margin-bottom:1.5rem">
			<p class="section-label">What they said</p>
			<p style="white-space:pre-wrap">{data.submission.description}</p>
		</div>

		<div class="grid-2" style="margin-bottom:1.5rem">
			<div class="panel">
				<p class="section-label">Requested</p>
				<p class="row-title">{data.submission.hours_requested} hours</p>
				<p class="hint">
					Submitted {new Date(data.submission.submitted_at).toLocaleString()}
				</p>
				{#if data.balance}
					<p class="hint">Currently banked: {data.balance.hours_available}h</p>
				{/if}
			</div>

			<div class="panel">
				<p class="section-label">Hackatime</p>
				{#if data.tracked}
					<p class="row-title">{data.tracked.time}</p>
					<p class="hint">tracked on “{data.tracked.name}”</p>
				{:else if data.hackatimeProject}
					<p class="row-title">Unavailable</p>
					<p class="hint">Mapped to “{data.hackatimeProject}” but no time could be read.</p>
				{:else}
					<p class="row-title">Not connected</p>
					<p class="hint">No Hackatime project mapped. Judge on the evidence.</p>
				{/if}
			</div>
		</div>

		{#if data.submission.projects?.repo_url || data.submission.projects?.demo_url}
			<div class="panel" style="margin-bottom:1.5rem">
				<p class="section-label">Links</p>
				{#if data.submission.projects?.repo_url}
					<p><a href={data.submission.projects.repo_url} rel="noopener noreferrer nofollow" target="_blank">{data.submission.projects.repo_url}</a></p>
				{/if}
				{#if data.submission.projects?.demo_url}
					<p><a href={data.submission.projects.demo_url} rel="noopener noreferrer nofollow" target="_blank">{data.submission.projects.demo_url}</a></p>
				{/if}
			</div>
		{/if}

		<div class="panel" style="margin-bottom:2rem">
			<p class="section-label">Evidence</p>
			{#if data.evidence.length}
				{#each data.evidence as e (e.id)}
					{#if e.url}
						<img class="evidence" src={e.url} alt={e.filename} />
					{:else}
						<p class="empty">Could not load {e.filename}.</p>
					{/if}
				{/each}
			{:else}
				<p class="empty">No evidence attached.</p>
			{/if}
		</div>

		{#if data.reviews.length}
			<div class="panel" style="margin-bottom:2rem">
				<p class="section-label">Previous decisions</p>
				{#each data.reviews as r (r.id)}
					<p class="row-meta">
						{r.decision.replace('_', ' ')}
						{r.hours_approved ? ` · ${r.hours_approved}h` : ''}
						· {new Date(r.created_at).toLocaleDateString()}
					</p>
					{#if r.feedback}<p style="margin-bottom:0.8rem">{r.feedback}</p>{/if}
				{/each}
			</div>
		{/if}

		{#if data.submission.status === 'approved' || data.submission.status === 'rejected'}
			<p class="notice">This submission is already {data.submission.status}. No further action.</p>
		{:else}
			<form method="POST" onsubmit={() => (submitting = true)}>
				<div class="field">
					<span class="field-label">Decision</span>
					<label class="radio"><input type="radio" name="decision" value="approved" bind:group={decision} /> Approve</label>
					<label class="radio"><input type="radio" name="decision" value="changes_requested" bind:group={decision} /> Request changes</label>
					<label class="radio"><input type="radio" name="decision" value="rejected" bind:group={decision} /> Reject</label>
				</div>

				{#if decision === 'approved'}
					<div class="field">
						<label for="hours_approved">Hours approved</label>
						<input
							id="hours_approved"
							name="hours_approved"
							type="number"
							step="0.25"
							min="0.25"
							max="200"
							value={data.submission.hours_requested}
							required
						/>
						<span class="hint">This is what gets credited to their ledger.</span>
					</div>
				{/if}

				<div class="field">
					<label for="feedback">Feedback</label>
					<textarea id="feedback" name="feedback" maxlength="4000"></textarea>
					<span class="hint">Required unless you're approving.</span>
				</div>

				<button class="btn" type="submit" disabled={submitting || data.isOwnSubmission}>
					{submitting ? 'Recording…' : 'Record decision'}
				</button>
			</form>
		{/if}

		<p style="margin-top:2.5rem"><a href="/admin/reviews">← Back to queue</a></p>
	</div>
</main>
<Footer />

<style>
	.evidence {
		width: 100%;
		border: 2px solid var(--rule);
		border-radius: 10px;
		margin-bottom: 1rem;
	}
	.radio {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
	}
	.radio input {
		width: auto;
	}
</style>
