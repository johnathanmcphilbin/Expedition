<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let preview = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let dragging = $state(false);
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
	function fixUrl(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const v = el.value.trim();
		if (v && !/^https?:\/\//i.test(v)) el.value = `https://${v}`;
	}
	// Vercel caps a request at 4.5 MB, so big screenshots are shrunk here first.
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

	const shareLabel: Record<string, string> = {
		private: 'Only you and reviewers',
		waiting: 'Shared · waiting for an OK',
		shown: 'Shared on the Expedition log',
		hidden: 'Not shown publicly'
	};
</script>

<svelte:head><title>Checkpoint · {data.project} · Expedition</title></svelte:head>

<main class="app-page cp-page">
	<div class="wrap">
		<p class="back"><a href="/dashboard">← Dashboard</a></p>
		<h1 class="app-title">{data.project}</h1>
		<p class="hint lead">
			{#if data.tracked}{data.tracked} tracked · {/if}a checkpoint every {data.every} hours ·
			{data.checkpoints.length} posted
		</p>

		{#if form && 'posted' in form && form.posted}
			<p class="notice">Checkpoint {form.posted} posted. Keep going.</p>
		{/if}

		{#if data.canPost}
			<section class="panel composer">
				<p class="reached">Checkpoint {data.next} · {data.next * data.every} hours</p>
				<h2>Show what you made.</h2>
				<p class="hint">A screenshot or a video, and a sentence or two about what you built. No essays.</p>

				<form
					method="POST"
					action="?/post"
					enctype="multipart/form-data"
					use:enhance={async ({ formData }) => {
						sending = true;
						const file = formData.get('image');
						if (file instanceof File && file.size) formData.set('image', await shrink(file));
						return async ({ update, result }) => {
							await update();
							sending = false;
							if (result.type === 'success') showPreview(undefined);
						};
					}}>
					<input type="hidden" name="project" value={data.project} />

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
							<input bind:this={fileInput} class="sr-only" type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
								onchange={(e) => showPreview(e.currentTarget.files?.[0])} />
							{#if preview}
								<img src={preview} alt="Screenshot preview" />
								<span class="hint">Click to change</span>
							{:else}
								<span class="drop-main">Drop an image here, or click to choose</span>
								<span class="hint">Big ones get shrunk automatically.</span>
							{/if}
						</label>
					</div>

					<div class="field">
						<label for="video_url">Video link <span class="optional">optional if you added a screenshot</span></label>
						<input id="video_url" name="video_url" type="url" placeholder="YouTube, Loom, Google Drive…" onblur={fixUrl} />
					</div>

					<div class="field">
						<label for="worked_on">What did you work on?</label>
						<textarea id="worked_on" name="worked_on" rows="3" required maxlength="2000"
							placeholder="A sentence or two is plenty."></textarea>
					</div>

					<div class="field">
						<label for="next_up">What's next? <span class="optional">optional</span></label>
						<textarea id="next_up" name="next_up" rows="2" maxlength="1000"></textarea>
					</div>

					<label class="share">
						<input type="checkbox" name="share" value="yes" />
						<span>
							Share this on the public <a href="/log" target="_blank">Expedition log</a>
							<span class="hint">Only your first name and project show. An organiser OKs it first.</span>
						</span>
					</label>

					{#if form && 'message' in form && form.message}
						<p class="error-box">{form.message}</p>
					{/if}

					<button class="btn" type="submit" disabled={sending}>{sending ? 'Posting…' : 'Post checkpoint'}</button>
				</form>
			</section>
		{:else if data.hackatimeUnavailable}
			<p class="error-box">Couldn't reach Hackatime just now. Try again in a moment.</p>
		{:else}
			<section class="panel not-yet">
				<p class="reached">Next: checkpoint {data.next} at {data.next * data.every} hours</p>
				<p>
					{Math.ceil(data.hoursToNext * 10) / 10}h more tracked time on this project and your next
					checkpoint unlocks.
				</p>
			</section>
		{/if}

		{#if data.checkpoints.length}
			<h2 class="timeline-title">Your checkpoints</h2>
			<ol class="timeline">
				{#each [...data.checkpoints].reverse() as c (c.id)}
					<li class="cp">
						<div class="cp-head">
							<span class="cp-n">#{c.number}</span>
							<span class="cp-meta">{Math.round(c.tracked_hours * 10) / 10}h tracked · {new Date(c.created_at).toLocaleDateString()}</span>
						</div>
						{#if c.image_url}<img class="cp-img" src={c.image_url} alt="Checkpoint {c.number} screenshot" loading="lazy" />{/if}
						<p class="cp-text">{c.worked_on}</p>
						{#if c.next_up}<p class="cp-next"><strong>Next:</strong> {c.next_up}</p>{/if}
						{#if c.video_url}<a class="cp-video" href={c.video_url} target="_blank" rel="noopener noreferrer">Watch the video ↗</a>{/if}
						<form class="cp-share" method="POST" action="?/share" use:enhance>
							<input type="hidden" name="id" value={c.id} />
							<span class="hint">{shareLabel[c.visibility]}</span>
							{#if c.visibility === 'private'}
								<input type="hidden" name="share" value="yes" />
								<button class="text-btn" type="submit">Share publicly</button>
							{:else}
								<input type="hidden" name="share" value="no" />
								<button class="text-btn" type="submit">Make private</button>
							{/if}
						</form>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</main>
<Footer />

<style>
	.cp-page {
		padding-bottom: calc(90px + 3rem);
	}
	.back a {
		font-weight: 700;
		color: var(--navy);
	}
	.lead {
		margin: 0.4rem 0 1.6rem;
		font-size: 1rem;
	}
	.composer,
	.not-yet {
		max-width: 720px;
		border: 3px solid var(--navy);
	}
	.reached {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--green-dark);
	}
	.composer h2 {
		margin-top: 0.4rem;
		font-size: 1.5rem;
	}
	.composer .hint {
		margin-bottom: 1.2rem;
	}
	.optional {
		font-weight: 500;
		color: var(--muted);
		font-size: 0.85em;
	}
	.drop {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		min-height: 140px;
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
		max-height: 240px;
		max-width: 100%;
		object-fit: contain;
	}
	.share {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		margin: 0.4rem 0 1.2rem;
		font-weight: 700;
		color: var(--navy);
		cursor: pointer;
	}
	.share input {
		margin-top: 0.25rem;
		width: 1.1rem;
		height: 1.1rem;
		accent-color: var(--green);
	}
	.share .hint {
		display: block;
		margin: 0.15rem 0 0;
		font-weight: 500;
	}
	.share a {
		color: var(--navy);
	}
	.not-yet p:last-child {
		margin-top: 0.4rem;
		font-weight: 600;
		color: var(--slate);
	}

	.timeline-title {
		margin-top: 2.6rem;
		font-size: 1.3rem;
	}
	.timeline {
		list-style: none;
		margin: 1rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 720px;
	}
	.cp {
		padding: 1.1rem 1.3rem;
		background: var(--white);
		border: 2px solid var(--rule);
	}
	.cp-head {
		display: flex;
		align-items: baseline;
		gap: 0.8rem;
	}
	.cp-n {
		font-size: 1.3rem;
		font-weight: 800;
		color: var(--navy);
	}
	.cp-meta {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--muted);
	}
	.cp-img {
		display: block;
		margin: 0.8rem 0;
		max-width: 100%;
		max-height: 320px;
		object-fit: contain;
		border: 1px solid var(--rule);
	}
	.cp-text {
		margin-top: 0.5rem;
		white-space: pre-wrap;
		line-height: 1.5;
	}
	.cp-next {
		margin-top: 0.4rem;
		color: var(--slate);
		font-size: 0.95rem;
	}
	.cp-video {
		display: inline-block;
		margin-top: 0.5rem;
		font-weight: 700;
		color: var(--navy);
	}
	.cp-share {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-top: 0.8rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--rule);
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
</style>
