<script lang="ts">
	import RewardTrail from '$lib/components/RewardTrail.svelte';
	import Footer from '$lib/components/Footer.svelte';
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

</main>
<Footer />

<style>
	/* ---- 40h teaser: dark sea, its waves rising into the trail above ---- */
	.tease {
		/* the footer's waves rise 90px into this section */
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
		font-size: 1rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: var(--sea);
		text-transform: uppercase;
	}
	.tease-head {
		margin-top: 0.6rem;
		font-size: clamp(2.6rem, 6.5vw, 4.2rem);
		color: var(--cream);
		line-height: 1.05;
		text-wrap: balance;
	}
	.tease-copy {
		margin-top: 1rem;
		max-width: 40ch;
		color: rgba(248, 243, 231, 0.78);
		font-size: 1.3rem;
		line-height: 1.45;
	}
	.tp-big {
		font-size: clamp(2.8rem, 7vw, 4rem);
		font-weight: 800;
		letter-spacing: -0.04em;
		line-height: 1;
		color: var(--cream);
	}
	.tp-big span {
		font-size: 1.2rem;
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
		font-size: 1.3rem;
	}
	.tp-sub a {
		color: var(--cream);
	}
	@media (max-width: 760px) {
		.tease-inner {
			grid-template-columns: 1fr;
		}
	}
</style>
