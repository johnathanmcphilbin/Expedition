<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{data.project.title} · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<div>
				<h1 class="app-title">{data.project.title}</h1>
				{#if data.project.hackatime_project}
					<p class="hint">Hackatime: {data.project.hackatime_project}</p>
				{/if}
			</div>
			<a class="btn" href="/projects/{data.project.id}/submit">Submit a checkpoint</a>
		</div>

		{#if data.project.description}
			<div class="panel" style="margin-bottom:2rem">
				<p>{data.project.description}</p>
			</div>
		{/if}

		<div class="stack" style="margin-bottom:2.5rem">
			{#if data.project.repo_url}
				<p><strong>Repo:</strong> <a href={data.project.repo_url} rel="noopener noreferrer nofollow" target="_blank">{data.project.repo_url}</a></p>
			{/if}
			{#if data.project.demo_url}
				<p><strong>Demo:</strong> <a href={data.project.demo_url} rel="noopener noreferrer nofollow" target="_blank">{data.project.demo_url}</a></p>
			{/if}
		</div>

		<p class="section-label">Checkpoints</p>
		{#if data.submissions.length}
			<div class="row-list">
				{#each data.submissions as s (s.id)}
					<div class="row">
						<span class="row-title">{s.hours_requested}h requested</span>
						<span class="row-meta">{new Date(s.submitted_at).toLocaleDateString()}</span>
						<span class="status status-{s.status}">{s.status.replace('_', ' ')}</span>
					</div>
				{/each}
			</div>
		{:else}
			<p class="empty">No checkpoints yet.</p>
		{/if}

		<p style="margin-top:2.5rem"><a href="/dashboard">← Back to dashboard</a></p>
	</div>
</main>
<Footer />
