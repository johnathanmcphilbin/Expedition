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
	   "Where to next." */
	.onward {
		padding-top: calc(90px + clamp(2.5rem, 5vw, 4rem));
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
		border-top: 3px solid var(--rule-strong);
		padding-top: 0.9rem;
	}
	.onward-link:hover {
		border-top-color: var(--green);
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
		color: var(--muted);
		line-height: 1.45;
	}
</style>
