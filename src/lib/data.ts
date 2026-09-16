import type { SupplyItem, VaultGrant, Checkpoint, Builder } from './types';

export const builders: Builder[] = [
	{
		slug: 'johnny',
		name: 'Johnny',
		from: 'Galway',
		to: 'Vermont',
		projects: [
			{ id: 'weather-station', name: 'Weather Station', hours: 9.8 },
			{ id: 'stupid-robot', name: 'Stupid Robot', hours: 12.1 },
			{ id: 'tiny-game', name: 'Tiny Game', hours: 5.5 }
		]
	},
	{
		slug: 'maya',
		name: 'Maya',
		from: 'Toronto',
		projects: [
			{ id: 'tide-logger', name: 'Tide Logger', hours: 20.3 },
			{ id: 'desk-lamp', name: 'Reactive Desk Lamp', hours: 6.1 }
		]
	},
	{
		slug: 'lucas',
		name: 'Lucas',
		from: 'Berlin',
		projects: [
			{ id: 'couch-robot', name: 'Couch Robot', hours: 35.6 },
			{ id: 'font', name: 'A Font, Somehow', hours: 5.6 }
		]
	},
	{
		slug: 'sam',
		name: 'Sam',
		from: 'London',
		projects: [{ id: 'bad-at-games', name: 'Multiplayer for the Bad at Games', hours: 12.8 }]
	},
	{
		slug: 'priya',
		name: 'Priya',
		from: 'Bangalore',
		projects: [
			{ id: 'inbox-translator', name: 'Corporate Email Translator', hours: 22.4 },
			{ id: 'plant-alarm', name: 'Plant Guilt-Trip Alarm', hours: 11.2 }
		]
	},
	{
		slug: 'finn',
		name: 'Finn',
		from: 'Cork',
		projects: [{ id: 'printer', name: 'School Printer, Reverse Engineered', hours: 7.1 }]
	}
];

export const checkpoints: Checkpoint[] = [
	{
		number: 5,
		builderSlug: 'johnny',
		builderName: 'Johnny',
		projectId: 'weather-station',
		projectName: 'Weather Station',
		hours: 5,
		text: 'Got it reading temperature without lying to me. That took longer than it should have.',
		next: 'Wire up the rain sensor.',
		location: 'Galway, Ireland',
		date: '2026-06-02',
		media: 'photo',
		style: 'taped',
		rotate: -2
	},
	{
		number: 10,
		builderSlug: 'johnny',
		builderName: 'Johnny',
		projectId: 'weather-station',
		projectName: 'Weather Station',
		hours: 10,
		text: 'It texts me now when it’s going to rain. Mostly correct forecasts.',
		location: 'Galway, Ireland',
		date: '2026-06-09',
		media: 'photo',
		style: 'photo',
		rotate: 1.5
	},
	{
		number: 15,
		builderSlug: 'johnny',
		builderName: 'Johnny',
		projectId: 'stupid-robot',
		projectName: 'Stupid Robot',
		hours: 15,
		text: 'Finally got this thing to stop driving directly into my wall. It can now turn around when the ultrasonic sensor sees something.',
		next: 'Teach it to avoid the dog.',
		location: 'Galway, Ireland',
		date: '2026-06-21',
		media: 'video',
		style: 'label',
		rotate: -1
	},
	{
		number: 20,
		builderSlug: 'johnny',
		builderName: 'Johnny',
		projectId: 'stupid-robot',
		projectName: 'Stupid Robot',
		hours: 20,
		text: 'Taught it to avoid the dog. The dog is unimpressed either way.',
		location: 'Galway, Ireland',
		date: '2026-07-03',
		media: 'video',
		style: 'taped',
		rotate: 2
	},
	{
		number: 25,
		builderSlug: 'johnny',
		builderName: 'Johnny',
		projectId: 'tiny-game',
		projectName: 'Tiny Game',
		hours: 25,
		text: 'Started something new. It’s a game where everyone is bad at the game, on purpose.',
		location: 'Galway, Ireland',
		date: '2026-07-14',
		media: 'photo',
		style: 'plain',
		rotate: -1.5
	},
	{
		number: 20,
		builderSlug: 'maya',
		builderName: 'Maya',
		projectId: 'tide-logger',
		projectName: 'Tide Logger',
		hours: 20,
		text: 'Turns out waterproofing this was harder than building it.',
		next: 'Stop it filling with sand.',
		location: 'Toronto, Canada',
		date: '2026-06-18',
		media: 'photo',
		style: 'photo',
		rotate: -1
	},
	{
		number: 10,
		builderSlug: 'maya',
		builderName: 'Maya',
		projectId: 'tide-logger',
		projectName: 'Tide Logger',
		hours: 10,
		text: 'Logging tide height to a spreadsheet nobody asked for. I ask for it. I need it.',
		location: 'Toronto, Canada',
		date: '2026-06-05',
		media: 'photo',
		style: 'taped',
		rotate: 2
	},
	{
		number: 35,
		builderSlug: 'lucas',
		builderName: 'Lucas',
		projectId: 'couch-robot',
		projectName: 'Couch Robot',
		hours: 35,
		text: 'It moves. Whether it’s moving in the correct direction is another question.',
		location: 'Berlin, Germany',
		date: '2026-07-20',
		media: 'video',
		style: 'label',
		rotate: 1
	},
	{
		number: 25,
		builderSlug: 'lucas',
		builderName: 'Lucas',
		projectId: 'couch-robot',
		projectName: 'Couch Robot',
		hours: 25,
		text: 'Found four separate ways for it to get stuck under the couch. Working on a fifth.',
		location: 'Berlin, Germany',
		date: '2026-07-02',
		media: 'photo',
		style: 'plain',
		rotate: -2
	},
	{
		number: 10,
		builderSlug: 'sam',
		builderName: 'Sam',
		projectId: 'bad-at-games',
		projectName: 'Multiplayer for the Bad at Games',
		hours: 10,
		text: 'Everyone loses on purpose now. It’s a lot more fun.',
		location: 'London, UK',
		date: '2026-06-11',
		media: 'photo',
		style: 'taped',
		rotate: 1.5
	},
	{
		number: 20,
		builderSlug: 'priya',
		builderName: 'Priya',
		projectId: 'inbox-translator',
		projectName: 'Corporate Email Translator',
		hours: 20,
		text: '"Circling back" now correctly translates to "I forgot."',
		location: 'Bangalore, India',
		date: '2026-06-24',
		media: 'photo',
		style: 'photo',
		rotate: -1.5
	},
	{
		number: 5,
		builderSlug: 'finn',
		builderName: 'Finn',
		projectId: 'printer',
		projectName: 'School Printer, Reverse Engineered',
		hours: 5,
		text: 'Found the printer’s hidden admin panel. Have not told the IT department yet.',
		location: 'Cork, Ireland',
		date: '2026-06-01',
		media: 'photo',
		style: 'label',
		rotate: 2
	}
];

