<script lang="ts">
	let callsign = $state('YOURNAME');
	let number = $state('07');
</script>

<section class="section">
	<div class="wrap jersey-wrap">
		<div class="copy-col">
			<h2>You can't buy this.</h2>
			<p class="price">40 hours. That's the price.</p>
			<p class="lede">
				Everyone who reaches 40 verified hours gets the Expedition jersey. It isn't in the Supply
				Co. and it never goes on sale. It's proof you finished.
			</p>

			<div class="customize">
				<label class="field">
					<span class="field-label">Name / callsign</span>
					<input maxlength="12" bind:value={callsign} />
				</label>
				<label class="field">
					<span class="field-label">Number</span>
					<input class="num-input" maxlength="2" bind:value={number} />
				</label>
			</div>
		</div>

		<div class="jersey-col">
			<svg viewBox="0 0 300 340" class="jersey-svg" aria-label="Expedition jersey preview">
				<path
					d="M75,30 L110,15 C120,35 180,35 190,15 L225,30 L255,80 L225,105 L215,90 L215,320 L85,320 L85,90 L75,105 L45,80 Z"
					fill="var(--navy)"
					stroke="var(--navy)"
					stroke-width="3"
					stroke-linejoin="round"
				/>
				<rect x="85" y="150" width="130" height="10" fill="var(--green)" />
				<rect x="85" y="168" width="130" height="5" fill="var(--paper)" />
				<text x="150" y="255" text-anchor="middle" font-family="Phantom Sans, sans-serif" font-size="72" font-weight="800" fill="var(--paper)">
					{number || '00'}
				</text>
				<text x="150" y="290" text-anchor="middle" font-family="Phantom Sans, sans-serif" font-size="15" font-weight="700" fill="var(--green)">
					{(callsign || 'YOURNAME').toUpperCase()}
				</text>
				<text x="150" y="120" text-anchor="middle" font-family="Phantom Sans, sans-serif" font-size="17" font-weight="800" fill="var(--paper)">
					EXPEDITION
				</text>
			</svg>
		</div>
	</div>
</section>

<style>
	.jersey-wrap {
		display: grid;
		grid-template-columns: 1.05fr 0.95fr;
		gap: 3.5rem;
		align-items: center;
	}

	.price {
		margin: 0.9rem 0 1rem;
		font-size: 1.35rem;
		font-weight: 800;
		color: var(--green);
	}

	.customize {
		display: flex;
		gap: 1rem;
		margin-top: 2rem;
		flex-wrap: wrap;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.field-label {
		font-size: 0.92rem;
		font-weight: 700;
		color: var(--navy);
	}

	.field input {
		background: var(--white);
		border: 2px solid var(--rule-strong);
		border-radius: 12px;
		color: var(--ink);
		padding: 0.65em 0.8em;
		font-family: var(--font-sans);
		font-size: 1rem;
		font-weight: 700;
		width: 12ch;
	}
	.num-input {
		width: 5ch;
	}
	.field input:focus {
		outline: 3px solid var(--blue);
		outline-offset: 1px;
		border-color: transparent;
	}

	.jersey-col {
		display: flex;
		justify-content: center;
	}

	.jersey-svg {
		width: 100%;
		max-width: 320px;
	}

	@media (max-width: 820px) {
		.jersey-wrap {
			grid-template-columns: 1fr;
			gap: 2.5rem;
		}
	}
</style>
