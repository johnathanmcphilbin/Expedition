<script lang="ts">
	import '$lib/styles/app.css';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let paying = $state<string | null>(null);
	const usd = (n: number) => `$${n.toFixed(2)}`;
	const STAGE: Record<string, string> = { approved: 'Grant approved', requested: 'Grant requested', banked: 'Banked, not requested' };
</script>

<svelte:head><title>What you owe · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<div>
				<h1 class="app-title">What you owe</h1>
				<p class="hint lead">Everyone who has banked hours for travel, at $8 an hour, split by what it's for. Plus reviewer cash and shop items to send.</p>
			</div>
		</div>

		{#if form && 'message' in form && form.message}<p class="error-box">{form.message}</p>{/if}
		{#if form && 'done' in form && form.done}<p class="notice">{form.done}</p>{/if}

		<section class="totals">
			<div><span class="n">{usd(data.totalUsd)}</span><span class="k">total you still owe</span></div>
			<div><span class="n">{usd(data.paidTotal)}</span><span class="k">travel already paid</span></div>
			<div><span class="n">{usd(data.all.total)}</span><span class="k">travel: {data.people.length} {data.people.length === 1 ? 'person has' : 'people have'} banked hours</span></div>
			<div><span class="n">{usd(data.all.visa)}</span><span class="k">for visas</span></div>
			<div><span class="n">{usd(data.all.flights)}</span><span class="k">for flights</span></div>
			<div><span class="n">{usd(data.all.accommodation)}</span><span class="k">for accommodation</span></div>
			<div><span class="n">{usd(data.reviewersUsd)}</span><span class="k">reviewer cash</span></div>
			<div><span class="n">{usd(data.shop.usd)}</span><span class="k">shop items to send</span></div>
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
						<thead><tr><th>Person</th><th>Status</th><th>Visa</th><th>Flights</th><th>Accommodation</th><th>Still owed</th><th>Paid</th><th>Their flight</th><th></th></tr></thead>
						<tbody>
							{#each data.people as p (p.id)}
								<tr>
									<th>{p.name}{#if p.email}<a class="sub" href="mailto:{p.email}">{p.email}</a>{/if}</th>
									<td><span class="stage st-{p.stage}">{STAGE[p.stage]}</span>{#if p.locked}<span class="sub">fund locked</span>{/if}</td>
									<td>{usd(p.visa)}</td>
									<td>{usd(p.flights)}</td>
									<td>{usd(p.accommodation)}</td>
									<td><strong>{usd(p.total)}</strong></td>
									<td>{p.paid ? usd(p.paid) : '—'}</td>
									<td>
										{#if p.flightPrice !== null}
											{usd(p.flightPrice)}
											{#if p.flights < p.flightPrice}<span class="sub short">they cover {usd(p.flightPrice - p.flights)}</span>{/if}
										{:else}<span class="sub">not set</span>{/if}
									</td>
									<td class="act">
										{#if p.total > 0}
											{#if paying === p.id}
												<form method="POST" action="?/payTravel" use:enhance={() => async ({ update }) => { await update(); paying = null; }} class="pay-form">
													<input type="hidden" name="user_id" value={p.id} />
													<select name="bucket">
														<option value="all">Everything ({usd(p.total)})</option>
														{#if p.visa}<option value="visa">Visa ({usd(p.visa)})</option>{/if}
														{#if p.flights}<option value="flights">Flights ({usd(p.flights)})</option>{/if}
														{#if p.accommodation}<option value="accommodation">Accommodation ({usd(p.accommodation)})</option>{/if}
													</select>
													<input name="note" maxlength="500" placeholder="Note (e.g. how you paid)" />
													<button class="btn" type="submit">Mark paid</button>
													<button class="text-btn" type="button" onclick={() => (paying = null)}>Cancel</button>
												</form>
											{:else}
												<button class="text-btn" type="button" onclick={() => (paying = p.id)}>Mark paid</button>
											{/if}
										{:else}
											<span class="paid-ok">Paid ✓</span>
										{/if}
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
					<ul class="list">
						{#each data.reviewers as r (r.id)}
							<li>
								<span>{r.name}</span>
								<span class="rv">
									<strong>{usd(r.owedUsd)}</strong>
									<form method="POST" action="?/payReviewer" use:enhance>
										<input type="hidden" name="user_id" value={r.id} />
										<button class="text-btn" type="submit">Mark paid</button>
									</form>
								</span>
							</li>
						{/each}
					</ul>
				{:else}<p class="empty">Nothing owed.</p>{/if}

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
	.act {
		text-align: left;
	}
	.pay-form {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		align-items: flex-start;
		min-width: 220px;
	}
	.pay-form select,
	.pay-form input {
		width: 100%;
		padding: 0.35rem 0.45rem;
		border: 2px solid var(--rule-strong);
		font: inherit;
		font-size: 0.85rem;
	}
	.paid-ok {
		color: #2f7a46;
		font-weight: 700;
	}
	.rv {
		display: inline-flex;
		gap: 0.6rem;
		align-items: center;
	}
	.notice {
		margin-bottom: 1rem;
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
