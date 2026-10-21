/**
 * A supply drop on the Expedition route.
 * Hours are the price: 1 verified hour = $5 of value, so `value` is always
 * `hours * 5` and includes shipping. Swap `art` for real photography later.
 */
export interface Drop {
	/** claim key; defaults to the hour tier. Needed when two drops share a tier. */
	key?: string;
	hours: number;
	value: number;
	name: string;
	/** second item in the drop, if there is one */
	extra?: string;
	art?: 'cap' | 'mouse' | 'charger' | 'earbuds' | 'mic' | 'speaker' | 'camera' | 'keyboard';
	/** the 40 hour drop, which ends the trail. Not revealed or claimable yet. */
	finisher?: boolean;
	/** product photo on a transparent background, under /static */
	image?: string;
	/** Expedition merch we ship — every other drop is a grant for the item */
	merch?: boolean;
	/** a line about it, shown in the shop */
	about?: string;
	/** in the shop only, not a stop on the hours trail */
	shopOnly?: boolean;
}

export interface Project {
	id: string;
	name: string;
	hours: number;
}

export interface Checkpoint {
	number: number;
	builderSlug: string;
	builderName: string;
	projectId: string;
	projectName: string;
	hours: number;
	text: string;
	next?: string;
	location?: string;
	date: string;
	media: 'photo' | 'video';
	style: 'photo' | 'taped' | 'label' | 'plain';
	rotate: number;
}

export interface Builder {
	slug: string;
	name: string;
	from: string;
	to?: string;
	projects: Project[];
}
