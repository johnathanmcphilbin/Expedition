<script lang="ts">
	import { onMount } from 'svelte';
	import { drops } from '$lib/data';
	import type { Drop } from '$lib/types';
	import DropArt from './DropArt.svelte';

	let {
		/** verified hours built. Wire to real data when it exists. */
		hoursBuilt = $bindable(17),
		/** hours already spent on claimed drops */
		claimed = $bindable(new Set<number>()),
		name = ''
	}: { hoursBuilt?: number; claimed?: Set<number>; name?: string } = $props();

	let spent = $derived([...claimed].reduce((a, b) => a + b, 0));
	let available = $derived(hoursBuilt - spent);

	// everything except the 40h finisher lives on the trail
	const trailDrops = drops.filter((d) => !d.finisher);
	let claimable = $derived(drops.filter((d) => !claimed.has(d.hours) && available >= d.hours));
	let nextUp = $derived(drops.find((d) => !claimed.has(d.hours) && available < d.hours) ?? null);

	function statusOf(d: Drop) {
		if (claimed.has(d.hours)) return 'claimed';
		return available >= d.hours ? 'available' : 'short';
	}

	// ---- claim flow -------------------------------------------------------
	let pending = $state<Drop | null>(null);
	let justClaimed = $state<{ hours: number; left: number } | null>(null);
	let dialog: HTMLDialogElement;

	$effect(() => {
		if (pending) dialog?.showModal();
		else dialog?.close();
	});

	function confirmClaim() {
		if (!pending) return;
		const hrs = pending.hours;
		// read the balance before mutating `claimed`, since `available` is derived from it
		const left = available - hrs;
		claimed = new Set(claimed).add(hrs);
		justClaimed = { hours: hrs, left };
		pending = null;
	}

	// ---- desktop trail geometry ------------------------------------------
	// Everything is positioned off these constants so the drawn route and the
	// DOM markers can't drift apart.
	const STOP_W = 330;
	const MARKER_Y = 120; // where the route line runs
	const ART_TOP = 200; // every stop's art starts here, so baselines line up
	const FORK_Y = 575; // the gear/go lane, clear of the stops above it
	const TRAIL_H = 740;
	// slightly irregular: up, down, up, down
	const OFFSETS = [0, -34, 20, -26, 12, -30, 18];
	const trailW = trailDrops.length * STOP_W;

	const pt = (i: number) => ({
		x: i * STOP_W + STOP_W / 2,
		y: MARKER_Y + OFFSETS[i % OFFSETS.length]
	});

	const routeD =
		trailDrops
			.map((_, i) => {
				const { x, y } = pt(i);
				if (i === 0) return `M -40 ${MARKER_Y} L ${x} ${y}`;
				const prev = pt(i - 1);
				return `Q ${(prev.x + x) / 2} ${prev.y} ${x} ${y}`;
			})
			.join(' ') + ` L ${trailW + 60} ${MARKER_Y}`;

	// the fork branches down off the 20h stop
	const fork = pt(3);
	const forkD = `M ${fork.x} ${fork.y} C ${fork.x + 30} ${fork.y + 190}, ${fork.x + 60} ${FORK_Y - 60}, ${fork.x + 110} ${FORK_Y - 18}`;

	let sectionEl: HTMLElement;
	let drawn = $state(false);
	let primed = $state(false);

	onMount(() => {
		primed = true;
		const io = new IntersectionObserver(
			([e]) => {
				if (e.isIntersecting) {
					drawn = true;
					io.disconnect();
				}
			},
			{ threshold: 0.08 }
		);
		io.observe(sectionEl);
		return () => io.disconnect();
	});
</script>

