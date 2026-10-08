<script lang="ts">
	import '$lib/styles/app.css';
	import Footer from '$lib/components/Footer.svelte';

	import { EVENT } from '$lib/data';

	// Johnny's words, in his voice.
	const faq: { q: string; a: string[]; link?: { href: string; text: string } }[] = [
		{
			q: 'what is expedition?!',
			a: ['Expedition Ireland is an overnight hackathon!']
		},
		{
			q: 'is the actual hackathon free?!',
			a: ['yeahh! the event itself is completely free']
		},
		{
			q: 'where?!',
			a: ['PorterShed, Galway, Ireland'],
			link: { href: EVENT.mapsUrl, text: 'PorterShed on Google Maps →' }
		},
		{
			q: 'whenn?!',
			a: ['5–6 December. it starts at 8am on 5 December and ends at 2pm on 6 December']
		},
		{
			q: 'how do i qualify?!',
			a: [
				'build projects! build whatever you want, software or hardware',
				'then do the standard 40 hours to qualify, or enough hours to cover half your travel cost. like if your travel costs $100 you need to cover half, which is $50'
			]
		},
		{
			q: 'wait, how do i cover the travel cost?',
			a: [
				'you do hours to get a travel grant. the rate is $8 per hour',
				"for example, if someone's travel costs $800 they'd need 100 hours to cover all of it at $8/h"
			]
		},
		{
			q: 'so the 40h count towards qualifying and the travel grant too?',
			a: ['YESS, it counts towards your travel grant too, which is $320']
		},
		{
			q: 'what about accommodation?',
			a: [
				'same as the travel stipend! id recommend keeping around 7 to 14 hours for accommodation. orgs are working on group accommodation for everyone atm so dont go booking random hotels yet, we will sort that closer to the time'
			]
		},
		{
			q: 'should i book flights/hotels now?',
			a: ['pls dont yet. theres still stuff being sorted']
		},
		{
			q: 'can i do more than 40 hours then?',
			a: [
				'YES!! 40 is just the max you need to qualify to come. you can keep building after that and every extra approved hour you bank is another $8 towards travel'
			]
		},
		{
			q: 'will there be need based stipends?',
			a: ['orgs are looking into it!! we dont want to promise anything until we know what budget we have though']
		},
		{
			q: 'what about visas?',
			a: [
				'orgs are working on it rn. we are looking into invitation letters + the visa documents people need and will get proper info out asap because some of you need to apply pretty early'
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
			a: [
				"YES. keep a JOURNAL.md in your repo with an entry roughly every hour, and make sure your repo has your BOM, schematics/CAD files and firmware. you dont need a live url for hardware"
			],
			link: { href: '/hardware', text: 'the hardware rules →' }
		},
		{
			q: 'do i really need to come to ireland?',
			a: ["no!! you can just do expedition, build cool stuff and get the normal prizes if you dont want to come"]
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
					{#if item.link}
						<dd>
							<a class="more" href={item.link.href} {...item.link.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {}}>{item.link.text}</a>
						</dd>
					{/if}
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
	.more {
		font-weight: 700;
		color: var(--navy);
	}
	dd {
		margin: 0.5rem 0 0;
		font-size: 1rem;
		line-height: 1.55;
		color: var(--slate);
	}
</style>
