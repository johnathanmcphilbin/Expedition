<script lang="ts">
	let open = $state(false);
</script>

<header class="nav">
	<div class="wrap nav-inner">
		<a href="/" class="logo">Expedition</a>

		<nav class="links" class:open>
			<a href="/#how-it-works">How it works</a>
			<a href="/library">Library</a>
			<a href="/rewards">What you get</a>
			<a href="/ireland">Ireland</a>
		</nav>

		<div class="right">
			<span class="ages">[ ages 13&ndash;18 ]</span>
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
	}
</style>
