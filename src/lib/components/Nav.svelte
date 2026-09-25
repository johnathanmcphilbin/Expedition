<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { page } from '$app/state';

	let {
		currentUser = null
	}: {
		currentUser?: {
			displayName: string | null;
			isAdmin: boolean;
			hackatimeConnected: boolean;
		} | null;
	} = $props();

	let open = $state(false);

	// The waves are a welcome, not furniture — they roll away as soon as you
	// start reading so the sticky bar stays out of the way.
	let scrolled = $state(false);
	function onScroll() {
		scrolled = window.scrollY > 24;
	}

	// Come back to whatever they were reading once Hack Club Auth is done.
	const signInHref = $derived(`/auth/login?next=${encodeURIComponent(page.url.pathname)}`);
</script>

<svelte:window onscroll={onScroll} />

<header class="nav">
	<a
		class="hc-mark"
		href="https://hackclub.com"
		target="_blank"
		rel="noopener noreferrer"
		aria-label="Hack Club">
		<img src="/hackclub-flag.svg" alt="" width="42" height="24" />
	</a>

	<div class="wrap nav-inner">
		<div class="brand-group">
			<a href="/" class="logo">
				<img src="/logo.png" alt="" width="56" height="52" />
				<img class="wordmark" src="/title-expedition-v2.png" alt="Expedition" width="243" height="30" />
			</a>
		</div>

		<nav class="links" class:open>
			<a href="/#how-it-works">How it works</a>
			<a href="/rewards">Your hours</a>
			<a href="/ireland">Dublin</a>
			{#if currentUser}
				{#if currentUser.isAdmin}
					<a href="/admin/reviews">Reviews</a>
					<a href="/admin">Admin</a>
				{/if}
				<a href="/dashboard">Dashboard</a>
			{/if}
		</nav>

		<div class="right">
			<!-- Metadata printed in the corner of a map, not a control. -->
			<span class="ages" aria-label="Ages 13 to 18">
				<span class="ages-num">13&ndash;18</span>
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

	<!-- The nav's own edge, not a border — waves hang down out of the water
	     the nav bar represents into the page below. -->
	<div class="nav-wave" class:rolled={scrolled} aria-hidden="true"></div>
</header>

<style>
	.nav {
		position: sticky;
		top: 0;
		z-index: 500;
		background: url('/wave-texture.jpg');
		background-size: 65px auto;
	}
	.hc-mark {
		position: absolute;
		left: 0;
		top: 50%;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		transform: translateY(-50%);
		opacity: 0.9;
		transition: opacity 120ms ease;
	}
	.hc-mark img {
		width: 88px;
		height: auto;
	}
	.hc-mark:hover {
		opacity: 1;
	}
	/* Overlapping past the nav's own bottom edge, the same way How It Works'
	   bottom wave overlaps past ITS bottom edge — the transparent gaps in the
	   wave PNG need to reveal the page underneath, not more nav texture, or
	   the wave shape disappears and all that's left is the header's own
	   straight rectangular edge. Nested inside .nav, sharing its background,
	   was exactly that bug. */
	.nav-wave {
		position: absolute;
		left: 0;
		right: 0;
		top: 100%;
		height: 90px;
		background: url('/wave-band-down.png') repeat-x top;
		background-size: auto 100%;
		margin-top: -2px;
		pointer-events: none;
		transition: height 260ms ease, opacity 200ms ease;
	}
	/* rolled away once you start scrolling, so the sticky bar stays slim */
	.nav-wave.rolled {
		height: 0;
		opacity: 0;
	}
	@media (prefers-reduced-motion: reduce) {
		.nav-wave {
			transition: none;
		}
	}
	.nav-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-top: 1rem;
		padding-bottom: 1rem;
	}
	.brand-group {
		display: inline-flex;
		align-items: center;
		gap: 0.7rem;
		flex-shrink: 0;
	}
	.logo {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.5rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--navy);
		text-decoration: none;
		flex-shrink: 0;
	}
	.logo img {
		height: 64px;
		width: auto;
	}
	.logo .wordmark {
		height: 38px;
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
		border-radius: 0;
	}

	@media (max-width: 900px) {
		/* Hangs off the bottom of the bar itself rather than a hard-coded
		   offset, so it stays put as the nav's own height changes. */
		.links {
			position: absolute;
			top: 100%;
			left: 0;
			right: 0;
			background: url('/wave-texture.jpg');
			background-size: 65px auto;
			flex-direction: column;
			align-items: flex-start;
			padding: 1.2rem var(--edge-pad);
			gap: 1rem;
			transform: translateY(-140%);
			transition: transform 0.2s ease;
			z-index: -1;
		}
		/* the menu's own edge — the same waves the bar hangs, not a rule */
		.links::after {
			content: '';
			position: absolute;
			left: 0;
			right: 0;
			top: 100%;
			height: 48px;
			background: url('/wave-band-down.png') repeat-x;
			background-size: auto 100%;
			margin-top: -2px;
			pointer-events: none;
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
		.logo img {
			height: 48px;
		}
		.logo .wordmark {
			height: 28px;
		}
		.hc-mark img {
			width: 68px;
		}
		/* Two text actions crowd the collapsed bar; the dashboard still offers it. */
		.nav-btn-hackatime {
			display: none;
		}
	}
</style>
