<script lang="ts">
	import { TRAVEL_RATE, money } from '$lib/data';
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
				Bank approved hours in your travel fund instead of spending them on gear. Every hour you bank
				adds {money(TRAVEL_RATE)} to a travel grant for getting you here, and you can move them back
				until your trip is booked.
			</p>
			<a class="btn" href="/dashboard#travel">Bank hours for Dublin</a>
		</div>

		<p class="clarify">
			Claim every drop and never come to Dublin, or bank the lot and come. Both are the whole
			Expedition.
		</p>
	</div>
</section>

<style>
	.dublin-section {
		background: url('/wave-texture-dark.jpg');
		background-size: 68px auto;
		color: var(--cream);
	}

	.dublin-section h2 {
		color: var(--cream);
	}

	.dublin-section .lede,
	.dublin-section .travel-copy {
		color: rgba(248, 243, 231, 0.78);
	}

	.dublin-section .facts {
		border-color: rgba(248, 243, 231, 0.28);
	}

	.dublin-section .fact-key {
		color: rgba(248, 243, 231, 0.68);
	}

	.dublin-section .fact-val,
	.dublin-section h3 {
		color: var(--cream);
	}

	.dublin-section .clarify {
		border-color: rgba(248, 243, 231, 0.28);
		color: rgba(248, 243, 231, 0.82);
	}

	.dublin-section .btn {
		background: var(--green);
		border-color: var(--green);
		color: var(--white);
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