<section class="section trail-section" bind:this={sectionEl} id="rewards">
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

			{#if justClaimed}
				<div class="claimed-banner">
					<p class="cb-1">Drop claimed.</p>
					<p class="cb-2">
						{justClaimed.hours} hours spent. {justClaimed.left} hours still banked.
					</p>
				</div>
			{/if}

			<p class="prompt">What are you doing with them?</p>
			<div class="options">
				{#if claimable.length}
					<div class="opt">
						<span class="opt-k">You can claim</span>
						<span class="opt-v">
							{claimable.map((d) => `${d.hours}h drop`).join(', ')}
						</span>
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

	<!-- ---------- the route ---------- -->
	<div class="scroller">
		<div
			class="trail"
			class:primed
			class:drawn
			style:--trail-w="{trailW}px"
			style:--trail-h="{TRAIL_H}px"
			style:--art-top="{ART_TOP}px"
		>
			<svg class="route" width={trailW} height={TRAIL_H} viewBox="0 0 {trailW} {TRAIL_H}" aria-hidden="true">
				<path class="route-line" d={routeD} />
				<path class="route-line fork" d={forkD} />
			</svg>

			<div class="stops">
				{#each trailDrops as d, i (d.hours)}
					{@const status = statusOf(d)}
					{@const p = pt(i)}
					<div class="stop stop-{status}" style:--my="{p.y}px">
						<p class="hrs">{d.hours}h</p>
						<span class="marker" aria-hidden="true"></span>

						<div class="body">
							<div class="art-wrap"><DropArt kind={d.art} /></div>
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

			<!-- gear / go, in its own lane below the stops -->
			<!-- the orange branch lands on Go; Gear points back up to the main trail -->
			<div class="fork-lane" style:--fx="{fork.x}px" style:--fy="{FORK_Y}px">
				<div class="fork-arm go">
					<span class="fork-k">Go <span aria-hidden="true">↓</span></span>
					<span class="fork-v">keep your hours banked for Dublin</span>
				</div>
				<div class="fork-arm gear">
					<span class="fork-k">Gear <span aria-hidden="true">↑</span></span>
					<span class="fork-v">keep following the trail</span>
				</div>
			</div>
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
		<p class="c-item">
			{pending.name}{pending.extra ? ` + ${pending.extra}` : ''}
		</p>
		<p class="c-cost">This will spend {pending.hours} of your available hours.</p>
		<p class="c-math">
			<strong>{available}h available</strong> → {available - pending.hours}h remaining
		</p>
		<div class="c-actions">
			<button class="keep" onclick={() => (pending = null)}>Keep banking</button>
			<button class="take" onclick={confirmClaim}>Claim reward</button>
		</div>
	{/if}
</dialog>

<style>
	.trail-section {
		padding-bottom: 3rem;
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
	.scroller {
		margin-top: 3.5rem;
		overflow-x: auto;
		overflow-y: hidden;
		padding: 0 var(--edge-pad) 1rem;
		scrollbar-width: thin;
	}
	.trail {
		position: relative;
		width: var(--trail-w);
		height: var(--trail-h);
	}

	.route {
		position: absolute;
		top: 0;
		left: 0;
	}
	.route-line {
		fill: none;
		stroke: var(--navy);
		stroke-width: 3;
		stroke-linecap: round;
		opacity: 0.55;
	}
	.route-line.fork {
		stroke-dasharray: 9 9;
		stroke: var(--orange);
		opacity: 0.85;
	}
	.trail.primed .route-line {
		stroke-dasharray: 4000;
		stroke-dashoffset: 4000;
		transition: stroke-dashoffset 2.2s ease;
	}
	.trail.primed.drawn .route-line {
		stroke-dashoffset: 0;
	}
	.trail.primed .route-line.fork {
		stroke-dasharray: 9 9;
		stroke-dashoffset: 0;
	}

	.stops {
		position: relative;
		display: flex;
		height: 100%;
	}
	.stop {
		position: relative;
		width: 330px;
		flex-shrink: 0;
		padding: 0 1.4rem;
	}

	/* number and marker are pinned to the route; body starts at a shared baseline */
	.hrs {
		position: absolute;
		top: calc(var(--my) - 74px);
		font-size: 3rem;
		font-weight: 800;
		letter-spacing: -0.04em;
		line-height: 1;
		color: var(--navy);
	}
	.stop-short .hrs {
		opacity: 0.4;
	}
	.stop-claimed .hrs {
		color: var(--green-dark);
	}

	.marker {
		position: absolute;
		top: calc(var(--my) - 9px);
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 4px solid var(--navy);
		background: var(--paper);
	}

	.body {
		position: absolute;
		top: var(--art-top);
		left: 1.4rem;
		right: 1.4rem;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		transition: transform 0.15s ease;
	}
	.stop-available .body:hover {
		transform: translateY(-3px);
	}
	.stop-available .marker {
		border-color: var(--green);
		background: var(--green);
	}
	.stop-claimed .marker {
		border-color: var(--green-dark);
		background: var(--green-dark);
	}
	.stop-short .marker {
		opacity: 0.4;
	}

	.art-wrap {
		width: 100%;
		max-width: 200px;
		margin: 0.4rem 0 0.8rem;
	}
	.stop-short .art-wrap {
		opacity: 0.4;
	}

	.name {
		font-size: 1.1rem;
		font-weight: 800;
		color: var(--navy);
		letter-spacing: -0.01em;
	}
	.extra {
		font-weight: 700;
		color: var(--muted);
		font-size: 0.92rem;
	}
	.value {
		margin-top: 0.3rem;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--muted);
	}

	.tag {
		margin-top: 0.8rem;
		font-size: 0.8rem;
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
		margin-top: 0.8rem;
		background: var(--green);
		color: var(--white);
		border: 0;
		border-radius: 12px;
		box-shadow: 0 5px 0 var(--green-dark);
		font-family: var(--font-sans);
		font-size: 0.9rem;
		font-weight: 800;
		padding: 0.7em 1.1em;
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

	/* ---------- fork ---------- */
	.fork-lane {
		position: absolute;
		top: var(--fy);
		left: calc(var(--fx) + 96px);
		display: flex;
		gap: 3rem;
		width: 620px;
	}
	.fork-arm {
		display: flex;
		flex-direction: column;
	}
	.fork-k {
		font-size: 1.5rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--navy);
	}
	.fork-arm.go .fork-k {
		color: var(--orange);
	}
	.fork-v {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--muted);
	}

	.fineprint {
		margin-top: 2rem;
		font-size: 0.85rem;
		color: var(--muted);
		max-width: 60ch;
	}

	/* ---------- confirmation ---------- */
	.confirm {
		border: 3px solid var(--navy);
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
	.keep,
	.take {
		font-family: var(--font-sans);
		font-weight: 800;
		font-size: 0.95rem;
		padding: 0.85em 1.3em;
		border-radius: 12px;
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
	.take {
		background: var(--green);
		border: 0;
		color: var(--white);
		box-shadow: 0 5px 0 var(--green-dark);
	}
	.take:active {
		transform: translateY(4px);
		box-shadow: 0 1px 0 var(--green-dark);
	}

	/* ---------- mobile: the trail goes vertical ---------- */
	@media (max-width: 860px) {
		.scroller {
			overflow-x: hidden;
			padding-left: var(--edge-pad);
			padding-right: var(--edge-pad);
		}
		.trail {
			width: 100%;
			height: auto;
		}
		.route,
		.fork-lane {
			display: none;
		}
		.stops {
			flex-direction: column;
			height: auto;
			border-left: 3px solid var(--rule-strong);
			padding-left: 1.6rem;
		}
		/* undo the desktop pinning: everything flows normally down the route */
		.stop {
			width: 100%;
			padding: 0 0 3.5rem;
		}
		.stop:nth-child(even) {
			padding-left: 1.75rem;
		}
		.hrs,
		.marker,
		.body {
			position: static;
		}
		.hrs {
			font-size: 2.4rem;
		}
		.body {
			left: auto;
			right: auto;
			margin-top: 0.6rem;
		}
		.stop-available .body:hover {
			transform: none;
		}
		.marker {
			position: absolute;
			top: 18px;
			left: -1.6rem;
			transform: translateX(-50%);
		}
		.art-wrap {
			max-width: 170px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.trail.primed .route-line {
			stroke-dasharray: none;
			stroke-dashoffset: 0;
			transition: none;
		}
	}
</style>
