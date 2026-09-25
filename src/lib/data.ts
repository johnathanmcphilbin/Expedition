import type { Checkpoint, Builder, Drop } from './types';

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

/** `value` is the grant amount in USD — only shown when someone asks for it. */
export const drops: Drop[] = [
	{ hours: 5, value: 25, name: 'Custom Expedition cap', extra: 'Jukebox Expedition stickers', art: 'cap', image: '/drop-cap.webp', merch: true },
	{ hours: 10, value: 50, name: 'Nice wireless mouse', art: 'mouse', image: '/drop-mouse.webp' },
	{ hours: 15, value: 75, name: '65W GaN charger', extra: 'USB-C cable', art: 'charger', image: '/drop-charger.webp' },
	{ hours: 20, value: 100, name: 'Wireless earbuds', art: 'earbuds', image: '/drop-earbuds.webp' },
	{ hours: 25, value: 125, name: 'Really nice microphone', art: 'mic', image: '/drop-mic.webp' },
	{ hours: 30, value: 150, name: 'Portable Bluetooth speaker', art: 'speaker', image: '/drop-speaker.webp' },
	{ hours: 35, value: 175, name: 'Polaroid-style instant camera', art: 'camera', image: '/drop-camera.webp' },
	// The finisher prize isn't announced yet — only ever shown as a teaser.
	{ hours: 40, value: 200, name: 'The 40-hour prize', art: 'keyboard', finisher: true }
];

/** Travel grant per approved hour banked toward Dublin. Only ever shown on request. */
export const TRAVEL_RATE = 8;

/** "$50 grant", or "$12.75" style for travel amounts */
export const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

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
