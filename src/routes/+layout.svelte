<script lang="ts">
	import '../lib/styles/global.css';
	import Nav from '$lib/components/Nav.svelte';
	let { children, data } = $props();
</script>

<Nav currentUser={data.currentUser} builders={data.builders} />
{@render children()}
