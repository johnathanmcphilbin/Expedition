<section class="section ireland-section" id="ireland">
	<div class="wrap">
		<h2>Three builders are coming to Ireland.</h2>
		<p class="lede">
			Anyone who reaches 40 verified hours becomes eligible to apply. Three builders get a funded
			Expedition experience in Ireland this November, and join around 150 students for a massive
			secondary school hackathon.
		</p>

		<div class="eligibility">
			<div class="elig yes">
				<span class="elig-mark">✓</span>
				<span>40 hours = eligible to apply</span>
			</div>
			<div class="elig no">
				<span class="elig-mark">✗</span>
				<span>40 hours ≠ a guaranteed trip</span>
			</div>
		</div>

		<a class="btn" href="/#how-it-works">Get to 40 <span aria-hidden="true">→</span></a>

		<p class="worth-it">Expedition is worth doing even if you never leave home.</p>
	</div>
</section>

<style>
	.ireland-section {
		background: var(--paper-soft);
	}

	.eligibility {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin: 2.5rem 0;
	}

	.elig {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		background: var(--white);
		border: 2px solid var(--rule);
		border-radius: 999px;
		padding: 0.6em 1.2em;
		font-weight: 700;
		font-size: 0.98rem;
	}

	.elig-mark {
		font-weight: 800;
	}
	.yes .elig-mark {
		color: var(--green);
	}
	.no .elig-mark {
		color: var(--muted);
	}
	.no {
		color: var(--muted);
	}

	.worth-it {
		margin-top: 2rem;
		color: var(--muted);
		font-weight: 600;
	}
</style>
