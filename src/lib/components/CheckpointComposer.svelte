<script lang="ts">
	let fileName = $state('');
	let workedOn = $state('');
	let next = $state('');
	let posted = $state(false);

	function pickFile() {
		const names = ['screenshot.png', 'demo.mov', 'build-log.png', 'clip.mp4'];
		fileName = names[Math.floor(Math.random() * names.length)];
	}

	function submit(e: Event) {
		e.preventDefault();
		if (!fileName || !workedOn.trim()) return;
		posted = true;
		setTimeout(() => {
			posted = false;
			fileName = '';
			workedOn = '';
			next = '';
		}, 2600);
	}
</script>

<section class="section composer-section">
	<div class="wrap">
		<h2>Show us what happened.</h2>
		<p class="lede">
			A screenshot or a video and a sentence or two. That's the whole thing. No essays.
		</p>

		<div class="panel">
			<p class="reached">Checkpoint reached at 20 hours</p>

			<form onsubmit={submit}>
				<div class="field">
					<span class="field-label">Screenshot or video</span>
					<button type="button" class="dropzone" class:filled={fileName} onclick={pickFile}>
						{fileName || 'Click to attach →'}
					</button>
				</div>

				<label class="field">
					<span class="field-label">What did you work on?</span>
					<textarea bind:value={workedOn} rows="3" placeholder="Keep it short. A sentence or two is plenty."></textarea>
				</label>

				<label class="field">
					<span class="field-label">What's next? <span class="optional">(optional)</span></span>
					<textarea bind:value={next} rows="2" placeholder="Whatever you're thinking of trying next."></textarea>
				</label>

				<button class="btn" type="submit" disabled={!fileName || !workedOn.trim()}>
					Post to the library <span aria-hidden="true">→</span>
				</button>

				{#if posted}
					<p class="posted">Posted. Your hours keep counting toward the next checkpoint.</p>
				{/if}
			</form>
		</div>

		<p class="footnote">
			Hackatime keeps tracking your time either way. Checkpoints are just how Expedition
			progression stays tied to something real.
		</p>
	</div>
</section>

<style>
	.panel {
		margin-top: 2.5rem;
		background: var(--white);
		border: 2px solid var(--rule);
		border-radius: 0;
		padding: 1.8rem;
		max-width: 520px;
	}

	.reached {
		font-weight: 800;
		color: var(--green);
		font-size: 1.05rem;
		margin-bottom: 1.4rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1.3rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field-label {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--navy);
	}
	.optional {
		color: var(--muted);
		font-weight: 500;
	}

	.dropzone {
		background: var(--paper-soft);
		border: 2px dashed var(--rule-strong);
		border-radius: 0;
		color: var(--muted);
		font-weight: 700;
		padding: 1.2rem;
		cursor: pointer;
	}
	.dropzone:hover {
		border-color: var(--blue);
		color: var(--blue);
	}
	.dropzone.filled {
		color: var(--green-dark);
		border-color: var(--green);
	}

	textarea {
		background: var(--white);
		border: 2px solid var(--rule-strong);
		border-radius: 0;
		color: var(--ink);
		padding: 0.75em 0.85em;
		font-family: var(--font-sans);
		font-size: 1rem;
		font-weight: 500;
		resize: vertical;
	}
	textarea:focus {
		outline: 3px solid var(--blue);
		outline-offset: 1px;
		border-color: transparent;
	}

	.btn {
		align-self: flex-start;
	}
	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
		transform: none;
	}

	.posted {
		font-weight: 700;
		color: var(--green-dark);
		font-size: 0.95rem;
	}

	.footnote {
		margin-top: 1.6rem;
		max-width: 52ch;
		font-size: 0.95rem;
		color: var(--muted);
	}
</style>
