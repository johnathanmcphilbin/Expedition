<script lang="ts">
	import '$lib/styles/app.css';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let show = $state<'todo' | 'all'>('todo');
	let busy = $state<string | null>(null);
	const act =
		(key: string) =>
		() => {
			busy = key;
			return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
				await update({ reset: false });
				busy = null;
			};
		};

	const shown = $derived(show === 'todo' ? data.builders.filter((b) => !b.contacted) : data.builders);
	const ago = (iso: string | null) => {
		if (!iso) return 'never';
		const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
		if (h < 1) return 'just now';
		if (h < 48) return `${Math.round(h)}h ago`;
		return `${Math.round(h / 24)}d ago`;
	};
	const day = (iso: string) => new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });
	const mine = $derived(data.people.find((p) => p.id === data.me));
</script>

<svelte:head><title>Outreach · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<div>
				<h1 class="app-title">Outreach</h1>
				<p class="hint lead">
					People with a project of {data.minHours}h+ connected to Expedition who haven't shipped it yet. Message them on Slack, help them
					get it submitted, then mark them messaged. You get €{data.eurPerHour} for every hour approved for them after that.
				</p>
			</div>
		</div>

		{#if form && 'message' in form && form.message}<p class="error-box">{form.message}</p>{/if}

		<section class="totals">
			<div><span class="n">{data.builders.filter((b) => !b.contacted).length}</span><span class="k">to message</span></div>
			<div><span class="n">{data.builders.filter((b) => b.contacted).length}</span><span class="k">messaged, not shipped yet</span></div>
			<div><span class="n">{Math.round(data.builders.reduce((t, b) => t + b.unshippedHours, 0))}h</span><span class="k">waiting to be shipped</span></div>
			{#if mine}
				<div><span class="n">€{mine.eur.toFixed(2)}</span><span class="k">you've earned: {mine.hours}h approved from {mine.shipped} of the {mine.messaged} you messaged</span></div>
			{/if}
		</section>

		<section class="block">
			<div class="b-head">
				<h2 class="section-label">Builders</h2>
				<div class="seg" role="group" aria-label="Show">
					<button type="button" class:on={show === 'todo'} onclick={() => (show = 'todo')}>To message</button>
					<button type="button" class:on={show === 'all'} onclick={() => (show = 'all')}>Everyone</button>
				</div>
			</div>
			{#if shown.length}
				<div class="table-wrap">
					<table class="grid">
						<thead><tr><th>Builder</th><th>Slack</th><th>Unshipped projects</th><th>Last coded</th><th>Messaged</th></tr></thead>
						<tbody>
							{#each shown as b (b.id)}
								<tr class:dim={!!b.contacted}>
									<th>{b.name}</th>
									<td>
										{#if b.slackId}
											<a href="https://hackclub.slack.com/team/{b.slackId}" target="_blank" rel="noopener noreferrer">{b.slackId} ↗</a>
										{:else}<span class="sub">no Slack ID</span>{/if}
									</td>
									<td>
										{#each b.projects as p (p.project)}
											<span class="proj">
												<strong>{p.project}</strong> · {p.hours}h
												{#if p.changes}<span class="tag">sent back for changes: nudge them to resubmit</span>{/if}
											</span>
										{/each}
									</td>
									<td>{ago(b.lastBeat)}</td>
									<td class="act">
										{#if b.contacted}
											<span class="sub">by {b.contacted.by}, {day(b.contacted.at)}</span>
										{/if}
										<form method="POST" action="?/contacted" use:enhance={act(`c-${b.id}`)} class="note-form">
											<input type="hidden" name="user_id" value={b.id} />
											<input name="note" maxlength="1000" placeholder="Note (optional)" value={b.contacted?.note ?? ''} />
											<button class={b.contacted ? 'text-btn' : 'btn btn-sm'} type="submit" disabled={busy === `c-${b.id}`}>
												{busy === `c-${b.id}` ? 'Saving…' : b.contacted ? 'Save note' : 'Mark messaged'}
											</button>
										</form>
										{#if b.contacted && (data.isAdmin || b.contacted.byId === data.me)}
											<form method="POST" action="?/uncontacted" use:enhance={act(`u-${b.id}`)}>
												<input type="hidden" name="user_id" value={b.id} />
												<button class="text-btn" type="submit" disabled={busy === `u-${b.id}`}>Undo</button>
											</form>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="sub foot">Hours are live from Hackatime, checked {new Date(data.checkedAt).toLocaleTimeString()}. Nobody under {data.minHours}h, and nothing already submitted, unless it was sent back for changes.</p>
			{:else}
				<p class="empty">{show === 'todo' ? 'Everyone on the list has been messaged.' : 'Nobody with unshipped hours right now.'}</p>
			{/if}
		</section>

		{#if data.isAdmin}
			<section class="block two">
				<div>
					<h2 class="section-label">What outreach has earned</h2>
					{#if data.people.length}
						<div class="table-wrap">
							<table class="grid">
								<thead><tr><th>Who</th><th>Messaged</th><th>Shipped</th><th>Hours approved since</th><th>Earned</th></tr></thead>
								<tbody>
									{#each data.people as p (p.id)}
										<tr><th>{p.name}</th><td>{p.messaged}</td><td>{p.shipped}</td><td>{p.hours}h</td><td><strong>€{p.eur.toFixed(2)}</strong></td></tr>
									{/each}
								</tbody>
							</table>
						</div>
						<p class="sub foot">Approved hours for someone after they were first marked messaged, at €{data.eurPerHour} an hour.</p>
					{:else}<p class="empty">Nobody's been messaged yet.</p>{/if}
				</div>
				<div>
					<h2 class="section-label">Who can see this page</h2>
					<p class="sub">Admins, plus these emails (the one they sign in to Hack Club with).</p>
					{#if data.access.length}
						<ul class="list">
							{#each data.access as a (a.email)}
								<li>
									<span>{a.email}</span>
									<form method="POST" action="?/revoke" use:enhance={act(`r-${a.email}`)}>
										<input type="hidden" name="email" value={a.email} />
										<button class="text-btn" type="submit" disabled={busy === `r-${a.email}`}>Remove</button>
									</form>
								</li>
							{/each}
						</ul>
					{/if}
					<form method="POST" action="?/grant" use:enhance={act('grant')} class="grant">
						<input name="email" type="email" required placeholder="their@email.com" />
						<button class="btn btn-sm" type="submit" disabled={busy === 'grant'}>{busy === 'grant' ? 'Adding…' : 'Add'}</button>
					</form>
					<p class="sub">Send them <strong>/admin/outreach</strong>. Nothing else in admin opens for them.</p>
				</div>
			</section>
		{/if}
	</div>
</main>

<style>
	.lead {
		margin-top: 0.4rem;
		max-width: 760px;
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
	.foot {
		margin-top: 0.5rem;
	}
	.block {
		margin-bottom: 2.5rem;
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
		vertical-align: top;
		text-align: left;
	}
	.grid tr.dim th,
	.grid tr.dim td {
		color: var(--muted);
	}
	.grid a {
		color: var(--blue-dark);
		font-weight: 700;
		white-space: nowrap;
	}
	.proj {
		display: block;
		margin-bottom: 0.25rem;
	}
	.tag {
		display: inline-block;
		margin-left: 0.3rem;
		padding: 0.05em 0.4em;
		font-size: 0.7rem;
		font-weight: 800;
		color: #8a5a00;
		border: 1.5px solid #d98e04;
	}
	.act {
		min-width: 230px;
	}
	.act form {
		margin: 0;
	}
	.note-form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		align-items: center;
	}
	.note-form input,
	.grant input {
		flex: 1;
		min-width: 140px;
		padding: 0.35rem 0.45rem;
		border: 2px solid var(--rule-strong);
		font: inherit;
		font-size: 0.85rem;
	}
	.btn-sm {
		padding: 0.4rem 0.8rem;
		font-size: 0.8rem;
	}
	button:disabled {
		opacity: 0.55;
		cursor: wait;
	}
	.two {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 1.5rem;
	}
	.list {
		list-style: none;
		margin: 0.5rem 0;
		padding: 0;
		background: var(--white);
		border: 2px solid var(--rule-strong);
	}
	.list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.45rem 0.8rem;
		border-top: 1px solid var(--rule);
	}
	.list li:first-child {
		border-top: 0;
	}
	.list form {
		margin: 0;
	}
	.grant {
		display: flex;
		gap: 0.5rem;
		margin: 0.5rem 0;
	}
	.empty {
		color: var(--muted);
	}
</style>
