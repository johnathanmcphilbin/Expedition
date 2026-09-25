<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const statusLabel: Record<string, string> = {
		pending: 'Submitted',
		in_review: 'In review',
		approved: 'Approved',
		changes_requested: 'Needs changes',
		rejected: 'Not approved'
	};

	let project = $state('');
	$effect(() => {
		project = data.selected ?? (data.projects.length === 1 ? data.projects[0].name : '');
	});
	const chosen = $derived(data.projects.find((p) => p.name === project) ?? null);

	// Hackatime lists every folder ever opened — dozens of them. Show the few
	// that matter and let search find the rest.
	const TOP = 6;
	let query = $state('');
	let showAll = $state(false);
	let picking = $state(true);
	$effect(() => {
		picking = !data.selected;
	});
	const matches = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (q) return data.projects.filter((p) => p.name.toLowerCase().includes(q));
		return showAll ? data.projects : data.projects.filter((p) => p.connected || p.seconds >= 60).slice(0, TOP);
	});

	function pick(name: string) {
		project = name;
		picking = false;
		query = '';
	}

	// Who's submitting: prefilled, so it's a glance and a click unless
	// something's missing — then the fields open straight away.
	let editingIdentity = $state(false);
	$effect(() => {
		const d = data.defaults;
		editingIdentity = !(d.firstName && d.lastName && d.email && d.githubUsername);
	});

	let preview = $state<string | null>(null);
	let dragging = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let sending = $state(false);

	function showPreview(file: File | undefined) {
		if (preview) URL.revokeObjectURL(preview);
		preview = file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		const file = e.dataTransfer?.files[0];
		if (!file || !fileInput) return;
		const dt = new DataTransfer();
		dt.items.add(file);
		fileInput.files = dt.files;
		showPreview(file);
	}

	// People paste "github.com/me/thing" — add the scheme instead of failing
	// the browser's URL check on them.
	function fixUrl(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const v = el.value.trim();
		if (v && !/^https?:\/\//i.test(v)) el.value = `https://${v}`;
	}
	function fixGithub(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		el.value = el.value.trim().replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '').replace(/\/.*$/, '').replace(/^@/, '');
	}

	// Vercel caps a request at 4.5 MB, so a big phone/retina screenshot is
	// scaled down in the browser rather than bounced by the server.
	async function shrink(file: File): Promise<File> {
		if (file.size <= 3.5 * 1024 * 1024) return file;
		const bitmap = await createImageBitmap(file);
		const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);
		canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
		return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
	}
</script>

