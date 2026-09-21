<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Review queue · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<h1 class="app-title">Review queue</h1>
			<span class="row-meta">{data.queue.length} waiting</span>
		</div>

		{#if data.queue.length}
			<div class="row-list">
				{#each data.queue as s (s.id)}
					<a class="row" href="/admin/reviews/{s.id}">
						<span class="row-title">{s.users?.display_name ?? 'Participant'}</span>
						<span class="row-meta">{s.projects?.title ?? 'Project'}</span>
						<span class="row-meta">{s.hours_requested}h requested</span>
						<span class="row-meta">{new Date(s.submitted_at).toLocaleDateString()}</span>
						<span class="status status-{s.status}">{s.status.replace('_', ' ')}</span>
					</a>
				{/each}
			</div>
		{:else}
			<p class="empty">Nothing waiting. Queue is clear.</p>
		{/if}

		<p style="margin-top:2.5rem"><a href="/dashboard">← Back to dashboard</a></p>
	</div>
</main>
<Footer />
