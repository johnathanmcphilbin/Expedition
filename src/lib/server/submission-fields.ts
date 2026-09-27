import { text, url, email, ValidationError } from './validate';

/**
 * The fields of a project submission, as the participant fills them in and as
 * a reviewer can edit them before the row goes to Hack Club. One parser, so
 * both sides are held to exactly the same rules.
 */
export type SubmissionFields = {
	project_name: string;
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

export function parseSubmissionFields(form: FormData): SubmissionFields {
	const hardware = form.get('hardware') === 'yes';
	const codeUrl = url(form.get('code_url'), 'Code link', { required: true })!;
	return {
		project_name: text(form.get('project'), 'Project', { max: 200, required: true })!,
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
