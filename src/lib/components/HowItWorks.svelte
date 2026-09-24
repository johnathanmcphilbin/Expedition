<script lang="ts">
	const steps = [
		{ t: 'Build things.', d: 'Any project you actually care about. Software, hardware, games, weird internet stuff.' },
		{ t: 'Every 5 hours, show what happened.', d: 'A screenshot or a video, and a sentence about what you worked on. That’s a checkpoint.' },
		{ t: 'Your checkpoint becomes part of the expedition.', d: 'Your progress stays tied to something real: the work you are building and sharing along the way.' },
		{ t: 'Start as many projects as you want.', d: 'Your hours carry across everything you build. Starting something new never resets you.' },
		{ t: 'Every hour you build is worth $5.', d: 'Hours bank up as you go. There are no points or coins — the hours themselves are what you spend.' },
		{ t: 'Take a drop, or keep going.', d: 'Claim gear at any point on the trail and it spends those hours. Bank them instead and they can count toward getting to Dublin.' }
	];
</script>

<section class="section how-it-works" id="how-it-works">
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
	.how-it-works {
		background: url('/wave-texture.jpg');
		background-size: 65px auto;
		/* The bottom wave (::after, below) overlaps down into the next section
		   in the DOM. A later sibling paints on top of an earlier one by
		   default, so once that next section has its own opaque background,
		   it silently buries the wave underneath it unless this is lifted
		   into its own stacking layer above the default one. */
		z-index: 1;
	}

	/* The wave crests overlap upward into whatever section comes before this
	   one — the seam between them, not a border. */
	.how-it-works::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 100%;
		height: 90px;
		background: url('/wave-band-up.png') repeat-x bottom;
		background-size: auto 100%;
		margin-bottom: -2px;
		pointer-events: none;
	}

	/* The bottom edge, mirroring the nav bar's own bottom edge — waves hang
	   down out of this section into whatever comes after it. */
	.how-it-works::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 100%;
		height: 90px;
		background: url('/wave-band-down.png') repeat-x top;
		background-size: auto 100%;
		margin-top: -2px;
		pointer-events: none;
	}

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

	.body h3 {
		font-size: clamp(1.5rem, 2.6vw, 1.9rem);
	}

	.desc {
		margin-top: 0.5rem;
		color: var(--muted);
		font-size: 1.15rem;
		max-width: 52ch;
	}

	@media (max-width: 560px) {
		.step {
			gap: 1rem;
		}
	}
</style>
