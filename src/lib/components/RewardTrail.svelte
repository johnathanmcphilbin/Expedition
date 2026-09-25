<script lang="ts">
	import { onMount } from 'svelte';
	import { drops } from '$lib/data';
	import type { Drop } from '$lib/types';

	let {
		/** verified hours built. Wire to real data when it exists. */
		hoursBuilt = $bindable(17),
		/** hours already spent on claimed drops */
		claimed = $bindable(new Set<number>()),
		name = ''
	}: { hoursBuilt?: number; claimed?: Set<number>; name?: string } = $props();

	let spent = $derived([...claimed].reduce((a, b) => a + b, 0));
	let available = $derived(hoursBuilt - spent);

	// the 40h drop is its own destination section, not a bend on the route
	const trailDrops = drops.filter((d) => !d.finisher);
	let claimable = $derived(drops.filter((d) => !claimed.has(d.hours) && available >= d.hours));
	let nextUp = $derived(drops.find((d) => !claimed.has(d.hours) && available < d.hours) ?? null);

	function statusOf(d: Drop) {
		if (claimed.has(d.hours)) return 'claimed';
		return available >= d.hours ? 'available' : 'short';
	}

	// ---- claim flow -------------------------------------------------------
	// This trail is a preview (drag the slider below to see any hour count) —
	// it was never wired to a real balance. There is no live way to redeem
	// hours for gear yet, so the confirm dialog says exactly that rather than
	// faking a success state.
	let pending = $state<Drop | null>(null);
	let dialog: HTMLDialogElement;

	$effect(() => {
		if (pending) dialog?.showModal();
		else dialog?.close();
	});

	// ---- the winding route ------------------------------------------------
	// Geometry is computed in real pixels off the measured width, so the drawn
	// curve and the DOM markers can never drift apart.
	let routeEl: HTMLDivElement;
	let W = $state(1100);

	let narrow = $derived(W < 760);
	let amp = $derived(narrow ? 0.2 : 0.15); // how far the route sweeps toward each edge
	let seg = $derived(narrow ? 300 : 370); // vertical distance between bends
	const TOP = 220; // clearance so the first stop doesn't clip at the top
	const TAIL = 240;

	let pts = $derived(
		trailDrops.map((_, i) => ({
			x: i % 2 === 0 ? W * amp : W * (1 - amp),
			y: TOP + i * seg
		}))
	);
	let totalH = $derived(TOP + (trailDrops.length - 1) * seg + TAIL);
	let roadPts = $derived(
		trailDrops.map((_, i) => ({
			x: W / 2,
			y: i === 0 ? TOP / 2 : TOP + (i - 0.5) * seg
		}))
	);

	let routeD = $derived(
		(() => {
			if (!pts.length) return '';
			const k = seg * 0.55;
			let d = `M ${W / 2} 0 C ${W / 2} ${TOP * 0.5}, ${pts[0].x} ${pts[0].y - k}, ${pts[0].x} ${pts[0].y}`;
			for (let i = 1; i < pts.length; i++) {
				const a = pts[i - 1];
				const b = pts[i];
				d += ` C ${a.x} ${a.y + k}, ${b.x} ${b.y - k}, ${b.x} ${b.y}`;
			}
			const last = pts[pts.length - 1];
			d += ` C ${last.x} ${last.y + k}, ${W * 0.62} ${totalH - 90}, ${W * 0.62} ${totalH}`;
			return d;
		})()
	);

	onMount(() => {
		const ro = new ResizeObserver(() => (W = routeEl.clientWidth));
		ro.observe(routeEl);
		W = routeEl.clientWidth;

		return () => {
			ro.disconnect();
		};
	});
</script>

