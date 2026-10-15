<script lang="ts">
	import '$lib/styles/app.css';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let open = $state<string | null>(null);
	const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
	const STATUS: Record<string, string> = { active: 'Active', held: 'Held', rejected: 'Rejected' };
</script>

<svelte:head><title>Referrals · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<div>
				<h1 class="app-title">Referrals</h1>
				<p class="hint lead">
					{usd(data.config.reward_cents)} once per referred builder, when their first project is approved ({data.config.min_approved_hours}+ approved hours).
					Joined means they connected Hackatime; active means they've submitted a project.
				</p>
			</div>
			<form method="POST" action="?/reconcile" use:enhance>
				<button class="btn btn-outline" type="submit">Reconcile unpaid</button>
			</form>
		</div>

		{#if form && 'message' in form && form.message}<p class="error-box">{form.message}</p>{/if}
		{#if form && 'done' in form && form.done}<p class="notice">{form.done}</p>{/if}

		<section class="totals">
			<div><span class="n">{data.totals.clicks}</span><span class="k">link clicks</span></div>
			<div><span class="n">{data.totals.uniqueVisitors}</span><span class="k">unique visitors (approx.)</span></div>
			<div><span class="n">{data.totals.attributed}</span><span class="k">referred accounts{data.totals.held ? ` · ${data.totals.held} held` : ''}</span></div>
			<div><span class="n">{data.totals.joined}</span><span class="k">joined (Hackatime connected)</span></div>
			<div><span class="n">{data.totals.active}</span><span class="k">active (submitted)</span></div>
			<div><span class="n">{data.totals.approvedProjects}</span><span class="k">approved projects · {data.totals.approvedBuilders} builders</span></div>
			<div><span class="n">{usd(data.totals.creditCents)}</span><span class="k">referral credit paid</span></div>
		</section>

		<section class="block">
			<h2 class="section-label">Budget</h2>
			<table class="money">
				<tbody>
					<tr><th>Approved build hours</th><td>{data.budget.approvedHours}h</td></tr>
					<tr><th>Gross program budget ({usd(data.config.budget_cents_per_hour)}/h)</th><td>{usd(data.budget.grossCents)}</td></tr>
					<tr><th>Participant rewards <span class="muted">(shop at item value, the rest as travel at {usd(data.config.hour_value_cents)}/h)</span></th><td>−{usd(data.budget.participantCents)}</td></tr>
					<tr><th>Reviewer pay</th><td>−{usd(data.budget.reviewerCents)}</td></tr>
					<tr><th>Referral rewards <span class="muted">({data.budget.referralPctOfBudget}% of budget)</span></th><td>−{usd(data.budget.referralCents)}</td></tr>
					<tr class="total" class:neg={data.budget.remainingCents < 0}><th>Remaining</th><td>{usd(data.budget.remainingCents)}</td></tr>
				</tbody>
			</table>
		</section>

		<section class="block">
			<h2 class="section-label">Referrers</h2>
			{#if data.referrers.length}
				<div class="table-wrap">
					<table class="people">
						<thead><tr><th>Referrer</th><th>Code</th><th>Clicks</th><th>Referred</th><th>Approved projects</th><th>Credit</th><th></th></tr></thead>
						<tbody>
							{#each data.referrers as r (r.id)}
								<tr>
									<td><span class="who">{r.name}</span>{#if r.email}<span class="sub">{r.email}</span>{/if}</td>
									<td>
										<code>{r.code ?? '—'}</code>
										{#if r.code}
											<form method="POST" action="?/code" use:enhance class="inline">
												<input type="hidden" name="code" value={r.code} />
												<input type="hidden" name="active" value={r.codeActive ? 'no' : 'yes'} />
												<button class="text-btn" type="submit">{r.codeActive ? 'Disable' : 'Enable'}</button>
											</form>
										{/if}
									</td>
									<td>{r.clicks}</td>
									<td>{r.referred.length}</td>
									<td>{r.approvedProjects} <span class="sub">{r.approvedBuilders} builders</span></td>
									<td>{usd(r.creditCents)}</td>
									<td><button class="text-btn" type="button" onclick={() => (open = open === r.id ? null : r.id)}>{open === r.id ? 'Close' : 'Inspect'}</button></td>
								</tr>
								{#if open === r.id}
									<tr class="inspect">
										<td colspan="7">
											{#each r.referred as p (p.id)}
												<div class="ref-row">
													<div class="rr-head">
														<strong>{p.name}</strong>
														<span class="badge b-{p.status}">{STATUS[p.status]}</span>
														<span class="sub">joined {new Date(p.joinedAt).toLocaleDateString('en-IE')}</span>
														{#if p.flag}<span class="flag">⚑ {p.flag}</span>{/if}
													</div>
													{#each p.rewards as w (w.id)}
														<div class="reward" class:rev={w.status === 'reversed'}>
															<span>{w.project_names.join(' + ')} · {w.approved_hours}h approved · {usd(w.amount_cents)} ({w.hours}h)</span>
															<span class="sub">{new Date(w.created_at).toLocaleDateString('en-IE')}{w.status === 'reversed' ? ` · reversed${w.note ? `: ${w.note}` : ''}` : ''}</span>
															{#if w.status === 'earned'}
																<form method="POST" action="?/reverse" use:enhance class="inline">
																	<input type="hidden" name="reward_id" value={w.id} />
																	<input name="note" placeholder="Reason" maxlength="500" required />
																	<button class="text-btn danger" type="submit">Reverse</button>
																</form>
															{/if}
														</div>
													{:else}
														<p class="sub">No approved projects yet.</p>
													{/each}
													<form method="POST" action="?/attribution" use:enhance class="inline ops">
														<input type="hidden" name="referred_id" value={p.id} />
														<input name="note" placeholder="Note (needed to flag or reject)" maxlength="500" />
														<button class="text-btn" type="submit" name="op" value="flag">Flag</button>
														{#if p.status === 'held'}
															<button class="text-btn" type="submit" name="op" value="release">Release</button>
														{:else if p.status === 'active'}
															<button class="text-btn" type="submit" name="op" value="hold">Hold rewards</button>
														{/if}
														{#if p.status !== 'rejected'}
															<button class="text-btn danger" type="submit" name="op" value="reject">Reject (reverses rewards)</button>
														{/if}
													</form>
												</div>
											{:else}
												<p class="sub">Nobody has joined through this link yet.</p>
											{/each}
										</td>
									</tr>
								{/if}
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="empty">No referrals yet.</p>
			{/if}
			{#if data.clickOnly.length}
				<p class="sub" style="margin-top:0.8rem">
					Clicked, no sign-ups yet: {data.clickOnly.map((c) => `${c.name} (${c.clicks})`).join(', ')}
				</p>
			{/if}
		</section>

		<section class="block">
			<h2 class="section-label">Admin actions</h2>
			{#if data.audit.length}
				<ul class="audit">
					{#each data.audit as a (a.id)}
						<li><span class="sub">{new Date(a.created_at).toLocaleString('en-IE')}</span> <strong>{a.admin}</strong> {a.action.replace(/_/g, ' ')} {a.note ? `· ${a.note}` : ''}</li>
					{/each}
				</ul>
			{:else}
				<p class="empty">Nothing yet.</p>
			{/if}
		</section>
	</div>
</main>

<style>
	.lead {
		margin-top: 0.4rem;
		max-width: 720px;
	}
	.notice {
		margin-bottom: 1rem;
	}
	.totals {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
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
	.money {
		width: 100%;
		max-width: 560px;
		border-collapse: collapse;
		background: var(--white);
		border: 2px solid var(--rule-strong);
	}
	.money th,
	.money td {
		padding: 0.5rem 0.8rem;
		border-top: 1px solid var(--rule);
		text-align: left;
		font-weight: 600;
		color: var(--slate);
	}
	.money td {
		text-align: right;
		font-variant-numeric: tabular-nums;
		color: var(--navy);
	}
	.money .total th,
	.money .total td {
		font-weight: 800;
		color: var(--navy);
		border-top: 2px solid var(--navy);
	}
	.money .total.neg td {
		color: #9b1c1c;
	}
	.muted {
		color: var(--muted);
		font-weight: 500;
	}
	.table-wrap {
		overflow-x: auto;
		background: var(--white);
		border: 3px solid var(--navy);
	}
	table.people {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.92rem;
	}
	.people th {
		padding: 0.6rem 0.9rem;
		background: var(--navy);
		color: var(--white);
		text-align: left;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.people td {
		padding: 0.6rem 0.9rem;
		border-top: 1px solid var(--rule);
		vertical-align: top;
	}
	.who {
		font-weight: 700;
		color: var(--navy);
	}
	.inline {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}
	.inline input {
		padding: 0.3rem 0.45rem;
		border: 2px solid var(--rule-strong);
		font: inherit;
		font-size: 0.82rem;
	}
	.inspect td {
		background: #f4f7fa;
	}
	.ref-row {
		padding: 0.6rem 0;
		border-bottom: 1px solid var(--rule);
	}
	.rr-head {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.8rem;
		align-items: baseline;
	}
	.badge {
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
	}
	.b-active {
		color: #2f7a46;
	}
	.b-held {
		color: #a34a00;
	}
	.b-rejected {
		color: #9b1c1c;
	}
	.flag {
		color: #9b1c1c;
		font-size: 0.85rem;
	}
	.reward {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.8rem;
		align-items: center;
		margin: 0.4rem 0 0 0.8rem;
		font-size: 0.88rem;
	}
	.reward.rev span:first-child {
		text-decoration: line-through;
		color: var(--muted);
	}
	.ops {
		margin-top: 0.5rem;
	}
	.audit {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 0.88rem;
	}
	.audit li {
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--rule);
	}
	.audit .sub {
		display: inline;
	}
</style>
