<script lang="ts">
	import { onMount } from 'svelte';

	let host: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let hint = $state('push the boat');

	onMount(() => {
		if (window.matchMedia('(pointer: coarse)').matches) hint = 'drag the boat';

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// The Expedition mark, drawn in place of the old vector boat. The
		// artwork's own sail/hull split sits at ~58% down the image — that line
		// is treated as the waterline so the mark rides the wave the same way
		// the drawn boat did, instead of bobbing centred on empty sail.
		const LOGO_WATERLINE = 0.58;
		const logo = new Image();
		let logoReady = false;
		logo.onload = () => (logoReady = true);
		logo.src = '/logo.png';

		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		let w = 0;
		let h = 0;
		let dpr = 1;

		// ---- scene constants -------------------------------------------------
		const BOAT_W = 46;
		const PUSH_RADIUS = 86;
		const FRICTION = 0.972;
		const MAX_SPEED = 26;

		// ---- state -----------------------------------------------------------
		let t = 0;
		const boat = { x: 0, y: 0, vx: 0, angle: 0, va: 0 };
		const pointer = { x: -9999, y: -9999, vx: 0, inside: false };
		let dragging = false;
		let dragOffset = 0;
		let running = false;
		let raf = 0;
		let initialised = false;

		function bounds() {
			// keep the boat in open water, clear of the two shore labels
			const margin = Math.max(96, Math.min(170, w * 0.18));
			return { left: margin, right: w - margin };
		}

		/** Height of the water surface at x. Two summed sines = less regular, more hand-drawn. */
		function waveY(x: number, time: number) {
			const base = h * 0.58;
			return (
				base +
				Math.sin(x * 0.014 + time * 1.1) * 9 +
				Math.sin(x * 0.031 - time * 0.7) * 4.5
			);
		}

		function waveSlope(x: number, time: number) {
			return (
				Math.cos(x * 0.014 + time * 1.1) * 9 * 0.014 +
				Math.cos(x * 0.031 - time * 0.7) * 4.5 * 0.031
			);
		}

		function resize() {
			const rect = host.getBoundingClientRect();
			dpr = Math.min(window.devicePixelRatio || 1, 2);
			w = rect.width;
			h = rect.height;
			canvas.width = Math.round(w * dpr);
			canvas.height = Math.round(h * dpr);
			canvas.style.width = w + 'px';
			canvas.style.height = h + 'px';
			ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

			if (!initialised) {
				boat.x = w * 0.5;
				boat.y = waveY(boat.x, 0);
				initialised = true;
			}
			const b = bounds();
			boat.x = Math.min(Math.max(boat.x, b.left), b.right);
			if (!running) draw();
		}

		// ---- drawing ---------------------------------------------------------
		function drawWave(
			amp: number,
			freq: number,
			speed: number,
			offset: number,
			colour: string,
			width: number
		) {
			ctx!.beginPath();
			for (let x = 0; x <= w; x += 6) {
				const y =
					h * 0.58 +
					offset +
					Math.sin(x * freq + t * speed) * amp +
					Math.sin(x * freq * 2.2 - t * speed * 0.6) * (amp * 0.45);
				if (x === 0) ctx!.moveTo(x, y);
				else ctx!.lineTo(x, y);
			}
			ctx!.strokeStyle = colour;
			ctx!.lineWidth = width;
			ctx!.lineCap = 'round';
			ctx!.lineJoin = 'round';
			ctx!.stroke();
		}

		function drawBoat() {
			if (!logoReady) return;

			ctx!.save();
			ctx!.translate(boat.x, boat.y);
			ctx!.rotate(boat.angle);

			const s = BOAT_W / 46;
			// same on-screen height the old hand-drawn boat occupied (mast tip to
			// hull base), so the mark neither dwarfs nor shrinks against the waves
			const targetH = 43 * s;
			const targetW = targetH * (logo.naturalWidth / logo.naturalHeight);
			ctx!.drawImage(
				logo,
				-targetW / 2,
				-targetH * LOGO_WATERLINE,
				targetW,
				targetH
			);

			ctx!.restore();
		}

		function draw() {
			ctx!.clearRect(0, 0, w, h);
			// back swells, then the surface the boat rides on
			drawWave(5, 0.02, 0.5, 26, 'rgba(246, 241, 227, 0.22)', 2);
			drawWave(7, 0.016, 0.8, 14, 'rgba(246, 241, 227, 0.4)', 2);
			drawBoat();
			drawWave(9, 0.014, 1.1, 0, '#2f9e57', 3);
			drawWave(6, 0.022, 0.9, 16, 'rgba(246, 241, 227, 0.55)', 2);
		}

		// ---- physics ---------------------------------------------------------
		function step() {
			t += 0.016;
			const b = bounds();

			if (dragging) {
				const targetX = Math.min(Math.max(pointer.x + dragOffset, b.left), b.right);
				boat.vx = targetX - boat.x;
				boat.x = targetX;
				boat.va += boat.vx * 0.0016;
			} else {
				// cursor shoves the boat when it gets close
				if (pointer.inside) {
					const dx = boat.x - pointer.x;
					const dy = boat.y - pointer.y;
					const dist = Math.hypot(dx, dy);
					if (dist < PUSH_RADIUS && dist > 0.001) {
						const strength = (1 - dist / PUSH_RADIUS) ** 2;
						const dirX = dx / dist;
						const push = strength * (0.9 + Math.abs(pointer.vx) * 0.55);
						boat.vx += dirX * push;
						boat.va += dirX * strength * 0.004;
					}
				}
				boat.vx *= FRICTION;
				boat.x += boat.vx;

				// soft bounce off the shores
				if (boat.x < b.left) {
					boat.x = b.left;
					boat.vx = Math.abs(boat.vx) * 0.45;
				} else if (boat.x > b.right) {
					boat.x = b.right;
					boat.vx = -Math.abs(boat.vx) * 0.45;
				}
			}

			boat.vx = Math.min(Math.max(boat.vx, -MAX_SPEED), MAX_SPEED);

			// bob: ride the surface
			const surface = waveY(boat.x, t);
			boat.y += (surface - boat.y) * 0.14;

			// lean with the wave slope, plus a little into the direction of travel
			const target = Math.atan(waveSlope(boat.x, t)) * 0.9 + boat.vx * 0.012;
			boat.va += (target - boat.angle) * 0.022;
			boat.va *= 0.9;
			boat.angle += boat.va;

			pointer.vx *= 0.8;
		}

		function loop() {
			step();
			draw();
			raf = requestAnimationFrame(loop);
		}

		function start() {
			if (running || reduceMotion) return;
			running = true;
			raf = requestAnimationFrame(loop);
		}
		function stop() {
			running = false;
			cancelAnimationFrame(raf);
		}

		// ---- input -----------------------------------------------------------
		function localPoint(e: PointerEvent) {
			const r = canvas.getBoundingClientRect();
			return { x: e.clientX - r.left, y: e.clientY - r.top };
		}

		function onMove(e: PointerEvent) {
			const p = localPoint(e);
			pointer.vx = p.x - pointer.x;
			pointer.x = p.x;
			pointer.y = p.y;
			pointer.inside = true;
			if (dragging) e.preventDefault();
			if (reduceMotion && dragging) {
				const b = bounds();
				boat.x = Math.min(Math.max(pointer.x + dragOffset, b.left), b.right);
				boat.y = waveY(boat.x, t);
				draw();
			}
		}

		function onLeave() {
			pointer.inside = false;
			pointer.x = -9999;
			pointer.y = -9999;
		}

		function onDown(e: PointerEvent) {
			const p = localPoint(e);
			// only grab if they actually went for the boat, so the page still scrolls
			if (Math.hypot(p.x - boat.x, p.y - boat.y) > BOAT_W) return;
			dragging = true;
			dragOffset = boat.x - p.x;
			pointer.x = p.x;
			pointer.y = p.y;
			pointer.inside = true;
			canvas.setPointerCapture(e.pointerId);
			e.preventDefault();
		}

		function onUp() {
			if (!dragging) return;
			dragging = false;
			// let the flick carry
			boat.vx = Math.min(Math.max(boat.vx, -MAX_SPEED), MAX_SPEED);
		}

		canvas.addEventListener('pointermove', onMove, { passive: false });
		canvas.addEventListener('pointerleave', onLeave);
		canvas.addEventListener('pointerdown', onDown);
		canvas.addEventListener('pointerup', onUp);
		canvas.addEventListener('pointercancel', onUp);

		const ro = new ResizeObserver(resize);
		ro.observe(host);
		resize();

		// only animate while the ocean is actually on screen
		const io = new IntersectionObserver(
			([entry]) => (entry.isIntersecting ? start() : stop()),
			{ threshold: 0.05 }
		);
		io.observe(host);

		if (reduceMotion) draw();

		return () => {
			stop();
			ro.disconnect();
			io.disconnect();
			canvas.removeEventListener('pointermove', onMove);
			canvas.removeEventListener('pointerleave', onLeave);
			canvas.removeEventListener('pointerdown', onDown);
			canvas.removeEventListener('pointerup', onUp);
			canvas.removeEventListener('pointercancel', onUp);
		};
	});
