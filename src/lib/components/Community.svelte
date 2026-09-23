<script lang="ts">
	import { outThere, stats } from '$lib/data';
</script>

<section class="section">
	<div class="wrap">
		<h2>Nobody's ranked. Everybody's building.</h2>

		<div class="stats">
			<div class="stat">
				<span class="stat-num">{stats.builders}</span>
				<span class="stat-label">builders</span>
			</div>
			<div class="stat">
				<span class="stat-num blue">{stats.hoursShipped.toLocaleString()}</span>
				<span class="stat-label">hours shipped</span>
			</div>
			<div class="stat">
				<span class="stat-num orange">{stats.projectsShipped}</span>
				<span class="stat-label">projects shipped</span>
			</div>
			<div class="stat">
				<span class="stat-num green">{stats.finishers40h}</span>
				<span class="stat-label">reached 40 hours</span>
			</div>
		</div>

		<div class="people">
			{#each outThere as p (p.name)}
				<div class="person">
					<h3>{p.name.charAt(0) + p.name.slice(1).toLowerCase()}</h3>
					<span class="place">{p.location.toLowerCase()}</span>
					<p class="note">{p.note}</p>
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1.5rem;
		margin: 3rem 0;
		border-top: 2px solid var(--rule);
		border-bottom: 2px solid var(--rule);
		padding: 1.8rem 0;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.stat-num {
		font-size: clamp(2rem, 4.5vw, 3rem);
		font-weight: 800;
		line-height: 1;
		letter-spacing: -0.03em;
		color: var(--green);
	}
	.stat-num.blue { color: var(--blue); }
	.stat-num.orange { color: var(--orange); }
	.stat-num.green { color: var(--green-dark); }

	.stat-label {
		font-size: 0.92rem;
		font-weight: 700;
		color: var(--muted);
	}

	.people {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
		gap: 1.5rem;
	}

	.person {
		background: var(--white);
		border: 2px solid var(--rule);
		border-radius: 0;
		padding: 1.2rem;
	}

	.place {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--muted);
	}

	.note {
		margin-top: 0.6rem;
		font-size: 0.95rem;
		color: var(--slate);
		line-height: 1.45;
	}

	@media (max-width: 700px) {
		.stats {
			grid-template-columns: repeat(2, 1fr);
			gap: 1.8rem 1rem;
		}
	}
</style>
