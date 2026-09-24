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
		position: relative;
		z-index: 1;
		height: 90px;
		background: url('/wave-band-dark.png') repeat-x;
		background-size: auto 100%;
		margin-top: -90px;
		margin-bottom: 0;
	}
	/* Dark water — the texture tile is sized so its grain matches the grain
	   baked into wave-band-dark.png at the wave's 90px height (checked side
	   by side), otherwise the footer reads as a different material from the
	   waves cresting into it. */
	.footer {
		background: url('/wave-texture-dark.jpg');
		background-size: 68px auto;
		padding: calc(3rem + 90px) 0 3.5rem;
		/* navy text measures 1.95:1 on this texture — everything below is
		   light-on-dark, with a soft shadow to hold it off the busy dashes */
		color: var(--cream);
		text-shadow: 0 1px 2px rgba(10, 25, 45, 0.45);
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
		color: var(--cream);
	}
	.brand img {
		height: 47px;
		width: auto;
	}

	.tag {
		margin-top: 0.6rem;
		color: var(--sea);
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
		color: var(--cream);
		font-weight: 700;
	}
	.links-col a:hover {
		color: var(--white);
		text-decoration: underline;
	}

	.meta-col {
		color: var(--sea);
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
		color: var(--sea-deep);
		font-size: 0.85rem;
	}

	@media (max-width: 700px) {
		.footer-inner {
			grid-template-columns: 1fr;
			gap: 1.8rem;
		}
	}
</style>
