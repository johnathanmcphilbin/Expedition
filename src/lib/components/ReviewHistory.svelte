<script lang="ts">
	// Earlier decisions on the same person's same project, newest first.
	type Entry = { at: string; project: string; status: string; hours: number | null; feedback: string | null; reviewer: string | null };
	let { items }: { items: Entry[] } = $props();

	const LABEL: Record<string, string> = {
		approved: 'Approved',
		changes_requested: 'Needs changes',
		rejected: 'Rejected'
	};
</script>

<section class="history">
	<p class="h-label">Past reviews · {items.length}</p>
	{#if items.length}
		<ol>
			{#each items as h, i (i)}
				<li>
					<div class="h-top">
						<span class="h-status h-{h.status}">{LABEL[h.status] ?? h.status}</span>
						<span>{h.project}</span>
						{#if h.status === 'approved' && h.hours !== null}<strong>{h.hours}h</strong>{/if}
						<span class="muted">{new Date(h.at).toLocaleDateString()}{h.reviewer ? ` · ${h.reviewer}` : ''}</span>
					</div>
					{#if h.feedback}<p class="h-feedback">“{h.feedback}”</p>{/if}
				</li>
			{/each}
		</ol>
	{:else}
		<p class="muted">None. This is the first time this project has been reviewed.</p>
	{/if}
</section>

<style>
	.history {
		margin: 1.2rem 0;
	}
	.h-label {
		margin-bottom: 0.5rem;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	li {
		padding: 0.6rem 0.8rem;
		background: var(--white);
		border: 1px solid var(--rule-strong);
		font-size: 0.9rem;
	}
	.h-top {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem 0.7rem;
		color: var(--navy);
	}
	.h-status {
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.h-approved {
		color: #2f7a46;
	}
	.h-changes_requested {
		color: #a34a00;
	}
	.h-rejected {
		color: #9b1c1c;
	}
	.h-feedback {
		margin: 0.3rem 0 0;
		color: var(--slate);
		white-space: pre-wrap;
	}
	.muted {
		color: var(--muted);
	}
</style>
