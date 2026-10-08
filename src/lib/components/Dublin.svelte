<script lang="ts">
	import { TRAVEL_RATE, TRAVEL_CAP_HOURS, EVENT, hoursToQualify, money } from '$lib/data';

	// Worked examples, computed from the real rule so they can't drift from it.
	const examples = [100, 800].map((flight) => {
		const half = flight / 2;
		const uncapped = Math.ceil(half / TRAVEL_RATE);
		return { flight, half, uncapped, hours: hoursToQualify(flight), capped: uncapped > TRAVEL_CAP_HOURS };
	});

	const polaroids = [
		{ src: '/polaroids/hapenny-bridge.webp', cls: 'p1', tilt: 4, caption: 'Ireland' },
		{ src: '/polaroids/dublin-above.webp', cls: 'p2', tilt: -3, caption: 'Ireland' },
		{ src: '/polaroids/convention-centre.webp', cls: 'p3', tilt: -5, caption: 'Ireland' },
		{ src: '/polaroids/galway-market-1.webp', cls: 'p4', tilt: -4, caption: 'Galway Christmas Market' },
		{ src: '/polaroids/galway-market-2.webp', cls: 'p5', tilt: 5, caption: 'Galway Christmas Market' }
	];
</script>

<section class="section dublin-section" id="dublin">
	<div class="wrap">
		{#each polaroids as p (p.src)}
			<figure class="polaroid {p.cls}" style:--tilt="{p.tilt}deg" aria-hidden="true">
				<img src={p.src} alt="" loading="lazy" />
				<figcaption>{p.caption}</figcaption>
			</figure>
		{/each}
		<h2 class="headline">Galway, 5–6 December</h2>
		<p class="lede">
			A free overnight hackathon at <a href={EVENT.mapsUrl} target="_blank" rel="noopener noreferrer">PorterShed, Galway</a>.
			Starts 8am on 5 December, ends 2pm on 6 December.
		</p>

		<div class="travel">
			<h3 class="t-kicker">Travelling to Galway</h3>
			<p class="t-lead">
				Bank your hours at <strong>{money(TRAVEL_RATE)}/hour</strong> towards your trip.
			</p>
			<p class="t-body">
				To qualify, reach enough approved hours to cover <strong>50% of your travel cost</strong>, or
				complete the full <strong>{TRAVEL_CAP_HOURS} hour Expedition</strong>.
			</p>
			<p class="t-cap">{TRAVEL_CAP_HOURS} hours is the maximum requirement.</p>
			<p class="t-body">
				The {TRAVEL_CAP_HOURS} hours count towards your travel grant too: that's {money(TRAVEL_CAP_HOURS * TRAVEL_RATE)}.
				Keep building past {TRAVEL_CAP_HOURS} and every extra approved hour is another {money(TRAVEL_RATE)}.
			</p>
			<p class="t-body">
				<strong>Accommodation</strong> comes out of the same stipend: keep around 7 to 14 hours for it.
				Group accommodation is being sorted, so don't book flights or hotels yet.
				Visa info and invitation letters are being worked on too.
			</p>

			<div class="t-examples">
				<p class="t-ex-k">Example</p>
				{#each examples as e (e.flight)}
					<p class="t-ex">
						{money(e.flight)} travel <span class="arr">→</span> 50% is {money(e.half)}
						<span class="arr">→</span>
						{#if e.capped}
							normally {e.uncapped} hours, but the requirement caps at {TRAVEL_CAP_HOURS}
							<span class="arr">→</span>
						{/if}
						<strong>{e.hours} approved hours qualifies you.</strong>
					</p>
				{/each}
			</div>

			<a class="btn" href="/dashboard#travel">Bank hours for Galway</a>
		</div>

		<div class="past-events">
			<p class="past-k">From past Hack Club hackathons</p>
			<div class="past-photos">
				<img src="/event-1.webp" alt="Builders at a past Hack Club hackathon" loading="lazy" />
				<img src="/event-2.webp" alt="A group of builders at a past Hack Club hackathon" loading="lazy" />
			</div>
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

	/* ---- travelling to Dublin: one plain notice, like a note on the chart ---- */
	.travel {
		margin-top: 2.4rem;
		max-width: 720px;
		padding: clamp(1.3rem, 3vw, 2rem) clamp(1.3rem, 3vw, 2.2rem);
		background: var(--white);
		border: 3px solid var(--navy);
	}
	.t-kicker {
		font-family: var(--font-mono);
		font-size: 0.95rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--navy);
	}
	.t-lead {
		margin-top: 0.8rem;
		font-size: 1.3rem;
		font-weight: 700;
		color: var(--navy);
	}
	.t-body {
		margin-top: 0.8rem;
		font-size: 1.05rem;
		line-height: 1.5;
		color: var(--slate);
		max-width: 56ch;
	}
	.t-body strong,
	.t-lead strong {
		color: var(--navy);
	}
	.t-cap {
		margin: 1.2rem 0 0.4rem;
		padding: 0.55rem 0;
		border-top: 3px solid var(--navy);
		border-bottom: 3px solid var(--navy);
		font-size: clamp(1.25rem, 3vw, 1.6rem);
		font-weight: 800;
		letter-spacing: -0.01em;
		text-transform: uppercase;
		color: var(--navy);
	}
	.t-examples {
		margin: 1.4rem 0 1.6rem;
		padding-left: 1rem;
		border-left: 3px solid var(--green);
	}
	.t-ex-k {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.t-ex {
		margin-top: 0.45rem;
		font-family: var(--font-mono);
		font-size: 0.92rem;
		line-height: 1.55;
		color: var(--slate);
	}
	.t-ex strong {
		color: var(--green-dark);
	}
	.arr {
		color: var(--muted);
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
		width: 180px;
		right: calc(100% + 3rem);
		top: 6rem;
		display: none;
	}
	@media (min-width: 1700px) {
		.p3 {
			display: block;
		}
	}
	/* further right again, out in the page margin, which is only wide enough
	   on big screens */
	.p4,
	.p5 {
		width: 170px;
		left: calc(100% - var(--edge-pad) + 1.5rem);
		display: none;
	}
	.p4 {
		top: 4rem;
	}
	.p5 {
		top: 19rem;
	}
	@media (min-width: 1440px) {
		.p4,
		.p5 {
			display: block;
		}
	}
	@media (max-width: 1100px) {
		.polaroid {
			display: none;
		}
	}

	/* ---- from past hackathons: real evidence, shown at every width ---- */
	.past-events {
		margin-top: 3rem;
		padding-top: 2rem;
		border-top: 2px solid rgba(23, 37, 63, 0.15);
		max-width: 900px;
	}
	.past-k {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--slate);
		margin-bottom: 0.9rem;
	}
	.past-photos {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}
	.past-photos img {
		display: block;
		width: 100%;
		aspect-ratio: 3 / 2;
		object-fit: cover;
		border: 3px solid var(--navy);
	}

	@media (max-width: 700px) {
		.past-photos {
			grid-template-columns: 1fr;
		}
	}
</style>
