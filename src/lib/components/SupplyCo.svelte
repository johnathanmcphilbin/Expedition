<script lang="ts">
	import { supplyItems } from '$lib/data';

	const categories = ['ALL', 'BUILD', 'HARDWARE', 'DESK', 'TOOLS', 'WEIRD STUFF'] as const;
	let active = $state<(typeof categories)[number]>('ALL');

	let items = $derived(
		active === 'ALL' ? supplyItems : supplyItems.filter((i) => i.category === active)
	);
</script>

<section class="section" id="supply-co">
	<div class="wrap">
		<h2>Stuff for people who make stuff.</h2>
		<p class="lede">
			The Expedition Supply Co. turns every verified hour into purchasing power, roughly
			$3&ndash;$5 of value per hour depending on the item.
		</p>

		<div class="filters">
			{#each categories as cat (cat)}
				<button class="filter" class:active={active === cat} onclick={() => (active = cat)}>
					{cat.toLowerCase()}
				</button>
			{/each}
		</div>

		<div class="grid">
			{#each items as item (item.id)}
				<article class="item">
					<div class="thumb" aria-hidden="true"></div>
					<div class="item-body">
						<span class="cat">{item.category.toLowerCase()}</span>
						<h3>{item.name}</h3>
						<p class="blurb">{item.blurb}</p>
						<div class="meta">
							<span class="credits">{item.credits} credits</span>
							<span class="hours">~{item.hoursApprox}h</span>
						</div>
					</div>
				</article>
			{/each}
		</div>
	</div>
</section>

<style>
	.filters {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin: 2.5rem 0 2rem;
	}
	.filter {
		background: transparent;
		border: 2px solid var(--rule-strong);
		border-radius: 999px;
		color: var(--slate);
		padding: 0.45em 1em;
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
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 1.5rem;
	}

	.item {
		background: var(--white);
		border: 2px solid var(--rule);
		border-radius: 14px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.thumb {
		aspect-ratio: 16 / 10;
		background: var(--paper-soft);
		border-bottom: 2px solid var(--rule);
	}

	.item-body {
		padding: 1.1rem 1.2rem 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		flex-grow: 1;
	}

	.cat {
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--orange);
	}

	.blurb {
		font-size: 0.95rem;
		color: var(--muted);
		line-height: 1.45;
		flex-grow: 1;
	}

	.meta {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		border-top: 2px solid var(--rule);
		padding-top: 0.7rem;
		margin-top: 0.4rem;
		font-size: 0.92rem;
		font-weight: 700;
	}
	.credits {
		color: var(--navy);
	}
	.hours {
		color: var(--muted);
	}
</style>
