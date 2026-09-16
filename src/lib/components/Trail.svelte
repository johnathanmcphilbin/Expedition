<script lang="ts">
	const points = [
		{ hrs: '0h', label: 'Trailhead' },
		{ hrs: '5h', label: 'First checkpoint' },
		{ hrs: '10h', label: 'Keep going' },
		{ hrs: '15h', label: 'Getting somewhere' },
		{ hrs: '20h', label: 'Halfway' },
		{ hrs: '25h', label: 'Deeper in' },
		{ hrs: '30h', label: 'Base camp' },
		{ hrs: '35h', label: 'Final stretch' },
		{ hrs: '40h', label: 'The Vault', final: true }
	];
</script>

<section class="section" id="trail">
	<div class="wrap">
		<h2>40 hours is a lot. That's the point.</h2>
		<p class="lede">
			No XP, no streaks, no levels. It's just a map of how much time you've genuinely spent making
			things.
		</p>

		<div class="points">
			{#each points as p (p.hrs)}
				<div class="point" class:final={p.final}>
					<span class="hrs">{p.hrs}</span>
					<span class="label">{p.label}</span>
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	.points {
		margin-top: 3rem;
		max-width: 720px;
		border-top: 2px solid var(--rule);
	}

	.point {
		display: flex;
		align-items: baseline;
		gap: 2rem;
		padding: 1.1rem 0;
		border-bottom: 2px solid var(--rule);
	}

	.hrs {
		font-size: 1.05rem;
		font-weight: 800;
		color: var(--muted);
		width: 3.5ch;
		flex-shrink: 0;
	}

	.label {
		font-size: clamp(1.15rem, 2.4vw, 1.5rem);
		font-weight: 800;
		color: var(--navy);
		letter-spacing: -0.02em;
	}

	.point.final {
		border-bottom-color: var(--green);
	}
	.point.final .hrs,
	.point.final .label {
		color: var(--green-dark);
	}
</style>
