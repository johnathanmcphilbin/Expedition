<script lang="ts">
	import { checkpoints, builders } from '$lib/data';
	import Checkpoint from '$lib/components/Checkpoint.svelte';
	import CheckpointComposer from '$lib/components/CheckpointComposer.svelte';
	import Community from '$lib/components/Community.svelte';
	import Footer from '$lib/components/Footer.svelte';

	let activeBuilder = $state('everyone');

	const builderNames = ['everyone', ...builders.map((b) => b.name)];

	let filtered = $derived(
		activeBuilder === 'everyone'
			? checkpoints
			: checkpoints.filter((c) => c.builderName === activeBuilder)
	);
	let sorted = $derived([...filtered].sort((a, b) => (a.date < b.date ? 1 : -1)));
</script>

<svelte:head>
	<title>The Library · Expedition</title>
</svelte:head>

<main>
	<section class="section">
		<div class="wrap">
			<h1>See what everyone's finding along the way.</h1>
			<p class="lede">
				Not a leaderboard, nobody's ranked. Just checkpoints, posted every five hours, from wherever
				people happen to be building.
			</p>

			<div class="filters">
				{#each builderNames as name (name)}
					<button
						class="filter"
						class:active={activeBuilder === name}
						onclick={() => (activeBuilder = name)}
					>
						{name.toLowerCase()}
					</button>
				{/each}
			</div>

			<div class="grid">
				{#each sorted as c (c.builderSlug + c.number)}
					<Checkpoint {c} />
				{/each}
			</div>
		</div>
	</section>

	<Community />
	<CheckpointComposer />
</main>
<Footer />

<style>
	h1 {
		max-width: 18ch;
		margin-bottom: 1rem;
	}

	.filters {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin: 2.5rem 0 2.5rem;
	}
	.filter {
		background: transparent;
		border: 2px solid var(--rule-strong);
		border-radius: 0;
		color: var(--slate);
		padding: 0.45em 1em;
		font-family: var(--font-sans);
		font-size: 0.9rem;
		font-weight: 700;
		cursor: pointer;
	}
	.filter:hover {
		border-color: var(--navy);
	}
	.filter.active {
		background: var(--navy);
		border-color: var(--navy);
		color: var(--paper);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1.5rem;
	}
</style>
