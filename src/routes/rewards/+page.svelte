<script lang="ts">
	import Trail from '$lib/components/Trail.svelte';
	import SupplyCo from '$lib/components/SupplyCo.svelte';
	import Vault from '$lib/components/Vault.svelte';
	import Jersey from '$lib/components/Jersey.svelte';
	import Footer from '$lib/components/Footer.svelte';
</script>

<svelte:head>
	<title>What you get · Expedition</title>
</svelte:head>

<main>
	<section class="section intro">
		<div class="wrap">
			<h1>Every hour you build is worth something.</h1>
			<p class="lede">
				Verified hours become supplies while you're building, and at 40 they open the vault.
			</p>
		</div>
	</section>

	<Trail />
	<SupplyCo />
	<Vault />
	<Jersey />
</main>
<Footer />

<style>
	.intro {
		padding-bottom: 0;
	}
	h1 {
		max-width: 17ch;
		margin-bottom: 1rem;
	}
</style>
