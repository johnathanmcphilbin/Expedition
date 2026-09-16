<script lang="ts">
	import { vaultGrants } from '$lib/data';

	let unlocked = $state(false);
	let nudged = $state(false);

	function tryOpen() {
		if (unlocked) return;
		nudged = true;
		setTimeout(() => (nudged = false), 500);
	}
</script>

<section class="section vault-section" id="vault">
	<div class="wrap">
		<h2>You actually did it. The vault opens.</h2>
		<p class="lede">
			Forty verified hours is the price of entry. Get there and you pick one grant worth up to $200,
			plus something you can't buy.
		</p>

		<div class="lock-row">
			<button class="lock" class:nudged onclick={tryOpen}>
				{unlocked ? 'Unlocked' : 'Locked'} <span class="lock-icon" aria-hidden="true">{unlocked ? '🔓' : '🔒'}</span>
			</button>
			<span class="requirement">40 verified hours required</span>
		</div>

		<div class="grants">
			{#each vaultGrants as g (g.id)}
				<div class="grant" class:hidden-grant={!unlocked}>
					<h3>{g.name.replace(' GRANT', '')} grant</h3>
					<p class="amount">Up to $200</p>
					<p class="grant-desc">{g.description}</p>
				</div>
			{/each}
		</div>

		<p class="choose">Choose one.</p>
	</div>
</section>

<style>
	.vault-section {
		background: var(--navy);
	}
	.vault-section :global(h2),
	.vault-section :global(h3) {
		color: var(--paper);
	}
	.vault-section :global(.lede) {
		color: rgba(253, 251, 245, 0.72);
	}

	.lock-row {
		display: flex;
		align-items: center;
		gap: 1.2rem;
		flex-wrap: wrap;
		margin: 2.5rem 0 3rem;
	}

	.lock {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		background: var(--navy-soft);
		color: var(--paper);
		border: 0;
		border-radius: 16px;
		box-shadow: 0 8px 0 #101b2e;
		font-size: 1.05rem;
		font-weight: 800;
		padding: 14px 26px;
		min-height: 54px;
		cursor: pointer;
		transition: transform 0.12s ease, box-shadow 0.12s ease;
	}
	.lock:hover {
		transform: translateY(-2px);
		box-shadow: 0 10px 0 #101b2e;
	}
	.lock.nudged {
		animation: nudge 0.5s ease;
	}
	@keyframes nudge {
		0%, 100% { transform: translateX(0); }
		25% { transform: translateX(-7px); }
		75% { transform: translateX(7px); }
	}
	.lock-icon {
		font-size: 1.1rem;
	}

	.requirement {
		font-weight: 700;
		color: rgba(253, 251, 245, 0.6);
	}

	.grants {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
		gap: 1.3rem;
	}

	.grant {
		background: var(--navy-soft);
		border: 2px solid rgba(253, 251, 245, 0.16);
		border-radius: 14px;
		padding: 1.3rem;
	}

	.amount {
		margin-top: 0.3rem;
		font-weight: 800;
		color: var(--green);
	}

	.grant-desc {
		margin-top: 0.5rem;
		font-size: 0.93rem;
		color: rgba(253, 251, 245, 0.66);
	}

	.hidden-grant .grant-desc {
		filter: blur(4px);
		user-select: none;
	}

	.choose {
		margin-top: 2rem;
		font-weight: 800;
		font-size: 1.1rem;
		color: var(--paper);
	}
</style>
