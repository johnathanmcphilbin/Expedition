<script lang="ts">
	import type { Checkpoint } from '$lib/types';

	let { c }: { c: Checkpoint } = $props();

	const accents = ['var(--green)', 'var(--blue)', 'var(--orange)', 'var(--green-dark)', 'var(--purple)'];
	let accent = $derived(accents[c.number % accents.length]);
</script>

<article class="checkpoint" style:--accent={accent}>
	<div class="media" aria-hidden="true">
		{#if c.media === 'video'}
			<span class="play">▶</span>
		{/if}
	</div>

	<div class="body">
		<header class="head">
			<span class="number">Checkpoint {String(c.number).padStart(3, '0')}</span>
			<span class="hours">{c.hours}h</span>
		</header>

		<p class="who">
			<a class="builder" href="/builders/{c.builderSlug}">{c.builderName}</a>
			<span class="project">· {c.projectName}</span>
		</p>

		<p class="text">{c.text}</p>

		{#if c.next}
			<p class="next">Next: {c.next}</p>
		{/if}

		<footer class="foot">
			{#if c.location}<span>{c.location}</span>{/if}
			<span>{c.date}</span>
		</footer>
	</div>
</article>

<style>
	.checkpoint {
		background: var(--white);
		border: 2px solid var(--rule);
		border-radius: 0;
		overflow: hidden;
		break-inside: avoid;
		display: flex;
		flex-direction: column;
	}

	.media {
		position: relative;
		aspect-ratio: 16 / 10;
		background: var(--paper-soft);
		border-bottom: 2px solid var(--rule);
	}
	.play {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.3rem;
		color: var(--muted);
	}

	.body {
		padding: 1.1rem 1.2rem 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: 0.82rem;
		font-weight: 700;
	}
	.number {
		color: var(--accent);
	}
	.hours {
		color: var(--muted);
	}

	.who {
		font-size: 0.98rem;
		font-weight: 700;
		color: var(--navy);
	}
	.builder {
		text-decoration: none;
		color: var(--navy);
		text-decoration: underline;
		text-decoration-thickness: 2px;
		text-underline-offset: 3px;
		text-decoration-color: var(--rule-strong);
	}
	.builder:hover {
		text-decoration-color: var(--accent);
	}
	.project {
		color: var(--muted);
		font-weight: 500;
	}

	.text {
		font-size: 0.97rem;
		color: var(--slate);
		line-height: 1.5;
	}

	.next {
		font-size: 0.9rem;
		color: var(--muted);
	}

	.foot {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--muted);
		border-top: 2px solid var(--rule);
		padding-top: 0.6rem;
		margin-top: 0.2rem;
	}
</style>
