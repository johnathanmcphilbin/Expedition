<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Airtable prefills a form field by its exact display name in the query
	// string — https://support.airtable.com/docs/prefilling-a-form. The
	// Hackatime ID is what lets Expedition match the resulting submission back
	// to this account without the participant typing anything themselves.
	const embedSrc = $derived.by(() => {
		if (!data.selected || !data.hackatimeUserId) return null;
		const p = new URLSearchParams();
		p.set('prefill_Justification - Submitter Hackatime ID', data.hackatimeUserId);
		p.set(
			'prefill_Justification - Hackatime Project Name(s) + Date Range(s)',
			data.selected.name
		);
		return `https://airtable.com/embed/appGcYrt3CFYab05y/pagB6M1gck9F0Pq3c/form?${p.toString()}`;
	});
</script>

<svelte:head><title>Submit to Hack Club · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head"><h1 class="app-title">Submit to Hack Club</h1></div>

		<p class="hint" style="max-width:60ch; margin-bottom:2rem">
			This is Hack Club's own Unified YSWS submission — the one, real submission for your
			project. Expedition picks it up from here to review, using your Hackatime ID and project
			name, prefilled below.
		</p>

		{#if data.hackatimeUnavailable}
			<p class="empty error">
				Couldn't reach Hackatime just now, so your projects aren't loading. Try again in a
				moment.
			</p>
		{:else if !data.projects.length}
			<p class="empty">
				Nothing tracked in Hackatime yet — start coding with it running, then come back.
			</p>
		{:else}
			<div class="field" style="max-width:24rem">
				<label for="project">Which project?</label>
				<select
					id="project"
					value={data.selected?.name ?? ''}
					onchange={(e) => {
						const name = e.currentTarget.value;
						const url = new URL(location.href);
						if (name) url.searchParams.set('project', name);
						else url.searchParams.delete('project');
						location.href = url.toString();
					}}>
					<option value="">Choose a project&hellip;</option>
					{#each data.projects as p (p.name)}
						<option value={p.name}>{p.name} — {p.tracked}</option>
					{/each}
				</select>
			</div>

			{#if embedSrc}
				<div class="panel embed-panel">
					<iframe
						class="airtable-embed"
						title="Submit {data.selected?.name} to Hack Club"
						src={embedSrc}
						frameborder="0"
						width="100%"
						height="533"
						style="background: transparent;"
					></iframe>
				</div>
				<p class="hint" style="margin-top:0.8rem">
					Your Hackatime ID and this project's name are filled in — Hack Club also asks for
					code and demo links, a screenshot, a description and a shipping address.
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
	.error {
		color: var(--red);
	}
</style>
