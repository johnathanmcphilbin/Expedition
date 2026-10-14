<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import { EVENT } from '$lib/data';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Join Expedition</title></svelte:head>

<main class="app-page join-page">
	<div class="wrap">
		{#if data.referrer && data.valid}
			<p class="kicker">{data.referrer} invited you</p>
		{/if}
		<h1 class="app-title">Join Expedition</h1>
		<p class="lead">
			Build whatever you want, software or hardware. Track your hours, get them approved, and spend them on real gear or a
			travel grant to our free overnight hackathon at {EVENT.venue} on 5–6 December.
		</p>

		{#if data.enrolled}
			<p class="note">You're already on Expedition. Pick up where you left off.</p>
			<a class="btn" href="/dashboard">Go to your dashboard</a>
		{:else}
			<a class="btn" href="/auth/login?next=%2Fonboarding">Join with Hack Club</a>
			<p class="note">
				Sign in with your Hack Club account (or make one, it's free), then connect Hackatime to start tracking.
			</p>
		{/if}
	</div>
</main>
<Footer />

<style>
	.join-page {
		padding-bottom: calc(90px + 3rem);
	}
	.kicker {
		font-size: 0.8rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.lead {
		max-width: 620px;
		margin: 0.6rem 0 1.6rem;
		font-size: 1.05rem;
		line-height: 1.55;
		color: var(--slate);
	}
	.note {
		margin-top: 0.9rem;
		max-width: 520px;
		color: var(--muted);
	}
</style>
