import { EVENT, hoursToQualify, TRAVEL_RATE } from '$lib/data';

/**
 * Rough cost of getting someone to Dublin, for planning only: an economy
 * return fare estimated from their departure airport's distance to Dublin,
 * plus an Irish visa where their country needs one. Check the real fare with
 * the Skyscanner link before promising anything.
 */

/** Close enough to Dublin that it's a bus or train, not a flight. */
export const NO_FLIGHT_KM = 300;

/**
 * Economy return to Dublin in USD from distance alone. Calibrated against
 * typical fares (DEL ~$750, JFK ~$600, MAD ~$160, SYD ~$1,750); a departure
 * that isn't a major gateway adds a connection.
 */
export function estimateFare(flightKm: number, hub: boolean): number {
	if (flightKm < NO_FLIGHT_KM) return 0;
	const base = flightKm < 2500 ? 60 + 0.07 * flightKm : 100 + 0.095 * flightKm;
	return Math.round((base + (hub ? 0 : 120)) / 10) * 10;
}

/**
 * Ireland's short-stay visa (€60) plus typical application-centre costs, in
 * USD, for passports that need one. Assumes they hold the passport of the
 * country they live in.
 */
const VISA_FEE = 85;
const VISA_REQUIRED = new Set([
	'IN', 'PK', 'BD', 'NP', 'LK', 'AF', 'CN', 'PH', 'ID', 'VN', 'TH', 'MM', 'KH', 'LA',
	'EG', 'MA', 'DZ', 'TN', 'LY', 'NG', 'GH', 'KE', 'ET', 'UG', 'TZ', 'CM', 'SN', 'CI', 'ZW', 'ZM', 'SD',
	'TR', 'IR', 'IQ', 'JO', 'LB', 'SY', 'YE', 'RU', 'BY', 'KZ', 'UZ', 'AZ', 'AM', 'GE',
	'CO', 'BO', 'CU', 'DO', 'HT', 'JM'
]);
/** Visa-free for Ireland: EU/EEA/UK/Swiss, and the common exempt passports. */
const VISA_FREE = new Set([
	'IE', 'GB', 'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IT', 'LV', 'LT',
	'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH',
	'US', 'CA', 'MX', 'BR', 'AR', 'CL', 'UY', 'PY', 'CR', 'PA', 'GT', 'HN', 'SV', 'NI',
	'AU', 'NZ', 'JP', 'KR', 'SG', 'MY', 'BN', 'HK', 'MO', 'TW', 'AE', 'IL', 'UA', 'RS', 'ME', 'MK', 'AL', 'BA', 'MD'
]);

/** Visa cost in USD: 0 if not needed, null if we haven't confirmed which. */
export function visaFor(countryCode: string | null | undefined): number | null {
	if (!countryCode) return null;
	if (VISA_FREE.has(countryCode)) return 0;
	if (VISA_REQUIRED.has(countryCode)) return VISA_FEE;
	return null;
}

const yymmdd = (iso: string) => iso.slice(2, 10).replace(/-/g, '');

/**
 * Skyscanner.ie search from that airport to Dublin for the event: out the
 * day before, home the day after.
 */
export const skyscannerUrl = (airport: string, out = EVENT.flyOutDate, home = EVENT.flyHomeDate) =>
	`https://www.skyscanner.ie/transport/flights/${airport.toLowerCase()}/dub/${yymmdd(out)}/${yymmdd(home)}/?adultsv2=1&cabinclass=economy`;

export type TripEstimate = {
	airport: string;
	airportName: string;
	airportCity: string | null;
	/** how far they live from that airport */
	toAirportKm: number | null;
	flight: number;
	visa: number | null;
	/** flight + visa (an unconfirmed visa counts as 0 here) */
	total: number;
	/** approved hours needed to qualify for the travel stipend */
	hoursToQualify: number;
	stipendAtQualify: number;
	/** worked out from their city, their region, or only their country */
	precision: 'city' | 'region' | 'country';
	skyscanner: string;
};

export function estimateTrip(origin: {
	airport: string;
	airport_name: string;
	airport_city: string | null;
	country_code: string | null;
	to_airport_km: number | null;
	flight_km: number;
	hub: boolean;
	precision: 'city' | 'region' | 'country';
}): TripEstimate {
	const flight = estimateFare(origin.flight_km, origin.hub);
	const visa = visaFor(origin.country_code);
	const hours = flight ? hoursToQualify(flight) : 0;
	return {
		airport: origin.airport,
		airportName: origin.airport_name,
		airportCity: origin.airport_city,
		toAirportKm: origin.to_airport_km,
		flight,
		visa,
		total: flight + (visa ?? 0),
		hoursToQualify: hours,
		stipendAtQualify: hours * TRAVEL_RATE,
		precision: origin.precision,
		skyscanner: skyscannerUrl(origin.airport)
	};
}
