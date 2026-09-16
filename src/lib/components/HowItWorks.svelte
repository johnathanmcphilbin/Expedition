<script lang="ts">
	const steps = [
		{ t: 'Build things.', d: 'Any project you actually care about. Software, hardware, games, weird internet stuff.' },
		{ t: 'Every 5 hours, show what happened.', d: 'A screenshot or a video, and a sentence about what you worked on. That’s a checkpoint.' },
		{ t: 'Your checkpoint joins the library.', d: 'Everything gets posted publicly, so you can see what everyone else is finding along the way.' },
		{ t: 'Start as many projects as you want.', d: 'Your hours carry across everything you build. Starting something new never resets you.' },
		{ t: 'Earn supplies as you go.', d: 'Every verified hour becomes purchasing power in the Expedition Supply Co.' },
		{ t: 'Reach 40 hours and the vault opens.', d: 'A grant worth up to $200, the jersey you can’t buy, and a shot at Ireland.' }
	];
</script>

<section class="section" id="how-it-works">
	<div class="wrap">
		<h2 class="heading">From an idea to 40 hours.</h2>
		<p class="lede">
			No applications, no gatekeeping. Pick something ambitious, log genuine time, and show your
			work as you go.
		</p>

		<ol class="steps">
			{#each steps as s, i (s.t)}
				<li class="step">
					<span class="num">{String(i + 1).padStart(2, '0')}</span>
					<div class="body">
						<h3>{s.t}</h3>
						<p class="desc">{s.d}</p>
					</div>
				</li>
			{/each}
		</ol>
	</div>
</section>

<style>
	.heading {
		margin-bottom: 1rem;
	}

	.steps {
		list-style: none;
		margin: 3.5rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2.5rem;
		max-width: 760px;
	}

	.step {
		display: flex;
		align-items: flex-start;
		gap: 1.8rem;
	}

	.num {
		font-size: clamp(2rem, 4vw, 2.8rem);
		font-weight: 800;
		line-height: 1;
		color: var(--navy);
		letter-spacing: -0.03em;
		flex-shrink: 0;
		width: 2.2ch;
	}

	.step:nth-child(2) .num { color: var(--green); }
	.step:nth-child(4) .num { color: var(--blue); }
	.step:nth-child(6) .num { color: var(--orange); }

	.desc {
		margin-top: 0.4rem;
		color: var(--muted);
		font-size: 1rem;
		max-width: 52ch;
	}

	@media (max-width: 560px) {
		.step {
			gap: 1rem;
		}
	}
</style>
