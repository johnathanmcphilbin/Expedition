<script lang="ts">
	import ShipRoutes from './ShipRoutes.svelte';

	let email = $state('');
	let joined = $state(false);

	function submit(e: Event) {
		e.preventDefault();
		if (!email.includes('@')) return;
		// no backend yet: this just confirms locally
		joined = true;
	}
</script>

<section class="hero">
	<ShipRoutes />

	<div class="wrap hero-inner">
		<div class="panel">
			<div class="mark" aria-hidden="true">
				<svg viewBox="0 0 40 40">
					<path d="M6 27 h28 l-5 8 H11 Z" fill="var(--navy)" />
					<path d="M20 5 v20" stroke="var(--navy)" stroke-width="3" stroke-linecap="round" />
					<path d="M22 8 l10 14 H22 Z" fill="var(--green)" />
				</svg>
			</div>
			<div class="titles">
				<h1><span class="light">a hack club ysws:</span> expedition</h1>
				<p class="sub">
					Build whatever you want and track the time you spend making it. Reach 40 hours and three
					builders sail to Ireland.
				</p>
			</div>
		</div>

		<form class="signup" onsubmit={submit}>
			<input
				type="email"
				bind:value={email}
				placeholder="your@email.com"
				aria-label="Your email address"
				required
			/>
			<button class="btn" type="submit">Get started <span aria-hidden="true">→</span></button>
		</form>

		{#if joined}
			<p class="joined">You're on the list. We'll be in touch before the first checkpoint.</p>
		{:else}
			<p class="note">For teens aged 13 to 18. Free to join, free to ship.</p>
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
		border-bottom: 2px solid var(--rule);
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
		width: 92px;
		display: grid;
		place-items: center;
		border-right: 3px solid var(--navy);
		padding: 1rem;
	}
	.mark svg {
		width: 100%;
		max-width: 44px;
	}

	.titles {
		padding: 1.3rem 1.5rem;
	}

	h1 {
		font-size: clamp(1.7rem, 4.6vw, 3rem);
		line-height: 1.02;
	}
	.light {
		font-weight: 400;
		color: var(--slate);
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
	.joined {
		margin-top: 0.9rem;
		font-size: 0.92rem;
		font-weight: 600;
		color: var(--muted);
	}
	.joined {
		color: var(--green-dark);
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
