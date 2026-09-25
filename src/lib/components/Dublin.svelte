<script lang="ts">
	import { TRAVEL_RATE, money } from '$lib/data';
</script>

<section class="section dublin-section" id="dublin">
	<div class="wrap">
		<h2 class="headline">Dublin, December 5.</h2>
		<p class="lede">One day of building with a hundred other people.</p>

		<ul class="facts">
			<li class="fact">
				<span class="fact-big">Free</span>
				<span class="fact-small">to attend</span>
			</li>
			<li class="fact">
				<span class="fact-big">Optional</span>
				<span class="fact-small">your hours count either way</span>
			</li>
			<li class="fact fact-grant">
				<span class="fact-big">{money(TRAVEL_RATE)}</span>
				<span class="fact-small">travel grant for every hour you bank</span>
			</li>
		</ul>

		<div class="travel">
			<h3>Getting there</h3>
			<ol class="steps">
				<li><span class="step-n">1</span>Get hours approved</li>
				<li><span class="step-n">2</span>Bank them for Dublin</li>
				<li><span class="step-n">3</span>Your grant goes toward the trip</li>
			</ol>
			<a class="btn" href="/dashboard#travel">Bank hours for Dublin</a>
		</div>
	</div>
</section>

<style>
	.dublin-section {
		background: url('/wave-texture-dark.jpg');
		background-size: 68px auto;
		color: var(--cream);
		/* first on the page: the nav's 90px wave band hangs over the top */
		padding-top: calc(90px + clamp(1.5rem, 4vw, 3rem));
	}

	.headline {
		font-size: clamp(2.6rem, 8vw, 5rem);
		line-height: 0.98;
		letter-spacing: -0.04em;
		color: var(--cream);
	}
	.lede {
		margin-top: 1rem;
		font-size: 1.15rem;
		color: rgba(248, 243, 231, 0.82);
	}

	/* ---- the three things that matter ---- */
	.facts {
		list-style: none;
		margin: 2.4rem 0 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
		max-width: 900px;
	}
	.fact {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 1.2rem 1.3rem;
		background: rgba(248, 243, 231, 0.07);
		border: 2px solid rgba(248, 243, 231, 0.3);
	}
	.fact-big {
		font-size: clamp(1.8rem, 4vw, 2.4rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--cream);
	}
	.fact-small {
		font-size: 0.9rem;
		font-weight: 600;
		color: rgba(248, 243, 231, 0.75);
	}
	.fact-grant {
		border-color: var(--green-bright);
	}
	.fact-grant .fact-big {
		color: var(--green-bright);
	}

	/* ---- getting there ---- */
	.travel {
		margin-top: 2.6rem;
	}
	.travel h3 {
		font-size: 1.3rem;
		color: var(--cream);
	}
	.steps {
		list-style: none;
		margin: 1rem 0 1.6rem;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1.8rem;
	}
	.steps li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-weight: 700;
		color: var(--cream);
	}
	.step-n {
		display: inline-grid;
		place-items: center;
		width: 1.7rem;
		height: 1.7rem;
		flex-shrink: 0;
		background: var(--cream);
		color: var(--navy);
		font-size: 0.85rem;
		font-weight: 800;
	}
	.dublin-section .btn {
		background: var(--green);
		border-color: var(--green);
		color: var(--white);
	}

	@media (max-width: 700px) {
		.facts {
			grid-template-columns: 1fr;
		}
		.steps {
			flex-direction: column;
		}
	}
</style>
