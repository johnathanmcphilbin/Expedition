export interface SupplyItem {
	id: string;
	name: string;
	category: 'BUILD' | 'HARDWARE' | 'DESK' | 'TOOLS' | 'WEIRD STUFF';
	credits: number;
	hoursApprox: number;
	blurb: string;
	style: 'taped' | 'label' | 'rough' | 'type';
}

export interface VaultGrant {
	id: string;
	name: string;
	description: string;
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
