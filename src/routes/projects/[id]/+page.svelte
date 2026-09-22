<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{data.project.title} · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<div>
				<h1 class="app-title">{data.project.title}</h1>
				{#if data.project.hackatime_project}
					<p class="hint">
						Hackatime: {data.project.hackatime_project}{data.tracked
							? ` — ${data.tracked} tracked`
							: ''}
					</p>
				{/if}
			</div>
			<a class="btn" href="/projects/{data.project.id}/submit">Submit a checkpoint</a>
		</div>

		{#if data.project.description}
			<div class="panel" style="margin-bottom:2rem">
				<p>{data.project.description}</p>
			</div>
		{/if}

		<!-- Connect this project to tracked coding time, or move it to a different
		     Hackatime project. Clearing the select disconnects it. -->
		<div class="panel" style="margin-bottom:2rem">
			<p class="section-label">Hackatime</p>
			{#if data.connected}
				<form method="POST" action="?/connect" use:enhance class="connect-row">
					<label class="sr-only" for="hackatime_project">Hackatime project</label>
					<select id="hackatime_project" name="hackatime_project">
						<option value="">Not tracked</option>
						{#each data.hackatimeProjects as p (p.name)}
							<option
								value={p.name}
								disabled={p.taken}
								selected={p.name === data.project.hackatime_project}>
								{p.name} — {p.tracked}{p.taken ? ' (already connected)' : ''}
							</option>
						{/each}
					</select>
					<button class="btn btn-outline" type="submit">Connect</button>
				</form>
				{#if form?.message}
					<p class="hint error">{form.message}</p>
				{:else if form?.connected}
					<p class="hint">Saved.</p>
				{/if}
			{:else}
				<p class="hint">
					<a href="/auth/hackatime">Connect Hackatime</a> to line this project up with your
					tracked coding time.
				</p>
			{/if}
		</div>

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

<style>
	.connect-row {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.connect-row select {
		flex: 1 1 16rem;
	}
	.error {
		color: var(--red);
	}
</style>