<svelte:head><title>Submit a project · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		{#if form && 'submitted' in form && form.submitted}
			<section class="done panel">
				<p class="section-label">Sent to Hack Club</p>
				<h1 class="app-title">{form.submitted} is in.</h1>
				<ol class="next">
					<li>An Expedition reviewer looks at it against your Hackatime time.</li>
					<li>Approved hours land in your balance. Spend them on drops or bank them for Dublin.</li>
					<li>If something needs fixing, you'll see a note on your dashboard.</li>
				</ol>
				<div class="done-actions">
					<a class="btn" href="/dashboard">Back to dashboard</a>
					<a class="btn btn-outline" href="/submit-to-hackclub">Submit another project</a>
				</div>
			</section>
		{:else}
			<div class="app-head">
				<div>
					<h1 class="app-title">Submit a project</h1>
					<p class="hint lead">
						One form, about five minutes. It goes straight to Hack Club and into the Expedition
						review queue, with your Hackatime linked automatically.
					</p>
				</div>
			</div>

			{#if data.hackatimeUnavailable}
				<p class="error-box">
					Couldn't reach Hackatime just now, so your projects aren't loading. Try again in a moment.
				</p>
			{:else if !data.projects.length}
				<p class="empty">
					Nothing tracked in Hackatime yet. Start coding with it running, then come back.
				</p>
			{:else}
				<form
					method="POST"
					enctype="multipart/form-data"
					use:enhance={async ({ formData }) => {
						sending = true;
						const file = formData.get('screenshot');
						if (file instanceof File && file.size) formData.set('screenshot', await shrink(file));
						return async ({ update }) => {
							await update({ reset: false });
							sending = false;
							if (form && 'message' in form) {
								document.getElementById('form-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
							}
						};
					}}>
					<!-- who -->
					<section class="identity" class:editing={editingIdentity}>
						<div class="id-head">
							<div>
								<p class="id-k">Submitting as</p>
								<p class="id-name">{data.defaults.firstName} {data.defaults.lastName}</p>
								{#if !editingIdentity}
									<p class="id-meta">
										{data.defaults.email} &middot; GitHub <strong>{data.defaults.githubUsername}</strong>
									</p>
								{/if}
							</div>
							{#if !editingIdentity}
								<button type="button" class="id-edit" onclick={() => (editingIdentity = true)}>Edit</button>
							{/if}
						</div>
						<p class="hint id-source">
							{editingIdentity
								? "We filled in what we could from your Hack Club and Hackatime accounts. Check it's right."
								: 'From your Hack Club and Hackatime accounts.'}
						</p>
						<div class="grid-2 tight id-fields" hidden={!editingIdentity}>
							<div class="field">
								<label for="first_name">First name</label>
								<input oninvalid={() => (editingIdentity = true)} id="first_name" name="first_name" type="text" required autocomplete="given-name" value={data.defaults.firstName} />
							</div>
							<div class="field">
								<label for="last_name">Last name</label>
								<input oninvalid={() => (editingIdentity = true)} id="last_name" name="last_name" type="text" required autocomplete="family-name" value={data.defaults.lastName} />
							</div>
							<div class="field">
								<label for="email">Email</label>
								<input oninvalid={() => (editingIdentity = true)} id="email" name="email" type="email" required autocomplete="email" value={data.defaults.email} />
							</div>
							<div class="field">
								<label for="github_username">GitHub username</label>
								<input oninvalid={() => (editingIdentity = true)} id="github_username" name="github_username" type="text" required autocomplete="username"
									placeholder="octocat" value={data.defaults.githubUsername} onblur={fixGithub} />
							</div>
						</div>
					</section>

					<!-- 1 -->
					<section class="step">
						<h2 class="step-title"><span class="step-n">1</span> Which project?</h2>
						<input type="hidden" name="project" value={project} />

						{#if chosen && !picking}
							<div class="project-card selected chosen">
								<div>
									<span class="pc-name">{chosen.name}</span>
									<span class="pc-meta">
										{chosen.tracked} tracked{#if chosen.languages.length}&nbsp;· {chosen.languages.join(', ')}{/if}
									</span>
								</div>
								<button type="button" class="btn btn-outline" onclick={() => (picking = true)}>Change</button>
							</div>
							{#if chosen.status}
								<p class="hint step-hint-after">
									You've already submitted this one ({statusLabel[chosen.status].toLowerCase()}). Submit again only if
									you've built more since.
								</p>
							{/if}
						{:else}
							<input
								class="project-search"
								type="search"
								placeholder="Search all {data.projects.length} Hackatime projects"
								aria-label="Search your Hackatime projects"
								bind:value={query} />
							<div class="projects">
								{#each matches as p (p.name)}
									<button
										type="button"
										class="project-card"
										class:selected={project === p.name}
										onclick={() => pick(p.name)}>
										<span class="pc-name">{p.name}</span>
										<span class="pc-meta">
											{p.tracked} tracked{#if p.languages.length}&nbsp;· {p.languages.join(', ')}{/if}
										</span>
										{#if p.status}
											<span class="status status-{p.status}">{statusLabel[p.status]}</span>
										{/if}
									</button>
								{:else}
									<p class="empty">No project called “{query}”.</p>
								{/each}
							</div>
							{#if !query && !showAll && data.projects.length > matches.length}
								<button type="button" class="link-more" onclick={() => (showAll = true)}>
									Show all {data.projects.length} projects
								</button>
							{/if}
						{/if}
					</section>

					<!-- 2 -->
					<section class="step">
						<h2 class="step-title"><span class="step-n">2</span> Show what you built</h2>
						<div class="grid-2 tight">
							<div class="field">
								<label for="code_url">Code link</label>
								<input id="code_url" name="code_url" type="url" required placeholder="https://github.com/you/project" onblur={fixUrl} />
							</div>
							<div class="field">
								<label for="playable_url">Demo link</label>
								<input id="playable_url" name="playable_url" type="url" required placeholder="Where someone can try it" onblur={fixUrl} />
								<span class="hint">A live site, a video, or a release download.</span>
							</div>
						</div>

						<div class="field">
							<span class="field-label">Screenshot</span>
							<label
								class="drop"
								class:dragging
								class:has-image={!!preview}
								ondragover={(e) => {
									e.preventDefault();
									dragging = true;
								}}
								ondragleave={() => (dragging = false)}
								ondrop={onDrop}>
								<input
									bind:this={fileInput}
									class="sr-only"
									type="file"
									name="screenshot"
									accept="image/*"
									required
									onchange={(e) => showPreview(e.currentTarget.files?.[0])} />
								{#if preview}
									<img src={preview} alt="Screenshot preview" />
									<span class="hint">Click to change</span>
								{:else}
									<span class="drop-main">Drop an image here, or click to choose</span>
									<span class="hint">PNG or JPG. Big ones get shrunk automatically.</span>
								{/if}
							</label>
						</div>

						<div class="field">
							<label for="description">What is it?</label>
							<textarea id="description" name="description" rows="4" required minlength="20" maxlength="4000"
								placeholder="What it does, what you built it with, and the part you're proudest of."></textarea>
						</div>
					</section>

					<!-- 3 -->
					<section class="step">
						<h2 class="step-title"><span class="step-n">3</span> Your birthday</h2>
						<p class="hint step-hint">Hack Club checks you're 13 to 18. It isn't shown to anyone else.</p>
						<div class="field birthday">
							<label class="sr-only" for="birthday">Birthday</label>
							<input id="birthday" name="birthday" type="date" required autocomplete="bday" />
						</div>
					</section>

					<!-- 4 -->
					<section class="step">
						<h2 class="step-title"><span class="step-n">4</span> Where to send things</h2>
						<p class="hint step-hint">Only used to ship you what you claim. Your browser can fill this in.</p>
						<div class="field">
							<label for="address_line1">Address</label>
							<input id="address_line1" name="address_line1" type="text" required autocomplete="address-line1" />
						</div>
						<div class="field">
							<label for="address_line2">Apartment, unit, etc. <span class="optional">optional</span></label>
							<input id="address_line2" name="address_line2" type="text" autocomplete="address-line2" />
						</div>
						<div class="grid-2 tight">
							<div class="field">
								<label for="city">City</label>
								<input id="city" name="city" type="text" required autocomplete="address-level2" />
							</div>
							<div class="field">
								<label for="state">State / province</label>
								<input id="state" name="state" type="text" required autocomplete="address-level1" />
							</div>
							<div class="field">
								<label for="zip">Postal code</label>
								<input id="zip" name="zip" type="text" required autocomplete="postal-code" />
							</div>
							<div class="field">
								<label for="country">Country</label>
								<input id="country" name="country" type="text" required autocomplete="country-name" />
							</div>
						</div>
					</section>

					<details class="step extra">
						<summary>Tell Hack Club what you think <span class="optional">optional</span></summary>
						<div class="field">
							<label for="heard_about">How did you hear about this?</label>
							<input id="heard_about" name="heard_about" type="text" />
						</div>
						<div class="field">
							<label for="doing_well">What are we doing well?</label>
							<textarea id="doing_well" name="doing_well" rows="2"></textarea>
						</div>
						<div class="field">
							<label for="improve">How can we improve?</label>
							<textarea id="improve" name="improve" rows="2"></textarea>
						</div>
					</details>

					<div class="submit-bar">
						{#if form && 'message' in form && form.message}
							<p class="error-box" id="form-error">{form.message}</p>
						{/if}
						<div class="submit-row">
							<p class="submit-summary">
								{#if chosen}
									Submitting <strong>{chosen.name}</strong> · {chosen.tracked} tracked
								{:else}
									Pick a project above to submit.
								{/if}
							</p>
							<button class="btn" type="submit" disabled={sending || !chosen}>
								{sending ? 'Sending…' : 'Submit to Hack Club'}
							</button>
						</div>
					</div>
				</form>
			{/if}
		{/if}

		<p class="back"><a href="/dashboard">← Back to dashboard</a></p>
	</div>
</main>
<Footer />

<style>
	.lead {
		max-width: 60ch;
		margin-top: 0.6rem;
		font-size: 1rem;
	}

	/* ---- who's submitting ---- */
	.identity {
		max-width: 760px;
		margin-bottom: 2.4rem;
		padding: 1.1rem 1.3rem;
		background: var(--white);
		border: 3px solid var(--navy);
	}
	.id-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
	}
	.id-k {
		font-size: 0.75rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--muted);
	}
	.id-name {
		margin-top: 0.15rem;
		font-size: 1.35rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--navy);
	}
	.id-meta {
		margin-top: 0.2rem;
		font-size: 0.92rem;
		color: var(--slate);
		word-break: break-word;
	}
	.id-edit {
		background: none;
		border: 2px solid var(--navy);
		padding: 0.35rem 0.8rem;
		font: inherit;
		font-weight: 700;
		font-size: 0.88rem;
		color: var(--navy);
		cursor: pointer;
	}
	.id-edit:hover {
		background: var(--navy);
		color: var(--white);
	}
	.id-source {
		margin-top: 0.5rem;
		font-size: 0.8rem;
	}
	.id-fields {
		margin-top: 1rem;
	}
	.id-fields[hidden] {
		display: none;
	}
	.birthday {
		max-width: 16rem;
	}
	.step {
		margin-bottom: 2.8rem;
		max-width: 760px;
	}
	.step-title {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		font-size: 1.35rem;
		margin-bottom: 1.1rem;
	}
	.step-n {
		display: inline-grid;
		place-items: center;
		width: 1.9rem;
		height: 1.9rem;
		flex-shrink: 0;
		background: var(--navy);
		color: var(--white);
		font-size: 0.95rem;
		font-weight: 800;
	}
	.step-hint {
		margin: -0.5rem 0 1.1rem;
	}
	.grid-2.tight {
		gap: 0 1.2rem;
	}
	.optional {
		font-weight: 500;
		color: var(--muted);
		font-size: 0.85em;
	}

	input[type='date'] {
		font-family: var(--font-sans);
		font-size: 1rem;
		font-weight: 500;
		color: var(--ink);
		background: var(--white);
		border: 2px solid var(--rule-strong);
		padding: 0.6em 0.85em;
		width: 100%;
	}

	/* ---- project picker ---- */
	.projects {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 0.8rem;
	}
	.project-search {
		max-width: 420px;
		margin-bottom: 0.9rem;
	}
	.project-card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.35rem;
		padding: 1rem 1.1rem;
		background: var(--white);
		border: 2px solid var(--rule-strong);
		cursor: pointer;
		font: inherit;
		text-align: left;
		transition: border-color 120ms ease, box-shadow 120ms ease;
	}
	.project-card:focus-visible {
		outline: 3px solid var(--green);
		outline-offset: 2px;
	}
	.project-card.chosen {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		cursor: default;
		max-width: 520px;
	}
	.project-card.chosen > div {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.step-hint-after {
		margin-top: 0.7rem;
	}
	.link-more {
		margin-top: 0.9rem;
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		font-weight: 700;
		color: var(--blue-dark);
		text-decoration: underline;
		cursor: pointer;
	}
	.project-card:hover {
		border-color: var(--navy-soft);
	}
	.project-card.selected {
		border-color: var(--green);
		box-shadow: inset 0 0 0 2px var(--green);
	}
	.pc-name {
		font-weight: 800;
		color: var(--navy);
		word-break: break-word;
	}
	.pc-meta {
		font-size: 0.85rem;
		color: var(--muted);
		font-weight: 600;
	}

	/* ---- screenshot ---- */
	.drop {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		min-height: 150px;
		padding: 1.2rem;
		background: var(--white);
		border: 2px dashed var(--rule-strong);
		text-align: center;
		cursor: pointer;
	}
	.drop:hover,
	.drop.dragging {
		border-color: var(--green);
		background: var(--paper);
	}
	.drop:has(input:focus-visible) {
		outline: 3px solid var(--green);
		outline-offset: 2px;
	}
	.drop-main {
		font-weight: 700;
		color: var(--navy);
	}
	.drop img {
		max-height: 260px;
		max-width: 100%;
		object-fit: contain;
		border: 1px solid var(--rule);
	}

	/* ---- optional extras ---- */
	.extra summary {
		cursor: pointer;
		font-weight: 700;
		color: var(--navy);
		margin-bottom: 1rem;
	}

	/* ---- submit ---- */
	.submit-bar {
		position: sticky;
		bottom: 0;
		z-index: 2;
		max-width: 760px;
		padding: 1rem 1.2rem;
		background: var(--white);
		border: 2px solid var(--rule-strong);
		box-shadow: 0 -6px 18px rgba(23, 37, 63, 0.08);
	}
	.submit-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.submit-summary {
		margin: 0;
		color: var(--slate);
		font-weight: 600;
	}
	.submit-bar .error-box {
		margin-bottom: 0.9rem;
	}
	@media (max-width: 560px) {
		.submit-bar {
			padding: 0.7rem 0.8rem;
		}
		.submit-summary {
			font-size: 0.85rem;
		}
		.submit-row .btn {
			width: 100%;
			justify-content: center;
		}
	}
	button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	/* ---- success ---- */
	.done {
		max-width: 640px;
		padding: clamp(1.5rem, 4vw, 2.5rem);
	}
	.done .app-title {
		word-break: break-word;
	}
	.next {
		margin: 1.4rem 0 1.8rem;
		padding-left: 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		color: var(--slate);
		font-weight: 500;
	}
	.done-actions {
		display: flex;
		gap: 0.8rem;
		flex-wrap: wrap;
	}

	.back {
		margin-top: 2.5rem;
	}
</style>
