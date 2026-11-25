<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function ago(iso: string) {
		const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
		if (mins < 60) return `${mins}m`;
		const hrs = Math.round(mins / 60);
		if (hrs < 48) return `${hrs}h`;
		return `${Math.round(hrs / 24)}d`;
	}
</script>

<svelte:head>
	<title>Public review queue · Expedition</title>
	<meta name="description" content="See Expedition's project review queue and expected position." />
</svelte:head>

<main class="app-page queue-page">
	<div class="wrap">
		<h1 class="app-title">Public review queue</h1>
		<p class="hint lead">A privacy-safe list of projects waiting for review. Names and personal details are never shown.</p>

		{#if data.demo}
			<p class="demo-banner">Demo preview — this local environment has no database connection, so the entries below are examples, not live submissions.</p>
		{/if}

		<div class="stats">
			<div><strong>{data.waiting}</strong><span>waiting</span></div>
			<div><strong>{data.needsChanges}</strong><span>needs changes</span></div>
			<div><strong>{data.hardware}</strong><span>hardware</span></div>
		</div>

		<div class="table-wrap">
			<table>
				<thead>
					<tr><th>Position</th><th>Project</th><th>Type</th><th>Status</th><th>Submitted</th></tr>
				</thead>
				<tbody>
					{#each data.queue as item (item.position)}
						<tr>
							<td class="position">#{item.position}</td>
							<td><strong>{item.project}</strong></td>
							<td>{item.hardware ? 'Hardware' : 'Software'}</td>
							<td><span class="status" class:changes={item.status === 'needs_changes'}>{item.status === 'needs_changes' ? 'Needs changes' : 'Waiting'}</span></td>
							<td>{ago(item.submittedAt)} ago</td>
						</tr>
					{:else}
						<tr><td colspan="5" class="empty">No projects are in the review queue right now.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>

		<p class="api"><a href="/api/queue">JSON API ↗</a></p>
	</div>
</main>
<Footer />

<style>
	.queue-page { padding-bottom: calc(90px + 3rem); }
	.lead { margin: 0.5rem 0 1.5rem; }
	.demo-banner {
		margin: 0 0 1.2rem;
		padding: 0.8rem 1rem;
		border: 3px solid #c78b00;
		background: #fff3d1;
		color: var(--navy);
		font-weight: 800;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.8rem;
		margin-bottom: 1.2rem;
	}
	.stats div {
		background: var(--white);
		border: 3px solid var(--navy);
		padding: 1rem;
		display: grid;
	}
	.stats strong { color: var(--navy); font-size: 1.8rem; }
	.stats span { color: var(--muted); font-weight: 700; }
	.position { color: var(--navy); font-weight: 900; }
	.status {
		display: inline-block;
		padding: 0.2rem 0.5rem;
		background: #e7f2ff;
		border: 1px solid var(--rule);
		font-weight: 800;
	}
	.status.changes { background: #fff3d1; }
	.api { margin-top: 1rem; font-weight: 800; }
</style>
