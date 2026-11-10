<script lang="ts">
	let { open = false }: { open?: boolean } = $props();
</script>

<a class="bar" href="/ireland">
	<span class="stamp">Ireland</span>
	<span class="msg">In Ireland? Irish students sign up here</span>
	<span class="state" class:open>{open ? 'Sign-ups are open' : 'Opening soon'}</span>
</a>

<style>
	.bar {
		position: relative;
		z-index: 600;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.75rem;
		padding: 0.55rem var(--edge-pad);
		background: var(--navy);
		color: var(--cream);
		text-decoration: none;
		line-height: 1.3;
	}
	.bar:hover .msg {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.bar:focus-visible {
		outline: 3px solid var(--green-bright);
		outline-offset: -3px;
	}
	.stamp {
		flex: none;
		background: var(--red);
		color: var(--white);
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 0.18rem 0.4rem;
	}
	.msg {
		font-weight: 800;
		font-size: 0.95rem;
		letter-spacing: -0.01em;
	}
	.state {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--cream);
	}
	.state.open {
		color: var(--green-bright);
	}
	@media (min-width: 720px) {
		.state {
			margin-left: auto;
		}
	}
</style>
