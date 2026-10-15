<script lang="ts">
	import '$lib/styles/app.css';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const usd = (n: number) => `$${n.toFixed(2)}`;
	const STAGE: Record<string, string> = { approved: 'Grant approved', requested: 'Grant requested', banked: 'Banked, not requested' };
</script>

<svelte:head><title>What you owe · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<div>
				<h1 class="app-title">What you owe</h1>
				<p class="hint lead">Travel stipends are what's banked in each travel fund, at $8 an hour, split by what it's for.</p>
			</div>
		</div>

		<section class="totals">
			<div><span class="n">{usd(data.committedUsd)}</span><span class="k">owed now: approved grants, reviewer cash, shop to send</span></div>
			<div><span class="n">{usd(data.stages.requested.total)}</span><span class="k">grants waiting on you ({data.stages.requested.people})</span></div>
			<div><span class="n">{usd(data.stages.banked.total)}</span><span class="k">banked, not requested yet ({data.stages.banked.people})</span></div>
			<div><span class="n">{usd(data.worstCaseUsd)}</span><span class="k">if every banked fund is approved</span></div>
		</section>

		<section class="block">
			<h2 class="section-label">Travel stipends by type</h2>
			<div class="table-wrap">
				<table class="grid">
					<thead><tr><th></th><th>Visa</th><th>Flights</th><th>Accommodation</th><th>Total</th></tr></thead>
					<tbody>
						{#each ['approved', 'requested', 'banked'] as const as s (s)}
							{@const r = data.stages[s]}
							<tr><th>{STAGE[s]} <span class="sub">{r.people} {r.people === 1 ? 'person' : 'people'}</span></th><td>{usd(r.visa)}</td><td>{usd(r.flights)}</td><td>{usd(r.accommodation)}</td><td><strong>{usd(r.total)}</strong></td></tr>
						{/each}
					</tbody>
					<tfoot>
						<tr><th>All travel funds</th><td>{usd(data.all.visa)}</td><td>{usd(data.all.flights)}</td><td>{usd(data.all.accommodation)}</td><td><strong>{usd(data.all.total)}</strong></td></tr>
					</tfoot>
				</table>
			</div>
		</section>

		<section class="block">
			<h2 class="section-label">By person</h2>
			{#if data.people.length}
				<div class="table-wrap">
					<table class="grid">
						<thead><tr><th>Person</th><th>Status</th><th>Visa</th><th>Flights</th><th>Accommodation</th><th>Total</th><th>Their flight</th></tr></thead>
						<tbody>
							{#each data.people as p (p.id)}
								<tr>
									<th>{p.name}{#if p.email}<a class="sub" href="mailto:{p.email}">{p.email}</a>{/if}</th>
									<td><span class="stage st-{p.stage}">{STAGE[p.stage]}</span>{#if p.locked}<span class="sub">fund locked</span>{/if}</td>
									<td>{usd(p.visa)}</td>
									<td>{usd(p.flights)}</td>
									<td>{usd(p.accommodation)}</td>
									<td><strong>{usd(p.total)}</strong></td>
									<td>
										{#if p.flightPrice !== null}
											{usd(p.flightPrice)}
											{#if p.flights < p.flightPrice}<span class="sub short">they cover {usd(p.flightPrice - p.flights)}</span>{/if}
										{:else}<span class="sub">not set</span>{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="empty">Nobody has banked hours for travel yet.</p>
			{/if}
		</section>

		<section class="block two">
			<div>
				<h2 class="section-label">Reviewer cash</h2>
				{#if data.reviewers.length}
					<ul class="list">{#each data.reviewers as r (r.name)}<li><span>{r.name}</span><strong>{usd(r.owedUsd)}</strong></li>{/each}</ul>
				{:else}<p class="empty">Nothing owed.</p>{/if}
				<p class="sub"><a href="/admin">Mark it paid on the admin page →</a></p>
			</div>
			<div>
				<h2 class="section-label">Shop items to send</h2>
				{#if data.shop.items.length}
					<ul class="list">{#each data.shop.items as s, i (i)}<li><span>{s.name}</span><span>{s.reward}</span></li>{/each}</ul>
					<p class="sub">Worth about {usd(data.shop.usd)}. <a href="/admin/fulfilment">Fulfilment →</a></p>
				{:else}<p class="empty">Nothing to send.</p>{/if}
			</div>
		</section>
	</div>
</main>

<style>
	.lead {
		margin-top: 0.4rem;
	}
	.totals {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
		gap: 0.8rem 1.5rem;
		margin: 1.5rem 0 2rem;
		padding: 1rem 1.2rem;
		background: var(--white);
		border: 2px solid var(--rule-strong);
	}
	.totals div {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.n {
		font-size: 1.5rem;
		font-weight: 800;
		color: var(--navy);
		line-height: 1;
	}
	.k,
	.sub {
		font-size: 0.8rem;
		color: var(--muted);
	}
	.sub {
		display: block;
	}
	.block {
		margin-bottom: 2.5rem;
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
	.grid tbody th,
	.grid tfoot th {
		text-align: left;
		font-weight: 700;
		color: var(--navy);
	}
	.grid td,
	.grid tbody th,
	.grid tfoot th {
		padding: 0.6rem 0.9rem;
		border-top: 1px solid var(--rule);
		vertical-align: top;
	}
	.grid td {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.grid tfoot th,
	.grid tfoot td {
		border-top: 2px solid var(--navy);
		font-weight: 800;
		color: var(--navy);
	}
	.grid a.sub {
		color: var(--blue-dark);
	}
	.stage {
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
	}
	.st-approved {
		color: #2f7a46;
	}
	.st-requested {
		color: #a34a00;
	}
	.st-banked {
		color: var(--muted);
	}
	.short {
		color: #a34a00;
	}
	.two {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1.5rem;
	}
	.list {
		list-style: none;
		margin: 0 0 0.5rem;
		padding: 0;
		background: var(--white);
		border: 2px solid var(--rule-strong);
	}
	.list li {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.5rem 0.8rem;
		border-top: 1px solid var(--rule);
	}
	.list li:first-child {
		border-top: 0;
	}
	.sub a {
		color: var(--blue-dark);
		font-weight: 700;
	}
</style>
