<!--
	The sea behind the hero. Each line is a sine wave that drifts sideways
	forever; the path runs a full wavelength past each edge so the loop is
	seamless. Two of them carry moving dashes: shipping routes crossing.
-->
<script lang="ts">
	const W = 1200;

	/** Sine-ish wave built from one quadratic hump plus smooth reflections. */
	function wave(y: number, amp: number, wl: number) {
		let d = `M ${-wl} ${y} q ${wl / 4} ${-amp} ${wl / 2} 0`;
		const reps = Math.ceil((W + wl * 3) / (wl / 2));
		for (let i = 0; i < reps; i++) d += ` t ${wl / 2} 0`;
		return d;
	}

	const swell = [
		{ y: 110, amp: 16, wl: 320, colour: 'var(--slate)', o: 0.13, w: 6, dur: 15, dir: 1 },
		{ y: 215, amp: 26, wl: 420, colour: 'var(--green)', o: 0.2, w: 9, dur: 19, dir: -1 },
		{ y: 330, amp: 18, wl: 280, colour: 'var(--navy)', o: 0.12, w: 6, dur: 12, dir: 1 },
		{ y: 450, amp: 30, wl: 500, colour: 'var(--green-dark)', o: 0.16, w: 10, dur: 24, dir: -1 },
		{ y: 565, amp: 22, wl: 360, colour: 'var(--slate)', o: 0.12, w: 7, dur: 17, dir: 1 },
		{ y: 680, amp: 26, wl: 440, colour: 'var(--green)', o: 0.18, w: 9, dur: 21, dir: -1 },
		{ y: 770, amp: 16, wl: 300, colour: 'var(--navy)', o: 0.11, w: 6, dur: 14, dir: 1 }
	];

	// the two crossings, riding on top of the swell
	const lanes = [
		{ y: 285, amp: 24, wl: 400, colour: 'var(--green)', w: 8, drift: 20, flow: 5, dir: -1 },
		{ y: 620, amp: 28, wl: 460, colour: 'var(--green-dark)', w: 8, drift: 26, flow: 7, dir: 1 }
	];
</script>

<svg class="sea" viewBox="0 0 {W} 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
	{#each swell as s (s.y)}
		<path
			class="wave"
			d={wave(s.y, s.amp, s.wl)}
			stroke={s.colour}
			stroke-width={s.w}
			opacity={s.o}
			style:--shift="{s.dir * s.wl}px"
			style:animation-duration="{s.dur}s"
		/>
	{/each}

	{#each lanes as l (l.y)}
		<!-- the lane itself, then the traffic moving along it -->
		<path
			class="wave"
			d={wave(l.y, l.amp, l.wl)}
			stroke={l.colour}
			stroke-width={l.w}
			opacity="0.14"
			style:--shift="{l.dir * l.wl}px"
			style:animation-duration="{l.drift}s"
		/>
		<path
			class="wave lane"
			d={wave(l.y, l.amp, l.wl)}
			stroke={l.colour}
			stroke-width={l.w}
			style:--shift="{l.dir * l.wl}px"
			style:animation-duration="{l.drift}s, {l.flow}s"
		/>
	{/each}
</svg>

<style>
	.sea {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.wave {
		fill: none;
		stroke-linecap: round;
		animation-name: drift;
		animation-timing-function: linear;
		animation-iteration-count: infinite;
	}

	/* shipping lane: drifts with the swell and carries moving dashes */
	.lane {
		stroke-dasharray: 26 74;
		animation-name: drift, sail;
		animation-timing-function: linear, linear;
		animation-iteration-count: infinite, infinite;
	}

	@keyframes drift {
		to {
			transform: translateX(var(--shift));
		}
	}

	@keyframes sail {
		to {
			stroke-dashoffset: -100;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.wave {
			animation: none;
		}
	}
</style>
