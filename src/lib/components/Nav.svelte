<script lang="ts">
	import { page } from '$app/state';

	let {
		currentUser = null
	}: {
		currentUser?: {
			displayName: string | null;
			isReviewer: boolean;
			hackatimeConnected: boolean;
		} | null;
	} = $props();

	let open = $state(false);

	// Come back to whatever they were reading once Hack Club Auth is done.
	const signInHref = $derived(`/auth/login?next=${encodeURIComponent(page.url.pathname)}`);
</script>

<header class="nav">
	<div class="wrap nav-inner">
		<a href="/" class="logo">Expedition</a>

		<nav class="links" class:open>
			<a href="/#how-it-works">How it works</a>
			<a href="/library">Library</a>
			<a href="/rewards">Your hours</a>
			<a href="/ireland">Dublin</a>
			{#if currentUser}
				{#if currentUser.isReviewer}<a href="/admin/reviews">Reviews</a>{/if}
				<a href="/dashboard">Dashboard</a>
			{/if}
		</nav>

		<div class="right">
			<span class="ages">[ ages 13&ndash;18 ]</span>

			{#if currentUser}
				{#if !currentUser.hackatimeConnected}
					<a class="nav-btn nav-btn-hackatime" href="/auth/hackatime">Connect Hackatime</a>
				{/if}
				<!-- POST: a GET logout could be fired by any third-party <img> tag. -->
				<form method="POST" action="/auth/logout">
					<button class="nav-btn nav-btn-ghost" type="submit">Sign out</button>
				</form>
			{:else}
				<a class="nav-btn" href={signInHref}>Sign in with Hack Club</a>
			{/if}

			<button class="burger" aria-label="Toggle menu" onclick={() => (open = !open)}>
				<span></span><span></span><span></span>
			</button>
		</div>
	</div>
</header>

<style>
	.nav {
		position: sticky;
		top: 0;
		z-index: 500;
		background: var(--paper);
		border-bottom: 2px solid var(--rule);
	}
	.nav-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-top: 1rem;
		padding-bottom: 1rem;
	}
	.logo {
		font-size: 1.3rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--navy);
		text-decoration: none;
		flex-shrink: 0;
	}
	.links {
		display: flex;
		align-items: center;
		gap: 1.7rem;
		font-size: 1rem;
		font-weight: 700;
	}
	.links a {
		text-decoration: none;
		color: var(--slate);
	}
	.links a:hover {
		color: var(--green);
	}
	.right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
	}
	.nav-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 40px;
		padding: 8px 18px;
		border: 0;
		border-radius: 12px;
		font-family: inherit;
		font-size: 0.92rem;
		font-weight: 800;
		white-space: nowrap;
		color: var(--white);
		background: var(--green);
		box-shadow: 0 5px 0 var(--green-dark);
		text-decoration: none;
		cursor: pointer;
		transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
	}
	.nav-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 7px 0 var(--green-dark);
		filter: brightness(1.05);
	}
	.nav-btn:active {
		transform: translateY(4px);
		box-shadow: 0 1px 0 var(--green-dark);
	}
	.nav-btn:focus-visible {
		outline: 3px solid var(--ink);
		outline-offset: 3px;
	}
	.nav-btn-ghost {
		color: var(--navy);
		background: transparent;
		border: 2px solid var(--navy);
		box-shadow: none;
		padding: 6px 16px;
	}
	.nav-btn-ghost:hover {
		background: var(--navy);
		color: var(--paper);
		box-shadow: none;
	}
	.nav-btn-ghost:active {
		transform: translateY(1px);
		box-shadow: none;
	}
	.ages {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--green);
		white-space: nowrap;
	}
	.burger {
		display: none;
		flex-direction: column;
		gap: 4px;
		background: none;
		border: 0;
		cursor: pointer;
		padding: 0.4rem;
	}
	.burger span {
		width: 22px;
		height: 2.5px;
		background: var(--navy);
		border-radius: 2px;
	}

	@media (max-width: 900px) {
		.links {
			position: fixed;
			top: 65px;
			left: 0;
			right: 0;
			background: var(--paper);
			border-bottom: 2px solid var(--rule);
			flex-direction: column;
			align-items: flex-start;
			padding: 1.2rem var(--edge-pad);
			gap: 1rem;
			transform: translateY(-140%);
			transition: transform 0.2s ease;
		}
		.links.open {
			transform: translateY(0);
		}
		.burger {
			display: flex;
		}
		.ages {
			display: none;
		}
		.nav-btn {
			font-size: 0.85rem;
			padding: 7px 14px;
			min-height: 36px;
		}
	}

	/* Too tight for two buttons — the dashboard still offers the connection. */
	@media (max-width: 560px) {
		.nav-btn-hackatime {
			display: none;
		}
	}
</style>
