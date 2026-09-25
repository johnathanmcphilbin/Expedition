<script lang="ts">
	import RewardTrail from '$lib/components/RewardTrail.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import GrantAmount from '$lib/components/GrantAmount.svelte';
	import { TRAVEL_RATE, money } from '$lib/data';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// signed out: a scrubbable preview. Signed in: the real ledger.
	let hoursBuilt = $state(17);
	let claimed = $state(new Set<number>());
	$effect(() => {
		if (data.live) claimed = new Set(data.live.claimed);
	});

	const FINISH = 40;
	const toFinish = $derived(data.live ? Math.max(0, FINISH - data.live.built) : null);
	const finishPct = $derived(data.live ? Math.min(100, (data.live.built / FINISH) * 100) : 0);
	const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));
</script>

<svelte:head>
	<title>Your hours · Expedition</title>
</svelte:head>

<main>
	<RewardTrail bind:hoursBuilt bind:claimed live={data.live} />

	<!-- ---------- 40h teaser: the prize itself isn't announced yet ---------- -->
	<section class="section tease">
		<div class="wrap tease-inner">
			<div>
				<p class="tease-k">At {FINISH} hours</p>
				<h2 class="tease-head">Something's waiting at {FINISH}.</h2>
				<p class="tease-copy">
					We're keeping it quiet for now. Every approved hour counts toward it, including the ones
					you spend on gear or bank for Dublin. And {FINISH} isn't the end, so keep building.
				</p>
			</div>
			<div class="tease-progress">
				{#if data.live}
					{#if data.live.finished}
						<p class="tp-big">You're there.</p>
						<p class="tp-sub">We'll be in touch.</p>
					{:else}
						<p class="tp-big">{fmt(data.live.built)}h <span>approved</span></p>
						<div class="tp-meter" role="progressbar" aria-valuenow={Math.round(finishPct)} aria-valuemin="0" aria-valuemax="100" aria-label="Approved hours toward the 40-hour prize">
							<span style="width:{finishPct}%"></span>
						</div>
						<p class="tp-sub">{fmt(toFinish ?? 0)}h to go.</p>
					{/if}
				{:else}
					<p class="tp-sub"><a href="/auth/login?next=/rewards">Sign in</a> to see your hours.</p>
				{/if}
			</div>
		</div>
	</section>

	<!-- ---------- saving up for Dublin ---------- -->
	<section class="section dublin-save">
		<div class="wrap">
			<h2 class="go-head">Or save up for Dublin.</h2>
			<p class="go-copy">
				Skip the gear and bank your hours for the hackathon instead. Every hour you bank adds
				{money(TRAVEL_RATE)} to your travel grant, and you can move hours back until your trip is
				booked.
			</p>
			{#if data.live && data.live.travel > 0}
				<p class="go-grant">
					You've banked {fmt(data.live.travel)}h. <GrantAmount reveal="{money(data.live.travel * TRAVEL_RATE)} travel grant so far" />
				</p>
			{/if}
			<p class="go-big">
				The hackathon is free.<br /><span class="dim">Getting there shouldn't stop you.</span>
			</p>
			<div class="go-actions">
				<a class="btn" href={data.live ? '/dashboard#travel' : '/auth/login?next=/dashboard'}>Bank hours for Dublin</a>
				<a class="btn btn-outline" href="/ireland">Dublin, December 5</a>
			</div>
			<p class="go-fine">Your travel grant goes toward the actual cost of getting you to Dublin.</p>
		</div>
	</section>
</main>
<Footer />

<style>
	/* ---- 40h teaser: dark sea, its waves rising into the trail above ---- */
	.tease {
		margin-top: 90px;
		/* room for the light waves that rise into it from the section below */
		padding-bottom: calc(90px + clamp(3rem, 6vw, 5rem));
		background: url('/wave-texture-dark.jpg');
		background-size: 68px auto;
		color: var(--cream);
	}
	.tease::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 100%;
		height: 90px;
		background: url('/wave-band-dark.png') repeat-x bottom;
		background-size: auto 100%;
		margin-bottom: -2px;
		pointer-events: none;
	}
	.tease-inner {
		display: grid;
		grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
		gap: 2rem 4rem;
		align-items: center;
	}
	.tease-k {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: var(--sea);
		text-transform: uppercase;
	}
	.tease-head {
		margin-top: 0.6rem;
		font-size: clamp(2rem, 5vw, 3.2rem);
		color: var(--cream);
		line-height: 1.05;
		text-wrap: balance;
	}
	.tease-copy {
		margin-top: 1rem;
		max-width: 46ch;
		color: rgba(248, 243, 231, 0.78);
	}
	.tp-big {
		font-size: clamp(2.2rem, 6vw, 3.2rem);
		font-weight: 800;
		letter-spacing: -0.04em;
		line-height: 1;
		color: var(--cream);
	}
	.tp-big span {
		font-size: 1rem;
		font-weight: 700;
		letter-spacing: 0;
		color: var(--sea-deep);
	}
	.tp-meter {
		height: 10px;
		margin: 1rem 0 0.7rem;
		border: 1.5px solid var(--sea-deep);
	}
	.tp-meter span {
		display: block;
		height: 100%;
		background: var(--green-bright);
	}
	.tp-sub {
		font-weight: 600;
		color: rgba(248, 243, 231, 0.82);
	}
	.tp-sub a {
		color: var(--cream);
	}
	@media (max-width: 760px) {
		.tease-inner {
			grid-template-columns: 1fr;
		}
	}

	/* ---- saving up: back to the light sea, its waves rising into the dark ---- */
	.dublin-save {
		background: url('/wave-texture.jpg');
		background-size: 65px auto;
		/* the footer's waves rise 90px into this section */
		padding-bottom: calc(90px + 2.5rem);
	}
	.dublin-save::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 100%;
		height: 90px;
		background: url('/wave-band-up.png') repeat-x bottom;
		background-size: auto 100%;
		margin-bottom: -2px;
		pointer-events: none;
	}
	.go-head {
		text-wrap: balance;
		font-size: clamp(2.6rem, 7vw, 4.6rem);
		margin-bottom: 1.6rem;
	}
	.go-grant {
		margin-top: 0.6rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.go-copy {
		color: var(--slate);
		font-size: 1.05rem;
		max-width: 56ch;
	}
	.go-big {
		margin-top: 2rem;
		font-size: clamp(1.5rem, 3.4vw, 2.2rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1.1;
		color: var(--navy);
	}
	.dim {
		color: var(--muted);
	}
	.go-actions {
		margin-top: 2rem;
		display: flex;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.go-fine {
		margin-top: 1.6rem;
		font-size: 0.85rem;
		color: var(--muted);
		max-width: 58ch;
	}
</style>
