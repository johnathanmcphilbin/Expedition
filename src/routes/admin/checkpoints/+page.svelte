<script lang="ts">
	import '$lib/styles/app.css';
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const TABS = [
		{ value: 'waiting', label: 'Waiting for OK' },
		{ value: 'shown', label: 'On the log' },
		{ value: 'hidden', label: 'Not shown' }
	] as const;
</script>

<svelte:head><title>Shared checkpoints · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<div>
				<h1 class="app-title">Shared checkpoints</h1>
				<p class="hint lead">
					Checkpoints people chose to share. Nothing appears on the public <a href="/log">Expedition log</a>
					until you OK it. Only their first name and project name are shown there.
				</p>
			</div>
		</div>

		<nav class="tabs" aria-label="Filter">
			{#each TABS as t (t.value)}
				<a href="/admin/checkpoints?status={t.value}" class:active={data.tab === t.value}>
					{t.label}<span class="tab-count">{data.counts[t.value]}</span>
				</a>
			{/each}
		</nav>

		{#if data.items.length}
			<ul class="grid">
				{#each data.items as c (c.id)}
					<li class="item">
						{#if c.image_url}
							<a href={c.image_url} target="_blank" rel="noopener noreferrer"><img src={c.image_url} alt="" loading="lazy" /></a>
						{/if}
						<p class="who">{c.owner_name ?? 'Unknown'} · {c.hackatime_project} · #{c.number}</p>
						<p class="text">{c.worked_on}</p>
						{#if c.next_up}<p class="next">Next: {c.next_up}</p>{/if}
						{#if c.video_url}<a class="video" href={c.video_url} target="_blank" rel="noopener noreferrer">Check the video ↗</a>{/if}
						<form method="POST" action="?/moderate" use:enhance class="acts">
							<input type="hidden" name="id" value={c.id} />
							{#if c.visibility !== 'shown'}
								<button class="btn" type="submit" name="to" value="shown">Show on the log</button>
							{/if}
							{#if c.visibility !== 'hidden'}
								<button class="btn btn-outline" type="submit" name="to" value="hidden">Don't show</button>
							{/if}
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty">Nothing here.</p>
		{/if}
	</div>
</main>

<style>
	.lead {
		margin-top: 0.5rem;
		max-width: 62ch;
	}
	.lead a {
		color: var(--navy);
		font-weight: 700;
	}
	.tabs {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-bottom: 1.4rem;
	}
	.tabs a {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.45rem 0.8rem;
		border: 2px solid var(--rule-strong);
		background: var(--white);
		text-decoration: none;
		font-weight: 700;
		font-size: 0.88rem;
		color: var(--slate);
	}
	.tabs a.active {
		border-color: var(--navy);
		background: var(--navy);
		color: var(--white);
	}
	.tab-count {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		opacity: 0.75;
	}
	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
	}
	.item {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 1rem;
		background: var(--white);
		border: 2px solid var(--rule);
	}
	.item img {
		display: block;
		width: 100%;
		max-height: 220px;
		object-fit: cover;
		border: 1px solid var(--rule);
	}
	.who {
		font-weight: 800;
		color: var(--navy);
		font-size: 0.92rem;
	}
	.text {
		white-space: pre-wrap;
		line-height: 1.45;
	}
	.next {
		color: var(--slate);
		font-size: 0.92rem;
	}
	.video {
		font-weight: 700;
		color: var(--navy);
	}
	.acts {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: auto;
		padding-top: 0.6rem;
	}
</style>
