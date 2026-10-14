<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import { enhance } from '$app/forms';
	import { TRAVEL_RATE, TRAVEL_CAP_HOURS, money } from '$lib/data';
	import GrantAmount from '$lib/components/GrantAmount.svelte';
	import { skyscannerUrl } from '$lib/travel-estimates';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const needsChanges = $derived([
		...data.projects.filter((p) => p.queued?.status === 'changes_requested').map((p) => ({ name: p.name, id: p.queued!.id })),
		...data.untracked.filter((u) => u.status === 'changes_requested').map((u) => ({ name: u.name, id: u.id }))
	]);

	let bookedDifferent = $state(false);
	let copied = $state(false);
	// "2026-12-04 07:50" → "Fri 4 Dec, 07:50"
	const fmtLocal = (s: string) => {
		const [d, hm] = s.split(' ');
		const date = new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
		return `${date}, ${hm}`;
	};
	async function copyLink(link: string) {
		try {
			await navigator.clipboard.writeText(link);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			/* clipboard blocked: the link is selectable */
		}
	}
	const t = $derived(data.trip);
	// qualification claim: their hours against half the trip cost they enter
	let claimCost = $state<number | string>('');
	const claimCostNum = $derived(Number(claimCost) || 0);
	const claimCovers = $derived(claimCostNum > 0 && data.trip.approved * TRAVEL_RATE >= claimCostNum / 2);
	const pct = $derived(Math.min(100, (data.trip.approved / (data.trip.target || 1)) * 100));
	const fmtDublin = (iso: string) =>
		new Date(iso).toLocaleString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Dublin' });

	const flashText: Record<string, string> = {
		connected: 'Hackatime connected. Now add the project you’re working on.',
		denied: 'Hackatime connection was cancelled.',
		failed: 'Hackatime connection failed. Try again.',
		taken: 'That Hackatime account is already connected to another Expedition account. Each Hackatime account can only be on one. Ask an organiser if that’s wrong.'
	};

	const firstName = $derived((data.user.display_name ?? '').split(' ')[0]);
	const available = $derived(Number(data.balance.hours_available));
	const nextDrop = $derived(data.unlocks.find((u) => u.state === 'locked') ?? null);
	const readyCount = $derived(data.unlocks.filter((u) => u.state === 'ready').length);

	// Hackatime lists every folder ever opened; show a handful and let
	// search find the rest.
	let adding = $state(false);
	let query = $state('');
	const suggestions = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (q) return data.others.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 12);
		return data.others.filter((p) => p.seconds >= 60).slice(0, 6);
	});
	const pickerOpen = $derived(adding || data.projects.length === 0);

	const travelHours = $derived(Number(data.balance.hours_travel));
	const travelLocked = $derived(!!data.balance.travel_locked_at);
	let moveHours = $state<number | null>(null);

	const BUCKETS = [
		{ key: 'visa', label: 'Visa' },
		{ key: 'accommodation', label: 'Accommodation' },
		{ key: 'flights', label: 'Flights' }
	] as const;
	type BucketKey = (typeof BUCKETS)[number]['key'];
	let bucket = $state<BucketKey>('flights');
	const inBucket = $derived(Number(data.travelBuckets[bucket]));
	const bucketLabel = (k: string) => BUCKETS.find((b) => b.key === k)?.label ?? k;

	type Stage = 'building' | 'submitted' | 'approved' | 'changes' | 'rejected';
	function stageOf(p: (typeof data.projects)[number]): Stage {
		// a submission still in Expedition's queue is the newest word on it
		if (p.queued) {
			if (p.queued.status === 'changes_requested') return 'changes';
			if (p.queued.status === 'rejected') return 'rejected';
			return 'submitted';
		}
		const st = p.review?.status;
		if (st === 'approved') return 'approved';
		if (st === 'changes_requested') return 'changes';
		if (st === 'rejected') return 'rejected';
		if (st || p.submitted) return 'submitted';
		return 'building';
	}
	const finalLabel: Record<Stage, string> = {
		building: 'Approved',
		submitted: 'Approved',
		approved: 'Approved',
		changes: 'Needs changes',
		rejected: 'Not approved'
	};

	function hoursToGo(h: number) {
		const n = Math.max(0, h - available);
		return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, '')}h to go`;
	}
</script>

<svelte:head><title>Dashboard · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<div class="app-head">
			<div>
				<h1 class="app-title">{firstName ? `Hey, ${firstName}` : 'Your expedition'}</h1>
				<p class="hint lead">Build, submit, get hours approved, spend them on gear.</p>
			</div>
			<div class="head-actions">
				{#if data.pendingReviews !== null}
					<a class="btn btn-outline" href="/admin/reviews">
						Review queue{data.pendingReviews ? ` (${data.pendingReviews})` : ''}
					</a>
				{/if}
				<a class="btn" href="/submit-to-hackclub">Submit a project</a>
			</div>
		</div>

		{#if data.flash && flashText[data.flash]}
			<p class="notice">{flashText[data.flash]}</p>
		{/if}

		{#if needsChanges.length}
			<div class="changes-banner" role="status">
				<strong>{needsChanges.length === 1 ? 'A reviewer asked for changes' : `Reviewers asked for changes on ${needsChanges.length} projects`}.</strong>
				<span>
					{#each needsChanges as p, i (p.id)}<a href="/submit-to-hackclub?resubmit={p.id}">{p.name}</a>{i < needsChanges.length - 1 ? ', ' : ''}{/each}:
					read their feedback below, fix it, then resubmit.
				</span>
			</div>
		{/if}

		<!-- ---------------- progress ---------------- -->
		<section class="panel progress">
			<div class="progress-main">
				<p class="section-label">Approved hours</p>
				<p class="big"><strong>{data.progress.hours_earned}</strong><span>h</span></p>
				<p class="hint">Build as much as you like. There's no cap.</p>
				<div class="milestone">
					<div class="milestone-head">
						<span class="milestone-k">{data.progress.hours_target}-hour prize</span>
						<span class="milestone-v">
							{#if data.progress.finished}Unlocked{:else}at {data.progress.hours_target}h{/if}
						</span>
					</div>
					<div
						class="meter"
						role="progressbar"
						aria-valuenow={data.progress.percent_complete}
						aria-valuemin="0"
						aria-valuemax="100"
						aria-label="Approved hours toward the 40-hour prize">
						<span class="meter-fill" style="width:{data.progress.percent_complete}%"></span>
					</div>
					<p class="hint">
						{#if data.progress.finished}
							You've unlocked the 40-hour prize. We'll be in touch about it.
						{:else}
							Something extra at {data.progress.hours_target} approved hours. We're keeping it quiet for now.
						{/if}
					</p>
				</div>
			</div>
			<dl class="mini-stats">
				<div><dt>To spend</dt><dd class="green">{data.balance.hours_available}h</dd></div>
				<div><dt>For Galway</dt><dd>{travelHours}h</dd></div>
				<div><dt>Spent</dt><dd>{data.balance.hours_spent}h</dd></div>
				<a class="ledger-link" href="/your-hours">See every hour →</a>
			</dl>
		</section>

		<!-- ---------------- unlocks ---------------- -->
		<section class="block">
			<div class="block-head">
				<h2>What you've unlocked</h2>
				{#if readyCount}
					<a class="btn" href="/claim">Claim gear ({readyCount} ready)</a>
				{:else}
					<a class="text-link" href="/claim">See all drops →</a>
				{/if}
			</div>
			<p class="hint block-hint">
				{#if nextDrop}
					Next up: <strong>{nextDrop.name}</strong>, {hoursToGo(nextDrop.hours)}.
				{:else}
					Every drop is within reach.
				{/if}
			</p>
			<ol class="unlocks">
				{#each data.unlocks as u (u.hours)}
					<li class="unlock unlock-{u.state}">
						{#if u.image}<img class="u-img" src={u.image} alt="" loading="lazy" />{/if}
						<span class="u-tier">{u.hours}h</span>
						<span class="u-name">{u.name}</span>
						<span class="u-state">
							{#if u.state === 'claimed'}Claimed ✓{:else if u.state === 'ready'}Ready to claim{:else}{hoursToGo(u.hours)}{/if}
						</span>
					</li>
				{/each}
			</ol>
		</section>

		<!-- ---------------- your flight ---------------- -->
		{#if data.flight}
			{@const f = data.flight}
			<section class="block" id="flight">
				<div class="block-head">
					<h2>Your flight to Ireland</h2>
					<span class="flight-status fs-{f.status}">
						{f.status === 'booked' ? 'Booked' : f.status === 'changed' ? 'Booked (different flight)' : 'Please book this'}
					</span>
				</div>
				<div class="panel flight-card">
					<div class="leg">
						<span class="leg-k">Getting there</span>
						<strong class="leg-flight">{f.outFlight}</strong>
						<span>{f.outFrom} → Ireland{f.outTerminal ? ` (${f.outTerminal})` : ''}</span>
						{#if f.outDepartsLocal}<span>Departs {f.outDepartsLocal} (local time)</span>{/if}
						<span>Lands <strong>{fmtDublin(f.outArrivesAt)}</strong> Irish time</span>
					</div>
					{#if f.retFlight || f.retDepartsAt}
						<div class="leg">
							<span class="leg-k">Going home</span>
							{#if f.retFlight}<strong class="leg-flight">{f.retFlight}</strong>{/if}
							{#if f.retDepartsAt}<span>Flies home <strong>{fmtDublin(f.retDepartsAt)}</strong></span>{/if}
						</div>
					{/if}
					{#if f.price !== null}<p class="flight-note">About <strong>${f.price}</strong> return when we checked.</p>{/if}
					{#if f.notes}<p class="flight-note">{f.notes}</p>{/if}

					{#if f.status === 'suggested'}
						<!-- organisers can paste the exact flight; otherwise it's Skyscanner from that airport for the event dates -->
						<a class="btn book-btn" href={f.bookingUrl ?? skyscannerUrl(f.outFrom)} target="_blank" rel="noopener noreferrer">Book this flight ↗</a>
						<p class="flight-note">Book exactly this flight so we can pick you up at the airport, then tell us below.</p>
						<form method="POST" action="?/bookFlight" use:enhance class="book-form">
							<label>Booking reference <input name="booking_ref" required maxlength="20" placeholder="e.g. X7KQ2P" autocomplete="off" /></label>
							<label class="check"><input type="checkbox" name="different" value="yes" bind:checked={bookedDifferent} /> I booked a different flight</label>
							{#if bookedDifferent}
								<label>Flight you booked <input name="booked_flight" required maxlength="80" placeholder="e.g. QR 571 / QR 17" /></label>
								<label>Lands in Ireland (Irish time) <input name="booked_arrives_at" type="datetime-local" required /></label>
							{/if}
							<button class="btn" type="submit">I've booked it</button>
						</form>
						{#if form && 'flightMessage' in form && form.flightMessage}<p class="hint error">{form.flightMessage}</p>{/if}
					{:else}
						<p class="flight-note">
							Thanks, you're booked{f.status === 'changed' && f.bookedFlight ? ` on ${f.bookedFlight}${f.bookedArrivesAt ? `, landing ${fmtDublin(f.bookedArrivesAt)}` : ''}` : ''}.
							We'll meet you at the airport. If anything changes, tell an organiser straight away.
						</p>
					{/if}
				</div>
			</section>
		{/if}

		<!-- ---------------- travel fund ---------------- -->
		<section class="block" id="travel">
			<div class="block-head">
				<h2>Galway travel fund</h2>
				<a class="text-link" href="/ireland">About Galway →</a>
			</div>
			<p class="hint block-hint">
				Bank approved hours here at <strong>{money(TRAVEL_RATE)}/hour</strong> towards your trip to Galway
				for 5–6 December. To qualify, you need enough approved hours to cover 50% of your travel cost, or the
				full {TRAVEL_CAP_HOURS} hour Expedition. <strong>{TRAVEL_CAP_HOURS} hours is the maximum
				requirement.</strong> Once you qualify, your stipend goes towards your travel and accommodation,
				and you cover anything left over.
			</p>
			<div class="panel trip-card" class:qualified={t.remaining === 0}>
				<div class="trip-cols">
					<div>
						<p class="trip-k">Your trip</p>
						{#if t.claim?.status === 'approved'}
							<p class="trip-big">{money(t.claim.trip_cost_usd)}</p>
							<p class="trip-sub">
								Your trip, confirmed by an organiser
								{#if t.claim.flight_link}· <a href={t.claim.flight_link} target="_blank" rel="noopener noreferrer">your flight ↗</a>{/if}
							</p>
						{:else if t.estimate && t.estimate.flight}
							<p class="trip-big">~{money(t.estimate.total)}</p>
							<p class="trip-sub">
								~{money(t.estimate.flight)} return flight from
								<a href={t.estimate.skyscanner} target="_blank" rel="noopener noreferrer" title={t.estimate.airportName}>{t.estimate.airport} ↗</a>
								{#if t.estimate.visa === null}+ a visa (we're checking the cost){:else if t.estimate.visa}+ {money(t.estimate.visa)} visa{/if}
							</p>
							{#await t.quote}
								<p class="trip-fine">Finding the cheapest flight…</p>
							{:then q}
							{#if q}
								<div class="quote">
									<p class="trip-k">Cheapest flight right now</p>
									<p class="quote-price">{money(q.priceUsd)} <span>return</span></p>
									<p class="trip-sub">
										{t.estimate.airport} → {q.destination === 'SNN' ? 'Shannon' : 'Dublin'} · {q.airlines} ·
										{q.stops ? `${q.stops} stop${q.stops > 1 ? 's' : ''}` : 'direct'}
									</p>
									{#if q.departLocal && q.arriveLocal}
										<p class="trip-fine">Leaves {fmtLocal(q.departLocal)}, lands {fmtLocal(q.arriveLocal)} Irish time</p>
									{/if}
									<a class="btn sky-btn" href={q.link} target="_blank" rel="noopener noreferrer">See this flight ↗</a>
									<p class="trip-fine">From Google Flights, checked {new Date(q.fetchedAt).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}. Prices change, so don't book yet.</p>
								</div>
							{/if}
							{/await}
							<a class="btn btn-outline sky-btn" href={t.estimate.skyscanner} target="_blank" rel="noopener noreferrer">Compare on Skyscanner ↗</a>
							<p class="trip-fine">An estimate, for the event dates. Don't book yet: we'll tell you which flight to take.</p>
						{:else if t.estimate}
							<p class="trip-big">No flight needed</p>
						{:else}
							<p class="trip-sub">We don't know where you're travelling from yet. Tell us your city below.</p>
						{/if}
					</div>
					{#if !(t.estimate && !t.estimate.flight)}
					<div>
						<p class="trip-k">To qualify</p>
						{#if t.remaining === 0}
							<p class="trip-big ok">You qualify ✓</p>
						{:else}
							<p class="trip-big">{t.remaining}h to go</p>
						{/if}
						<p class="trip-sub">
							{t.approved} / {t.target} approved hours
							{#if t.estimate && t.target < TRAVEL_CAP_HOURS}(half your travel cost at {money(TRAVEL_RATE)}/h){:else}({TRAVEL_CAP_HOURS}h is the most anyone needs){/if}
						</p>
						<span class="trip-bar" role="img" aria-label="{Math.round(pct)}% of the way to qualifying"><span style="width:{pct}%"></span></span>
					</div>
					{/if}
				</div>

				{#if t.estimate?.flight !== 0 && (t.remaining > 0 || t.claim)}
					<div class="claim">
						{#if t.claim?.status === 'requested'}
							<p><strong>Qualification claim sent ✓</strong> You said your trip costs {money(t.claim.trip_cost_usd)}. An organiser will check it.</p>
						{:else if t.claim?.status === 'approved'}
							<p><strong>Qualified on your {money(t.claim.trip_cost_usd)} trip ✓</strong></p>
						{:else}
							{#if t.claim?.status === 'declined'}
								<p class="grant-declined">Your claim wasn't approved{t.claim.admin_note ? `: ${t.claim.admin_note}` : '.'} You can claim again.</p>
							{/if}
							<details open={!!claimCost}>
								<summary>Found a cheaper trip? Claim qualification</summary>
								<form method="POST" action="?/claimQualification" use:enhance={() => async ({ update }) => update({ reset: false })} class="claim-form">
									<label>What your trip actually costs ($)
										<input name="trip_cost" type="number" min="1" max="20000" step="1" required bind:value={claimCost} placeholder="e.g. 420" />
									</label>
									<label>Link to that flight <input name="flight_link" type="url" maxlength="2000" placeholder="https://www.skyscanner.ie/…" /></label>
									<textarea name="note" rows="2" maxlength="1000" placeholder="Anything we should know? (optional)"></textarea>
									{#if claimCostNum > 0}
										<p class="claim-calc" class:ok={claimCovers}>
											I've done {t.approved} approved hours = <strong>{money(t.approved * TRAVEL_RATE)}</strong>,
											{claimCovers ? 'which covers' : "but that's less than"} half of my {money(claimCostNum)} trip ({money(claimCostNum / 2)}).
										</p>
									{/if}
									<button class="btn" type="submit" disabled={!claimCovers}>Claim qualification</button>
								</form>
								{#if form && 'claimMessage' in form && form.claimMessage}<p class="hint error">{form.claimMessage}</p>{/if}
							</details>
						{/if}
					</div>
				{/if}

				{#if t.remaining === 0 && t.estimate?.flight !== 0}
					<div class="grant">
						{#if data.grant?.status === 'requested'}
							<p>
								<strong>Grant requested ✓</strong> {data.grant.hours_banked}h = {money(data.grant.hours_banked * TRAVEL_RATE)}.
								Your travel fund is locked while an organiser looks at it.
							</p>
							<form method="POST" action="?/withdrawGrant" use:enhance><button class="text-link" type="submit">Withdraw request (unlocks your fund)</button></form>
						{:else if data.grant?.status === 'approved'}
							<p><strong>Grant approved 🎉</strong> Your travel fund is locked while we sort your trip. We'll be in touch with next steps.</p>
						{:else}
							{#if data.grant?.status === 'declined'}
								<p class="grant-declined">Your last request wasn't approved{data.grant.admin_note ? `: ${data.grant.admin_note}` : '.'} Your fund is unlocked, so you can adjust it and ask again.</p>
							{/if}
							{#if travelHours > 0}
								<form method="POST" action="?/requestGrant" use:enhance class="grant-form">
									<p>
										You qualify! Your grant is what's in your travel fund: <strong>{travelHours}h = {money(travelHours * TRAVEL_RATE)}</strong>.
										Requesting it <strong>locks your travel fund</strong>, so bank everything you want for travel first.
									</p>
									<textarea name="note" rows="2" maxlength="1000" placeholder="Anything we should know? (optional)"></textarea>
									<button class="btn" type="submit">Request my travel grant</button>
								</form>
							{:else}
								<p>You qualify! Bank hours into your travel fund below, then request your grant here.</p>
							{/if}
							{#if form && 'grantMessage' in form && form.grantMessage}<p class="hint error">{form.grantMessage}</p>{/if}
						{/if}
					</div>
				{/if}

				<details class="home-set">
					<summary>{t.estimate ? `Not flying from ${t.estimate.airport}?` : 'Set where you\'re travelling from'}</summary>
					<form method="POST" action="?/setHome" use:enhance={() => async ({ update }) => update({ reset: false })} class="home-form">
						<input name="city" required maxlength="100" placeholder="Your city" />
						<input name="country" required maxlength="100" placeholder="Country" />
						<button class="btn btn-outline" type="submit">Update</button>
					</form>
					<p class="trip-fine">We only keep the nearest airport, not your city.</p>
					{#if form && 'homeMessage' in form && form.homeMessage}<p class="hint error">{form.homeMessage}</p>{/if}
				</details>
			</div>

			<div class="panel travel">
				<div class="travel-total">
					<span class="t-dollars">{travelHours}h</span>
					<span class="t-hours">banked for Galway</span>
					{#if travelHours > 0}
						<span class="t-grant">
							<GrantAmount reveal="{money(travelHours * TRAVEL_RATE)} travel grant so far" />
						</span>
					{/if}
				</div>

				<div class="buckets" role="radiogroup" aria-label="What it goes toward">
					{#each BUCKETS as b (b.key)}
						<label class="bucket" class:selected={bucket === b.key} class:locked={travelLocked}>
							<input class="sr-only" type="radio" name="bucket-pick" value={b.key} bind:group={bucket} disabled={travelLocked} />
							<span class="b-label">{b.label}</span>
							<span class="b-hours">{Number(data.travelBuckets[b.key])}h</span>
						</label>
					{/each}
				</div>

				{#if travelLocked}
					<p class="travel-note">
						Your fund is locked while your trip is being arranged. Talk to an organiser if something's changed.
					</p>
				{:else}
					<form
						class="travel-form"
						method="POST"
						action="?/travel"
						use:enhance={({ formData }) => {
							formData.set('bucket', bucket);
							return async ({ update, result }) => {
								await update({ reset: false });
								if (result.type === 'success') moveHours = null;
							};
						}}>
						<input type="hidden" name="bucket" value={bucket} />
						<label class="sr-only" for="move-hours">Hours</label>
						<div class="travel-input">
							<input
								id="move-hours"
								name="hours"
								type="number"
								min="0.25"
								step="0.25"
								max={Math.max(available, inBucket)}
								placeholder="Hours"
								bind:value={moveHours}
								required />
						</div>
						<div class="travel-actions">
							<button class="btn" type="submit" name="direction" value="bank" disabled={available <= 0}>
								Bank for {bucketLabel(bucket).toLowerCase()}
							</button>
							{#if inBucket > 0}
								<button class="btn btn-outline" type="submit" name="direction" value="back">
									Move back to gear
								</button>
							{/if}
						</div>
						<p class="hint travel-avail">
							{available}h available to bank{#if available > 0}
								· <button type="button" class="text-link inline" onclick={() => (moveHours = available)}>use all</button>{/if}
						</p>
					</form>
				{/if}

				{#if form && 'travelMessage' in form && form.travelMessage}
					<p class="error-box travel-msg">{form.travelMessage}</p>
				{:else if form && 'travelMoved' in form && form.travelMoved}
					<p class="notice travel-msg">
						{form.travelMoved > 0
							? `Banked ${form.travelMoved}h toward ${bucketLabel(form.travelBucket).toLowerCase()}.`
							: `Moved ${-form.travelMoved}h out of ${bucketLabel(form.travelBucket).toLowerCase()}, back to your gear balance.`}
					</p>
				{/if}
			</div>
		</section>

		<!-- ---------------- projects ---------------- -->
		<section class="block">
			<div class="block-head">
				<h2>What you're working on</h2>
				{#if data.hackatime.connected && data.projects.length && !adding}
					<button type="button" class="btn btn-outline" onclick={() => (adding = true)}>+ Add a project</button>
				{/if}
			</div>

			{#if !data.hackatime.connected}
				<div class="panel connect-cta">
					<div>
						<p class="row-title">Connect Hackatime to get started</p>
						<p class="hint">
							Hackatime tracks your coding time. Once it's connected, pick the project you're
							building and its hours show up here.
						</p>
					</div>
					<a class="btn" href="/auth/hackatime">Connect Hackatime</a>
				</div>
			{:else if data.hackatimeUnavailable}
				<p class="error-box">Couldn't reach Hackatime just now. Try reloading in a moment.</p>
			{:else}
				{#if data.syncError}
					<p class="hint error">
						Couldn't refresh submission status from Hack Club just now, so statuses may be a little out of date.
					</p>
				{/if}

				{#if form && 'message' in form && form.message}
					<p class="error-box">{form.message}</p>
				{/if}

				{#if data.projects.length}
					<ul class="projects">
						{#each data.projects as p (p.name)}
							{@const stage = stageOf(p)}
							<li class="project">
								<div class="p-info">
									<span class="p-name">{p.name}</span>
									{#if p.languages.length}<span class="p-meta">{p.languages.join(', ')}</span>{/if}
									<ol class="stages" aria-label="Where this project is at">
										<li class="st done">Building</li>
										<li class="st" class:done={stage !== 'building'} class:now={stage === 'submitted'}>
											{stage === 'submitted' ? 'Submitted, in review' : 'Submitted'}
										</li>
										<li
											class="st st-final"
											class:done={stage === 'approved'}
											class:warn={stage === 'changes'}
											class:bad={stage === 'rejected'}>
											{finalLabel[stage]}{#if stage === 'approved' && p.review?.approved_hours} · {p.review.approved_hours}h{/if}
										</li>
									</ol>
									<a
										class="cp-line"
										class:due={p.checkpointsUnlocked > p.checkpointsPosted}
										href="/checkpoint?project={encodeURIComponent(p.name)}">
										{#if p.checkpointsUnlocked > p.checkpointsPosted}
											<span class="cp-dot" aria-hidden="true"></span>
											{p.checkpointsUnlocked - p.checkpointsPosted === 1
												? 'Checkpoint due'
												: `${p.checkpointsUnlocked - p.checkpointsPosted} checkpoints due`} · post an update →
										{:else if p.checkpointsPosted}
											{p.checkpointsPosted} checkpoint{p.checkpointsPosted === 1 ? '' : 's'} posted →
										{:else}
											First checkpoint at 5h tracked
										{/if}
									</a>
								</div>
								<div class="p-total">
									<span class="p-total-n">{p.tracked}</span>
									<span class="p-total-k">tracked</span>
								</div>
								<div class="p-actions">
									{#if stage === 'building'}
										<a class="btn" href="/submit-to-hackclub?project={encodeURIComponent(p.name)}">Submit</a>
									{:else if stage === 'changes'}
										<a class="btn" href="/submit-to-hackclub?project={encodeURIComponent(p.name)}">Resubmit</a>
									{/if}
									{#if p.connected && stage === 'building'}
										<form method="POST" action="?/disconnect" use:enhance>
											<input type="hidden" name="project" value={p.name} />
											<button class="remove" type="submit" aria-label="Remove {p.name}" title="Remove">×</button>
										</form>
									{/if}
								</div>
								{#if p.queued}
									{#if p.queued.participant_feedback && p.queued.status !== 'pending'}
										<p class="p-feedback">“{p.queued.participant_feedback}”</p>
									{/if}
									{#if p.queued.status === 'changes_requested'}
										<a class="btn resubmit-btn" href="/submit-to-hackclub?resubmit={p.queued.id}">Make changes &amp; resubmit</a>
									{/if}
								{:else if p.review?.participant_feedback && p.review.status !== 'pending'}
									<p class="p-feedback">“{p.review.participant_feedback}”</p>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}

				{#if data.untracked.length}
					<p class="untracked-k">Hardware submissions (no Hackatime project)</p>
					<ul class="untracked">
						{#each data.untracked as u (u.id)}
							<li>
								<div class="u-top">
									<strong>{u.name}</strong>
									<span class="u-status u-{u.status}">
										{u.status === 'pending' ? 'Waiting for review' : u.status === 'changes_requested' ? 'Needs changes' : u.status === 'rejected' ? 'Not approved' : 'Approved'}
									</span>
								</div>
								{#if u.feedback && u.status !== 'pending'}<p class="p-feedback">“{u.feedback}”</p>{/if}
								{#if u.status === 'changes_requested'}
									<a class="btn resubmit-btn" href="/submit-to-hackclub?resubmit={u.id}">Make changes &amp; resubmit</a>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}

				{#if pickerOpen}
					<div class="picker panel">
						<p class="row-title">
							{data.projects.length ? 'Add another project' : 'Which project are you working on?'}
						</p>
						<p class="hint">Pick it from your Hackatime. You can add more later.</p>
						{#if data.others.length}
							<input
								class="picker-search"
								type="search"
								placeholder="Search all {data.others.length} Hackatime projects"
								aria-label="Search your Hackatime projects"
								bind:value={query} />
							<div class="picker-grid">
								{#each suggestions as s (s.name)}
									<form
										method="POST"
										action="?/connect"
										use:enhance={() =>
											async ({ update }) => {
												await update();
												adding = false;
												query = '';
											}}>
										<input type="hidden" name="project" value={s.name} />
										<button class="pick" type="submit">
											<span class="p-name">{s.name}</span>
											<span class="p-meta">{s.tracked} tracked</span>
										</button>
									</form>
								{:else}
									<p class="empty">No project called “{query}”.</p>
								{/each}
							</div>
						{:else}
							<p class="empty">
								Nothing tracked in Hackatime yet. Start coding with it running and your projects will show up here.
							</p>
						{/if}
						{#if data.projects.length}
							<button type="button" class="text-link cancel" onclick={() => ((adding = false), (query = ''))}>Cancel</button>
						{/if}
					</div>
				{/if}

				<p class="hint hackatime-line">
					Hackatime connected · <a href="/auth/hackatime">Reconnect</a>
				</p>
			{/if}
		</section>

		<!-- ---------------- referrals ---------------- -->
		{#if data.referrals?.link}
			{@const r = data.referrals}
			<section class="block" id="friends">
				<div class="block-head">
					<h2>Bring your friends on Expedition</h2>
				</div>
				<p class="hint block-hint">
					Get <strong>{money(r.rewardCents / 100)}</strong> in reward credit for every friend you bring who gets their first project approved!
					You earn when their project is approved, not when they sign up.
				</p>
				<div class="panel ref-panel">
					<div class="ref-link">
						<input readonly value={r.link} aria-label="Your referral link" onfocus={(e) => e.currentTarget.select()} />
						<button type="button" class="btn" onclick={() => copyLink(r.link!)}>{copied ? 'Copied ✓' : 'Copy link'}</button>
					</div>
					<dl class="ref-stats">
						<div><dt>Link clicks</dt><dd>{r.funnel.clicks}</dd></div>
						<div><dt>People joined</dt><dd>{r.funnel.joined}</dd></div>
						<div><dt>Active builders</dt><dd>{r.funnel.active}</dd></div>
						<div><dt>Friends approved</dt><dd>{r.funnel.approvedBuilders}</dd></div>
						<div><dt>Credit earned</dt><dd>{money(r.funnel.creditCents / 100)}</dd></div>
					</dl>
					<ol class="ref-steps">
						<li>Share your link.</li>
						<li>Someone new joins Expedition.</li>
						<li>They build and ship a project.</li>
						<li>Their first project gets approved{r.minHours > 0 ? ` (${r.minHours}+ hours)` : ''}.</li>
						<li>You earn {money(r.rewardCents / 100)} in reward credit, once for each friend.</li>
					</ol>
					<p class="ref-fine">Credit goes into your hours: spend it, bank it, and it counts towards your 40 hours and qualifying for Galway.</p>
				</div>
			</section>
		{/if}
	</div>
</main>
<Footer />

<style>
	.untracked-k {
		margin: 1.2rem 0 0.5rem;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.untracked {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.untracked li {
		padding: 0.8rem 1rem;
		background: var(--white);
		border: 2px solid var(--rule-strong);
	}
	.u-top {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		color: var(--navy);
	}
	.u-status {
		font-size: 0.75rem;
		font-weight: 800;
		text-transform: uppercase;
	}
	.u-changes_requested {
		color: #a34a00;
	}
	.u-sent {
		color: #2f7a46;
	}
	.ref-link {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.ref-link input {
		flex: 1;
		min-width: 240px;
		padding: 0.6rem 0.7rem;
		border: 2px solid var(--rule-strong);
		font: inherit;
		font-weight: 700;
		color: var(--navy);
		background: var(--white);
	}
	.ref-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 0.8rem 1.2rem;
		margin: 1.2rem 0 0;
	}
	.ref-stats div {
		display: flex;
		flex-direction: column-reverse;
		gap: 0.15rem;
	}
	.ref-stats dt {
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--muted);
	}
	.ref-stats dd {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 800;
		color: var(--navy);
	}
	.ref-steps {
		margin: 1.2rem 0 0;
		padding-left: 1.2rem;
		color: var(--slate);
		line-height: 1.6;
	}
	.ref-fine {
		margin-top: 0.8rem;
		font-size: 0.82rem;
		color: var(--muted);
	}
	.trip-card {
		margin-bottom: 1rem;
		border-left: 6px solid #338eda;
	}
	.trip-card.qualified {
		border-left-color: #2f9e57;
	}
	.trip-cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 1rem 2rem;
	}
	.trip-k {
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.trip-big {
		margin: 0.2rem 0;
		font-size: 1.6rem;
		font-weight: 800;
		color: var(--navy);
	}
	.trip-big.ok {
		color: #2f7a46;
	}
	.trip-sub {
		color: var(--slate);
		font-size: 0.92rem;
	}
	.trip-sub a {
		font-weight: 700;
		color: var(--blue-dark);
	}
	.trip-fine {
		margin-top: 0.3rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.trip-bar {
		display: block;
		height: 10px;
		margin-top: 0.5rem;
		background: #e3e9ef;
		border-radius: 2px;
		overflow: hidden;
	}
	.trip-bar span {
		display: block;
		height: 100%;
		background: #338eda;
	}
	.qualified .trip-bar span {
		background: #2f9e57;
	}
	.claim {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--rule);
	}
	.claim summary {
		cursor: pointer;
		font-weight: 700;
		color: var(--slate);
	}
	.claim-form {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		align-items: flex-start;
		margin-top: 0.7rem;
		max-width: 520px;
	}
	.claim-form label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		width: 100%;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--slate);
	}
	.claim-form input,
	.claim-form textarea {
		width: 100%;
		padding: 0.5rem 0.6rem;
		border: 2px solid var(--rule-strong);
		font: inherit;
	}
	.claim-calc {
		padding: 0.5rem 0.7rem;
		background: #fff4e5;
		color: #7a3a00;
	}
	.claim-calc.ok {
		background: #eef8f1;
		color: #1f5a33;
	}
	.grant {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--rule);
	}
	.grant-form {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		align-items: flex-start;
	}
	.grant-form textarea {
		width: 100%;
		max-width: 520px;
		padding: 0.5rem 0.6rem;
		border: 2px solid var(--rule-strong);
		font: inherit;
	}
	.grant-declined {
		color: #a34a00;
		margin-bottom: 0.5rem;
	}
	.home-set {
		margin-top: 1rem;
		font-size: 0.9rem;
	}
	.home-set summary {
		cursor: pointer;
		font-weight: 700;
		color: var(--slate);
	}
	.home-form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}
	.home-form input {
		padding: 0.45rem 0.6rem;
		border: 2px solid var(--rule-strong);
		font: inherit;
	}
	.changes-banner {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		margin-bottom: 1.5rem;
		padding: 0.9rem 1.1rem;
		background: #fff8ec;
		border: 2px solid #e0a040;
		color: var(--navy);
	}
	.changes-banner a {
		font-weight: 800;
		color: var(--navy);
	}
	.resubmit-btn {
		display: inline-flex;
		margin-top: 0.6rem;
		font-size: 0.85rem;
	}
	.flight-status {
		font-size: 0.75rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.15rem 0.5rem;
		border: 2px solid currentColor;
	}
	.fs-suggested {
		color: #a34a00;
	}
	.fs-booked,
	.fs-changed {
		color: #2f7a46;
	}
	.flight-card {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem 2.5rem;
	}
	.leg {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		color: var(--slate);
	}
	.leg-k {
		font-size: 0.75rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	.quote {
		margin-top: 0.8rem;
		padding: 0.7rem 0.9rem;
		background: #f4f9f5;
		border-left: 4px solid #2f9e57;
	}
	.quote-price {
		margin: 0.15rem 0;
		font-size: 1.4rem;
		font-weight: 800;
		color: var(--navy);
	}
	.quote-price span {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--muted);
	}
	.sky-btn {
		margin-top: 0.7rem;
		font-size: 0.85rem;
	}
	.book-btn {
		flex-basis: auto;
		align-self: flex-start;
	}
	.leg-flight {
		font-size: 1.3rem;
		color: var(--navy);
	}
	.flight-note {
		flex-basis: 100%;
		margin: 0;
		color: var(--slate);
	}
	.book-form {
		flex-basis: 100%;
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.8rem 1.2rem;
	}
	.book-form label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--slate);
	}
	.book-form label.check {
		flex-direction: row;
		align-items: center;
		gap: 0.4rem;
	}
	.book-form input:not([type='checkbox']) {
		padding: 0.5rem 0.6rem;
		border: 2px solid var(--rule-strong);
		font: inherit;
	}
	.lead {
		margin-top: 0.5rem;
		font-size: 1rem;
	}
	.head-actions {
		display: flex;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.error {
		color: var(--red);
	}

	/* ---- progress ---- */
	.progress {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 1.5rem 3rem;
		flex-wrap: wrap;
		margin-bottom: 3rem;
	}
	.progress-main {
		flex: 1 1 320px;
	}
	.progress .section-label {
		margin-bottom: 0.3rem;
	}
	.big {
		margin: 0;
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		line-height: 1;
	}
	.big strong {
		font-size: clamp(2.6rem, 7vw, 3.6rem);
		font-weight: 800;
		letter-spacing: -0.04em;
		color: var(--navy);
	}
	.big span {
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--muted);
	}
	.milestone {
		margin-top: 1.2rem;
		padding-top: 1rem;
		border-top: 2px solid var(--rule);
		max-width: 520px;
	}
	.milestone-head {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		font-size: 0.8rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.milestone-k {
		color: var(--navy);
	}
	.milestone-v {
		color: var(--muted);
	}
	.meter {
		height: 8px;
		border: 1.5px solid var(--navy);
		margin: 0.5rem 0 0.5rem;
	}
	.meter-fill {
		display: block;
		height: 100%;
		background: var(--green);
		transition: width 200ms ease;
	}
	@media (prefers-reduced-motion: reduce) {
		.meter-fill {
			transition: none;
		}
	}
	.mini-stats {
		display: flex;
		align-items: flex-end;
		gap: 1.8rem;
		margin: 0;
		flex-wrap: wrap;
	}
	.mini-stats dt {
		font-size: 0.75rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--muted);
	}
	.mini-stats dd {
		margin: 0.15rem 0 0;
		font-size: 1.6rem;
		font-weight: 800;
		color: var(--navy);
	}
	.mini-stats dd.green {
		color: var(--green-dark);
	}
	.ledger-link,
	.text-link {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--blue-dark);
	}

	/* ---- sections ---- */
	.block {
		margin-bottom: 3rem;
	}
	.block-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 0.4rem;
	}
	.block-head h2 {
		font-size: 1.5rem;
	}
	.block-hint {
		margin-bottom: 1.1rem;
		font-size: 0.95rem;
	}

	/* ---- unlock track ---- */
	.unlocks {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 0.6rem;
	}
	.unlock {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.8rem 0.75rem;
		background: var(--white);
		border: 2px solid var(--rule);
		min-height: 128px;
	}
	.u-img {
		height: 56px;
		width: 100%;
		object-fit: contain;
		margin-bottom: 0.2rem;
	}
	.unlock-locked .u-img {
		opacity: 0.6;
	}
	.u-tier {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--muted);
	}
	.u-name {
		font-weight: 800;
		font-size: 0.92rem;
		line-height: 1.25;
		color: var(--navy);
		flex: 1;
	}
	.u-state {
		font-size: 0.75rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	.unlock-locked {
		background: rgba(255, 255, 255, 0.55);
	}
	.unlock-locked .u-name {
		color: var(--slate);
	}
	.unlock-ready {
		border-color: var(--green);
		box-shadow: inset 0 0 0 1px var(--green);
	}
	.unlock-ready .u-state {
		color: var(--green-dark);
	}
	.unlock-claimed {
		background: var(--navy);
		border-color: var(--navy);
	}
	.unlock-claimed .u-tier,
	.unlock-claimed .u-state {
		color: var(--sea);
	}
	.unlock-claimed .u-name {
		color: var(--white);
	}
	@media (max-width: 900px) {
		.unlocks {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	@media (max-width: 480px) {
		.unlocks {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.unlock {
			min-height: 0;
		}
	}

	/* ---- travel fund ---- */
	.travel {
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
	}
	.travel-total {
		display: flex;
		flex-direction: column;
	}
	.t-dollars {
		font-size: clamp(2.2rem, 6vw, 3rem);
		font-weight: 800;
		letter-spacing: -0.04em;
		line-height: 1;
		color: var(--navy);
	}
	.t-hours {
		margin-top: 0.3rem;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--muted);
	}
	.buckets {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.6rem;
	}
	.bucket {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.8rem 1rem;
		background: var(--white);
		border: 2px solid var(--rule-strong);
		cursor: pointer;
	}
	.bucket:hover {
		border-color: var(--navy-soft);
	}
	.bucket.selected {
		border-color: var(--green);
		box-shadow: inset 0 0 0 1px var(--green);
	}
	.bucket.locked {
		cursor: default;
	}
	.bucket:has(input:focus-visible) {
		outline: 3px solid var(--green);
		outline-offset: 2px;
	}
	.b-label {
		font-size: 0.78rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	.b-hours {
		font-size: 1.5rem;
		font-weight: 800;
		letter-spacing: -0.03em;
		color: var(--navy);
	}
	.travel-form {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.travel-input {
		display: flex;
		align-items: center;
		gap: 0.8rem;
	}
	.travel-input input {
		max-width: 9rem;
	}
	.t-grant {
		margin-top: 0.35rem;
	}
	.travel-actions {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.travel-avail {
		margin: 0;
	}
	.inline {
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		text-decoration: underline;
		font-size: inherit;
	}
	.travel-note {
		margin: 0;
		font-weight: 600;
		color: var(--slate);
	}
	.travel-msg {
		grid-column: 1 / -1;
		margin: 0;
	}
	@media (max-width: 600px) {
		.buckets {
			grid-template-columns: 1fr;
		}
	}

	/* ---- projects ---- */
	.connect-cta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.2rem;
		flex-wrap: wrap;
	}
	.connect-cta .hint {
		max-width: 52ch;
		margin-top: 0.3rem;
	}
	.projects {
		list-style: none;
		margin: 0.6rem 0 1.2rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.project {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 0.6rem 1.2rem;
		padding: 1rem 1.1rem;
		background: var(--white);
		border: 2px solid var(--rule);
	}
	.p-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.p-name {
		font-weight: 800;
		color: var(--navy);
		word-break: break-word;
	}
	.p-meta {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--muted);
	}
	.stages {
		list-style: none;
		margin: 0.55rem 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.st {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.15em 0.55em;
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border: 1.5px solid var(--rule);
		color: var(--muted);
		background: var(--white);
	}
	.st::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--rule-strong);
	}
	.st.done {
		border-color: var(--green);
		color: var(--green-dark);
	}
	.st.done::before {
		background: var(--green);
	}
	.st.now {
		border-color: var(--navy);
		color: var(--navy);
	}
	.st.now::before {
		background: var(--navy);
	}
	.st.warn {
		border-color: var(--orange);
		color: var(--orange-dark);
	}
	.st.warn::before {
		background: var(--orange);
	}
	.st.bad {
		border-color: var(--red);
		color: var(--red-dark);
	}
	.st.bad::before {
		background: var(--red);
	}
	.p-total {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		line-height: 1;
	}
	.p-total-n {
		font-size: 1.6rem;
		font-weight: 800;
		letter-spacing: -0.03em;
		color: var(--navy);
		white-space: nowrap;
	}
	.p-total-k {
		margin-top: 0.25rem;
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	.cp-line {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.5rem;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--muted);
		text-decoration: none;
	}
	.cp-line:hover {
		color: var(--navy);
		text-decoration: underline;
	}
	.cp-line.due {
		color: var(--green-dark);
	}
	.cp-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--green);
	}
	.p-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.p-feedback {
		grid-column: 1 / -1;
		margin: 0;
		padding-left: 0.8rem;
		border-left: 3px solid var(--rule-strong);
		font-size: 0.9rem;
		color: var(--slate);
	}
	.remove {
		width: 2.2rem;
		height: 2.2rem;
		font-size: 1.3rem;
		line-height: 1;
		background: none;
		border: 2px solid var(--rule);
		color: var(--muted);
		cursor: pointer;
	}
	.remove:hover {
		border-color: var(--red);
		color: var(--red);
	}
	@media (max-width: 600px) {
		.project {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.p-total {
			align-items: flex-start;
			grid-column: 1;
		}
	}

	.picker {
		margin-top: 0.6rem;
	}
	.picker .hint {
		margin: 0.25rem 0 1rem;
	}
	.picker-search {
		max-width: 420px;
		margin-bottom: 0.9rem;
	}
	.picker-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.6rem;
	}
	.pick {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
		padding: 0.85rem 1rem;
		background: var(--white);
		border: 2px solid var(--rule-strong);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.pick:hover {
		border-color: var(--green);
	}
	.pick:focus-visible {
		outline: 3px solid var(--green);
		outline-offset: 2px;
	}
	.cancel {
		margin-top: 1rem;
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		text-decoration: underline;
	}
	.hackatime-line {
		margin-top: 1rem;
	}
</style>
