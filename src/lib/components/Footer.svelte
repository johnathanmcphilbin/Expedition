<footer class="footer">
	<div class="wrap footer-inner">
		<div class="col">
			<span class="brand">Expedition</span>
			<p class="tag">A Hack Club YSWS. Build something worth exploring.</p>
		</div>

		<div class="col links-col">
			<a href="/#how-it-works">How it works</a>
			<a href="/library">Library</a>
			<a href="/rewards">What you get</a>
			<a href="/ireland">Ireland</a>
		</div>

		<div class="col meta-col">
			<span>Hack Club · YSWS program</span>
			<span>For teens aged 13&ndash;18</span>
			<span class="signoff">johnny was here</span>
		</div>
	</div>
</footer>

<style>
	.footer {
		border-top: 2px solid var(--rule);
		padding: 3rem 0 3.5rem;
	}

	.footer-inner {
		display: grid;
		grid-template-columns: 1.3fr 1fr 1fr;
		gap: 2rem;
	}

	.brand {
		font-size: 1.25rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--navy);
	}

	.tag {
		margin-top: 0.6rem;
		color: var(--muted);
		font-size: 0.95rem;
		max-width: 32ch;
	}

	.links-col,
	.meta-col {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		font-size: 0.95rem;
	}

	.links-col a {
		text-decoration: none;
		color: var(--slate);
		font-weight: 700;
	}
	.links-col a:hover {
		color: var(--green);
	}

	.meta-col {
		color: var(--muted);
		font-weight: 500;
	}

	.signoff {
		color: var(--rule-strong);
		font-size: 0.85rem;
	}

	@media (max-width: 700px) {
		.footer-inner {
			grid-template-columns: 1fr;
			gap: 1.8rem;
		}
	}
</style>
