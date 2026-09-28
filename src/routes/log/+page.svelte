<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Expedition log</title></svelte:head>

<main class="app-page log-page">
	<div class="wrap">
		<h1 class="app-title">Expedition log</h1>
		<p class="hint lead">Checkpoints from builders who chose to share. A new one every 5 hours of building.</p>

		{#if data.entries.length}
			<ul class="log">
				{#each data.entries as e (e.id)}
					<li class="entry">
						{#if e.image_url}<img src={e.image_url} alt="{e.first_name}'s {e.project}" loading="lazy" />{/if}
						<div class="body">
							<p class="who">{e.first_name} <span>· {e.project} · checkpoint {e.number}</span></p>
							<p class="text">{e.worked_on}</p>
							{#if e.next_up}<p class="next">Next: {e.next_up}</p>{/if}
							{#if e.video_url}<a class="video" href={e.video_url} target="_blank" rel="noopener noreferrer nofollow">Watch the video ↗</a>{/if}
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty">Nothing on the log yet. Checkpoints show up here once builders share them.</p>
		{/if}
	</div>
</main>
<Footer />

<style>
	.log-page {
		padding-bottom: calc(90px + 3rem);
	}
	.lead {
		margin: 0.5rem 0 2rem;
		font-size: 1rem;
	}
	.log {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1.2rem;
	}
	.entry {
		display: flex;
		flex-direction: column;
		background: var(--white);
		border: 3px solid var(--navy);
	}
	.entry img {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 10;
		object-fit: cover;
		border-bottom: 3px solid var(--navy);
	}
	.body {
		padding: 1rem 1.1rem 1.2rem;
	}
	.who {
		font-weight: 800;
		color: var(--navy);
	}
	.who span {
		font-weight: 600;
		color: var(--muted);
		font-size: 0.88rem;
	}
	.text {
		margin-top: 0.4rem;
		line-height: 1.5;
		white-space: pre-wrap;
	}
	.next {
		margin-top: 0.4rem;
		font-size: 0.92rem;
		color: var(--slate);
	}
	.video {
		display: inline-block;
		margin-top: 0.5rem;
		font-weight: 700;
		color: var(--navy);
	}
</style>
