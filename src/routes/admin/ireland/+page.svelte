<script lang="ts">
	import '$lib/styles/app.css';
	import type { IrelandSignupStatus } from '$lib/ireland';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let q = $state('');
	let show = $state<'all' | IrelandSignupStatus>('all');

	const rows = $derived(data.signups ?? []);
	const shown = $derived(
		rows.filter((row) => {
			if (show !== 'all' && row.status !== show) return false;
			const needle = q.trim().toLowerCase();
			if (!needle) return true;
			return [row.name, row.email, row.school, row.county, row.github_username, row.built_note, row.built_url]
				.filter(Boolean)
				.join(' ')
				.toLowerCase()
				.includes(needle);
		})
	);

	const atCap = $derived(!!data.counts && !!data.settings && data.counts.approved >= data.settings.capacity);
	const day = (iso: string | null) =>
		iso ? new Date(iso).toLocaleString('en-IE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
</script>

<svelte:head><title>Ireland sign-ups · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<div>
				<h1 class="app-title">Ireland</h1>
				<p class="hint lead">Students in Ireland signing up for Galway. Approving someone does not email them from this site.</p>
			</div>
			<div class="head-actions">
				<a class="btn btn-outline" href="/admin/ireland/export">Export approved CSV</a>
				<a class="btn btn-outline" href="/admin">Admin</a>
			</div>
		</div>

		{#if form?.message}
			<p class={form.ok ? 'notice' : 'error-box'}>{form.message}</p>
		{/if}

		{#if !data.ready}
			<p class="error-box">
				The Ireland tables aren’t there yet. Apply <code>supabase/migrations/0047_ireland_signups.sql</code> to the Expedition database.
				It only adds tables.
			</p>
			{#if data.message}<p class="hint">{data.message}</p>{/if}
		{:else if data.settings && data.counts}
			<section class="totals">
				<div><span class="n">{data.counts.approved}</span><span class="k">approved of {data.settings.capacity}</span></div>
				<div><span class="n">{data.counts.pending}</span><span class="k">pending</span></div>
				<div><span class="n">{data.counts.holding}</span><span class="k">approved + pending, of {data.settings.capacity}</span></div>
				<div><span class="n">{data.counts.waitlist}</span><span class="k">waitlist</span></div>
				<div><span class="n">{data.counts.rejected}</span><span class="k">rejected</span></div>
			</section>

			<section class="panel settings">
				<h2 class="section-label">Sign-ups</h2>
				<p class="hint">
					Right now sign-ups are {data.settings.open ? 'open' : 'closed'}.
					{#if data.settings.openSource === 'env'}
						<strong>IRELAND_SIGNUPS_OPEN is overriding this switch.</strong>
					{/if}
					{#if data.settings.capacitySource === 'env'}
						<strong>IRELAND_CAPACITY is overriding the number below.</strong> In use: {data.settings.capacity}.
					{/if}
				</p>
				<form method="POST" action="?/settings" class="settings-form">
					<label class="check">
						<input type="checkbox" name="open" checked={data.settings.dbOpen} />
						Open sign-ups
					</label>
					<label class="cap">
						Capacity
						<input name="capacity" type="number" min="0" max="10000" required value={data.settings.dbCapacity} />
					</label>
					<button class="btn btn-plain" type="submit">Save</button>
				</form>
				<p class="hint">
					New sign-ups are pending until approved + pending reaches capacity, then they waitlist. Rejecting someone moves the oldest waitlisted person to pending.
					Approving past {data.settings.capacity} approved people needs the override on that row.
				</p>
			</section>

			<section class="handoff">
				<h2 class="section-label">Getting them into Attend</h2>
				{#if data.attend.on}
					<p class="hint">
						Attend is on for <strong>{data.attend.eventId}</strong>. Approving someone invites them with
						<code>POST /api/v1/events/{data.attend.eventId}/participants</code>.
						Rejecting them here does not remove them from Attend.
					</p>
					<form method="POST" action="?/attend_all">
						<button class="btn btn-outline" type="submit">Send approved people who aren’t on Attend yet</button>
					</form>
				{:else}
					<p class="hint">
						Attend isn’t connected. Download the CSV and import it on the Expedition event in Attend.
						The file starts with Email, First Name, Last Name, Country and State, which is what Attend’s importer reads.
						Age, school, county, GitHub and what they built are extra columns. Attend ignores those.
						A one-word name is exported with last name Unknown, which Attend treats as a placeholder.
						To send invites from here instead, set <code>ATTEND_API_TOKEN</code> and <code>ATTEND_EVENT_ID</code>. It’s off until both are set.
					</p>
				{/if}
			</section>

			<section>
				<div class="b-head">
					<h2 class="section-label">{shown.length} of {rows.length}</h2>
					<div class="tools">
						<label class="search">
							<span class="visually-hidden">Search sign-ups</span>
							<input type="search" placeholder="Search" bind:value={q} />
						</label>
						<div class="seg" role="group" aria-label="Filter by status">
							{#each ['all', 'pending', 'waitlist', 'approved', 'rejected'] as status (status)}
								<button type="button" class:on={show === status} onclick={() => (show = status as typeof show)}>{status}</button>
							{/each}
						</div>
					</div>
				</div>

				{#if shown.length === 0}
					<p class="empty">{rows.length ? 'Nothing matches.' : 'No sign-ups yet.'}</p>
				{:else}
					<ul class="people">
						{#each shown as row (row.id)}
							<li>
								<div class="who">
									<div>
										<strong>{row.name}</strong>
										<span class="age">{row.age}</span>
										<span class="status status-{row.status}">{row.status}</span>
									</div>
									<span class="meta">{row.email}</span>
									<span class="meta">{row.school} · {row.county}</span>
									{#if row.github_username}<span class="meta">GitHub: {row.github_username}</span>{/if}
									{#if row.built_note}<span class="built">{row.built_note}</span>{/if}
									{#if row.built_url}<a class="meta link" href={row.built_url} target="_blank" rel="noopener noreferrer">{row.built_url}</a>{/if}
									<span class="meta">Signed up {day(row.created_at)}{#if row.decided_at} · decided {day(row.decided_at)}{/if}</span>
									{#if row.attend_synced_at}
										<span class="meta on-attend">On Attend{row.attend_participant_event_id ? ` · ${row.attend_participant_event_id}` : ''} · {day(row.attend_synced_at)}</span>
									{:else if row.attend_error}
										<span class="meta attend-err">Attend: {row.attend_error}</span>
									{/if}
								</div>
								<div class="acts">
									{#if row.status !== 'approved'}
										<form method="POST" action="?/approve">
											<input type="hidden" name="id" value={row.id} />
											{#if atCap}
												<label class="override"><input type="checkbox" name="override" /> Past capacity</label>
											{/if}
											<button class="btn btn-plain" type="submit">Approve</button>
										</form>
									{/if}
									{#if row.status !== 'rejected'}
										<form method="POST" action="?/reject">
											<input type="hidden" name="id" value={row.id} />
											<button class="text" type="submit">Reject</button>
										</form>
									{/if}
									{#if data.attend.on && row.status === 'approved' && !row.attend_synced_at}
										<form method="POST" action="?/attend">
											<input type="hidden" name="id" value={row.id} />
											<button class="text" type="submit">Send to Attend</button>
										</form>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="notify">
				<h2 class="section-label">Heads-up list · {data.notify.length}</h2>
				<p class="hint">Emails left while sign-ups were closed. Not shown on the public page.</p>
				{#if data.notify.length}
					<p><a href="/admin/ireland/export?list=notify">Download these emails</a></p>
					<ul>
						{#each data.notify as row (row.email)}
							<li><span>{row.email}</span> <span class="meta">{day(row.created_at)}</span></li>
						{/each}
					</ul>
				{:else}
					<p class="empty">Nobody’s asked for a heads-up.</p>
				{/if}
			</section>
		{/if}
	</div>
</main>

<style>
	.lead {
		margin-top: 0.35rem;
		max-width: 46ch;
	}
	.head-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
	}
	.totals {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 0.8rem 1.2rem;
		margin: 0 0 1.4rem;
		padding: 1rem 1.1rem;
		background: var(--white);
		border: 2px solid var(--navy);
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
	.k {
		font-size: 0.8rem;
		color: var(--muted);
	}
	.settings,
	.handoff,
	.notify {
		margin-bottom: 1.6rem;
	}
	.settings-form {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 1rem;
		margin: 0.8rem 0;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-weight: 800;
		color: var(--navy);
	}
	.cap {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-weight: 700;
		color: var(--navy);
		font-size: 0.9rem;
	}
	.cap input {
		width: 7rem;
	}
	.b-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.7rem;
		margin-bottom: 0.7rem;
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		align-items: center;
	}
	.search input {
		min-width: 16rem;
	}
	.seg {
		display: inline-flex;
		border: 2px solid var(--navy);
	}
	.seg button {
		padding: 0.35rem 0.7rem;
		border: 0;
		background: var(--white);
		font: inherit;
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		cursor: pointer;
	}
	.seg button.on {
		background: var(--navy);
		color: var(--white);
	}
	.people {
		list-style: none;
		margin: 0;
		padding: 0;
		background: var(--white);
		border: 3px solid var(--navy);
	}
	.people li {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0.9rem 1rem;
		border-bottom: 1px solid var(--rule);
	}
	.people li:last-child {
		border-bottom: 0;
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 16rem;
		flex: 1;
	}
	.who strong {
		color: var(--navy);
	}
	.age {
		margin-left: 0.4rem;
		color: var(--muted);
		font-weight: 700;
	}
	.meta {
		font-size: 0.88rem;
		color: var(--muted);
	}
	.built {
		font-size: 0.95rem;
		color: var(--slate);
		white-space: pre-wrap;
	}
	.link {
		color: var(--navy);
		font-weight: 700;
		word-break: break-all;
	}
	.on-attend {
		color: var(--green-dark);
		font-weight: 700;
	}
	.attend-err {
		color: var(--red-dark);
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.7rem;
	}
	.acts form {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.override {
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--navy);
	}
	.text {
		background: none;
		border: 0;
		border-bottom: 1.5px solid var(--navy);
		padding: 0;
		font: inherit;
		font-size: 0.82rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--navy);
		cursor: pointer;
	}
	.text:hover {
		color: var(--red-dark);
		border-bottom-color: var(--red-dark);
	}
	.status-waitlist {
		border-color: var(--orange);
		color: var(--orange-dark);
	}
	.notify ul {
		list-style: none;
		margin: 0.6rem 0 0;
		padding: 0;
		max-height: 240px;
		overflow: auto;
	}
	.notify li {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--rule);
	}
	code {
		font-family: var(--font-mono);
		font-size: 0.85em;
	}
</style>
