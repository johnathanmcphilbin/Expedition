<script lang="ts">
	import '$lib/styles/app.css';
	import { enhance } from '$app/forms';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let grantingFor = $state<string | null>(null);

	const totalBanked = $derived(
		data.users.reduce((sum, u) => sum + Number(u.balance.hours_available), 0)
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
			<div class="stat-big">
				<span class="n">{data.projects.length}</span>
				<span class="k">projects</span>
			</div>
			<div class="stat-big green">
				<span class="n">{totalBanked}h</span>
				<span class="k">banked, all accounts</span>
			</div>
			<div class="stat-big">
				<span class="n">{totalEarned}h</span>
				<span class="k">verified, all-time</span>
			</div>
		</div>

		<!-- "YSWS Project Submission" in this base is Hack Club's own Unified YSWS
		     pipeline (/submit-to-hackclub) — a separate track from Expedition's
		     hours, not a source of reward-claim requests. There is currently no
		     self-service way for a builder to request gear for banked hours; the
		     grant/deduct tool below is the only way to record one, by hand, once
		     you've agreed to it some other way (Slack, email, in person). -->
		<section class="claims-note panel" style="margin-bottom:2.5rem">
			<p class="section-label">Hack Club submissions</p>
			<p class="hint">
				Builders can send a finished project to Hack Club's own Unified YSWS review — separate
				from Expedition's hours, and not something this app reads back. Check submissions there
				if you need to.
			</p>
			<a
				class="link-action"
				href="https://airtable.com/appGcYrt3CFYab05y"
				target="_blank"
				rel="noopener noreferrer">
				Open the Airtable base ↗
			</a>
		</section>

		<p class="section-label">Every project</p>
		{#if data.projects.length}
			<div class="row-list" style="margin-bottom:2.5rem">
				{#each data.projects as p (p.id)}
					<div class="row">
						<span class="row-title">{p.title}</span>
						<span class="row-meta">
							{p.owner?.display_name ?? 'unknown'}{p.owner?.email ? ` · ${p.owner.email}` : ''}
						</span>
						<span class="row-meta">
							{p.hours?.hours_earned ?? 0}h verified &middot;
							{p.hours?.checkpoints_approved ?? 0} checkpoints &middot;
							{p.hackatime_project ?? 'no Hackatime project'}
						</span>
					</div>
				{/each}
			</div>
		{:else}
			<p class="empty" style="margin-bottom:2.5rem">No projects yet.</p>
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
								<option value="travel_allocation">Travel support (deduct)</option>
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
