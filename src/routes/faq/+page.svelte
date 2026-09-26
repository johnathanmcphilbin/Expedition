<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';

	// Johnny's words, kept exactly as written.
	const faq: { q: string; a: string[] }[] = [
		{
			q: 'when is it?',
			a: [
				'december 5th in dublin!! dogpatch labs is confirmed and im talking with them atm about making it a 2 day hackathon. ill have the exact schedule + details up when thats all sorted'
			]
		},
		{
			q: 'wait so how many hours do i actually need to come?',
			a: [
				'you need enough hours to cover 50% of your flight at $8/hr OR finish the full expedition which is 40 hours'
			]
		},
		{
			q: 'what if my flight is like $1000?',
			a: [
				'you still only need 40 hours to qualify to come. you do NOT need to do 60 or 100 hours just because you live further away'
			]
		},
		{
			q: 'so 40 hours means you pay for my flight?',
			a: [
				'NOOO this is where i confused everyone lmao. 40 hours qualifies you to come, it does not mean your whole flight is paid for',
				'40 hours = $320 of travel stipend. if your flight is $1000 you can put that $320 towards it and pay the rest yourself'
			]
		},
		{
			q: 'can i do more than 40 hours then?',
			a: [
				'YES!! 40 is just the max you need to qualify to come. you can keep building after that and every extra approved hour you bank is another $8 towards travel'
			]
		},
		{
			q: 'what about accommodation?',
			a: [
				'same travel stipend! id recommend keeping around 7 to 14 hours for accommodation. im working on group accommodation for everyone atm so dont go booking random hotels yet, we will sort that closer to the time'
			]
		},
		{
			q: 'is the actual hackathon free?',
			a: ['YES the event itself is completely free']
		},
		{
			q: 'will there be need based stipends?',
			a: ["im looking into it!! i dont want to promise anything until i know what budget i have though"]
		},
		{
			q: 'what about visas?',
			a: [
				'I KNOWWWW im working on it. im looking into invitation letters + the visa documents people need and ill get proper info out asap because ik some of ye need to apply pretty early'
			]
		},
		{
			q: 'can i use an old project?',
			a: [
				'you can keep working on an unfinished old project but only the new hours you do during expedition count'
			]
		},
		{
			q: 'CAN I DO HARDWARE?',
			a: ['YES. proper rules for how hardware journaling/submissions work are coming']
		},
		{
			q: 'do i have to go to ireland?',
			a: [
				"no!! you can just do expedition, build cool stuff and get the normal prizes if you dont want to come"
			]
		},
		{
			q: 'should i book flights/hotels now?',
			a: [
				'pls dont yet. theres still stuff being sorted and id rather tell ye i dont know something yet than have someone spend hundreds because of something said in a random slack thread'
			]
		},
		{
			q: 'i have another question',
			a: [
				'throw it in #expedition-help!! thats the place for anything about projects, hours, submissions, travel, visas or anything else expedition. theres a lot being figured out atm but ill try get ye an answer as quickly as possible'
			]
		}
	];
</script>

<svelte:head><title>FAQ · Expedition</title></svelte:head>

<main class="app-page faq-page">
	<div class="wrap">
		<h1 class="app-title">FAQ</h1>

		<dl class="faq">
			{#each faq as item (item.q)}
				<div class="item">
					<dt>{item.q}</dt>
					{#each item.a as para, i (i)}
						<dd>{para}</dd>
					{/each}
				</div>
			{/each}
		</dl>
	</div>
</main>
<Footer />

<style>
	/* the footer's waves rise 90px up into the page */
	.faq-page {
		padding-bottom: calc(90px + 3rem);
	}

	.faq {
		margin: 2rem 0 0;
		max-width: 760px;
		background: var(--white);
		border: 3px solid var(--navy);
	}
	.item {
		padding: 1.3rem clamp(1.2rem, 3vw, 1.8rem);
	}
	.item + .item {
		border-top: 2px solid var(--rule);
	}
	dt {
		font-size: 1.15rem;
		font-weight: 800;
		letter-spacing: -0.01em;
		color: var(--navy);
	}
	dd {
		margin: 0.5rem 0 0;
		font-size: 1rem;
		line-height: 1.55;
		color: var(--slate);
	}
</style>
