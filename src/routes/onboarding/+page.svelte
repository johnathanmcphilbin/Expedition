<script lang="ts">
	import '$lib/styles/app.css';
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let submittingExisting = $state<string | null>(null);
	let submittingNew = $state(false);

	const pickable = $derived(data.projects.filter((p) => !p.taken));
	const alreadyLinked = $derived(data.projects.filter((p) => p.taken));

	const VISIBLE = 5;
	let showAll = $state(false);
	const visiblePickable = $derived(showAll ? pickable : pickable.slice(0, VISIBLE));
	const hiddenCount = $derived(Math.max(pickable.length - VISIBLE, 0));
</script>

<svelte:head><title>Welcome · Expedition</title></svelte:head>

<main class="app-page onboarding">
	<div class="wrap onboarding-wrap">
		<p class="eyebrow">Welcome to</p>
		<h1 class="app-title">Expedition</h1>

		<ol class="steps">
			<li class="step done">
				<span class="step-mark"><Icon name="checkmark" size={16} /></span>
				<div>
					<p class="step-title">Hack Club connected</p>
				</div>
			</li>

			<li class="step" class:done={data.hackatime.connected}>
				<span class="step-mark">
					{#if data.hackatime.connected}
						<Icon name="checkmark" size={16} />
					{:else}
						2
					{/if}
				</span>
				<div>
					<p class="step-title">Connect Hackatime</p>
					{#if data.hackatime.connected}
						<p class="step-hint">Connected. Hackatime tracks how long you spend building.</p>
					{:else}
						<p class="step-hint">Hackatime tracks how long you spend building.</p>
						<a class="btn" href="/auth/hackatime?next=/onboarding">
							Connect Hackatime
						</a>
					{/if}
				</div>
			</li>

			<li class="step" class:done={false} class:locked={!data.hackatime.connected}>
				<span class="step-mark">3</span>
				<div class="step-body">
					<p class="step-title">Pick your project</p>

					{#if !data.hackatime.connected}
						<p class="step-hint">Connect Hackatime first — Expedition picks up your projects from there.</p>
					{:else}
						{#if form?.message}
							<p class="hint error">{form.message}</p>
						{/if}

						<div class="pick-block">
							<p class="pick-label">Already building something? Choose it from Hackatime.</p>

							{#if pickable.length}
								<div class="project-rows">
									{#each visiblePickable as p (p.name)}
										<form
											method="POST"
											action="?/connectExisting"
											use:enhance={() => {
												submittingExisting = p.name;
												return async ({ update }) => {
													await update();
													submittingExisting = null;
												};
											}}>
											<input type="hidden" name="hackatime_project" value={p.name} />
											<button class="project-row" type="submit" disabled={submittingExisting === p.name}>
												<span class="project-name">{p.name}</span>
												<span class="project-meta">
													{p.tracked}{#if p.languages.length}
														&middot; {p.languages[0]}{/if}
												</span>
												<span class="project-go"><Icon name="view-forward" size={16} /></span>
											</button>
										</form>
									{/each}
								</div>
								{#if hiddenCount > 0}
									<button type="button" class="link-action" onclick={() => (showAll = true)}>
										Show {hiddenCount} more
									</button>
								{/if}
							{:else if alreadyLinked.length}
								<p class="hint">
									Every tracked Hackatime project is already connected to one of your projects.
								</p>
							{:else}
								<p class="hint">
									Nothing tracked yet. Start coding with Hackatime running, then check again.
								</p>
							{/if}

							<button type="button" class="link-action" onclick={() => location.reload()}>
								<span class="stamp"><Icon name="external" size={11} /></span>
								Check again
							</button>
						</div>

						<div class="pick-divider"><span>or</span></div>

						<details class="pick-block new-project">
							<summary class="link-action">
								<span class="stamp"><Icon name="plus" size={11} /></span>
								Start a new project
							</summary>

							<p class="step-hint">
								Hackatime projects come from your editor, not from Expedition — name this one, then
								start coding with Hackatime running. Once it shows up above, come back and connect it.
							</p>

							<form
								method="POST"
								action="?/startNew"
								use:enhance={() => {
									submittingNew = true;
									return async ({ update }) => {
										await update();
										submittingNew = false;
									};
								}}>
								<div class="field">
									<label for="title">Project name</label>
									<input id="title" name="title" type="text" maxlength="120" required />
								</div>
								<div class="field">
									<label for="description">What are you making?</label>
									<textarea id="description" name="description" maxlength="4000" rows="3"></textarea>
								</div>
								<div class="field">
									<label for="repo_url">GitHub URL <span class="optional">optional</span></label>
									<input id="repo_url" name="repo_url" type="url" placeholder="https://..." />
								</div>
								<div class="field">
									<label for="demo_url">Playable URL <span class="optional">optional</span></label>
									<input id="demo_url" name="demo_url" type="url" placeholder="https://..." />
								</div>
								<button class="btn" type="submit" disabled={submittingNew}>
									Start this project
								</button>
							</form>
						</details>
					{/if}
				</div>
			</li>
		</ol>
	</div>
</main>

<style>
	.onboarding {
		min-height: calc(100vh - 80px);
		display: flex;
		align-items: center;
	}
	.onboarding-wrap {
		max-width: 640px;
	}
	.eyebrow {
		font-size: 0.85rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
		margin-bottom: 0.3rem;
	}
	.app-title {
		margin-bottom: 2.5rem;
	}

	.steps {
		list-style: none;
		display: flex;
		flex-direction: column;
	}

	.step {
		display: flex;
		gap: 1rem;
		padding: 1.6rem 0;
		border-top: 1.5px solid var(--rule);
	}
	.step:first-child {
		border-top: 0;
		padding-top: 0;
	}
	.step.locked {
		opacity: 0.55;
	}

	.step-mark {
		flex-shrink: 0;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border: 1.5px solid var(--navy);
		border-radius: 0;
		font-weight: 800;
		font-size: 0.9rem;
		color: var(--navy);
	}
	.step.done .step-mark {
		background: var(--navy);
		color: var(--cream);
	}

	.step-body {
		width: 100%;
	}
	.step-title {
		font-weight: 800;
		font-size: 1.05rem;
		margin-bottom: 0.2rem;
	}
	.step-hint {
		color: var(--muted);
		font-size: 0.92rem;
		margin-bottom: 0.9rem;
		max-width: 46ch;
	}

	.pick-block {
		margin-bottom: 1.2rem;
	}
	.pick-label {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--slate);
		margin-bottom: 0.7rem;
	}

	.project-rows {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-bottom: 0.9rem;
	}
	.project-row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		width: 100%;
		padding: 0.85rem 1rem;
		border: 1.5px solid var(--navy);
		border-radius: 0;
		background: transparent;
		font-family: var(--font-sans);
		cursor: pointer;
		text-align: left;
		transition: background 120ms ease, color 120ms ease;
	}
	.project-row:hover:not(:disabled) {
		background: var(--navy);
		color: var(--cream);
	}
	.project-row:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.project-name {
		font-weight: 800;
		flex: 1;
	}
	.project-meta {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: inherit;
		opacity: 0.75;
	}
	.project-go {
		flex-shrink: 0;
	}

	.pick-divider {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin: 1.4rem 0;
		color: var(--muted);
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.pick-divider::before,
	.pick-divider::after {
		content: '';
		flex: 1;
		height: 1.5px;
		background: var(--rule);
	}

	.new-project summary {
		cursor: pointer;
		list-style: none;
	}
	.new-project summary::-webkit-details-marker {
		display: none;
	}
	.new-project[open] summary {
		margin-bottom: 1.2rem;
	}
	.new-project form {
		max-width: 30rem;
	}

	.optional {
		font-weight: 500;
		color: var(--muted);
		text-transform: none;
		letter-spacing: normal;
	}

	.error {
		color: var(--red);
	}
</style>
