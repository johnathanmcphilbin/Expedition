import { text, url, email, ValidationError } from './validate';
import { JUSTIFICATION_FIELDS, type Justifications } from './airtable';

/**
 * The justification section of a review form. Inputs are named `just_<n>`
 * (Airtable's field names have commas and brackets in them), mapped back to
 * the exact field name here. Blank means clear.
 */
export function parseJustifications(form: FormData): Justifications {
	return Object.fromEntries(
		JUSTIFICATION_FIELDS.map((f, i) => [f.name, text(form.get(`just_${i}`), f.label, { max: 5000 })])
	);
}

/**
 * The fields of a project submission, as the participant fills them in and as
 * a reviewer can edit them before the row goes to Hack Club. One parser, so
 * both sides are held to exactly the same rules.
 */
export type SubmissionFields = {
	/** display name: the Hackatime projects joined with " + ", or what they called it (untracked hardware) */
	project_name: string;
	/** every Hackatime project that makes up this one Expedition project; empty for hardware not tracked in Hackatime */
	hackatime_projects: string[];
	hardware: boolean;
	code_url: string;
	playable_url: string;
	description: string;
	first_name: string;
	last_name: string;
	email: string;
	github_username: string;
	birthday: string;
	address_line1: string;
	address_line2: string | null;
	city: string;
	state: string;
	country: string;
	zip: string;
	heard_about: string | null;
	doing_well: string | null;
	improve: string | null;
};

function birthday(value: FormDataEntryValue | null): string {
	const raw = text(value, 'Birthday', { max: 10, required: true })!;
	const d = new Date(`${raw}T00:00:00Z`);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(d.getTime())) {
		throw new ValidationError('Birthday must be a real date', 'birthday');
	}
	if (d.getTime() > Date.now() || d.getUTCFullYear() < 1900) {
		throw new ValidationError('Birthday must be a real date', 'birthday');
	}
	return raw;
}

function projects(form: FormData): string[] {
	const names = [
		...new Set(
			form
				.getAll('project')
				.map((v) => (typeof v === 'string' ? v.trim() : ''))
				.filter(Boolean)
		)
	];
	if (names.length > 10) throw new ValidationError('Pick at most 10 Hackatime projects', 'project');
	for (const n of names) if (n.length > 200) throw new ValidationError('Project name is too long', 'project');
	return names;
}

const LAPSE_INPUT = `just_${JUSTIFICATION_FIELDS.findIndex((f) => f.name === 'Justification - Lapse Links, comma-separated')}`;

/** Lapse links on either form: the participant's box, or the reviewer's justification field. */
function hasLapse(form: FormData): boolean {
	return [form.get('lapse_links'), form.get(LAPSE_INPUT)].some((v) => typeof v === 'string' && v.trim() !== '');
}

export function parseSubmissionFields(form: FormData): SubmissionFields {
	const hardware = form.get('hardware') === 'yes';
	const hackatimeProjects = projects(form);
	// Hardware doesn't have to be tracked in Hackatime (journals, photos and
	// the build itself are the evidence), unless it comes with Lapse
	// timelapses: those are recorded against a Hackatime project.
	if (!hackatimeProjects.length) {
		if (!hardware) throw new ValidationError('Pick at least one Hackatime project', 'project');
		if (hasLapse(form)) {
			throw new ValidationError('Lapse timelapses are recorded against a Hackatime project. Pick the one you used', 'project');
		}
	}
	const projectName = hackatimeProjects.length
		? hackatimeProjects.join(' + ')
		: text(form.get('project_title'), 'Project name', { max: 200, required: true })!;
	const codeUrl = url(form.get('code_url'), 'Code link', { required: true })!;
	return {
		project_name: projectName,
		hackatime_projects: hackatimeProjects,
		hardware,
		code_url: codeUrl,
		// hardware has no live URL; the repo stands in for it (see /hardware)
		playable_url: url(form.get('playable_url'), 'Demo link', { required: !hardware }) ?? codeUrl,
		description: text(form.get('description'), 'Description', { min: 20, max: 4000, required: true })!,
		first_name: text(form.get('first_name'), 'First name', { max: 100, required: true })!,
		last_name: text(form.get('last_name'), 'Last name', { max: 100, required: true })!,
		email: email(form.get('email'), 'Email'),
		github_username: text(form.get('github_username'), 'GitHub username', { max: 100, required: true })!,
		birthday: birthday(form.get('birthday')),
		address_line1: text(form.get('address_line1'), 'Address', { max: 200, required: true })!,
		address_line2: text(form.get('address_line2'), 'Address line 2', { max: 200 }),
		city: text(form.get('city'), 'City', { max: 100, required: true })!,
		state: text(form.get('state'), 'State / province', { max: 100, required: true })!,
		country: text(form.get('country'), 'Country', { max: 100, required: true })!,
		zip: text(form.get('zip'), 'Postal code', { max: 20, required: true })!,
		heard_about: text(form.get('heard_about'), 'How you heard', { max: 1000 }),
		doing_well: text(form.get('doing_well'), 'What we do well', { max: 2000 }),
		improve: text(form.get('improve'), 'What to improve', { max: 2000 })
	};
}