</script>

<section class="ocean">
	<div class="wrap ocean-inner" bind:this={host}>
		<span class="shore left">USA</span>
		<span class="shore right">Ireland</span>
		<canvas bind:this={canvas} aria-label="The Atlantic, with a boat you can push around"></canvas>
		<span class="hint">{hint}</span>
	</div>
</section>

<style>
	.ocean {
		background: var(--navy);
		padding: clamp(2rem, 5vw, 3.5rem) 0;
		overflow: hidden;
	}

	.ocean-inner {
		position: relative;
		height: clamp(230px, 30vw, 320px);
	}

	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
		/* vertical scrolling still belongs to the page; horizontal drags are ours */
		touch-action: pan-y;
	}

	.shore {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		font-size: clamp(1.1rem, 2.6vw, 1.8rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--paper);
		z-index: 2;
		pointer-events: none;
	}
	/* .wrap's padding doesn't apply to absolutely positioned children, so match it here */
	.shore.left {
		left: var(--edge-pad);
	}
	.shore.right {
		right: var(--edge-pad);
		color: var(--green);
	}

	.hint {
		position: absolute;
		left: 50%;
		bottom: 0;
		transform: translateX(-50%);
		font-size: 0.8rem;
		font-weight: 600;
		color: rgba(246, 241, 227, 0.45);
		pointer-events: none;
	}
</style>
