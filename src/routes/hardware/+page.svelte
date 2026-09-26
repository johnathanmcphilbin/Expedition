<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';
</script>

<svelte:head><title>Hardware rules · Expedition</title></svelte:head>

<main class="app-page hw-page">
	<div class="wrap">
		<h1 class="app-title">Hardware</h1>
		<p class="lede">
			Hardware is allowed! You don't need to screen record yourself soldering for hours. Keep a
			journal instead, and make sure your repo has everything we need to review it.
		</p>
		<p class="lede">
			You still submit the normal way through <a href="/submit-to-hackclub">Submit a project</a>. This
			page is just what your repo needs to have in it so we can approve your hours.
		</p>

		<div class="doc">
			<section>
				<h2>Hardware tracking</h2>
				<p>Keep a <code>JOURNAL.md</code> in your GitHub repo and add an entry roughly every hour you work.</p>
				<p>Each entry should have:</p>
				<ul>
					<li>what you worked on</li>
					<li>roughly how long you worked</li>
					<li>a photo or screenshot of your progress where you can</li>
					<li>anything that went wrong, changed, or what you're doing next</li>
				</ul>
				<p>
					It does NOT need to be an essay. The point is that when your project gets reviewed, we can
					follow the build and see where your tracked hours went.
				</p>
				<p class="ex-k">Example</p>
				<pre class="journal"><span class="md-h">## Sept 28 - 1 hour</span>

Wired the XIAO RP2040 to the display and got it powered on. Spent ages figuring out why the screen wasn't responding and realised I had SDA/SCL backwards.

<span class="md-photo">[photo]</span>

Next im going to get the actual display code working.</pre>
			</section>

			<section>
				<h2>What every hardware submission needs</h2>
				<ol>
					<li>GitHub repo</li>
					<li>README explaining what the project is and how it works</li>
					<li><code>JOURNAL.md</code> showing progress roughly every hour</li>
					<li>Photos/videos of the project or the current build</li>
					<li>All the relevant source/design files</li>
					<li>BOM where needed</li>
					<li>Schematics/wiring diagrams where needed</li>
					<li>Firmware/code where needed</li>
				</ol>
				<p>You don't need a live URL for hardware. A link to your repo is fine.</p>
			</section>

			<section>
				<h2>BOM</h2>
				<p>
					You need a Bill of Materials for hardware projects, unless the whole project is just a 3D
					model/print.
				</p>
				<p>Your BOM needs:</p>
				<ul>
					<li>every component you used, including stuff you already had</li>
					<li>specific part names</li>
				</ul>
				<p class="good-bad">
					<span class="good">Good:</span> "Seeed Studio XIAO RP2040"<br />
					<span class="bad">Bad:</span> "Microcontroller"
				</p>
			</section>

			<section>
				<h2>PCB projects</h2>
				<p>If your project uses a PCB, submit:</p>
				<ul>
					<li>the schematic</li>
					<li>the PCB design</li>
					<li>all the original, editable PCB project files</li>
				</ul>
				<p>For KiCad that's <code>.kicad_pro</code>, <code>.kicad_sch</code> and <code>.kicad_pcb</code>.</p>
				<p>Exported images or PDFs of the PCB on their own won't be accepted.</p>
			</section>

			<section>
				<h2>Electronics without a PCB</h2>
				<p>If you've wired components together without a PCB/schematic, include a wiring diagram.</p>
				<p>
					If you have a PCB but there's extra electronics connected outside it, document those
					connections too.
				</p>
			</section>

			<section>
				<h2>3D printing / CAD</h2>
				<p>
					If you made custom 3D models, include the editable CAD files, like <code>.STEP</code>,
					<code>.STP</code> or <code>.F3D</code>.
				</p>
				<p>
					You can include STLs too, but an STL on its own isn't enough when there's an editable
					source model.
				</p>
				<p>If the whole project is just a 3D model/print, you don't need a BOM unless you used other components.</p>
			</section>

			<section>
				<h2>Firmware</h2>
				<p>If your project needs firmware to do its main thing, include the firmware source code.</p>
				<p>
					If you're still in the design/prototype stage, the firmware can be basic and doesn't have
					to be fully tested yet.
				</p>
			</section>

			<section class="final">
				<h2>Your final submission</h2>
				<p><strong>We're not looking for just a photo of a finished thing.</strong> We want to be able to see:</p>
				<ul>
					<li>what you made</li>
					<li>how you made it</li>
					<li>the actual project/design files</li>
					<li>your progress over time</li>
					<li>enough evidence to review the hours you submitted</li>
				</ul>
				<p>Questions? Throw them in #expedition-help.</p>
			</section>
		</div>
	</div>
</main>
<Footer />

<style>
	/* the footer's waves rise 90px up into the page */
	.hw-page {
		padding-bottom: calc(90px + 3rem);
	}
	.lede {
		margin-top: 0.8rem;
		max-width: 62ch;
		font-size: 1.05rem;
		color: var(--slate);
	}
	.lede a {
		color: var(--navy);
		font-weight: 700;
	}

	.doc {
		margin-top: 2rem;
		max-width: 760px;
		background: var(--white);
		border: 3px solid var(--navy);
	}
	section {
		padding: 1.4rem clamp(1.2rem, 3vw, 1.8rem);
	}
	section + section {
		border-top: 2px solid var(--rule);
	}
	h2 {
		font-size: 1.25rem;
		color: var(--navy);
		margin-bottom: 0.6rem;
	}
	p,
	li {
		font-size: 1rem;
		line-height: 1.55;
		color: var(--slate);
	}
	p + p,
	ul + p,
	ol + p {
		margin-top: 0.6rem;
	}
	ul,
	ol {
		margin: 0.4rem 0 0;
		padding-left: 1.3rem;
	}
	li + li {
		margin-top: 0.2rem;
	}
	code {
		font-family: var(--font-mono);
		font-size: 0.9em;
		padding: 0.05em 0.35em;
		background: var(--paper);
		color: var(--navy);
	}
	.ex-k {
		margin-top: 1rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.journal {
		margin: 0.5rem 0 0;
		padding: 1rem 1.1rem;
		background: var(--paper);
		border-left: 3px solid var(--green);
		font-family: var(--font-mono);
		font-size: 0.88rem;
		line-height: 1.55;
		color: var(--ink);
		white-space: pre-wrap;
	}
	.md-h {
		font-weight: 700;
		color: var(--navy);
	}
	.md-photo {
		color: var(--muted);
	}
	.good-bad {
		margin-top: 0.8rem;
		font-family: var(--font-mono);
		font-size: 0.92rem;
	}
	.good {
		font-weight: 700;
		color: var(--green-dark);
	}
	.bad {
		font-weight: 700;
		color: var(--red-dark);
	}
	.final strong {
		color: var(--navy);
	}
</style>
