<script lang="ts">
	import '$lib/styles/app.css';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let declining = $state<string | null>(null);
	const usd = (n: number) => `$${n.toFixed(2)}`;
	const STAGE: Record<string, string> = {
		approved: 'Approved, to pay',
		requested: 'Claimed, waiting for you',
		paid: 'Paid',
		unclaimed: 'Banked, not claimed yet'
	};
	const STATUS: Record<string, string> = { requested: 'Waiting', approved: 'Approved', paid: 'Paid ✓', declined: 'Declined' };
	const day = (iso: string) => new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
</script>

<svelte:head><title>What you owe · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<div>
				<h1 class="app-title">What you owe</h1>
				<p class="hint lead">
					Travel money is claimed per claim, at $8 an hour, for visa, flights or accommodation. Banking more and claiming again adds on as a new claim.
					Plus reviewer cash and shop items to send.
				</p>
			</div>
		</div>

		{#if form && 'message' in form && form.message}<p class="error-box">{form.message}</p>{/if}
		{#if form && 'done' in form && form.done}<p class="notice">{form.done}</p>{/if}

		<section class="totals">
			<div><span class="n">{usd(data.totalUsd)}</span><span class="k">owed now (approved travel + reviewers + shop)</span></div>
			<div><span class="n">{usd(data.stages.approved.total)}</span><span class="k">travel approved, to pay</span></div>
			<div><span class="n">{usd(data.stages.requested.total)}</span><span class="k">travel claimed, waiting for you</span></div>
			<div><span class="n">{usd(data.stages.unclaimed.total)}</span><span class="k">banked, not claimed yet</span></div>
			<div><span class="n">{usd(data.stages.paid.total)}</span><span class="k">travel already paid</span></div>
			<div><span class="n">{usd(data.reviewersUsd)}</span><span class="k">reviewer cash</span></div>
			<div><span class="n">{usd(data.shop.usd)}</span><span class="k">shop items to send</span></div>
		</section>

		<section class="block">
			<h2 class="section-label">Travel claims</h2>
			{#if data.claims.length}
				<div class="table-wrap">
					<table class="grid">
						<thead><tr><th>Person</th><th>For</th><th>Amount</th><th>Claimed</th><th>Status</th><th></th></tr></thead>
						<tbody>
							{#each data.claims as c (c.id)}
								<tr class:dim={c.status === 'paid' || c.status === 'declined'}>
									<th>
										{c.name}{#if c.email}<a class="sub" href="mailto:{c.email}">{c.email}</a>{/if}
										{#if c.note}<span class="sub note">“{c.note}”</span>{/if}
									</th>
									<td class="left">{c.bucket}{#if c.addOn}<span class="sub">add-on</span>{/if}</td>
									<td><strong>{usd(c.usd)}</strong><span class="sub">{c.hours}h</span></td>
									<td class="left">{day(c.requested_at)}</td>
									<td class="left">
										<span class="stage st-{c.status}">{STATUS[c.status]}</span>
										{#if c.paid_at}<span class="sub">{day(c.paid_at)}</span>{/if}
										{#if c.admin_note}<span class="sub">{c.admin_note}</span>{/if}
									</td>
									<td class="act">
										{#if c.status === 'requested'}
											{#if declining === c.id}
												<form method="POST" action="?/decideClaim" use:enhance={() => async ({ update }) => { await update(); declining = null; }} class="pay-form">
													<input type="hidden" name="id" value={c.id} />
													<input name="admin_note" maxlength="1000" placeholder="Why (they'll see this)" required />
													<button class="text-btn danger" type="submit" name="decision" value="decline">Decline</button>
													<button class="text-btn" type="button" onclick={() => (declining = null)}>Cancel</button>
												</form>
											{:else}
												<div class="btns">
													<form method="POST" action="?/decideClaim" use:enhance>
														<input type="hidden" name="id" value={c.id} />
														<button class="btn" type="submit" name="decision" value="approve">Approve</button>
													</form>
													<form method="POST" action="?/payClaim" use:enhance>
														<input type="hidden" name="id" value={c.id} />
														<button class="text-btn" type="submit">Approve &amp; mark paid</button>
													</form>
													<button class="text-btn danger" type="button" onclick={() => (declining = c.id)}>Decline</button>
												</div>
											{/if}
										{:else if c.status === 'approved'}
											<form method="POST" action="?/payClaim" use:enhance>
												<input type="hidden" name="id" value={c.id} />
												<button class="btn" type="submit">Mark paid</button>
											</form>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="empty">No travel claims yet. People claim from their dashboard once they qualify.</p>
			{/if}
		</section>

		<section class="block">
			<h2 class="section-label">Travel by type</h2>
			<div class="table-wrap">
				<table class="grid">
					<thead><tr><th></th><th>Visa</th><th>Flights</th><th>Accommodation</th><th>Total</th></tr></thead>
					<tbody>
						{#each ['approved', 'requested', 'unclaimed', 'paid'] as const as s (s)}
							{@const r = data.stages[s]}
							<tr><th>{STAGE[s]}</th><td>{usd(r.visa)}</td><td>{usd(r.flights)}</td><td>{usd(r.accommodation)}</td><td><strong>{usd(r.total)}</strong></td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="block">
			<h2 class="section-label">By person</h2>
			{#if data.people.length}
				<div class="table-wrap">
					<table class="grid">
						<thead><tr><th>Person</th><th>Banked (visa / flights / accom.)</th><th>To pay</th><th>Waiting</th><th>Not claimed</th><th>Paid</th><th>Their flight</th></tr></thead>
						<tbody>
							{#each data.people as p (p.id)}
								<tr>
									<th>{p.name}{#if p.email}<a class="sub" href="mailto:{p.email}">{p.email}</a>{/if}</th>
									<td>{usd(p.banked.visa)} / {usd(p.banked.flights)} / {usd(p.banked.accommodation)}</td>
									<td>{p.owed ? usd(p.owed) : '—'}</td>
									<td>{p.waiting ? usd(p.waiting) : '—'}</td>
									<td>{p.unclaimed ? usd(p.unclaimed) : '—'}</td>
									<td>{p.paid ? usd(p.paid) : '—'}</td>
									<td>
										{#if p.flightPrice !== null}
											{usd(p.flightPrice)}
											{#if p.banked.flights < p.flightPrice}<span class="sub short">they cover {usd(p.flightPrice - p.banked.flights)}</span>{/if}
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
	.grid tbody th {
		text-align: left;
		font-weight: 700;
		color: var(--navy);
	}
	.grid td,
	.grid tbody th {
		padding: 0.6rem 0.9rem;
		border-top: 1px solid var(--rule);
		vertical-align: top;
	}
	.grid td {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
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
	.st-paid {
		color: #2f7a46;
	}
	.st-declined {
		color: #9b1c1c;
	}
	.grid td.left {
		text-align: left;
	}
	.grid tr.dim th,
	.grid tr.dim td {
		color: var(--muted);
	}
	.note {
		font-style: italic;
		white-space: normal;
		max-width: 320px;
	}
	.btns {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
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
	.pay-form input {
		width: 100%;
		padding: 0.35rem 0.45rem;
		border: 2px solid var(--rule-strong);
		font: inherit;
		font-size: 0.85rem;
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
