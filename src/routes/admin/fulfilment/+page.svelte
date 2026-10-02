<script lang="ts">
	import '$lib/styles/app.css';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const TABS = [
		{ value: 'requested', label: 'To send' },
		{ value: 'fulfilled', label: 'Sent' },
		{ value: 'cancelled', label: 'Cancelled' }
	] as const;

	let busy = $state<string | null>(null);
	let copied = $state<string | null>(null);

	async function copy(id: string, lines: string[]) {
		try {
			await navigator.clipboard.writeText(lines.join('\n'));
			copied = id;
			setTimeout(() => (copied = null), 1500);
		} catch {
			/* clipboard blocked; the address is still selectable */
		}
	}

	function ago(iso: string) {
		const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
		if (mins < 60) return `${Math.max(mins, 1)}m ago`;
		const hrs = Math.round(mins / 60);
		if (hrs < 48) return `${hrs}h ago`;
		return `${Math.round(hrs / 24)}d ago`;
	}
</script>

<svelte:head><title>Fulfilment · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<div>
				<h1 class="app-title">Fulfilment</h1>
				<p class="hint lead">Everything people have claimed from the shop. Mark it sent once it's on its way.</p>
			</div>
		</div>

		<nav class="tabs" aria-label="Filter claims">
			{#each TABS as t (t.value)}
				<a href="/admin/fulfilment?status={t.value}" class:active={data.tab === t.value}>
					{t.label}<span class="tab-count">{data.counts[t.value]}</span>
				</a>
			{/each}
		</nav>

		{#if form && 'message' in form && form.message}
			<p class="error-box">{form.message}</p>
		{/if}

		{#if data.claims.length}
			<ul class="claims">
				{#each data.claims as c (c.id)}
					<li class="claim">
						<div class="c-main">
							<div class="c-head">
								<span class="c-reward">{c.reward}</span>
								<span class="c-hours">{c.hours}h</span>
							</div>
							<p class="c-who">
								<strong>{c.name}</strong>
								{#if c.email}· <a href="mailto:{c.email}">{c.email}</a>{/if}
							</p>
							<p class="c-when">
								Claimed {new Date(c.createdAt).toLocaleDateString()} ({ago(c.createdAt)})
								{#if c.fulfilledAt}· sent {new Date(c.fulfilledAt).toLocaleDateString()}{/if}
							</p>
							{#if c.note}<p class="c-note"><span>Their note:</span> {c.note}</p>{/if}
							{#if c.adminNotes}<p class="c-note"><span>Your note:</span> {c.adminNotes}</p>{/if}
						</div>

						{#if data.tab === 'requested'}
							<div class="c-ship">
								<p class="c-label">Ship to</p>
								{#if c.address}
									<address>{#each c.address as line, i (i)}{line}<br />{/each}</address>
									<button type="button" class="text-btn" onclick={() => copy(c.id, c.address ?? [])}>
										{copied === c.id ? 'Copied' : 'Copy address'}
									</button>
								{:else}
									<p class="no-addr">
										{c.hasSubmission ? "Couldn't load their address from Hack Club." : 'No address on file: they haven’t submitted a project yet.'}
										{#if c.email}Email them for it.{/if}
									</p>
								{/if}
							</div>

							<form
								class="c-actions"
								method="POST"
								use:enhance={({ submitter }) => {
									busy = c.id + (submitter?.getAttribute('formaction') ?? '');
									return async ({ update }) => {
										await update();
										busy = null;
									};
								}}>
								<input type="hidden" name="claim_id" value={c.id} />
								<input name="admin_notes" type="text" maxlength="500" placeholder="Note, e.g. tracking number (optional)" aria-label="Note" />
								<div class="c-btns">
									<button class="btn" type="submit" formaction="?/sent" disabled={!!busy}>Mark sent</button>
									<button class="text-btn danger" type="submit" formaction="?/cancel" disabled={!!busy}>Cancel &amp; refund hours</button>
								</div>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty">{data.tab === 'requested' ? 'Nothing waiting to be sent.' : 'Nothing here.'}</p>
		{/if}
	</div>
</main>

<style>
	.lead {
		margin-top: 0.4rem;
	}
	.tabs {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-bottom: 1.4rem;
	}
	.tabs a {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.45rem 0.8rem;
		border: 2px solid var(--rule-strong);
		background: var(--white);
		text-decoration: none;
		font-weight: 700;
		font-size: 0.88rem;
		color: var(--slate);
	}
	.tabs a.active {
		border-color: var(--navy);
		background: var(--navy);
		color: var(--white);
	}
	.tab-count {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		opacity: 0.75;
	}

	.claims {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}
	.claim {
		display: grid;
		grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1.1fr);
		gap: 1rem 1.6rem;
		align-items: start;
		padding: 1.1rem 1.3rem;
		background: var(--white);
		border: 2px solid var(--rule);
	}
	.c-head {
		display: flex;
		align-items: baseline;
		gap: 0.7rem;
	}
	.c-reward {
		font-size: 1.1rem;
		font-weight: 800;
		color: var(--navy);
	}
	.c-hours {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--muted);
	}
	.c-who {
		margin-top: 0.3rem;
		font-size: 0.92rem;
	}
	.c-who a {
		color: var(--blue-dark);
	}
	.c-when {
		margin-top: 0.2rem;
		font-size: 0.82rem;
		color: var(--muted);
		font-weight: 600;
	}
	.c-note {
		margin-top: 0.4rem;
		font-size: 0.9rem;
		color: var(--slate);
	}
	.c-note span {
		font-weight: 700;
		color: var(--navy);
	}
	.c-label {
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--muted);
	}
	address {
		margin-top: 0.3rem;
		font-style: normal;
		font-size: 0.9rem;
		line-height: 1.45;
		color: var(--ink);
	}
	.no-addr {
		margin-top: 0.3rem;
		font-size: 0.88rem;
		color: var(--orange-dark);
		font-weight: 600;
	}
	.c-actions {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.c-actions input {
		font-size: 0.9rem;
		padding: 0.55em 0.7em;
	}
	.c-btns {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		flex-wrap: wrap;
	}
	.text-btn {
		background: none;
		border: 0;
		padding: 0;
		margin-top: 0.4rem;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--blue-dark);
		text-decoration: underline;
		cursor: pointer;
	}
	.text-btn.danger {
		margin-top: 0;
		color: var(--red-dark);
	}
	@media (max-width: 900px) {
		.claim {
			grid-template-columns: 1fr;
		}
	}
</style>
