<script lang="ts">
	import '$lib/styles/app.css';
	import { enhance } from '$app/forms';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let claiming = $state<string | null>(null);

	const statusLabel: Record<string, string> = {
		requested: 'Requested',
		fulfilled: 'Sent',
		cancelled: 'Cancelled'
	};
</script>

<svelte:head><title>Spend your hours · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<div>
				<h1 class="app-title">Spend your hours</h1>
				<p class="hint">Approved hours only — tracked time doesn't count until it's reviewed.</p>
			</div>
		</div>

		<div class="stat-row" style="margin-bottom:1rem">
			<div class="stat-big green">
				<span class="n">{data.balance.hours_available}h</span>
				<span class="k">available to spend</span>
			</div>
			<div class="stat-big">
				<span class="n">{data.balance.hours_earned}h</span>
				<span class="k">approved all-time</span>
			</div>
			<div class="stat-big">
				<span class="n">{data.balance.hours_spent}h</span>
				<span class="k">already spent</span>
			</div>
		</div>

		{#if form?.success}
			<p class="notice">
				Claimed {form.claimed}. We'll be in touch about getting it to you.
			</p>
		{:else if form?.message}
			<p class="notice error">{form.message}</p>
		{/if}

		<p class="section-label" style="margin-top:2rem">The drops</p>
		<div class="drops">
			{#each data.catalogue as d (d.key)}
				<div class="drop" class:locked={!d.affordable && !d.claimed} class:done={d.claimed}>
					<div class="drop-head">
						<span class="drop-hours">{d.hours}h</span>
						<span class="drop-value">${d.value}</span>
					</div>
					<p class="drop-name">{d.name}</p>
					{#if d.extra}<p class="drop-extra">+ {d.extra}</p>{/if}

					{#if d.claimed}
						<p class="drop-state">Claimed</p>
					{:else if !d.affordable}
						<p class="drop-state">
							{(d.hours - Number(data.balance.hours_available)).toFixed(2).replace(/\.?0+$/, '')}h
							more needed
						</p>
					{:else}
						<form
							method="POST"
							action="?/claim"
							use:enhance={() => {
								claiming = d.key;
								return async ({ update }) => {
									await update();
									claiming = null;
								};
							}}>
							<input type="hidden" name="reward_key" value={d.key} />
							<input
								name="note"
								type="text"
								maxlength="500"
								placeholder="Size, colour, anything we should know" />
							<button class="btn" type="submit" disabled={claiming === d.key}>
								Claim for {d.hours}h
							</button>
						</form>
					{/if}
				</div>
			{/each}
		</div>

		{#if data.claims.length}
			<p class="section-label" style="margin-top:2.5rem">Your claims</p>
			<div class="row-list">
				{#each data.claims as c (c.id)}
					<div class="row">
						<span class="row-title">{c.reward_name}</span>
						<span class="row-meta">
							{c.hours_cost}h &middot; {new Date(c.created_at).toLocaleDateString()}
						</span>
						<span class="row-meta">{statusLabel[c.status] ?? c.status}</span>
					</div>
				{/each}
			</div>
		{/if}

		<p style="margin-top:2.5rem"><a href="/dashboard">← Back to dashboard</a></p>
	</div>
</main>
<Footer />

<style>
	.drops {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
		gap: 1rem;
	}
	.drop {
		border: 1.5px solid var(--navy);
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.drop.locked {
		opacity: 0.55;
	}
	.drop.done {
		background: var(--paper-soft);
	}
	.drop-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--muted);
	}
	.drop-hours {
		font-weight: 700;
		color: var(--navy);
	}
	.drop-name {
		font-weight: 800;
		line-height: 1.2;
	}
	.drop-extra {
		font-size: 0.85rem;
		color: var(--muted);
	}
	.drop-state {
		margin-top: auto;
		padding-top: 0.6rem;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--muted);
	}
	.drop form {
		margin-top: auto;
		padding-top: 0.7rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.drop form input {
		font-size: 0.85rem;
		min-height: 38px;
	}
	.drop .btn {
		width: 100%;
	}
	.error {
		color: var(--red);
	}
</style>
