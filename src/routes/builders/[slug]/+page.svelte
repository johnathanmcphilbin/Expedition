<script lang="ts">
	import { page } from '$app/state';
	import { builders, checkpoints } from '$lib/data';
	import Checkpoint from '$lib/components/Checkpoint.svelte';
	import Footer from '$lib/components/Footer.svelte';

	let builder = $derived(builders.find((b) => b.slug === page.params.slug));
	let ownCheckpoints = $derived(
		[...checkpoints]
			.filter((c) => c.builderSlug === page.params.slug)
			.sort((a, b) => (a.date > b.date ? 1 : -1))
	);
	let totalHours = $derived(builder ? builder.projects.reduce((sum, p) => sum + p.hours, 0) : 0);
</script>

<svelte:head>
	<title>{builder ? `${builder.name}'s Expedition` : 'Not found'} · Expedition</title>
</svelte:head>

<main>
	{#if builder}
		<section class="section">
			<div class="wrap">
				<h1>{builder.name}'s expedition</h1>
				<p class="lede place">
					{builder.from}{builder.to ? ` → ${builder.to}` : ''}
				</p>

				<div class="totals">
					<span class="total-hours">{totalHours.toFixed(1)}h</span>
					<span class="total-meta">
						across {builder.projects.length} projects · {ownCheckpoints.length} checkpoints
					</span>
				</div>

				<div class="projects">
					{#each builder.projects as p (p.id)}
						<div class="project">
							<span class="project-name">{p.name}</span>
							<span class="project-hours">{p.hours}h</span>
						</div>
					{/each}
					<div class="project project-total">
						<span class="project-name">Total</span>
						<span class="project-hours">{totalHours.toFixed(1)}h</span>
					</div>
				</div>

				<h2 class="journey-heading">The journey</h2>
				<div class="grid">
					{#each ownCheckpoints as c (c.number)}
						<Checkpoint {c} />
					{/each}
				</div>
			</div>
		</section>
	{:else}
		<section class="section">
			<div class="wrap">
				<h1>Nobody here.</h1>
				<p class="lede">No builder at that trailhead.</p>
			</div>
		</section>
	{/if}
</main>
<Footer />

<style>
	.place {
		margin-top: 0.7rem;
		font-weight: 700;
		color: var(--slate);
	}

	.totals {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		margin: 1.5rem 0 2rem;
		flex-wrap: wrap;
	}
	.total-hours {
		font-size: clamp(2.4rem, 5vw, 3.4rem);
		font-weight: 800;
		line-height: 1;
		letter-spacing: -0.03em;
		color: var(--green-dark);
	}
	.total-meta {
		font-weight: 700;
		color: var(--muted);
	}

	.projects {
		max-width: 460px;
		border-top: 2px solid var(--rule);
		margin-bottom: 4rem;
	}
	.project {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 0;
		border-bottom: 2px solid var(--rule);
		font-size: 1rem;
	}
	.project-name {
		font-weight: 600;
		color: var(--slate);
	}
	.project-hours {
		font-weight: 700;
		color: var(--muted);
	}
	.project-total .project-name,
	.project-total .project-hours {
		color: var(--navy);
		font-weight: 800;
	}

	.journey-heading {
		margin-bottom: 2rem;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1.5rem;
	}
</style>
