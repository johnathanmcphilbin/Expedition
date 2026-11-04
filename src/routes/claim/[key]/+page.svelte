<script lang="ts">
	import GrantAmount from '$lib/components/GrantAmount.svelte';
	import { money, CHALLENGE } from '$lib/data';
	import '$lib/styles/app.css';
	import { enhance } from '$app/forms';
	import Footer from '$lib/components/Footer.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let claiming = $state(false);
	const item = $derived(data.item);
	const short = $derived(
		(item.hours - Number(data.balance.hours_available)).toFixed(2).replace(/\.?0+$/, '')
	);
</script>

<svelte:head><title>{item.name} · Expedition</title></svelte:head>

<main class="app-page">
	<div class="wrap">
		<p class="back"><a href="/claim">← Shop</a></p>

		<div class="app-head">
			<div>
				<h1 class="app-title">{item.name}</h1>
				{#if item.about}<p class="about">{item.about}</p>{/if}
				{#if item.extra}<p class="about">+ {item.extra}</p>{/if}
			</div>
			<div class="price">
				<span class="hrs">{item.hours}h</span>
				<span class="kind">{item.merch ? 'Shipped to you' : 'Grant'}</span>
			</div>
		</div>

		{#if form?.success}
			<p class="notice">
				Claimed {form.claimed}. We'll be in touch about getting it to you.
				{#if form.wonChallenge && CHALLENGE}You also won {CHALLENGE.prize}, shipped free.{/if}
			</p>
		{:else if form?.message}
			<p class="notice error">{form.message}</p>
		{/if}

		<div class="sides">
			{#if item.image}
				<figure>
					<img src={item.image} alt="{item.name}, front" />
					<figcaption>{item.imageBack ? 'Front' : item.name}</figcaption>
				</figure>
			{/if}
			{#if item.imageBack}
				<figure>
					<img src={item.imageBack} alt="{item.name}, back" />
					<figcaption>Back</figcaption>
				</figure>
			{/if}
		</div>

		<div class="buy">
			{#if !item.merch}<GrantAmount reveal="{money(item.value)} grant" />{/if}
			{#if item.claimed}
				<p class="drop-state">Claimed{item.claimed > 1 ? ` ×${item.claimed}` : ''}</p>
			{/if}
			{#if !item.affordable}
				{#if !item.claimed}
					<p class="drop-state">{short}h more needed</p>
				{/if}
			{:else}
				<form
					method="POST"
					action="?/claim"
					use:enhance={() => {
						claiming = true;
						return async ({ update }) => {
							await update();
							claiming = false;
						};
					}}>
					<input type="hidden" name="reward_key" value={item.key} />
					<input name="note" type="text" maxlength="500" placeholder="Size, colour, anything we should know" />
					<button class="btn" type="submit" disabled={claiming}>
						{item.claimed ? 'Claim another' : 'Claim'} for {item.hours}h
					</button>
				</form>
			{/if}
			<p class="hint">You have {data.balance.hours_available}h available to spend.</p>
		</div>
	</div>
</main>
<Footer />

<style>
	.back {
		margin: 0 0 1.2rem;
	}
	.back a {
		font-weight: 700;
		text-decoration: none;
	}
	.back a:hover {
		color: var(--green-dark);
	}
	.about {
		margin-top: 0.55rem;
		max-width: 38rem;
		color: var(--slate);
		font-weight: 500;
	}
	.price {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		font-family: var(--font-mono);
	}
	.hrs {
		font-size: 1.7rem;
		font-weight: 700;
		color: var(--navy);
		line-height: 1;
	}
	.kind {
		font-size: 0.82rem;
		color: var(--muted);
	}
	.sides {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	.sides figure {
		margin: 0;
		border: 1.5px solid var(--navy);
		background: var(--white);
		padding: 0.75rem 0.75rem 0.65rem;
	}
	.sides img {
		width: 100%;
		height: min(440px, 52vw);
		object-fit: contain;
	}
	.sides figcaption {
		margin-top: 0.35rem;
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.buy {
		max-width: 28rem;
		margin-top: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.buy form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.drop-state {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--muted);
	}
	.error {
		color: var(--red);
	}
	@media (max-width: 700px) {
		.sides {
			grid-template-columns: 1fr;
		}
		.sides img {
			height: 300px;
		}
		.price {
			align-items: flex-start;
		}
	}
</style>
