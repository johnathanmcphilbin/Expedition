<script lang="ts">
	import '../lib/styles/global.css';
	import { page } from '$app/state';
	import IrelandBar from '$lib/components/IrelandBar.svelte';
	import Nav from '$lib/components/Nav.svelte';
	let { children, data } = $props();
</script>

{#if page.url.pathname === '/'}
	<IrelandBar open={data.irelandOpen} />
{/if}
<Nav currentUser={data.currentUser} builders={data.builders} />
{@render children()}