<section class="section trail-section" id="rewards">
	<div class="wrap">
		<h2 class="big">Your hours.<br />Your call.</h2>
		<p class="lede">
			Every hour you build is worth $5 in rewards. Spend your hours on gear now, or keep banking
			them for something bigger.
		</p>
		<p class="scrawl">or keep them for Dublin <span aria-hidden="true">→</span></p>

		<!-- ---------- banked readout ---------- -->
		<div class="bank">
			{#if name}<p class="whose">{name}'s expedition</p>{/if}
			<div class="tallies">
				<div class="tally">
					<span class="tally-n">{hoursBuilt}h</span><span class="tally-k">built</span>
				</div>
				<div class="tally">
					<span class="tally-n">{spent}h</span><span class="tally-k">spent</span>
				</div>
				<div class="tally hero">
					<span class="tally-n">{available}h</span><span class="tally-k">banked</span>
				</div>
			</div>

			<p class="prompt">What are you doing with them?</p>
			<div class="options">
				{#if claimable.length}
					<div class="opt">
						<span class="opt-k">You can claim</span>
						<span class="opt-v">{claimable.map((d) => `${d.hours}h drop`).join(', ')}</span>
					</div>
				{/if}
				{#if nextUp}
					<div class="opt">
						<span class="opt-k">Or keep going</span>
						<span class="opt-v">
							{nextUp.hours - available}h to {nextUp.name.toLowerCase()}
						</span>
					</div>
				{/if}
			</div>
		</div>

		<label class="scrub">
			<span class="scrub-k">Drag to preview hours built</span>
			<input type="range" min="0" max="180" step="1" bind:value={hoursBuilt} />
		</label>
	</div>

	<!-- ---------- the route down the page ---------- -->
	<div class="route-wrap">
		<div class="route" bind:this={routeEl} style:height="{totalH}px">
			<svg class="curve" width={W} height={totalH} viewBox="0 0 {W} {totalH}" aria-hidden="true">
				<path class="lane" d={routeD} />
			</svg>

			<div class="roadmap" aria-hidden="true">
				{#each trailDrops as d, i (d.hours)}
					<img
						class="road-art road-art-{statusOf(d)}"
						src={i % 2 === 0 ? '/rd2.png' : '/rd1.png'}
						alt=""
						style:left="{roadPts[i].x}px"
						style:top="{roadPts[i].y}px"
					/>
				{/each}
			</div>

			{#each trailDrops as d, i (d.hours)}
				{@const status = statusOf(d)}
				{@const p = pts[i]}
				{@const side = i % 2 === 0 ? 'left' : 'right'}
				<span
					class="marker marker-{status}"
					style:left="{p.x}px"
					style:top="{p.y}px"
					aria-hidden="true"
				></span>

				<div class="stop stop-{side} stop-{status}" style:top="{p.y}px" style:--bx="{p.x}px">
					<div class="info">
						{#if d.image}<img class="drop-img" src={d.image} alt={d.name} loading="lazy" />{/if}
						<p class="hrs">{d.hours}h</p>
						<p class="name">{d.name}</p>
						{#if d.extra}<p class="extra">+ {d.extra}</p>{/if}
						<p class="value">${d.value} value</p>

						{#if status === 'claimed'}
							<p class="tag claimed">Claimed</p>
						{:else if status === 'available'}
							<button class="claim" onclick={() => (pending = d)}>
								Claim for {d.hours} hours
							</button>
						{:else}
							<p class="tag short">{d.hours - available} more hours</p>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>

	<p class="fineprint wrap">
		Exact models may change depending on country, availability and shipping. Values include
		shipping.
	</p>
</section>

<!-- ---------- claim confirmation ---------- -->
<dialog bind:this={dialog} class="confirm" onclose={() => (pending = null)}>
	{#if pending}
		<p class="c-title">Claim the {pending.hours}h drop?</p>
		<p class="c-item">{pending.name}{pending.extra ? ` + ${pending.extra}` : ''}</p>
		<p class="c-cost">
			This is a preview, not a real checkout — there's no live way to redeem hours for gear yet.
			The numbers here are just for browsing.
		</p>
		<div class="c-actions">
			<button class="keep" onclick={() => (pending = null)}>Close</button>
		</div>
	{/if}
</dialog>

<style>
	.trail-section {
		padding-bottom: 2rem;
	}

	.big {
		font-size: clamp(2.6rem, 7vw, 5rem);
		line-height: 0.98;
	}
	.lede {
		margin-top: 1.2rem;
	}
	.scrawl {
		font-family: var(--font-mono);
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--orange);
		margin-top: 0.7rem;
		transform: rotate(-1.2deg);
		transform-origin: left;
	}

	/* ---------- banked readout ---------- */
	.bank {
		margin-top: 3rem;
		border-top: 3px solid var(--navy);
		padding-top: 1.4rem;
		max-width: 720px;
	}
	.whose {
		font-weight: 800;
		color: var(--muted);
		margin-bottom: 0.8rem;
	}
	.tallies {
		display: flex;
		gap: 2.5rem;
		flex-wrap: wrap;
	}
	.tally {
		display: flex;
		flex-direction: column;
	}
	.tally-n {
		font-size: clamp(1.7rem, 4vw, 2.6rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--muted);
	}
	.tally-k {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.tally.hero .tally-n {
		color: var(--green-dark);
		font-size: clamp(2.4rem, 6vw, 3.6rem);
	}
	.tally.hero .tally-k {
		color: var(--green-dark);
	}

	.claimed-banner {
		margin-top: 1.4rem;
		border-left: 6px solid var(--green);
		padding-left: 1rem;
	}
	.cb-1 {
		font-size: 1.3rem;
		font-weight: 800;
		color: var(--green-dark);
	}
	.cb-2 {
		font-weight: 600;
		color: var(--muted);
	}

	.prompt {
		margin-top: 1.6rem;
		font-size: 1.15rem;
		font-weight: 800;
		color: var(--navy);
	}
	.options {
		margin-top: 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.opt {
		display: flex;
		gap: 0.8rem;
		flex-wrap: wrap;
		align-items: baseline;
		border-bottom: 2px dotted var(--rule);
		padding-bottom: 0.5rem;
	}
	.opt-k {
		font-size: 0.8rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--muted);
		min-width: 9ch;
	}
	.opt-v {
		font-weight: 700;
		color: var(--navy);
	}

	.scrub {
		display: block;
		margin-top: 2rem;
		max-width: 420px;
	}
	.scrub-k {
		display: block;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--muted);
		margin-bottom: 0.4rem;
	}
	.scrub input {
		width: 100%;
		accent-color: var(--green);
	}

	/* ---------- route ---------- */
	.route-wrap {
		max-width: 1160px;
		margin: clamp(3rem, 7vw, 6rem) auto 0;
		padding: 0 var(--edge-pad);
	}
	.route {
		position: relative;
		width: 100%;
	}
	.curve {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
		z-index: 0;
	}
	.lane {
		fill: none;
		stroke: var(--rule-strong);
		stroke-width: 5;
		stroke-linecap: butt;
	}
	.roadmap {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.road-art {
		position: absolute;
		z-index: 1;
		width: clamp(170px, 22vw, 250px);
		height: auto;
		transform: translate(-50%, -50%);
		opacity: 0.92;
	}
	.road-art-short {
		opacity: 0.42;
	}

	.marker {
		position: absolute;
		width: 26px;
		height: 26px;
		border-radius: 0;
		border: 6px solid var(--rule-strong);
		background: var(--paper);
		transform: translate(-50%, -50%);
		z-index: 2;
	}
	.marker-available {
		border-color: var(--green);
		background: var(--green);
	}
	.marker-claimed {
		border-color: var(--green-dark);
		background: var(--green-dark);
	}

	/* ---------- a stop at a bend ---------- */
	.stop {
		position: absolute;
		left: 0;
		right: 0;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		gap: clamp(1.5rem, 3vw, 2.8rem);
	}
	/* pad so the illustration centres on the bend the marker sits at */
	.stop-left {
		justify-content: flex-start;
	}
	/* row-reverse flips the main axis, so flex-start is what packs to the right */
	.stop-right {
		justify-content: flex-start;
		flex-direction: row-reverse;
	}

	.info {
		position: absolute;
		max-width: 260px;
	}
	.stop-left .info {
		right: calc(100% - var(--bx) + 24px);
		text-align: right;
	}
	.stop-right .info {
		left: calc(var(--bx) + 24px);
		text-align: right;
	}

	.drop-img {
		display: block;
		height: clamp(80px, 11vw, 120px);
		width: auto;
		max-width: 100%;
		object-fit: contain;
		margin: 0 0 0.6rem auto;
		filter: drop-shadow(0 6px 10px rgba(23, 37, 63, 0.18));
	}
	.stop-short .drop-img {
		opacity: 0.55;
	}
	.hrs {
		font-size: clamp(3rem, 6vw, 4.6rem);
		font-weight: 800;
		letter-spacing: -0.045em;
		line-height: 0.9;
		color: var(--navy);
	}
	.stop-short .hrs {
		color: var(--muted);
		opacity: 0.6;
	}
	.stop-claimed .hrs,
	.stop-available .hrs {
		color: var(--green-dark);
	}

	.name {
		margin-top: 0.6rem;
		font-size: 1.2rem;
		font-weight: 800;
		color: var(--navy);
		letter-spacing: -0.01em;
	}
	.extra {
		font-weight: 700;
		color: var(--muted);
		font-size: 0.95rem;
	}
	.value {
		margin-top: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.88rem;
		font-weight: 600;
		color: var(--muted);
	}

	.tag {
		margin-top: 0.9rem;
		font-size: 0.82rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.07em;
	}
	.tag.short {
		color: var(--muted);
	}
	.tag.claimed {
		color: var(--green-dark);
	}

	.claim {
		margin-top: 0.9rem;
		background: var(--green);
		color: var(--white);
		border: 0;
		border-radius: 0;
		box-shadow: 0 5px 0 var(--green-dark);
		font-family: var(--font-sans);
		font-size: 0.92rem;
		font-weight: 800;
		padding: 0.75em 1.15em;
		cursor: pointer;
		transition: transform 0.12s ease, box-shadow 0.12s ease;
	}
	.claim:hover {
		transform: translateY(-2px);
		box-shadow: 0 7px 0 var(--green-dark);
	}
	.claim:active {
		transform: translateY(4px);
		box-shadow: 0 1px 0 var(--green-dark);
	}

	.fineprint {
		margin-top: 3rem;
		font-size: 0.85rem;
		color: var(--muted);
		max-width: 60ch;
	}

	/* ---------- confirmation ---------- */
	.confirm {
		border: 3px solid var(--navy);
		border-radius: 0;
		background: var(--paper);
		color: var(--ink);
		padding: 2rem;
		max-width: 440px;
		width: calc(100% - 2rem);
	}
	.confirm::backdrop {
		background: rgba(23, 37, 63, 0.7);
	}
	.c-title {
		font-size: 1.6rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--navy);
		line-height: 1.05;
	}
	.c-item {
		margin-top: 0.6rem;
		font-weight: 700;
		color: var(--slate);
	}
	.c-cost {
		margin-top: 1rem;
		color: var(--muted);
	}
	.c-math {
		margin-top: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.92rem;
		color: var(--green-dark);
	}
	.c-actions {
		display: flex;
		gap: 0.8rem;
		margin-top: 1.6rem;
		flex-wrap: wrap;
	}
	.keep {
		font-family: var(--font-sans);
		font-weight: 800;
		font-size: 0.95rem;
		padding: 0.85em 1.3em;
		border-radius: 0;
		cursor: pointer;
	}
	.keep {
		background: transparent;
		border: 3px solid var(--navy);
		color: var(--navy);
	}
	.keep:hover {
		background: var(--navy);
		color: var(--paper);
	}
	/* ---------- narrow: same winding route, tighter composition ---------- */
	@media (max-width: 760px) {
		.stop {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.6rem;
			padding-left: 0;
			padding-right: 0;
			transform: translateY(-40%);
		}
		.stop-left {
			padding-left: 0;
			align-items: flex-start;
		}
		.stop-right {
			flex-direction: column;
			padding-right: 0;
			align-items: flex-end;
		}
		.stop-right .info {
			text-align: right;
		}
		.info {
			position: static;
			max-width: 100%;
		}
		.hrs {
			font-size: 2.6rem;
		}
	}

</style>
