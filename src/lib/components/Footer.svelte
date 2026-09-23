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
	/* Footer.svelte is shared across every page, so what's directly above it
	   varies — a background-colour behind the wave PNG (not just relying on
	   true transparency) means the crest reads the same light-blue everywhere
	   instead of only matching on the one page that happens to have --sea-mid
	   right above it. */
	.footer-wave {
		height: 64px;
		background-color: var(--sea-mid);
		background-image: url('/wave-band-up.png');
		background-repeat: repeat-x;
		background-size: auto 100%;
		margin-bottom: -2px;
	}
	/* The deep end — the darkest stop of "the sea gets deeper as you scroll",
	   so text below flips to light-on-dark rather than the site's usual navy
	   on pale water. */
	.footer {
		background: var(--navy);
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
		color: var(--cream);
	}
	.brand img {
		height: 47px;
		width: auto;
	}

	.tag {
		margin-top: 0.6rem;
		color: var(--sea-deep);
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
		color: var(--green-bright);
	}

	.meta-col {
		color: var(--sea-deep);
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
		color: var(--navy-soft);
		font-size: 0.85rem;
	}

	@media (max-width: 700px) {
		.footer-inner {
			grid-template-columns: 1fr;
			gap: 1.8rem;
		}
	}
</style>
