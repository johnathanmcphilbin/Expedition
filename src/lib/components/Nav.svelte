<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
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
			<!-- Metadata printed in the corner of a map, not a control. -->
			<span class="ages" aria-label="Ages 13 to 18">
				<span class="ages-num">13&mdash;18</span>
				<span class="ages-unit">yrs</span>
			</span>

			{#if currentUser}
				{#if !currentUser.hackatimeConnected}
					<a class="link-action nav-btn-hackatime" href="/auth/hackatime">
						<span class="stamp"><Icon name="external" size={11} /></span>
						Hackatime
					</a>
				{/if}
				<!-- POST: a GET logout could be fired by any third-party <img> tag. -->
				<form method="POST" action="/auth/logout">
					<button class="link-action" type="submit">Sign out</button>
				</form>
			{:else}
				<a class="link-action" href={signInHref}>
					<span class="stamp"><Icon name="flag" size={11} /></span>
					Connect Hack Club
				</a>
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
	.ages {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		font-family: var(--font-mono);
		line-height: 1.05;
		color: var(--muted);
		border-right: 1.5px solid var(--rule-strong);
		padding-right: 0.85rem;
		margin-right: 0.1rem;
		user-select: none;
	}
	.ages-num {
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.04em;
	}
	.ages-unit {
		font-size: 0.58rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
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
		/* Two text actions crowd the collapsed bar; the dashboard still offers it. */
		.nav-btn-hackatime {
			display: none;
		}
	}
</style>
