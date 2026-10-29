<script lang="ts">
	import '$lib/styles/app.css';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let by = $state<'approved' | 'tracked'>('approved');

	const ranked = $derived([...data.rows].filter((r) => r[by] > 0).sort((a, b) => b[by] - a[by] || a.name.localeCompare(b.name)));
	const medal = (i: number) => ['🥇', '🥈', '🥉'][i] ?? `${i + 1}`;
</script>

<svelte:head><title>Leaderboard · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<div>
				<h1 class="app-title">Leaderboard</h1>
				<p class="hint lead">Only admins can see this for now, while it gets tweaked.</p>
			</div>
		</div>

		<section class="block">
			<div class="b-head">
				<h2 class="section-label">{ranked.length} builders</h2>
				<div class="seg" role="group" aria-label="Rank by">
					<button type="button" class:on={by === 'approved'} onclick={() => (by = 'approved')}>Approved hours</button>
					<button type="button" class:on={by === 'tracked'} onclick={() => (by = 'tracked')}>Tracked hours</button>
				</div>
			</div>
			{#if ranked.length}
				<div class="table-wrap">
					<table class="grid">
						<thead><tr><th>#</th><th>Builder</th><th>Approved</th><th>Tracked on Expedition projects</th></tr></thead>
						<tbody>
							{#each ranked as r, i (r.id)}
								<tr class:top={i < 3}>
									<td class="rank">{medal(i)}</td>
									<th>
										{r.name}
										{#if r.slackId}<a href="https://hackclub.slack.com/team/{r.slackId}" target="_blank" rel="noopener noreferrer">Slack ↗</a>{/if}
									</th>
									<td class:on={by === 'approved'}>{r.approved}h</td>
									<td class:on={by === 'tracked'}>{r.tracked}h <span class="sub">{r.projects} project{r.projects === 1 ? '' : 's'}</span></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="sub foot">
					Approved is journey hours (approved builds plus referral credit). Tracked is live from Hackatime, checked {new Date(data.checkedAt).toLocaleTimeString()}.
				</p>
			{:else}
				<p class="empty">Nobody has any hours yet.</p>
			{/if}
		</section>
	</div>
</main>

<style>
	.lead {
		margin-top: 0.4rem;
	}
	.block {
		margin: 1.5rem 0 2.5rem;
	}
	.b-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem 1rem;
		margin-bottom: 0.6rem;
	}
	.seg {
		display: inline-flex;
		border: 2px solid var(--navy);
	}
	.seg button {
		padding: 0.3rem 0.8rem;
		border: 0;
		background: var(--white);
		font: inherit;
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
	}
	.seg button.on {
		background: var(--navy);
		color: var(--white);
	}
	.table-wrap {
		overflow-x: auto;
		background: var(--white);
		border: 3px solid var(--navy);
	}
	table.grid {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.92rem;
	}
	.grid thead th {
		padding: 0.6rem 0.9rem;
		background: var(--navy);
		color: var(--white);
		text-align: left;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.grid td,
	.grid tbody th {
		padding: 0.6rem 0.9rem;
		border-top: 1px solid var(--rule);
		text-align: left;
	}
	.grid td.on {
		font-weight: 800;
		color: var(--navy);
	}
	.grid tr.top th {
		font-weight: 800;
	}
	.rank {
		width: 3rem;
		font-weight: 800;
		color: var(--muted);
	}
	.grid a {
		margin-left: 0.4rem;
		font-size: 0.78rem;
		color: var(--blue-dark);
		font-weight: 700;
	}
	.sub {
		font-size: 0.8rem;
		color: var(--muted);
	}
	.foot {
		display: block;
		margin-top: 0.5rem;
	}
	.empty {
		color: var(--muted);
	}
</style>
