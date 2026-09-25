<script lang="ts">
	import { enhance } from '$app/forms';
	import ShipRoutes from './ShipRoutes.svelte';

	let { form = null }: { form?: { message: string } | null } = $props();

	let submitting = $state(false);
</script>

<section class="hero">
	<ShipRoutes />

	<div class="wrap hero-inner">
		<p class="byline">Made by <a href="#footer">Johnny</a></p>
		<div class="panel">
			<div class="mark" aria-hidden="true">
				<img src="/logo.png" alt="" width="104" height="97" />
			</div>
			<div class="titles">
				<h1><img src="/title-expedition-v2.png" alt="Expedition" width="520" height="64" /></h1>
				<p class="sub">
					Build whatever you want and track the time you spend making it. Your hours unlock grants
					for real gear, or a travel grant to Dublin. Your call.
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
		<p class="slack">
			New to Hack Club? <a href="https://hackclub.com/slack" target="_blank" rel="noopener noreferrer">Join the Slack</a>
			first. It's where everyone hangs out, shares what they're building and gets help.
		</p>
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

	/* same card language as the panel above: solid white, 3px navy border */
	.slack {
		margin-top: 1.2rem;
		padding: 1rem 1.5rem;
		background: var(--white);
		border: 3px solid var(--navy);
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--muted);
	}
	.slack a {
		color: var(--navy);
		font-weight: 800;
	}
	.byline {
		margin-bottom: 0.7rem;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: var(--navy);
	}
	.byline a {
		color: var(--navy);
		font-weight: 700;
		text-underline-offset: 3px;
	}
	/* on phones the content is taller than the screen, so it starts right
	   under the nav, where the nav's 90px wave band hangs over it */
	@media (max-width: 700px) {
		.hero {
			padding-top: calc(90px + 0.5rem);
			align-items: flex-start;
		}
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
