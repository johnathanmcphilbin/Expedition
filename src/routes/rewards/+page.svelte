<script lang="ts">
	import RewardTrail from '$lib/components/RewardTrail.svelte';
	import FinisherMoment from '$lib/components/FinisherMoment.svelte';
	import Footer from '$lib/components/Footer.svelte';

	// demo state until hours come from Hackatime
	let hoursBuilt = $state(17);
	let claimed = $state(new Set<number>());

	let spent = $derived([...claimed].reduce((a, b) => a + b, 0));
	let available = $derived(hoursBuilt - spent);
</script>

<svelte:head>
	<title>Your hours · Expedition</title>
</svelte:head>

<main>
	<!-- This whole page is a preview: drag the slider to see how the trail
	     looks at any hour count. There is no live way to redeem hours for gear
	     yet, so nothing here is wired to a real account or a real checkout. -->
	<RewardTrail bind:hoursBuilt bind:claimed />

	<section class="section gearorgo">
		<div class="wrap">
			<h2 class="go-head">Gear or go.</h2>
			<p class="go-copy">Every reward you claim spends your hours.</p>
			<p class="go-copy">
				Keep them instead and they can count toward travel support to Dublin.
			</p>
			<p class="go-big">
				The hackathon is free.<br /><span class="dim">Getting there shouldn't stop you.</span>
			</p>
			<a class="btn go-btn" href="/ireland">Dublin, December 5</a>
			<p class="go-fine">
				Travel support depends on actual travel cost, available programme budget and approval.
				Banked hours don't guarantee a flight or a set amount.
			</p>
		</div>
	</section>

	<FinisherMoment {available} claimed={claimed.has(40)} />
</main>
<Footer />

<style>

	.gearorgo {
		background: var(--paper-soft);
	}
	.go-head {
		font-size: clamp(2.6rem, 7vw, 4.6rem);
		margin-bottom: 1.2rem;
	}
	.go-copy {
		color: var(--muted);
		font-size: 1.05rem;
		max-width: 50ch;
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
	.go-btn {
		margin-top: 2rem;
	}
	.go-fine {
		margin-top: 1.6rem;
		font-size: 0.85rem;
		color: var(--muted);
		max-width: 58ch;
	}
</style>
