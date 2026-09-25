<script lang="ts">
	import { TRAVEL_RATE, money } from '$lib/data';

	const polaroids = [
		{ src: '/polaroids/hapenny-bridge.webp', cls: 'p1', tilt: 4 },
		{ src: '/polaroids/dublin-above.webp', cls: 'p2', tilt: -3 },
		{ src: '/polaroids/convention-centre.webp', cls: 'p3', tilt: -5 }
	];
</script>

<section class="section dublin-section" id="dublin">
	<div class="wrap">
		{#each polaroids as p (p.src)}
			<figure class="polaroid {p.cls}" style:--tilt="{p.tilt}deg" aria-hidden="true">
				<img src={p.src} alt="" loading="lazy" />
				<figcaption>Ireland</figcaption>
			</figure>
		{/each}
		<h2 class="headline">Dublin, December 5th</h2>
		<p class="lede">One day of building with a hundred other people.</p>

		<ul class="facts">
			<li class="fact">
				<span class="fact-big">Free</span>
				<span class="fact-small">to attend</span>
			</li>
			<li class="fact">
				<span class="fact-big">Optional</span>
				<span class="fact-small">your hours count either way</span>
			</li>
			<li class="fact fact-grant">
				<span class="fact-big">{money(TRAVEL_RATE)}</span>
				<span class="fact-small">travel grant for every hour you bank</span>
			</li>
		</ul>

		<div class="travel">
			<h3>Getting there</h3>
			<ol class="steps">
				<li><span class="step-n">1</span>Get hours approved</li>
				<li><span class="step-n">2</span>Bank them for Dublin</li>
				<li><span class="step-n">3</span>Your grant goes toward the trip</li>
			</ol>
			<a class="btn" href="/dashboard#travel">Bank hours for Dublin</a>
		</div>
	</div>
</section>

<style>
	.dublin-section {
		/* the homepage hero's open water: plain, so the nav's textured waves
		   read against it instead of melting into the same texture */
		background: linear-gradient(180deg, var(--sea) 0%, var(--sea-deep) 100%);
		color: var(--navy);
		/* first on the page: the nav's 90px wave band hangs over the top */
		padding-top: calc(90px + clamp(1.5rem, 4vw, 3rem));
		/* and the dark sea below crests up 90px into the bottom of this one */
		padding-bottom: calc(90px + clamp(2rem, 5vw, 3.5rem));
	}
	.dublin-section::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: -2px;
		height: 90px;
		background: url('/wave-band-dark.png') repeat-x bottom;
		background-size: auto 100%;
		pointer-events: none;
	}

	.headline {
		font-size: clamp(2.6rem, 8vw, 5rem);
		line-height: 0.98;
		letter-spacing: -0.04em;
		color: var(--navy);
	}
	.lede {
		margin-top: 1rem;
		font-size: 1.15rem;
		color: var(--slate);
	}

	/* ---- the three things that matter ---- */
	.facts {
		list-style: none;
		margin: 2.4rem 0 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
		max-width: 720px;
	}
	.fact {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 1.2rem 1.3rem;
		background: var(--white);
		border: 3px solid var(--navy);
	}
	.fact-big {
		font-size: clamp(1.8rem, 4vw, 2.4rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--navy);
	}
	.fact-small {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--muted);
	}
	.fact-grant {
		border-color: var(--green);
		box-shadow: inset 0 0 0 1px var(--green);
	}
	.fact-grant .fact-big {
		color: var(--green-dark);
	}

	/* ---- getting there ---- */
	.travel {
		margin-top: 2.6rem;
	}
	.travel h3 {
		font-size: 1.3rem;
		color: var(--navy);
	}
	.steps {
		list-style: none;
		margin: 1rem 0 1.6rem;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1.8rem;
	}
	.steps li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-weight: 700;
		color: var(--navy);
	}
	.step-n {
		display: inline-grid;
		place-items: center;
		width: 1.7rem;
		height: 1.7rem;
		flex-shrink: 0;
		background: var(--navy);
		color: var(--white);
		font-size: 0.85rem;
		font-weight: 800;
	}
	.dublin-section .btn {
		background: var(--green);
		border-color: var(--green);
		color: var(--white);
	}

	/* ---- polaroids, in the empty column right of the content ---- */
	.polaroid {
		position: absolute;
		z-index: 0;
		margin: 0;
		width: clamp(160px, 14vw, 200px);
		padding: 10px 10px 0;
		background: #fdfcf8;
		box-shadow:
			0 1px 2px rgba(23, 37, 63, 0.18),
			0 10px 24px rgba(23, 37, 63, 0.22);
		transform: rotate(var(--tilt));
		pointer-events: none;
	}
	.polaroid img {
		display: block;
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
	}
	.polaroid figcaption {
		padding: 0.55rem 0 0.75rem;
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--slate);
	}
	.p1 {
		right: calc(var(--edge-pad) + 1rem);
		top: -1.5rem;
	}
	.p2 {
		right: calc(var(--edge-pad) + 3.5rem);
		top: 15rem;
	}
	/* the left margin only opens up on wide screens */
	.p3 {
		right: calc(100% + 3rem);
		top: 6rem;
		display: none;
	}
	@media (min-width: 1600px) {
		.p3 {
			display: block;
		}
	}
	@media (max-width: 1100px) {
		.polaroid {
			display: none;
		}
	}

	@media (max-width: 700px) {
		.facts {
			grid-template-columns: 1fr;
		}
		.steps {
			flex-direction: column;
		}
	}
</style>
