<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Claim your hours · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head"><h1 class="app-title">Claim your hours</h1></div>

		<div class="stat-row" style="margin-bottom:2rem">
			<div class="stat-big green">
				<span class="n">{data.balance.hours_available}h</span>
				<span class="k">available to claim</span>
			</div>
		</div>

		<p class="hint" style="max-width:60ch; margin-bottom:2rem">
			Fill this in to request gear for your banked hours. A reviewer checks it against your
			ledger and follows up — this doesn't spend anything automatically, so your balance above
			won't move until they do.
		</p>

		<div class="panel embed-panel">
			<iframe
				class="airtable-embed"
				title="Claim your Expedition hours"
				src="https://airtable.com/embed/appGcYrt3CFYab05y/pagB6M1gck9F0Pq3c/form"
				frameborder="0"
				width="100%"
				height="533"
				style="background: transparent;"
			></iframe>
		</div>

		<p style="margin-top:2.5rem"><a href="/your-hours">← Back to your hours</a></p>
	</div>
</main>
<Footer />

<style>
	.embed-panel {
		padding: 0;
		overflow: hidden;
	}
	.airtable-embed {
		display: block;
		width: 100%;
		border: 0;
	}
</style>
