<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Airtable prefills a form field by its exact display name in the query
	// string — https://support.airtable.com/docs/prefilling-a-form. Passing
	// nothing for a field just leaves it blank for them to fill in.
	const embedSrc = $derived.by(() => {
		if (!data.selected) return null;
		const p = new URLSearchParams();
		if (data.selected.repo_url) p.set('prefill_Code URL', data.selected.repo_url);
		if (data.selected.demo_url) p.set('prefill_Playable URL', data.selected.demo_url);
		if (data.selected.description) p.set('prefill_Description', data.selected.description);
		const qs = p.toString();
		return `https://airtable.com/embed/appGcYrt3CFYab05y/pagB6M1gck9F0Pq3c/form${qs ? `?${qs}` : ''}`;
	});
</script>

<svelte:head><title>Submit to Hack Club · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head"><h1 class="app-title">Submit to Hack Club</h1></div>

		<p class="hint" style="max-width:60ch; margin-bottom:2rem">
			This is Hack Club's own project submission for their Unified YSWS pipeline — separate
			from Expedition's checkpoints. It goes straight to Hack Club for review and any reward
			shipping; nothing here changes your Expedition hours or balance.
		</p>

		{#if !data.projects.length}
			<p class="empty">
				Nothing to submit yet — <a href="/projects/new">start a project</a> first.
			</p>
		{:else}
			<div class="field" style="max-width:24rem">
				<label for="project">Which project?</label>
				<select
					id="project"
					value={data.selected?.id ?? ''}
					onchange={(e) => {
						const id = e.currentTarget.value;
						const url = new URL(location.href);
						if (id) url.searchParams.set('project', id);
						else url.searchParams.delete('project');
						location.href = url.toString();
					}}>
					<option value="">Choose a project&hellip;</option>
					{#each data.projects as p (p.id)}
						<option value={p.id}>{p.title}</option>
					{/each}
				</select>
			</div>

			{#if embedSrc}
				<div class="panel embed-panel">
					<iframe
						class="airtable-embed"
						title="Submit {data.selected?.title} to Hack Club"
						src={embedSrc}
						frameborder="0"
						width="100%"
						height="533"
						style="background: transparent;"
					></iframe>
				</div>
				<p class="hint" style="margin-top:0.8rem">
					Code URL, playable URL and description were filled in from {data.selected?.title} —
					check them over, Hack Club also asks for a screenshot and a shipping address.
				</p>
			{/if}
		{/if}

		<p style="margin-top:2.5rem"><a href="/dashboard">← Back to dashboard</a></p>
	</div>
</main>
<Footer />

<style>
	.embed-panel {
		padding: 0;
		overflow: hidden;
		margin-top: 1.5rem;
	}
	.airtable-embed {
		display: block;
		width: 100%;
		border: 0;
	}
</style>
