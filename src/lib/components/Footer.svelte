<!-- Waves crest up out of the page into the footer, then the footer itself
     is the same water the page has been sailing on the whole way down. -->
<div class="footer-wave" aria-hidden="true"></div>
<footer class="footer">
	<div class="wrap footer-inner">
		<div class="col">
			<span class="brand">
				<img src="/logo.png" alt="" width="50" height="47" />
				Expedition
			</span>
			<p class="tag">A Hack Club YSWS. Build something worth exploring.</p>
		</div>

		<div class="col links-col">
			<a href="/#how-it-works">How it works</a>
			<a href="/library">Library</a>
			<a href="/rewards">Your hours</a>
			<a href="/ireland">Dublin</a>
		</div>

		<div class="col meta-col">
			<span class="hc-credit">
				<img src="/hackclub-flag.svg" alt="" width="46" height="26" />
				Hack Club · YSWS program
			</span>
			<span>For teens aged 13&ndash;18</span>
			<span class="signoff">johnny was here</span>
		</div>
	</div>
</footer>

<style>
	.footer-wave {
		height: 64px;
		background: url('/wave-band-up.png') repeat-x;
		background-size: auto 100%;
		margin-bottom: -2px;
	}
	.footer {
		background: var(--sea-band);
		padding: 3rem 0 3.5rem;
	}

	.footer-inner {
		display: grid;
		grid-template-columns: 1.3fr 1fr 1fr;
		gap: 2rem;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 1.4rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--navy);
	}
	.brand img {
		height: 47px;
		width: auto;
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
	.hc-credit {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}
	.hc-credit img {
		flex-shrink: 0;
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
