<script lang="ts">
	type Item = {
		id: string;
		hackatime_project: string;
		number: number;
		tracked_hours: number;
		worked_on: string;
		next_up: string | null;
		video_url: string | null;
		image_url: string | null;
		created_at: string;
	};
	let { items, unlocked = null }: { items: Item[]; unlocked?: number | null } = $props();
	const multi = $derived(new Set(items.map((i) => i.hackatime_project)).size > 1);
</script>

<section class="cps">
	<p class="cps-k">
		Checkpoints · {items.length} posted{#if unlocked !== null}&nbsp;of {unlocked} unlocked{/if}
	</p>
	{#if items.length}
		<ol>
			{#each items as c (c.id)}
				<li>
					<div class="c-head">
						<strong>#{c.number}</strong>
						{#if multi}<span class="c-proj">{c.hackatime_project}</span>{/if}
						<span class="c-meta">{Math.round(c.tracked_hours * 10) / 10}h tracked · {new Date(c.created_at).toLocaleDateString()}</span>
					</div>
					<div class="c-body">
						{#if c.image_url}
							<a href={c.image_url} target="_blank" rel="noopener noreferrer"><img src={c.image_url} alt="Checkpoint {c.number}" loading="lazy" /></a>
						{/if}
						<div>
							<p>{c.worked_on}</p>
							{#if c.next_up}<p class="c-next">Next: {c.next_up}</p>{/if}
							{#if c.video_url}<a class="c-video" href={c.video_url} target="_blank" rel="noopener noreferrer">Video ↗</a>{/if}
						</div>
					</div>
				</li>
			{/each}
		</ol>
	{:else}
		<p class="none">No checkpoints posted for this project.</p>
	{/if}
</section>

<style>
	.cps {
		margin-top: 1.4rem;
		padding-top: 1.2rem;
		border-top: 2px solid var(--rule);
	}
	.cps-k {
		font-size: 0.78rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--muted);
	}
	ol {
		list-style: none;
		margin: 0.8rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		max-height: 520px;
		overflow-y: auto;
	}
	li {
		padding: 0.7rem 0.8rem;
		border: 2px solid var(--rule);
	}
	.c-head {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
		color: var(--navy);
	}
	.c-proj {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--slate);
	}
	.c-meta {
		font-size: 0.8rem;
		color: var(--muted);
		font-weight: 600;
	}
	.c-body {
		display: flex;
		gap: 0.8rem;
		margin-top: 0.5rem;
		align-items: flex-start;
	}
	.c-body img {
		display: block;
		width: 140px;
		height: 96px;
		object-fit: cover;
		border: 1px solid var(--rule);
	}
	.c-body p {
		font-size: 0.92rem;
		line-height: 1.45;
		white-space: pre-wrap;
	}
	.c-next {
		margin-top: 0.3rem;
		color: var(--slate);
	}
	.c-video {
		display: inline-block;
		margin-top: 0.3rem;
		font-weight: 700;
		font-size: 0.88rem;
		color: var(--navy);
	}
	.none {
		margin-top: 0.5rem;
		font-weight: 600;
		color: var(--orange-dark);
	}
</style>
