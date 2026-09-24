<script lang="ts">
	import { enhance } from '$app/forms';
	import ShipRoutes from './ShipRoutes.svelte';

	let { form = null }: { form?: { message: string } | null } = $props();

	let submitting = $state(false);
</script>

<section class="hero">
	<ShipRoutes />

	<div class="wrap hero-inner">
		<div class="panel">
			<div class="mark" aria-hidden="true">
				<img src="/logo.png" alt="" width="104" height="97" />
			</div>
			<div class="titles">
				<h1><img src="/title-expedition-v2.png" alt="Expedition" width="520" height="64" /></h1>
				<p class="sub">
					Build whatever you want and track the time you spend making it. Every verified hour is worth
					$5 of gear. Bank them, spend them, your call.
				</p>
			</div>
		</div>

		<form
			class="signup"
			method="POST"
			action="/?/join"
			use:enhance={() => {
				submitting = true;
				// no need to reset submitting on success — a real submit
				// redirects away to Hack Club Auth
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}>
			<input
				type="email"
				name="email"
				placeholder="your@email.com"
				aria-label="Your email address"
				required
			/>
			<button class="btn" type="submit" disabled={submitting}>Start expedition</button>
		</form>

		{#if form?.message}
			<p class="form-error">{form.message}</p>
		{:else}
			<p class="note">
				For teens aged 13 to 18. Free to join, free to ship. Submitting signs you in with Hack
				Club.
			</p>
		{/if}
	</div>
</section>

<style>
	.hero {
		position: relative;
		overflow: hidden;
		/* fill what's left of the viewport under the sticky nav */
		min-height: calc(100svh - 69px);
		display: flex;
		align-items: center;
		padding: 3rem 0;
		/* open water, the same blue the wave texture and nav are cut from */
		background: linear-gradient(180deg, var(--sea) 0%, var(--sea-deep) 100%);
	}

	.hero-inner {
		position: relative;
		z-index: 1;
		width: 100%;
		max-width: 760px;
	}

	.panel {
		display: flex;
		align-items: stretch;
		background: var(--white);
		border: 3px solid var(--navy);
	}

	.mark {
		flex-shrink: 0;
		width: 160px;
		display: grid;
		place-items: center;
		border-right: 3px solid var(--navy);
		padding: 1rem;
	}
	.mark img {
		width: 100%;
		max-width: 108px;
		height: auto;
	}

	.titles {
		padding: 1.3rem 1.5rem;
	}

	h1 {
		line-height: 1.02;
	}
	h1 img {
		display: block;
		width: clamp(260px, 42vw, 520px);
		max-width: 100%;
		height: auto;
	}

	.sub {
		margin-top: 0.6rem;
		color: var(--muted);
		font-size: 1rem;
		max-width: 48ch;
	}

	.signup {
		display: flex;
		gap: 0.8rem;
		margin-top: 1.2rem;
		flex-wrap: wrap;
	}

	.signup input {
		flex: 1 1 260px;
		min-height: 54px;
		padding: 0 1rem;
		background: var(--white);
		border: 3px solid var(--navy);
		font-family: var(--font-sans);
		font-size: 1rem;
		font-weight: 600;
		color: var(--ink);
	}
	.signup input::placeholder {
		color: var(--muted);
		font-weight: 500;
	}
	.signup input:focus {
		outline: 3px solid var(--green);
		outline-offset: 2px;
	}

	.note,
	.form-error {
		margin-top: 0.9rem;
		font-size: 0.92rem;
		font-weight: 600;
		/* navy, not muted grey — this sits on the blue sea, not on paper */
		color: var(--navy);
	}
	.form-error {
		color: var(--red-dark);
	}

	@media (max-width: 560px) {
		.panel {
			flex-direction: column;
		}
		.mark {
			width: 100%;
			border-right: 0;
			border-bottom: 3px solid var(--navy);
			padding: 0.8rem;
		}
	}
</style>
