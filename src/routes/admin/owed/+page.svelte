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
			<h2 class="section-label">What you can spend</h2>
			{#await data.money}
				<p class="hint">Checking HCB…</p>
			{:then m}
				{#if m}
					<div class="totals spend">
						<div><span class="n" class:neg={m.spendUsd < 0}>{usd(m.spendUsd)}</span><span class="k">yours to spend: in the bank, less what participants still hold</span></div>
						<div><span class="n">{usd(m.stillToCome)}</span><span class="k">next from Max: {m.stillToComeHours}h approved he hasn't paid for yet, at $8.50</span></div>
						<div><span class="n">{usd(m.hcb.balance)}</span><span class="k">in the bank (<a href={m.hcbUrl} target="_blank" rel="noopener noreferrer">HCB</a>)</span></div>
						<div><span class="n">{usd(m.heldUsd)}</span><span class="k">held by participants, not paid out yet</span></div>
						<div><span class="n" class:neg={m.spendAfterUsd < 0}>{usd(m.spendAfterUsd)}</span><span class="k">yours to spend once HQ pays for the {m.stillToComeHours}h still to come</span></div>
						<div><span class="n" class:neg={m.likelyAfterUsd < 0}>{usd(m.likelyAfterUsd)}</span><span class="k">likely, then: if people keep spending {m.shopSharePct}% of hours in the shop</span></div>
					</div>
					<div class="table-wrap">
						<table class="grid spend-table">
							<tbody>
								<tr><th>Max has sent for approved hours</th><td>{usd(m.hcb.fromHq)}</td><td class="left">Payouts Clearinghouse and Hack Club HQ transfers on HCB = {m.hoursPaid}h at $8.50</td></tr>
								<tr><th>In the bank</th><td>{usd(m.hcb.balance)}</td><td class="left">live from HCB</td></tr>
								<tr><th>Less unspent hours, shop buyers</th><td>−{usd(m.shopperHours * m.shopRate)}</td><td class="left">{m.shopperHours}h at ${m.shopRate}: they've bought from the shop, so you keep $3.50 an hour</td></tr>
								<tr><th>Less unspent hours, trip already covered</th><td>−{usd(m.coveredHours * m.shopRate)}</td><td class="left">{m.coveredHours}h at ${m.shopRate}: past what their flight and visa still need, so it can only go on the shop</td></tr>
								<tr><th>Less hours of people who can't come</th><td>−{usd(m.cantComeHours * m.shopRate)}</td><td class="left">{m.cantComeHours}h at ${m.shopRate} across {m.cantComePeople} {m.cantComePeople === 1 ? 'person' : 'people'} (e.g. visa refused), travel they'd banked included: it can only go on the shop. Mark people on the admin page.</td></tr>
								<tr><th>Less unspent hours their trip still needs</th><td>−{usd(m.travelHours * 8)}</td><td class="left">{m.travelHours}h at $8 for flights, visas or accommodation</td></tr>
								<tr><th>Less unspent hours, no trip estimate yet</th><td>−{usd(m.unknownHours * 8)}</td><td class="left">{m.unknownHours}h at $8, the worst case: no home airport yet (Find missing airports on the admin page)</td></tr>
								<tr><th>Less travel banked or claimed, not paid</th><td>−{usd(m.travelUsd)}</td><td class="left">visa, flights and accommodation</td></tr>
								<tr><th>Less shop items to send</th><td>−{usd(m.shopUsd)}</td><td class="left">at what they're worth</td></tr>
								<tr><th>Less reviewer cash owed</th><td>−{usd(m.reviewerCashUsd)}</td><td></td></tr>
								<tr class="total-row"><th>Yours to spend now</th><td>{usd(m.spendUsd)}</td><td></td></tr>
								<tr><th>Plus next from Max</th><td>+{usd(m.stillToCome)}</td><td class="left">{m.approved}h approved − {m.hoursPaid}h Max has paid for ({usd(m.hcb.fromHq)} ÷ $8.50) = {m.stillToComeHours}h × $8.50</td></tr>
								<tr class="total-row"><th>Yours to spend once it arrives</th><td>{usd(m.spendAfterUsd)}</td><td class="left">worst case</td></tr>
								<tr><th>Likely shop spending</th><td>+{usd(m.likelySavingUsd)}</td><td class="left">{m.shopSharePct}% of hours spent so far went on the shop ({m.spentShop}h shop, {m.spentTravel}h travel), so that share of the {usd(m.travelHours * 8 + m.unknownHours * 8)} above probably costs $5 an hour, not $8</td></tr>
								<tr class="total-row"><th>Likely yours to spend</th><td>{usd(m.likelyUsd)}</td><td class="left">now; {usd(m.likelyAfterUsd)} once Max's next payment arrives</td></tr>
							</tbody>
						</table>
					</div>
					<p class="hint">
						Shop items already bought are out of the bank and ones still to send are at their value, so the shop's $3.50 an hour is already counted there.
						If shop buyers put their hours into travel instead, it'd cost $3 an hour more.
						HCB checked {new Date(m.hcb.checkedAt).toLocaleTimeString()}.
					</p>
				{:else}
					<p class="hint">Couldn't reach HCB just now.</p>
				{/if}
			{/await}
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
									<td>
										{#if p.unclaimed}
											{usd(p.unclaimed)}
											<form method="POST" action="?/claimFor" use:enhance={({ cancel }) => { if (!confirm(`Claim ${usd(p.unclaimed)} for ${p.name}? This skips the qualify check.`)) cancel(); }}>
												<input type="hidden" name="user_id" value={p.id} />
												<button class="text-btn" type="submit">Claim for them</button>
											</form>
										{:else}—{/if}
									</td>
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
				{#if data.challenge}
					<p class="sub">Challenge ({data.challenge.prize} for spending {data.challenge.spend}h): {data.challenge.taken} of {data.challenge.spots} won.</p>
				{/if}
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
	.total-row th,
	.total-row td {
		font-weight: 800;
		border-top: 2px solid currentColor;
	}
	.neg {
		color: #c81e1e;
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
