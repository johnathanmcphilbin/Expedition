<script lang="ts">
	import Hero from '$lib/components/Hero.svelte';
	import HowItWorks from '$lib/components/HowItWorks.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Expedition · A Hack Club YSWS</title>
</svelte:head>

<main>
	<Hero {form} />
	<HowItWorks />

	<section class="section onward">
		<div class="wrap">
			<h2>Where to next.</h2>
			<div class="links">
				<a class="onward-link" href="/library">
					<span class="onward-title">The library</span>
					<span class="onward-desc">Every checkpoint people have posted so far.</span>
				</a>
				<a class="onward-link" href="/rewards">
					<span class="onward-title">Your hours</span>
					<span class="onward-desc">Eight supply drops. Spend your hours or bank them.</span>
				</a>
				<a class="onward-link" href="/ireland">
					<span class="onward-title">Dublin</span>
					<span class="onward-desc">A free, optional hackathon on December 5.</span>
				</a>
			</div>
		</div>
	</section>
</main>
<Footer />

<style>
	/* How It Works hangs a 90px wave down over the top of this section, so
	   clear it before the heading starts rather than letting the waves crowd
	   "Where to next." Also the next beat of "the sea gets deeper as you go":
	   Hero starts pale, this section is where it visibly steps darker on the
	   way down to the footer's navy. */
	.onward {
		background: var(--sea-mid);
		padding-top: calc(90px + clamp(2.5rem, 5vw, 4rem));
		padding-bottom: clamp(3rem, 6vw, 5rem);
	}
	.onward h2 {
		color: var(--navy);
	}

	.links {
		margin-top: 2.5rem;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 1.5rem;
	}

	.onward-link {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		text-decoration: none;
		border-top: 3px solid var(--navy);
		padding-top: 0.9rem;
	}
	.onward-link:hover {
		border-top-color: var(--navy-soft);
	}

	.onward-title {
		font-size: 1.25rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--navy);
	}
	.onward-link:hover .onward-title {
		color: var(--green-dark);
	}

	.onward-desc {
		font-size: 0.95rem;
		/* --muted reads at ~1.6:1 on --sea-mid — far under AA. --ink holds 4.87:1. */
		color: var(--ink);
		line-height: 1.45;
	}
</style>
