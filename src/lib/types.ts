/**
 * A supply drop on the Expedition route.
 * Hours are the price: 1 verified hour = $5 of value, so `value` is always
 * `hours * 5` and includes shipping. Swap `art` for real photography later.
 */
export interface Drop {
	hours: number;
	value: number;
	name: string;
	/** second item in the drop, if there is one */
	extra?: string;
	art: 'cap' | 'mouse' | 'charger' | 'earbuds' | 'mic' | 'speaker' | 'camera' | 'keyboard';
	/** the 40 hour drop, which ends the trail */
	finisher?: boolean;
	/** product photo on a transparent background, under /static */
	image?: string;
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
