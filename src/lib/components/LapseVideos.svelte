<script lang="ts">
	// Lapse timelapses linked on a submission, playable right in the review.
	type LapseItem =
		| {
				id: string;
				url: string;
				ok: true;
				name: string;
				video: string | null;
				thumbnail: string | null;
				duration: number | null;
				owner: string | null;
				processing: boolean;
				someoneElse: boolean;
		  }
		| { id: string; url: string; ok: false; error: string; someoneElse: boolean };

	let { items }: { items: LapseItem[] } = $props();

	// timelapses are long; reviewers skim them faster
	const SPEEDS = [1, 1.5, 2, 4];
	let players = $state<Record<string, HTMLVideoElement | undefined>>({});
	let speed = $state<Record<string, number>>({});
	function setSpeed(id: string, s: number) {
		speed[id] = s;
		const v = players[id];
		if (v) {
			v.playbackRate = s;
			// some browsers reset it when the video (re)loads
			v.onloadedmetadata = () => (v.playbackRate = speed[id] ?? 1);
		}
	}

	const mins = (s: number) => (s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`);
</script>

{#if items.length}
	<section class="lapses">
		<p class="lapse-label">Lapse timelapses · {items.length}</p>
		<div class="lapse-grid">
			{#each items as l (l.id)}
				<figure class="lapse" class:warn={l.someoneElse || !l.ok}>
					{#if l.ok && l.video}
						<!-- svelte-ignore a11y_media_has_caption -->
						<video bind:this={players[l.id]} controls preload="metadata" playsinline poster={l.thumbnail ?? undefined} src={l.video}></video>
						<div class="speeds" role="group" aria-label="Playback speed">
							{#each SPEEDS as sp (sp)}
								<button type="button" class:on={(speed[l.id] ?? 1) === sp} onclick={() => setSpeed(l.id, sp)}>{sp}x</button>
							{/each}
						</div>
					{:else}
						<div class="lapse-empty">
							{#if !l.ok}{l.error}{:else if l.processing}Still processing on Lapse{:else}No video{/if}
						</div>
					{/if}
					<figcaption>
						<a href={l.url} target="_blank" rel="noopener noreferrer">{l.ok ? l.name : l.id} ↗</a>
						{#if l.ok}
							<span>{l.owner ?? 'Unknown'}{l.duration ? ` · ${mins(l.duration)} recorded` : ''}</span>
						{/if}
						{#if l.someoneElse}
							<strong class="lapse-flag">⚠ Recorded by a different Hackatime account than the submitter</strong>
						{/if}
					</figcaption>
				</figure>
			{/each}
		</div>
	</section>
{/if}

<style>
	.lapses {
		margin: 1.2rem 0;
	}
	.lapse-label {
		margin-bottom: 0.5rem;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.lapse-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 0.8rem;
	}
	.lapse {
		margin: 0;
		background: var(--white);
		border: 2px solid var(--rule-strong);
	}
	.lapse.warn {
		border-color: #c81e1e;
	}
	.lapse video,
	.lapse-empty {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 9;
		background: #0b1220;
	}
	.lapse-empty {
		display: grid;
		place-items: center;
		padding: 1rem;
		color: #cbd5e1;
		font-size: 0.85rem;
		text-align: center;
	}
	.speeds {
		display: flex;
		gap: 0.3rem;
		padding: 0.4rem 0.7rem 0;
	}
	.speeds button {
		padding: 0.15rem 0.5rem;
		font: inherit;
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--navy);
		background: var(--white);
		border: 1px solid var(--rule-strong);
		cursor: pointer;
	}
	.speeds button.on {
		color: var(--white);
		background: var(--navy);
		border-color: var(--navy);
	}
	figcaption {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.5rem 0.7rem 0.6rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	figcaption a {
		font-weight: 700;
		color: var(--blue-dark);
		overflow-wrap: anywhere;
	}
	.lapse-flag {
		color: #9b1c1c;
		font-size: 0.8rem;
	}
</style>
