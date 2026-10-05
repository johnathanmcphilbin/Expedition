<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// only http(s) links get rendered as links
	const safe = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : null);
</script>

<svelte:head><title>Expedition library</title></svelte:head>

<main class="app-page library-page">
	<div class="wrap">
		<h1 class="app-title">Library</h1>
		<p class="hint lead">Projects Expedition builders have shipped and chosen to share, plus checkpoints from along the way.</p>

		<h2 class="lib-h">Shipped projects</h2>
		{#if data.projects.length}
			<ul class="lib-grid">
				{#each data.projects as p (p.id)}
					<li class="lib-card">
						{#if p.image_url}<img src={p.image_url} alt="{p.project} by {p.first_name}" loading="lazy" />{/if}
						<div class="body">
							<p class="who">
								{p.project}
								<span>· by {p.first_name}{p.hardware ? ' · hardware' : ''}</span>
							</p>
							<p class="text">{p.description}</p>
							<p class="links">
								{#if safe(p.playable_url)}<a href={safe(p.playable_url)} target="_blank" rel="noopener noreferrer nofollow">Try it ↗</a>{/if}
								{#if safe(p.code_url)}<a href={safe(p.code_url)} target="_blank" rel="noopener noreferrer nofollow">Code ↗</a>{/if}
							</p>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty">No projects in the library yet. They show up once they're approved.</p>
		{/if}

		<h2 class="lib-h">Checkpoints</h2>
		{#if data.checkpoints.length}
			<ul class="lib-grid">
				{#each data.checkpoints as e (e.id)}
					<li class="lib-card">
						{#if e.image_url}<img src={e.image_url} alt="{e.first_name}'s {e.project}" loading="lazy" />{/if}
						<div class="body">
							<p class="who">{e.project} <span>· {e.first_name} · checkpoint {e.number}</span></p>
							<p class="text">{e.worked_on}</p>
							{#if safe(e.video_url)}<p class="links"><a href={safe(e.video_url)} target="_blank" rel="noopener noreferrer nofollow">Watch the video ↗</a></p>{/if}
						</div>
					</li>
				{/each}
			</ul>
			<p class="more"><a href="/log">See the whole Expedition log →</a></p>
		{:else}
			<p class="empty">No shared checkpoints yet.</p>
		{/if}
	</div>
</main>
<Footer />

<style>
	.library-page {
		padding-bottom: calc(90px + 3rem);
	}
	.lead {
		margin: 0.5rem 0 2rem;
		font-size: 1rem;
	}
	.lib-h {
		margin: 2rem 0 1rem;
		font-size: 1.3rem;
		font-weight: 800;
		color: var(--navy);
	}
	.lib-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1.2rem;
	}
	.lib-card {
		display: flex;
		flex-direction: column;
		background: var(--white);
		border: 3px solid var(--navy);
	}
	.lib-card img {
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
		overflow-wrap: anywhere;
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
		overflow-wrap: anywhere;
	}
	.links {
		display: flex;
		gap: 1rem;
		margin-top: 0.6rem;
	}
	.links a,
	.more a {
		font-weight: 700;
		color: var(--navy);
	}
	.more {
		margin-top: 1.2rem;
	}
</style>
