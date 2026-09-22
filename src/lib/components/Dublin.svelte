<script lang="ts">
</script>

<section class="section dublin-section" id="dublin">
	<div class="wrap">
		<h2>There's also a hackathon in Dublin.</h2>
		<p class="lede">
			On December 5 a few hundred people are getting together in Dublin to build for a day. It's
			free, it's optional, and it has nothing to do with your checkpoints.
		</p>

		<div class="facts">
			<div class="fact">
				<span class="fact-key">When</span>
				<span class="fact-val">December 5</span>
			</div>
			<div class="fact">
				<span class="fact-key">Cost</span>
				<span class="fact-val">Free to attend</span>
			</div>
			<div class="fact">
				<span class="fact-key">Required?</span>
				<span class="fact-val">No. Completely optional</span>
			</div>
		</div>

		<div class="travel">
			<h3>If you'd need help getting there</h3>
			<p class="travel-copy">
				Don't spend your hours on gear and that value can count toward getting you here. It's
				decided case by case, based on your verified building hours, what the travel actually
				costs, the budget available and approval. Banked hours don't guarantee a flight or a set
				amount.
			</p>
			<a class="btn" href="/#how-it-works">Start logging hours</a>
		</div>

		<p class="clarify">
			Claim every drop and never come to Dublin, or bank the lot and come. Both are the whole
			Expedition.
		</p>
	</div>
</section>

<style>
	.dublin-section {
		background: var(--paper-soft);
	}

	h2 {
		max-width: 18ch;
		margin-bottom: 1rem;
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
		gap: 1.5rem;
		margin: 2.5rem 0;
		border-top: 2px solid var(--rule);
		border-bottom: 2px solid var(--rule);
		padding: 1.6rem 0;
	}

	.fact {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.fact-key {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--muted);
	}
	.fact-val {
		font-size: 1.15rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--navy);
	}

	.travel {
		max-width: 56ch;
	}
	.travel-copy {
		margin: 0.8rem 0 1.6rem;
		color: var(--muted);
	}

	.clarify {
		margin-top: 2.5rem;
		padding-top: 1.2rem;
		border-top: 2px solid var(--rule);
		font-weight: 700;
		color: var(--slate);
		max-width: 56ch;
	}
</style>
