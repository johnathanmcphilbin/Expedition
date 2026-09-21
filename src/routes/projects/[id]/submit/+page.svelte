<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Submit a checkpoint · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap" style="max-width:720px">
		<div class="app-head">
			<div>
				<h1 class="app-title">Submit a checkpoint</h1>
				<p class="hint">{data.project.title}</p>
			</div>
		</div>

		{#if form?.message}<p class="error-box">{form.message}</p>{/if}

		{#if data.tracked}
			<p class="notice">Hackatime has {data.tracked} tracked on this project.</p>
		{/if}

		<form method="POST" enctype="multipart/form-data">
			<div class="field">
				<label for="hours_requested">Hours you're claiming</label>
				<input
					id="hours_requested"
					name="hours_requested"
					type="number"
					step="0.25"
					min="0.25"
					max="200"
					required
				/>
				<span class="hint">A reviewer decides the final number. Be honest.</span>
			</div>

			<div class="field">
				<label for="description">What did you build?</label>
				<textarea id="description" name="description" maxlength="4000" required></textarea>
				<span class="hint">A couple of sentences is plenty.</span>
			</div>

			<div class="field">
				<label for="evidence">Evidence</label>
				<input
					id="evidence"
					name="evidence"
					type="file"
					accept="image/png,image/jpeg,image/webp,image/gif"
					required
				/>
				<span class="hint">A screenshot of the thing working. PNG, JPEG, WebP or GIF, under 10MB.</span>
			</div>

			<button class="btn" type="submit">Submit for review</button>
		</form>

		<p style="margin-top:2.5rem"><a href="/projects/{data.project.id}">← Back to project</a></p>
	</div>
</main>
<Footer />
