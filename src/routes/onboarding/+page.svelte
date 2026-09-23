<script lang="ts">
	import '$lib/styles/app.css';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const flashText: Record<string, string> = {
		denied: 'Hackatime connection was cancelled.',
		failed: 'Hackatime connection failed. Try again.'
	};
</script>

<svelte:head><title>Welcome · Expedition</title></svelte:head>

<main class="app-page onboarding">
	<div class="wrap onboarding-wrap">
		<p class="eyebrow">Welcome to</p>
		<h1 class="app-title">Expedition</h1>

		{#if data.flash && flashText[data.flash]}
			<p class="notice">{flashText[data.flash]}</p>
		{/if}

		<ol class="steps">
			<li class="step done">
				<span class="step-mark"><Icon name="checkmark" size={16} /></span>
				<div>
					<p class="step-title">Hack Club connected</p>
				</div>
			</li>

			<li class="step">
				<span class="step-mark">2</span>
				<div>
					<p class="step-title">Connect Hackatime</p>
					<p class="step-hint">
						Hackatime tracks how long you spend building. Expedition reads your projects and
						hours from it directly — nothing to set up on your end beyond this.
					</p>
					<a class="btn" href="/auth/hackatime?next=/onboarding">Connect Hackatime</a>
				</div>
			</li>
		</ol>

		<p class="hint" style="margin-top:2rem">
			Once you're connected, your Hackatime projects show up on your dashboard automatically —
			no separate project to create here.
		</p>
	</div>
</main>

<style>
	.onboarding {
		min-height: calc(100vh - 80px);
		display: flex;
		align-items: center;
	}
	.onboarding-wrap {
		max-width: 560px;
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
</style>
