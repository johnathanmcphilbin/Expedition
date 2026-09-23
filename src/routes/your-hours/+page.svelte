<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const label: Record<string, string> = {
		checkpoint_approved: 'Submission approved',
		reward_claimed: 'Reward claimed',
		travel_allocation: 'Travel support',
		manual_adjustment: 'Adjustment'
	};
</script>

<svelte:head><title>Your hours · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head"><h1 class="app-title">Your hours</h1></div>

		<div class="stat-row">
			<div class="stat-big green">
				<span class="n">{data.balance.hours_available}h</span><span class="k">banked</span>
			</div>
			<div class="stat-big">
				<span class="n">{data.balance.hours_earned}h</span><span class="k">approved</span>
			</div>
			<div class="stat-big">
				<span class="n">{data.balance.hours_spent}h</span><span class="k">spent</span>
			</div>
		</div>

		<p class="section-label">Ledger</p>
		{#if data.transactions.length}
			<div class="row-list">
				{#each data.transactions as t (t.id)}
					<div class="row">
						<span class="row-title">{t.amount > 0 ? '+' : ''}{t.amount}h</span>
						<span class="row-meta">{label[t.type] ?? t.type}{t.note ? ` · ${t.note}` : ''}</span>
						<span class="row-meta">{new Date(t.created_at).toLocaleDateString()}</span>
					</div>
				{/each}
			</div>
		{:else}
			<p class="empty">Nothing on the ledger yet. Submit a project to Hack Club and get it reviewed, and it shows up here.</p>
		{/if}

		<p style="margin-top:2.5rem"><a href="/dashboard">← Back to dashboard</a></p>
	</div>
</main>
<Footer />
