<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>New project · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap" style="max-width:720px">
		<div class="app-head">
			<h1 class="app-title">Start a project</h1>
		</div>

		{#if form?.message}<p class="error-box">{form.message}</p>{/if}

		<form method="POST">
			<div class="field">
				<label for="title">What are you building?</label>
				<input id="title" name="title" type="text" maxlength="120" required />
			</div>

			<div class="field">
				<label for="description">Describe it</label>
				<textarea id="description" name="description" maxlength="4000"></textarea>
				<span class="hint">What it is, why you're making it.</span>
			</div>

			<div class="field">
				<label for="repo_url">Repo URL</label>
				<input id="repo_url" name="repo_url" type="url" placeholder="https://github.com/..." />
			</div>

			<div class="field">
				<label for="demo_url">Demo URL</label>
				<input id="demo_url" name="demo_url" type="url" placeholder="https://..." />
			</div>

			<div class="field">
				<label for="hackatime_project">Hackatime project</label>
				{#if data.hackatimeProjects.length}
					<select id="hackatime_project" name="hackatime_project">
						<option value="">Not tracked in Hackatime</option>
						{#each data.hackatimeProjects as p (p.name)}
							<!-- already claimed by another project: selecting it would count
							     the same hours twice, and the database would refuse anyway -->
							<option value={p.name} disabled={p.taken}>
								{p.name} — {p.tracked}{p.taken ? ' (already connected)' : ''}
							</option>
						{/each}
					</select>
					<span class="hint">
						Links your tracked coding time to this project for reviewers. You can run
						several projects at once — your hours add up across all of them.
					</span>
				{:else if data.connected}
					<input id="hackatime_project" name="hackatime_project" type="text" maxlength="200" />
					<span class="hint">
						Hackatime is connected but has no tracked projects yet. Type the name and it
						will line up once time is logged.
					</span>
				{:else}
					<input id="hackatime_project" name="hackatime_project" type="text" maxlength="200" />
					<span class="hint">
						Connect Hackatime on your dashboard to pick from a list instead.
					</span>
				{/if}
			</div>

			<button class="btn" type="submit">Create project</button>
		</form>
	</div>
</main>
<Footer />
