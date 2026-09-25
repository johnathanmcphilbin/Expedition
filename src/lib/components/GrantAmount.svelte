<script lang="ts">
	// Grant amounts stay out of the way — a quiet link, revealed on request.
	let { reveal, label = 'see grant amount' }: { reveal: string; label?: string } = $props();
	let open = $state(false);
</script>

{#if open}
	<span class="grant-amount">{reveal}</span>
{:else}
	<button type="button" class="grant-reveal" onclick={() => (open = true)}>{label}</button>
{/if}

<style>
	.grant-reveal,
	.grant-amount {
		font-family: var(--font-sans);
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--muted);
	}
	.grant-reveal {
		background: none;
		border: 0;
		padding: 0;
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}
	.grant-reveal:hover {
		color: var(--navy);
	}
</style>
