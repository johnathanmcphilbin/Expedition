<script lang="ts">
	import '$lib/styles/app.css';
	import { enhance } from '$app/forms';
	import { skyscannerUrl } from '$lib/travel-estimates';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let editing = $state<string | null>(null);

	const TZ = 'Europe/Dublin';
	const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
	const day = (iso: string) => new Date(iso).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
	// timestamptz → the value a datetime-local input wants, in Dublin time (GMT in December)
	const local = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

	const STATUS: Record<string, string> = {
		suggested: 'Not booked yet',
		booked: 'Booked',
		changed: 'Booked a different flight',
		cancelled: 'Cancelled'
	};

	// pickup runs grouped by day
	const runDays = $derived(
		data.runs.reduce<{ day: string; runs: typeof data.runs }[]>((acc, r) => {
			const d = day(r.from);
			const last = acc.at(-1);
			if (last && last.day === d) last.runs.push(r);
			else acc.push({ day: d, runs: [r] });
			return acc;
		}, [])
	);
</script>

<svelte:head><title>Arrivals · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<div>
				<h1 class="app-title">Arrivals</h1>
				<p class="hint lead">
					The flight each person should take to Dublin for 5 December (starts 10:00), whether they've booked it, and when to be at the airport.
					All times are Dublin time.
				</p>
			</div>
		</div>

		<div class="totals">
			<div><span class="n">{data.counts.assigned}</span><span class="k">given a flight</span></div>
			<div><span class="n">{data.counts.booked}</span><span class="k">booked{data.counts.changed ? ` · ${data.counts.changed} on a different flight` : ''}</span></div>
			<div><span class="n">{data.counts.assigned - data.counts.booked}</span><span class="k">still to book</span></div>
			<div class:alert={data.counts.flagged}><span class="n">{data.counts.flagged}</span><span class="k">arrivals to look at</span></div>
		</div>

		{#if form && 'message' in form && form.message}
			<p class="error-box">{form.message}</p>
		{/if}

		<!-- ---------------- pickups ---------------- -->
		<section class="block">
			<h2 class="section-label">Airport pickups</h2>
			{#if runDays.length}
				{#each runDays as d (d.day)}
					<h3 class="day">{d.day}</h3>
					<ol class="runs">
						{#each d.runs as r, i (r.from + r.terminal + i)}
							<li class="run">
								<div class="run-head">
									<strong>{time(r.from)}{r.to !== r.from ? `–${time(r.to)}` : ''}</strong>
									<span>{r.terminal ?? 'Terminal unknown'}</span>
									<span class="muted">{r.people.length} {r.people.length === 1 ? 'person' : 'people'}</span>
								</div>
								<ul>
									{#each r.people as p (p.id)}
										<li>
											<span class="who">{p.name}</span>
											<span class="muted">{p.flight} from {p.from} · lands {time(p.arrivesAt)}</span>
											<span class="status s-{p.status}">{STATUS[p.status]}</span>
											{#each p.flags as f (f.text)}<span class="flag {f.level}">{f.text}</span>{/each}
										</li>
									{/each}
								</ul>
							</li>
						{/each}
					</ol>
				{/each}
			{:else}
				<p class="empty">No flights given out yet. Pick someone below and give them the flight to take.</p>
			{/if}
		</section>

		{#if data.departures.length}
			<section class="block">
				<h2 class="section-label">Going home</h2>
				<ul class="deps">
					{#each data.departures as dep (dep.id)}
						<li><strong>{day(dep.departsAt)} {time(dep.departsAt)}</strong> {dep.name} <span class="muted">{dep.flight ?? ''}</span></li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- ---------------- people ---------------- -->
		<section class="block">
			<h2 class="section-label">People</h2>
			<p class="hint">Everyone with approved hours. Give each person the exact flight; they book it and confirm on their dashboard.</p>
			<div class="table-wrap">
				<table class="people">
					<thead>
						<tr><th>Builder</th><th>Home airport</th><th>Hours</th><th>Flight</th><th></th></tr>
					</thead>
					<tbody>
						{#each data.people as p (p.id)}
							<tr>
								<td>
									<span class="who">{p.name}</span>
									{#if p.email}<a class="sub" href="mailto:{p.email}">{p.email}</a>{/if}
								</td>
								<td>
									{#if p.home}
										<a href={skyscannerUrl(p.home.airport)} target="_blank" rel="noopener noreferrer" title={p.home.name}>{p.home.airport} ↗</a>
									{:else}<span class="muted">unknown</span>{/if}
								</td>
								<td>
									<strong>{p.approved}h</strong>
									{#if p.qualifiesAt !== null}
										<span class="sub">{p.qualifies ? 'qualifies' : `qualifies at ${p.qualifiesAt}h`}</span>
									{/if}
								</td>
								<td>
									{#if p.flight}
										<strong>{p.flight.out_flight}</strong>
										<span class="sub">{p.flight.out_from} → DUB · lands {day(p.flight.out_arrives_at)} {time(p.flight.out_arrives_at)}{p.flight.out_terminal ? ` ${p.flight.out_terminal}` : ''}</span>
										{#if p.flight.status === 'changed'}
											<span class="sub warn-text">They booked {p.flight.booked_flight}, landing {p.flight.booked_arrives_at ? `${day(p.flight.booked_arrives_at)} ${time(p.flight.booked_arrives_at)}` : '?'}</span>
										{/if}
										<span class="status s-{p.flight.status}">{STATUS[p.flight.status]}</span>
										{#if p.flight.booking_ref}<span class="sub">Ref {p.flight.booking_ref}</span>{/if}
										{#each p.flight.flags as f (f.text)}<span class="flag {f.level}">{f.text}</span>{/each}
									{:else}
										<span class="muted">none yet</span>
									{/if}
								</td>
								<td class="act">
									<button type="button" class="text-btn" onclick={() => (editing = editing === p.id ? null : p.id)}>
										{editing === p.id ? 'Close' : p.flight ? 'Change' : 'Give a flight'}
									</button>
								</td>
							</tr>
							{#if editing === p.id}
								<tr class="edit-row">
									<td colspan="5">
										<form
											method="POST"
											action="?/assign"
											class="flight-form"
											use:enhance={() => async ({ result, update }) => {
												await update({ reset: false });
												if (result.type === 'success') editing = null;
											}}>
											<input type="hidden" name="user_id" value={p.id} />
											<fieldset>
												<legend>Getting there</legend>
												<label>Flight(s) <input name="out_flight" required maxlength="80" placeholder="EK 511 / EK 161" value={p.flight?.out_flight ?? ''} /></label>
												<label>From <input name="out_from" required maxlength="3" placeholder="DEL" value={p.flight?.out_from ?? p.home?.airport ?? ''} style="width:5rem;text-transform:uppercase" /></label>
												<label>Departs (local, as on ticket) <input name="out_departs_local" maxlength="60" placeholder="4 Dec 03:35" value={p.flight?.out_departs_local ?? ''} /></label>
												<label>Lands in Dublin <input name="out_arrives_at" type="datetime-local" required value={local(p.flight?.out_arrives_at ?? null)} /></label>
												<label>Terminal
													<select name="out_terminal">
														<option value="">Unknown</option>
														<option value="T1" selected={p.flight?.out_terminal === 'T1'}>T1</option>
														<option value="T2" selected={p.flight?.out_terminal === 'T2'}>T2</option>
													</select>
												</label>
											</fieldset>
											<fieldset>
												<legend>Going home</legend>
												<label>Flight(s) <input name="ret_flight" maxlength="80" placeholder="EK 162 / EK 510" value={p.flight?.ret_flight ?? ''} /></label>
												<label>Leaves Dublin <input name="ret_departs_at" type="datetime-local" value={local(p.flight?.ret_departs_at ?? null)} /></label>
												<label>Price (USD, return) <input name="price_usd" type="number" min="0" step="1" value={p.flight?.price_usd ?? ''} style="width:7rem" /></label>
											</fieldset>
											<label class="wide">Notes for them <textarea name="organiser_notes" rows="2" maxlength="1000" placeholder="e.g. book on emirates.com, carry-on only is fine">{p.flight?.organiser_notes ?? ''}</textarea></label>
											<div class="form-actions">
												<button class="btn" type="submit">Save flight</button>
												{#if p.flight && p.flight.status !== 'cancelled'}
													<button class="text-btn danger" type="submit" formaction="?/cancel" formnovalidate>Cancel their flight</button>
												{/if}
												{#if p.home}<a href={skyscannerUrl(p.home.airport)} target="_blank" rel="noopener noreferrer">Search {p.home.airport} → DUB on Skyscanner ↗</a>{/if}
											</div>
											<p class="hint">Changing the flight or landing time after they've booked asks them to confirm again.</p>
										</form>
									</td>
								</tr>
							{/if}
						{:else}
							<tr><td colspan="5" class="muted">Nobody has approved hours yet.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	</div>
</main>

<style>
	.lead {
		margin-top: 0.4rem;
		max-width: 720px;
	}
	.totals {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
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
	.totals .n {
		font-size: 1.6rem;
		font-weight: 800;
		color: var(--navy);
		line-height: 1;
	}
	.totals .alert .n {
		color: #a34a00;
	}
	.totals .k {
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--muted);
	}
	.block {
		margin-bottom: 2.5rem;
	}
	.day {
		margin: 1rem 0 0.5rem;
		font-size: 1rem;
		font-weight: 800;
		color: var(--navy);
	}
	.runs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.run {
		background: var(--white);
		border: 2px solid var(--navy);
		padding: 0.8rem 1rem;
	}
	.run-head {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 1rem;
		align-items: baseline;
		margin-bottom: 0.4rem;
		color: var(--navy);
	}
	.run-head strong {
		font-size: 1.15rem;
	}
	.run ul,
	.deps {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.run li,
	.deps li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.3rem 0.7rem;
		padding: 0.3rem 0;
		border-top: 1px solid var(--rule);
		font-size: 0.92rem;
	}
	.deps li {
		background: var(--white);
		padding: 0.5rem 0.8rem;
		border: 1px solid var(--rule);
	}
	.who {
		font-weight: 700;
		color: var(--navy);
	}
	.muted {
		color: var(--muted);
	}
	.sub {
		display: block;
		font-size: 0.8rem;
		color: var(--muted);
	}
	a.sub {
		color: var(--blue-dark);
	}
	.warn-text {
		color: #a34a00;
		font-weight: 700;
	}
	.status {
		display: inline-block;
		margin-top: 0.2rem;
		padding: 0.05rem 0.4rem;
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		border: 1px solid currentColor;
	}
	.s-suggested {
		color: var(--muted);
	}
	.s-booked {
		color: #2f7a46;
	}
	.s-changed {
		color: #a34a00;
	}
	.s-cancelled {
		color: var(--muted);
		text-decoration: line-through;
	}
	.flag {
		display: inline-block;
		margin: 0.2rem 0.3rem 0 0;
		padding: 0.05rem 0.4rem;
		font-size: 0.75rem;
		font-weight: 700;
	}
	.flag.warn {
		background: #fff4e5;
		color: #7a3a00;
	}
	.flag.bad {
		background: #fde8e8;
		color: #9b1c1c;
	}
	.table-wrap {
		overflow-x: auto;
		background: var(--white);
		border: 3px solid var(--navy);
		margin-top: 0.6rem;
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
		padding: 0.65rem 0.9rem;
		border-top: 1px solid var(--rule);
		vertical-align: top;
	}
	.people td a {
		color: var(--blue-dark);
		font-weight: 700;
	}
	.act {
		white-space: nowrap;
		text-align: right;
	}
	.edit-row td {
		background: #f4f7fa;
	}
	.flight-form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem 1.2rem;
	}
	.flight-form fieldset {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1rem;
		margin: 0;
		padding: 0.6rem 0.8rem 0.8rem;
		border: 1px solid var(--rule-strong);
	}
	.flight-form legend {
		padding: 0 0.3rem;
		font-size: 0.75rem;
		font-weight: 800;
		text-transform: uppercase;
		color: var(--muted);
	}
	.flight-form label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--slate);
	}
	.flight-form input,
	.flight-form select,
	.flight-form textarea {
		padding: 0.4rem 0.5rem;
		border: 2px solid var(--rule-strong);
		font: inherit;
		font-weight: 500;
		color: var(--navy);
		background: var(--white);
	}
	.flight-form .wide {
		flex-basis: 100%;
	}
	.form-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
		flex-basis: 100%;
	}
</style>
