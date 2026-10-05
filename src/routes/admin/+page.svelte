<script lang="ts">
	import '$lib/styles/app.css';
	import { enhance } from '$app/forms';
	import Footer from '$lib/components/Footer.svelte';
	import { TRAVEL_RATE } from '$lib/data';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let grantingFor = $state<string | null>(null);

	type BuilderRow = (typeof data.builders)[number];
	const sum = (k: 'approved' | 'rewards' | 'travel' | 'available') =>
		data.builders.reduce((t: number, b: BuilderRow) => t + Number(b[k]), 0);
	const round = (n: number) => Math.round(n * 100) / 100;
	// "3h", "1.5d" — waits run from hours to days
	const fmtWait = (h: number) => (h < 48 ? `${Math.round(h * 10) / 10}h` : `${Math.round((h / 24) * 10) / 10}d`);

	const totalBanked = $derived(
		data.users.reduce((sum, u) => sum + Number(u.balance.hours_available), 0)
	);
	const totalTravel = $derived(
		data.users.reduce((sum, u) => sum + Number(u.balance.hours_travel), 0)
	);
	const totalEarned = $derived(
		data.users.reduce((sum, u) => sum + Number(u.balance.hours_earned), 0)
	);
</script>

<svelte:head><title>Admin · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<h1 class="app-title">Admin</h1>
			<div class="head-actions">
				<a class="btn btn-outline" href="/admin/reviews">
					Review queue{data.pendingReviews ? ` (${data.pendingReviews})` : ''}
				</a>
				<a class="btn btn-outline" href="/admin/fulfilment">
					Fulfilment{data.claims.filter((c) => c.status === 'requested').length ? ` (${data.claims.filter((c) => c.status === 'requested').length} to send)` : ''}
				</a>
				<a class="btn btn-outline" href="/admin/projects">Projects</a>
				<a class="btn btn-outline" href="/admin/checkpoints">
					Shared checkpoints{data.sharedWaiting ? ` (${data.sharedWaiting})` : ''}
				</a>
			</div>
		</div>

		<section class="stats panel">
			<div class="stats-head">
				<p class="section-label">Right now</p>
				{#await data.activity then a}
					{#if a}<span class="hint">checked {new Date(a.checkedAt).toLocaleTimeString()}</span>{/if}
				{/await}
			</div>
			{#await data.activity}
				<p class="hint">Checking everyone's Hackatime…</p>
			{:then a}
				{#if a}
					<div class="stat-grid">
						<div class="s"><span class="s-n live">{a.activeNow}</span><span class="s-k">projects being worked on now<br /><em>last 15 min</em></span></div>
						<div class="s"><span class="s-n">{a.active24h}</span><span class="s-k">worked on today<br /><em>last 24h</em></span></div>
						<div class="s"><span class="s-n">{a.active7d}</span><span class="s-k">this week</span></div>
						<div class="s"><span class="s-n">{a.connectedProjects}</span><span class="s-k">Hackatime projects connected<br /><em>by {a.builders} builders</em></span></div>
						<div class="s"><span class="s-n">{a.trackedHours}h</span><span class="s-k">tracked on connected projects</span></div>
					</div>
					<p class="see-all"><a href="/admin/projects">See every connected project with its hours →</a></p>
					{#if a.working.length}
						<details class="working">
							<summary>Worked on in the last 24 hours ({a.working.length})</summary>
							<ul>
								{#each a.working as w (w.builder + w.project)}
									<li>
										<span class="w-p">{w.project}</span>
										<span class="w-b">{w.builder} · {w.tracked}h tracked</span>
										<span class="w-t">{new Date(w.lastBeat).toLocaleString()}</span>
									</li>
								{/each}
							</ul>
						</details>
					{/if}
					{#if a.unreachable}
						<p class="hint">Couldn't reach Hackatime for {a.unreachable} builder{a.unreachable === 1 ? '' : 's'}, so they're not counted.</p>
					{/if}
				{:else}
					<p class="hint">Couldn't load Hackatime activity just now.</p>
				{/if}
			{/await}
			<div class="stat-grid small">
				<div class="s"><span class="s-n">{data.overview.signedUp ?? '–'}</span><span class="s-k">signed up</span></div>
				<div class="s"><span class="s-n">{data.overview.hackatime ?? '–'}</span><span class="s-k">connected Hackatime</span></div>
				<div class="s"><span class="s-n">{data.pendingReviews}</span><span class="s-k">waiting for review</span></div>
				<div class="s"><span class="s-n">{data.overview.checkpoints ?? '–'}</span><span class="s-k">checkpoints posted</span></div>
			</div>
		</section>

		{#await data.analytics}
			<p class="hint analytics-loading">Loading analytics…</p>
		{:then an}
			{#if an}
				<div class="analytics">
					<section class="panel an-card">
						<p class="section-label">Sign-up funnel</p>
						<ol class="funnel">
							{#each an.funnel as f, i (f.step)}
								{@const top = an.funnel[0].n || 1}
								{@const prev = i ? an.funnel[i - 1].n : f.n}
								<li title="{f.step}: {f.n} ({Math.round((f.n / top) * 100)}% of sign-ups)">
									<span class="f-step">{f.step}</span>
									<span class="f-track"><span class="f-bar" style="width:{Math.max((f.n / top) * 100, f.n ? 1 : 0)}%"></span></span>
									<span class="f-n">{f.n}</span>
									<span class="f-pct">
										{Math.round((f.n / top) * 100)}%{#if i && prev}<em> · {Math.round((f.n / prev) * 100)}% of previous</em>{/if}
									</span>
								</li>
							{/each}
						</ol>
					</section>

					{#if an.timeline.length}
					{@const W = 720}
						{@const H = 170}
						{@const pad = { l: 28, r: 8, t: 10, b: 24 }}
						{@const max = Math.max(1, ...an.timeline.map((d) => Math.max(d.submitted, d.decided)))}
						{@const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max]}
						{@const slot = (W - pad.l - pad.r) / an.timeline.length}
						{@const bw = Math.max(2, (slot - 4) / 2)}
						{@const y = (n: number) => pad.t + (H - pad.t - pad.b) * (1 - n / max)}
						{@const totalSub = an.timeline.reduce((t, d) => t + d.submitted, 0)}
						{@const totalDec = an.timeline.reduce((t, d) => t + d.decided, 0)}
					<section class="panel an-card wide">
						<div class="tl-head">
							<p class="section-label">Submissions over the last 30 days</p>
							<p class="legend">
								<span><i class="sw sub"></i>Submitted <strong>{totalSub}</strong></span>
								<span><i class="sw dec"></i>Decided <strong>{totalDec}</strong></span>
							</p>
						</div>
						<svg class="timeline" viewBox="0 0 {W} {H}" role="img" aria-label="Submitted and decided per day over the last 30 days: {totalSub} submitted, {totalDec} decided">
							{#each ticks as t (t)}
								<line class="grid" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
								<text class="axis" x={pad.l - 6} y={y(t) + 4} text-anchor="end">{t}</text>
							{/each}
							{#each an.timeline as d, i (d.day)}
								{@const x = pad.l + i * slot + 2}
								{@const label = new Date(d.day + 'T00:00:00Z').toLocaleDateString('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
								<g class="day">
									<title>{label}: {d.submitted} submitted, {d.decided} decided</title>
									<rect class="hit" x={pad.l + i * slot} y={pad.t} width={slot} height={H - pad.t - pad.b} />
									{#if d.submitted}<rect class="bar sub" x={x} y={y(d.submitted)} width={bw} height={y(0) - y(d.submitted)} rx="2" />{/if}
									{#if d.decided}<rect class="bar dec" x={x + bw + 1} y={y(d.decided)} width={bw} height={y(0) - y(d.decided)} rx="2" />{/if}
									{#if (an.timeline.length - 1 - i) % 7 === 0}
										<text class="axis" x={pad.l + i * slot + slot / 2} y={H - 6} text-anchor="middle">{label}</text>
									{/if}
								</g>
							{/each}
							<line class="base" x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} />
						</svg>
						<details class="tl-table">
							<summary>Show as a table</summary>
							<table class="tracks-table">
								<thead><tr><th>Day</th><th>Submitted</th><th>Decided</th></tr></thead>
								<tbody>
									{#each an.timeline.filter((d) => d.submitted || d.decided) as d (d.day)}
										<tr><th>{d.day}</th><td>{d.submitted}</td><td>{d.decided}</td></tr>
									{:else}
										<tr><td colspan="3">Nothing in the last 30 days.</td></tr>
									{/each}
								</tbody>
							</table>
						</details>
					</section>
					{/if}

					<section class="panel an-card">
						<p class="section-label">Review speed</p>
						<div class="stat-grid">
							<div class="s"><span class="s-n">{an.speed.waiting}</span><span class="s-k">waiting now</span></div>
							<div class="s"><span class="s-n">{an.speed.oldestWaitingHours === null ? '–' : fmtWait(an.speed.oldestWaitingHours)}</span><span class="s-k">oldest has waited</span></div>
							<div class="s"><span class="s-n">{an.speed.medianHours === null ? '–' : fmtWait(an.speed.medianHours)}</span><span class="s-k">typical wait for a decision<br /><em>median{an.speed.averageHours !== null ? `, average ${fmtWait(an.speed.averageHours)}` : ''}</em></span></div>
							<div class="s"><span class="s-n">{an.speed.decidedThisWeek}<small> / {an.speed.submittedThisWeek}</small></span><span class="s-k">decided / submitted<br /><em>last 7 days</em></span></div>
						</div>
						{#if an.speed.reviewers.length}
							<p class="an-sub">Decisions by reviewer:
								{#each an.speed.reviewers as r, i (r.name)}<strong>{r.name}</strong> {r.n}{i < an.speed.reviewers.length - 1 ? ' · ' : ''}{/each}
							</p>
						{/if}
					</section>

					<section class="panel an-card">
						<p class="section-label">Hours</p>
						<div class="stat-grid">
							<div class="s"><span class="s-n">{an.hours.approvedHours}h</span><span class="s-k">approved<br /><em>from {an.hours.trackedOnApproved}h tracked on those projects</em></span></div>
							<div class="s"><span class="s-n">{an.hours.cutPercent === null ? '–' : `${an.hours.cutPercent}%`}</span><span class="s-k">cut on review<br /><em>tracked hours not approved</em></span></div>
							<div class="s"><span class="s-n">{an.hours.approved}<small> / {an.hours.approved + an.hours.changes + an.hours.rejected}</small></span><span class="s-k">decisions approved<br /><em>{an.hours.changes} needs changes · {an.hours.rejected} rejected</em></span></div>
						</div>
						<table class="tracks-table">
							<thead><tr><th></th><th>Submissions</th><th>Approved</th><th>Hours approved</th></tr></thead>
							<tbody>
								<tr><th>Software</th><td>{an.hours.software.submissions}</td><td>{an.hours.software.approved}</td><td>{an.hours.software.hours}h</td></tr>
								<tr><th>Hardware</th><td>{an.hours.hardware.submissions}</td><td>{an.hours.hardware.approved}</td><td>{an.hours.hardware.hours}h</td></tr>
							</tbody>
						</table>
					</section>
					<section class="panel an-card">
						<p class="section-label">Where people are from</p>
						{#if an.countries.length}
							{@const top = an.countries[0].n}
							<ol class="funnel countries">
								{#each an.countries.slice(0, 12) as c (c.country)}
									<li title="{c.country}: {c.n} {c.n === 1 ? 'person' : 'people'} ({Math.round((c.n / an.countriesKnown) * 100)}%)">
										<span class="f-step">{c.country}</span>
										<span class="f-track"><span class="f-bar" style="width:{(c.n / top) * 100}%"></span></span>
										<span class="f-n">{c.n}</span>
									</li>
								{/each}
							</ol>
							<p class="an-sub">
								From the country on each person's latest submission · {an.countriesKnown} {an.countriesKnown === 1 ? 'person' : 'people'} known{#if an.countries.length > 12} · {an.countries.length - 12} more countries{/if}
							</p>
						{:else}
							<p class="an-sub">No countries yet. They fill in from new submissions and the next Airtable sync.</p>
						{/if}
					</section>
				</div>
			{:else}
				<p class="hint">Couldn't load analytics just now.</p>
			{/if}
		{/await}

		<div class="stat-row" style="margin-bottom:2.5rem">
			<div class="stat-big">
				<span class="n">{data.users.length}</span>
				<span class="k">builders</span>
			</div>
			<div class="stat-big green">
				<span class="n">{totalBanked}h</span>
				<span class="k">available for gear</span>
			</div>
			<div class="stat-big">
				<span class="n">${(totalTravel * TRAVEL_RATE).toFixed(0)}</span>
				<span class="k">travel funds ({totalTravel}h)</span>
			</div>
			<div class="stat-big">
				<span class="n">{totalEarned}h</span>
				<span class="k">verified, all-time</span>
			</div>
		</div>

		<!-- There is currently no self-service way for a builder to request gear
		     for banked hours; the grant/deduct tool below is the only way to
		     record one, by hand, once you've agreed to it some other way (Slack,
		     email, in person). Submissions and reviews live at /admin/reviews. -->
		<section class="claims-note panel" style="margin-bottom:2.5rem">
			<p class="section-label">Reviewing submissions</p>
			<p class="hint">
				Hack Club submissions and Expedition's own review decisions are handled on the
				<a href="/admin/reviews">review queue</a>, not here. This page is only the hours ledger.
			</p>
		</section>

		<div class="b-head">
			<p class="section-label">People with approved hours</p>
			<p class="b-totals">
				<strong>{data.builders.length}</strong> people ·
				<strong>{round(sum('approved'))}h</strong> approved ·
				<strong>{round(sum('rewards'))}h</strong> on rewards ·
				<strong>{round(sum('travel'))}h</strong> banked for Dublin (${round(sum('travel') * TRAVEL_RATE)}) ·
				<strong>{round(sum('available'))}h</strong> unspent
			</p>
		</div>

		{#if data.builders.length}
			<div class="table-wrap">
				<table class="builders">
					<thead>
						<tr>
							<th>Builder</th>
							<th class="num">Approved</th>
							<th>Rewards</th>
							<th>Dublin travel fund</th>
							<th class="num">Unspent</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each data.builders as u (u.id)}
							<tr>
								<td>
									<span class="b-name">{u.name}</span>
									{#if u.email}<a class="b-email" href="mailto:{u.email}">{u.email}</a>{:else}<span class="b-email muted">no email</span>{/if}
								</td>
								<td class="num strong">{u.approved}h</td>
								<td>
									{#if u.rewards > 0}
										<span class="strong">{u.rewards}h</span>
										<span class="b-sub">
											{#each u.rewardItems as r, i (i)}{r.name}{r.status === 'requested' ? ' (to send)' : ''}{i < u.rewardItems.length - 1 ? ', ' : ''}{/each}
										</span>
									{:else}
										<span class="muted">none</span>
									{/if}
								</td>
								<td>
									{#if u.travel > 0}
										<span class="strong">{u.travel}h</span> <span class="b-sub-inline">${(u.travel * TRAVEL_RATE).toFixed(2)}</span>
										{#if u.buckets}
											<span class="b-sub">Visa {u.buckets.visa}h · Accommodation {u.buckets.accommodation}h · Flights {u.buckets.flights}h</span>
										{/if}
									{:else}
										<span class="muted">none</span>
									{/if}
									{#if u.travel > 0 || u.travelLocked}
										<form method="POST" action="?/travelLock" use:enhance class="lock">
											<input type="hidden" name="user_id" value={u.id} />
											<input type="hidden" name="locked" value={u.travelLocked ? 'no' : 'yes'} />
											{#if u.travelLocked}<span class="locked">Locked</span>{/if}
											<button class="text-btn" type="submit">{u.travelLocked ? 'Unlock' : 'Lock fund'}</button>
										</form>
									{/if}
								</td>
								<td class="num">
									<span class="strong">{u.available}h</span>
									{#if u.adjustments !== 0}
										<span class="b-sub">{u.adjustments > 0 ? '+' : ''}{u.adjustments}h corrections</span>
									{/if}
								</td>
								<td class="act">
									{#if grantingFor === u.id}
										<form
											method="POST"
											action="?/grant"
											class="grant-form"
											use:enhance={() => async ({ update }) => {
												await update();
												grantingFor = null;
											}}>
											<input type="hidden" name="user_id" value={u.id} />
											<select name="type" required>
												<option value="manual_adjustment">Correction (+/-)</option>
												<option value="reward_claimed">Reward given (deduct)</option>
											</select>
											<input name="amount" type="number" step="0.25" placeholder="Hours" required style="width:6rem" />
											<input name="note" type="text" maxlength="500" placeholder="Note (optional)" />
											<button class="btn btn-outline" type="submit">Save</button>
											<button type="button" class="link-action" onclick={() => (grantingFor = null)}>Cancel</button>
										</form>
										{#if form?.message}<p class="hint error">{form.message}</p>{/if}
									{:else}
										<button type="button" class="text-btn" onclick={() => (grantingFor = u.id)}>Adjust hours</button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="empty">Nobody has approved hours yet.</p>
		{/if}
	</div>
</main>
<Footer />

<style>
	.analytics {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
		gap: 1.2rem;
		margin-bottom: 2.5rem;
	}
	.analytics-loading {
		margin-bottom: 2.5rem;
	}
	.an-card {
		border: 2px solid var(--rule-strong);
	}
	.an-card:first-child {
		grid-column: 1 / -1;
	}
	.an-card.wide {
		grid-column: 1 / -1;
	}
	.tl-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem 1.5rem;
	}
	.legend {
		display: flex;
		gap: 1.2rem;
		font-size: 0.85rem;
		color: var(--slate);
	}
	.legend strong {
		color: var(--navy);
	}
	.sw {
		display: inline-block;
		width: 12px;
		height: 12px;
		margin-right: 0.4rem;
		border-radius: 2px;
		vertical-align: -1px;
	}
	.sw.sub,
	.bar.sub {
		background: #338eda;
		fill: #338eda;
	}
	.sw.dec,
	.bar.dec {
		background: #2f9e57;
		fill: #2f9e57;
	}
	.timeline {
		display: block;
		width: 100%;
		height: auto;
		margin-top: 0.8rem;
	}
	.timeline .grid {
		stroke: var(--rule);
		stroke-width: 1;
	}
	.timeline .base {
		stroke: var(--rule-strong);
		stroke-width: 1;
	}
	.timeline .axis {
		font-size: 11px;
		fill: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.timeline .hit {
		fill: transparent;
	}
	.timeline .day:hover .hit {
		fill: var(--paper);
	}
	.tl-table {
		margin-top: 0.6rem;
		font-size: 0.85rem;
	}
	.tl-table summary {
		cursor: pointer;
		color: var(--slate);
		font-weight: 700;
	}
	.funnel.countries li {
		grid-template-columns: 9rem minmax(0, 1fr) 2.5rem;
	}
	.funnel {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.funnel li {
		display: grid;
		grid-template-columns: 11rem minmax(0, 1fr) 3.5rem 12rem;
		align-items: center;
		gap: 0.8rem;
		font-size: 0.9rem;
	}
	.f-step {
		font-weight: 700;
		color: var(--navy);
	}
	.f-track {
		height: 14px;
		background: var(--paper);
	}
	.f-bar {
		display: block;
		height: 100%;
		background: var(--navy-soft);
		border-radius: 0 4px 4px 0;
	}
	.funnel li:hover .f-bar {
		background: var(--navy);
	}
	.f-n {
		text-align: right;
		font-weight: 800;
		color: var(--navy);
		font-variant-numeric: tabular-nums;
	}
	.f-pct {
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--slate);
	}
	.f-pct em {
		font-style: normal;
		font-weight: 500;
		color: var(--muted);
	}
	.s-n small {
		font-size: 0.55em;
		color: var(--muted);
	}
	.an-sub {
		margin-top: 1rem;
		font-size: 0.88rem;
		color: var(--slate);
	}
	.tracks-table {
		width: 100%;
		margin-top: 1.1rem;
		border-collapse: collapse;
		font-size: 0.88rem;
	}
	.tracks-table th,
	.tracks-table td {
		padding: 0.4rem 0.5rem;
		border-top: 1px solid var(--rule);
		text-align: right;
	}
	.tracks-table thead th {
		border-top: 0;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	.tracks-table tbody th {
		text-align: left;
		color: var(--navy);
	}
	@media (max-width: 700px) {
		.funnel li {
			grid-template-columns: 1fr auto;
		}
		.f-track {
			grid-column: 1 / -1;
			grid-row: 2;
		}
		.f-pct {
			grid-column: 1 / -1;
		}
		.funnel.countries li {
			grid-template-columns: 1fr auto;
		}
	}
	.b-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem 1.5rem;
		flex-wrap: wrap;
		margin-bottom: 0.6rem;
	}
	.b-totals {
		font-size: 0.9rem;
		color: var(--slate);
	}
	.table-wrap {
		overflow-x: auto;
		background: var(--white);
		border: 3px solid var(--navy);
	}
	table.builders {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.92rem;
	}
	.builders th {
		padding: 0.65rem 0.9rem;
		background: var(--navy);
		color: var(--white);
		text-align: left;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.builders td {
		padding: 0.65rem 0.9rem;
		border-top: 1px solid var(--rule);
		vertical-align: top;
	}
	.builders tbody tr:nth-child(even) td {
		background: #f7f9fb;
	}
	.builders .num {
		text-align: right;
		white-space: nowrap;
	}
	.strong {
		font-weight: 800;
		color: var(--navy);
	}
	.b-name {
		display: block;
		font-weight: 700;
		color: var(--navy);
	}
	.b-email,
	.b-sub {
		display: block;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.b-email {
		color: var(--blue-dark);
	}
	.b-sub-inline {
		font-size: 0.8rem;
		color: var(--muted);
	}
	.muted {
		color: var(--muted);
	}
	.lock {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.3rem;
	}
	.locked {
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
		color: var(--orange-dark);
	}
	.act {
		white-space: nowrap;
	}
	.stats {
		margin-bottom: 2.5rem;
		border: 3px solid var(--navy);
	}
	.stats-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
	}
	.stat-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 1rem 1.5rem;
	}
	.stat-grid.small {
		margin-top: 1.4rem;
		padding-top: 1.1rem;
		border-top: 2px solid var(--rule);
	}
	.s {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.s-n {
		font-size: clamp(1.8rem, 4vw, 2.6rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--navy);
	}
	.small .s-n {
		font-size: 1.5rem;
	}
	.s-n.live {
		color: var(--green-dark);
	}
	.s-k {
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--muted);
	}
	.s-k em {
		font-style: normal;
		font-weight: 500;
	}
	.see-all {
		margin-top: 1rem;
	}
	.see-all a {
		font-weight: 700;
		color: var(--navy);
	}
	.working {
		margin-top: 1.2rem;
	}
	.working summary {
		cursor: pointer;
		font-weight: 700;
		color: var(--navy);
	}
	.working ul {
		list-style: none;
		margin: 0.7rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-height: 320px;
		overflow-y: auto;
	}
	.working li {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto;
		gap: 1rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--rule);
		font-size: 0.9rem;
	}
	.w-p {
		font-weight: 800;
		color: var(--navy);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.w-b,
	.w-t {
		color: var(--muted);
		font-weight: 600;
	}
	.claims-note {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		align-items: flex-start;
	}
	.text-btn {
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--blue-dark);
		text-decoration: underline;
		cursor: pointer;
	}
	.grant-form {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding-top: 0.8rem;
		border-top: 1.5px solid var(--rule);
	}
	.grant-form select,
	.grant-form input[type='text'] {
		flex: 1 1 12rem;
	}
	.error {
		color: var(--red);
		width: 100%;
	}
</style>
