<script lang="ts">
	let { available = 0, claimed = false }: { available?: number; claimed?: boolean } = $props();
	const HOURS = 40;
</script>

<section class="finisher" id="finisher">
	<div class="wrap">
		<p class="lead-in" aria-hidden="true">the trail ends here</p>

		<h2 class="huge">
			40 hours.<br /><span class="green">Expedition<br />finisher.</span>
		</h2>

		<div class="haul">
			<div class="jersey-col">
				<!-- back view is the hero: big 40 + FINISHER -->
				<svg class="jersey back" viewBox="0 0 260 300" aria-label="Expedition finisher jersey, back">
					<path
						class="body"
						d="M78 46 L108 28 C116 44 144 44 152 28 L182 46 L226 70 L206 104 L188 92 L188 274 L72 274 L72 92 L54 104 L34 70 Z"
					/>
					<path class="collar" d="M112 34 C122 44 138 44 148 34" />
					<path class="trim" d="M72 108 H188" />
					<text class="back-num" x="130" y="212" text-anchor="middle">40</text>
					<text class="back-word" x="130" y="248" text-anchor="middle">FINISHER</text>
					<!-- eight checkpoint ticks along the hem -->
					{#each Array(8) as _, i (i)}
						<rect class="tick" x={84 + i * 13} y="262" width="6" height="6" />
					{/each}
				</svg>

				<svg class="jersey front" viewBox="0 0 260 300" aria-label="Expedition finisher jersey, front">
					<path
						class="body"
						d="M78 46 L108 28 C116 44 144 44 152 28 L182 46 L226 70 L206 104 L188 92 L188 274 L72 274 L72 92 L54 104 L34 70 Z"
					/>
					<!-- v-collar, so it reads as a football shirt rather than a tee -->
					<path class="collar" d="M110 32 L130 58 L150 32" />
					<!-- crest, worn left chest -->
					<path class="crest" d="M92 86 H126 V114 C126 127 109 134 109 134 C109 134 92 127 92 114 Z" />
					<path class="crest-mark" d="M99 110 h20 l-3 6 h-14 Z" />
					<path class="crest-mast" d="M109 95 v15" />
					<text class="hc" x="160" y="104" text-anchor="middle">HACK CLUB</text>
				</svg>
			</div>

			<div class="copy-col">
				<p class="also">Mechanical keyboard</p>
				<p class="plus">+</p>
				<p class="hero-item">The Expedition finisher jersey</p>
				<p class="value">$200 value, shipping included</p>

				<p class="not-for-sale">
					Not for sale.<br /><span class="green">You built for it.</span>
				</p>

				{#if claimed}
					<p class="state claimed">Claimed. You finished the Expedition.</p>
				{:else if available >= HOURS}
					<p class="state ready">You have the hours. This one's yours.</p>
				{:else}
					<p class="state short">{HOURS - available} more hours</p>
				{/if}
			</div>
		</div>
	</div>
</section>

<style>
	.finisher {
		background: var(--navy);
		color: var(--paper);
		padding: clamp(4rem, 9vw, 7rem) 0;
	}

	.lead-in {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--green);
		margin-bottom: 1.2rem;
	}

	.huge {
		font-size: clamp(3rem, 11vw, 7.5rem);
		line-height: 0.92;
		letter-spacing: -0.035em;
		color: var(--paper);
	}
	.green {
		color: var(--green);
	}

	.haul {
		margin-top: clamp(2.5rem, 6vw, 4.5rem);
		display: grid;
		grid-template-columns: 1.15fr 0.85fr;
		gap: clamp(2rem, 5vw, 4rem);
		align-items: center;
	}

	.jersey-col {
		display: flex;
		align-items: flex-end;
		gap: 1rem;
	}
	.jersey {
		width: 100%;
		height: auto;
	}
	.jersey.back {
		flex: 1 1 62%;
	}
	.jersey.front {
		flex: 1 1 38%;
		opacity: 0.9;
		transform: translateY(6px);
	}

	.body {
		fill: var(--navy-soft);
		stroke: var(--paper);
		stroke-width: 4;
		stroke-linejoin: round;
	}
	.trim {
		stroke: var(--green);
		stroke-width: 6;
	}
	.back-num {
		font-family: var(--font-sans);
		font-weight: 800;
		font-size: 96px;
		letter-spacing: -0.04em;
		fill: var(--paper);
	}
	.back-word {
		font-family: var(--font-sans);
		font-weight: 800;
		font-size: 22px;
		letter-spacing: 0.22em;
		fill: var(--green);
	}
	.tick {
		fill: var(--green);
		opacity: 0.8;
	}
	.crest {
		fill: none;
		stroke: var(--green);
		stroke-width: 4;
		stroke-linejoin: round;
	}
	.crest-mark {
		fill: var(--green);
	}
	.crest-mast {
		stroke: var(--green);
		stroke-width: 3;
		stroke-linecap: round;
	}
	.hc {
		font-family: var(--font-sans);
		font-weight: 800;
		font-size: 9px;
		letter-spacing: 0.08em;
		fill: rgba(246, 241, 227, 0.5);
	}
	.collar {
		fill: none;
		stroke: var(--green);
		stroke-width: 4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* the jersey drifts a touch independently of the rest */
	@media (prefers-reduced-motion: no-preference) {
		.jersey.back {
			animation: sway 7s ease-in-out infinite;
		}
		.jersey.front {
			animation: sway 9s ease-in-out infinite reverse;
		}
		@keyframes sway {
			0%, 100% { transform: translateY(0) rotate(0deg); }
			50% { transform: translateY(-8px) rotate(-0.8deg); }
		}
	}

	.also {
		font-size: 1.2rem;
		font-weight: 700;
		color: rgba(246, 241, 227, 0.75);
	}
	.plus {
		font-size: 1.4rem;
		font-weight: 800;
		color: var(--green);
		margin: 0.2rem 0;
	}
	.hero-item {
		font-size: clamp(1.5rem, 3.2vw, 2.2rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1.05;
		color: var(--paper);
	}
	.value {
		margin-top: 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.9rem;
		color: rgba(246, 241, 227, 0.6);
	}

	.not-for-sale {
		margin-top: 2.2rem;
		font-size: clamp(1.6rem, 3.6vw, 2.4rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1.05;
		color: var(--paper);
	}

	.state {
		margin-top: 1.6rem;
		font-size: 0.85rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.state.short {
		color: rgba(246, 241, 227, 0.55);
	}
	.state.ready,
	.state.claimed {
		color: var(--green);
	}

	@media (max-width: 820px) {
		.haul {
			grid-template-columns: 1fr;
		}
		.jersey-col {
			max-width: 420px;
		}
	}
</style>
