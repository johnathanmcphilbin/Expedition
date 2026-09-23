/**
 * Server-side input validation. Every one of these runs on the server; nothing
 * the browser sends is trusted, including values that a disabled form field or
 * client-side check would appear to constrain.
 */

export class ValidationError extends Error {
	constructor(
		message: string,
		public field?: string
	) {
		super(message);
		this.name = 'ValidationError';
	}
}

export function text(
	value: FormDataEntryValue | null,
	field: string,
	opts: { min?: number; max: number; required?: boolean }
): string | null {
	if (typeof value !== 'string') {
		if (opts.required) throw new ValidationError(`${field} is required`, field);
		return null;
	}
	const trimmed = value.trim();
	if (!trimmed) {
		if (opts.required) throw new ValidationError(`${field} is required`, field);
		return null;
	}
	if (opts.min && trimmed.length < opts.min) {
		throw new ValidationError(`${field} must be at least ${opts.min} characters`, field);
	}
	if (trimmed.length > opts.max) {
		throw new ValidationError(`${field} must be under ${opts.max} characters`, field);
	}
	return trimmed;
}

/**
 * Accept only http(s) URLs. This rejects `javascript:`, `data:`, `file:` and
 * friends, which would otherwise become stored XSS the moment the value is
 * rendered into an href.
 */
export function url(
	value: FormDataEntryValue | null,
	field: string,
	opts: { required?: boolean } = {}
): string | null {
	const raw = text(value, field, { max: 2000, required: opts.required });
	if (!raw) return null;

	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		throw new ValidationError(`${field} must be a valid URL`, field);
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new ValidationError(`${field} must start with http:// or https://`, field);
	}
	return parsed.toString();
}

export function hours(value: FormDataEntryValue | null, field: string): number {
	if (typeof value !== 'string' || !value.trim()) {
		throw new ValidationError(`${field} is required`, field);
	}
	const n = Number(value);
	if (!Number.isFinite(n)) throw new ValidationError(`${field} must be a number`, field);
	if (n <= 0) throw new ValidationError(`${field} must be greater than zero`, field);
	if (n > 200) throw new ValidationError(`${field} is implausibly large`, field);
	// quarter-hour precision, and never trust the client's rounding
	return Math.round(n * 4) / 4;
}

/**
 * Signed hours, for admin ledger grants and deductions — unlike `hours()`,
 * zero and negative values are allowed (a deduction for a fulfilled claim is
 * a negative amount), but the database's own sign-matches-type constraint is
 * still the real guard: this only rejects garbage before it gets there.
 */
export function signedHours(value: FormDataEntryValue | null, field: string): number {
	if (typeof value !== 'string' || !value.trim()) {
		throw new ValidationError(`${field} is required`, field);
	}
	const n = Number(value);
	if (!Number.isFinite(n)) throw new ValidationError(`${field} must be a number`, field);
	if (n === 0) throw new ValidationError(`${field} cannot be zero`, field);
	if (Math.abs(n) > 200) throw new ValidationError(`${field} is implausibly large`, field);
	return Math.round(n * 4) / 4;
}

export function uuid(value: string | undefined, field: string): string {
	const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (!value || !re.test(value)) throw new ValidationError(`Invalid ${field}`, field);
	return value;
}

export function oneOf<T extends string>(
	value: FormDataEntryValue | null,
	allowed: readonly T[],
	field: string
): T {
	if (typeof value !== 'string' || !allowed.includes(value as T)) {
		throw new ValidationError(`Invalid ${field}`, field);
	}
	return value as T;
}
