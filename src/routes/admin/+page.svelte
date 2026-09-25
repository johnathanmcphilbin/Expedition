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
			</div>
		</div>

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
								<option value="travel_allocation">Move into travel fund (deduct)</option>
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