export const supplyItems: SupplyItem[] = [
	{
		id: 'EXP-014',
		name: 'Soldering Iron Kit',
		category: 'TOOLS',
		credits: 40,
		hoursApprox: 8,
		blurb: 'Temperature controlled. For when breadboards stop being enough.',
		style: 'taped'
	},
	{
		id: 'EXP-027',
		name: 'Mechanical Keyboard Switches (x10)',
		category: 'DESK',
		credits: 25,
		hoursApprox: 5,
		blurb: 'Linear, tactile, or clicky. We are not going to tell you which is correct.',
		style: 'label'
	},
	{
		id: 'EXP-041',
		name: 'Raspberry Pi 4 (4GB)',
		category: 'HARDWARE',
		credits: 90,
		hoursApprox: 18,
		blurb: 'Small computer. Big consequences.',
		style: 'rough'
	},
	{
		id: 'EXP-003',
		name: 'Domain Name (1 year)',
		category: 'BUILD',
		credits: 15,
		hoursApprox: 3,
		blurb: 'Make it real. Make it yours.',
		style: 'type'
	},
	{
		id: 'EXP-052',
		name: 'Desk Lamp, Slightly Too Bright',
		category: 'DESK',
		credits: 30,
		hoursApprox: 6,
		blurb: 'For 2am. You know the one.',
		style: 'taped'
	},
	{
		id: 'EXP-066',
		name: 'Mystery Electronics Grab Bag',
		category: 'WEIRD STUFF',
		credits: 20,
		hoursApprox: 4,
		blurb: 'Resistors, LEDs, one thing we forgot to label. No refunds.',
		style: 'label'
	},
	{
		id: 'EXP-019',
		name: 'Breadboard + Jumper Wire Pack',
		category: 'HARDWARE',
		credits: 18,
		hoursApprox: 4,
		blurb: 'The other kind of spaghetti code.',
		style: 'rough'
	},
	{
		id: 'EXP-038',
		name: 'Hosting Credit ($50)',
		category: 'BUILD',
		credits: 55,
		hoursApprox: 11,
		blurb: 'Put your thing on the internet. Watch it not crash. Hopefully.',
		style: 'type'
	},
	{
		id: 'EXP-071',
		name: 'Rubber Duck (Debugging Grade)',
		category: 'WEIRD STUFF',
		credits: 8,
		hoursApprox: 2,
		blurb: 'A very good listener. Says nothing. Fixes everything.',
		style: 'taped'
	}
];

export const vaultGrants: VaultGrant[] = [
	{ id: 'V-01', name: 'MONITOR GRANT', description: 'Up to $200 toward a monitor.' },
	{ id: 'V-02', name: 'HEADPHONE GRANT', description: 'Up to $200 toward headphones.' },
	{ id: 'V-03', name: 'KEYBOARD GRANT', description: 'Up to $200 toward a keyboard / setup upgrade.' },
	{
		id: 'V-04',
		name: 'MAKER GRANT',
		description: 'Up to $200 toward electronics, soldering equipment, tools or components.'
	},
	{
		id: 'V-05',
		name: 'PROJECT GRANT',
		description: 'Up to $200 toward whatever you need to build your next project.'
	},
	{
		id: 'V-06',
		name: 'HOME LAB GRANT',
		description: 'Up to $200 toward SBCs, storage, networking gear or a small home server.'
	}
];

export const stats = {
	builders: 412,
	hoursShipped: 6284,
	projectsShipped: 189,
	finishers40h: 11
};

export const outThere = [
	{ name: 'ADA', location: 'AUSTIN', note: 'A synth you play by tapping on cardboard boxes.' },
	{ name: 'PRIYA', location: 'BANGALORE', note: 'Teaching a plant to guilt-trip her into watering it.' },
	{ name: 'FINN', location: 'CORK', note: 'Reverse engineering the school printer. For science.' },
	{ name: 'SAM', location: 'LONDON', note: 'A multiplayer game for people who are terrible at games.' }
];
