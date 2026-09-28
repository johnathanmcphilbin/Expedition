<script lang="ts">
	import '$lib/styles/app.css';
	import { enhance } from '$app/forms';
	import Footer from '$lib/components/Footer.svelte';
	import { TRAVEL_RATE } from '$lib/data';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let grantingFor = $state<string | null>(null);

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

		<p class="section-label">Reward claims</p>
		{#if data.claims.length}
			<div class="row-list roster" style="margin-bottom:2.5rem">
				{#each data.claims as c (c.id)}
					<div class="roster-row">
						<div class="roster-id">
							<span class="row-title">{c.reward_name}</span>
							<span class="row-meta">
								{c.owner?.display_name ?? 'unknown'}{c.owner?.email ? ` · ${c.owner.email}` : ''}
							</span>
							{#if c.note}<span class="row-meta">“{c.note}”</span>{/if}
						</div>
						<div class="roster-balance">
							<span class="row-title">{c.hours_cost}h</span>
							<span class="row-meta">{new Date(c.created_at).toLocaleDateString()}</span>
						</div>
						<span class="status status-{c.status === 'fulfilled'
							? 'approved'
							: c.status === 'cancelled'
								? 'rejected'
								: 'pending'}">{c.status}</span>

						{#if c.status === 'requested'}
							<form method="POST" action="?/fulfil" use:enhance style="display:inline">
								<input type="hidden" name="claim_id" value={c.id} />
								<button class="btn btn-outline" type="submit">Mark sent</button>
							</form>
							<form method="POST" action="?/cancel" use:enhance style="display:inline">
								<input type="hidden" name="claim_id" value={c.id} />
								<button class="link-action" type="submit">Cancel &amp; refund</button>
							</form>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<p class="empty" style="margin-bottom:2.5rem">No claims yet.</p>
		{/if}

		<p class="section-label">Everyone's hours</p>
		<div class="row-list roster">
			{#each data.users as u (u.id)}
				<div class="roster-row">
					<div class="roster-id">
						<span class="row-title">{u.display_name ?? 'Unnamed'}</span>
						<span class="row-meta">
							{u.email ?? 'no email on file'}{u.slack_id ? ` · Slack ${u.slack_id}` : ''}
						</span>
					</div>
					<div class="roster-balance">
						<span class="row-title">{u.balance.hours_available}h</span>
						<span class="row-meta">
							{u.balance.hours_earned}h earned &middot; {u.balance.hours_spent}h spent
						</span>
						{#if Number(u.balance.hours_travel) > 0 || u.travel_locked_at}
							<span class="row-meta">
								{u.balance.hours_travel}h for Dublin (${(Number(u.balance.hours_travel) * TRAVEL_RATE).toFixed(2)})
								{#if u.travel_locked_at}&middot; <strong>locked</strong>{/if}
							</span>
							{#if data.travelBuckets[u.id]}
								{@const b = data.travelBuckets[u.id]}
								<span class="row-meta">
									Visa {b.visa}h &middot; Accommodation {b.accommodation}h &middot; Flights {b.flights}h
								</span>
							{/if}
							<form method="POST" action="?/travelLock" use:enhance>
								<input type="hidden" name="user_id" value={u.id} />
								<input type="hidden" name="locked" value={u.travel_locked_at ? 'no' : 'yes'} />
								<button class="text-btn" type="submit">
									{u.travel_locked_at ? 'Unlock travel fund' : 'Lock travel fund'}
								</button>
							</form>
						{/if}
					</div>

					{#if grantingFor === u.id}
						<form
							method="POST"
							action="?/grant"
							class="grant-form"
							use:enhance={() => {
								return async ({ update }) => {
									await update();
									grantingFor = null;
								};
							}}>
							<input type="hidden" name="user_id" value={u.id} />
							<select name="type" required>
								<option value="manual_adjustment">Correction (+/-)</option>
								<option value="reward_claimed">Reward given (deduct)</option>
							</select>
							<input
								name="amount"
								type="number"
								step="0.25"
								placeholder="Hours"
								required
								style="width:6rem" />
							<input name="note" type="text" maxlength="500" placeholder="Note (optional)" />
							<button class="btn btn-outline" type="submit">Save</button>
							<button
								type="button"
								class="link-action"
								onclick={() => (grantingFor = null)}>
								Cancel
							</button>
						</form>
						{#if form?.message}
							<p class="hint error">{form.message}</p>
						{/if}
					{:else}
						<button
							type="button"
							class="btn btn-outline"
							onclick={() => (grantingFor = u.id)}>
							Grant / deduct
						</button>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</main>
<Footer />

<style>
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
	.roster {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.roster-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		border: 1.5px solid var(--rule);
	}
	.roster-id {
		display: flex;
		flex-direction: column;
		min-width: 14rem;
		flex: 1;
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
	.roster-balance {
		display: flex;
		flex-direction: column;
		text-align: right;
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
