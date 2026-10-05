import { hoursToQualify, TRAVEL_RATE } from '$lib/data';

/**
 * Rough cost of getting someone from each country to Dublin, for planning
 * only. Fares are typical economy return to DUB in USD from the main
 * airport, booked a couple of months out; check the real price with the
 * Skyscanner link before promising anything. Visa is Ireland's short-stay
 * fee plus typical application-centre costs, 0 where that passport doesn't
 * need one, null where it needs checking.
 *
 * Edit these as real quotes come in. Keys match the country names the
 * admin analytics normalise to.
 */
type Route = { airport: string; flight: number; visa: number | null };

export const ROUTES: Record<string, Route> = {
	// Europe (no visa for EU/EEA/UK)
	'United Kingdom': { airport: 'LHR', flight: 120, visa: 0 },
	Spain: { airport: 'MAD', flight: 160, visa: 0 },
	Portugal: { airport: 'LIS', flight: 170, visa: 0 },
	France: { airport: 'CDG', flight: 170, visa: 0 },
	Germany: { airport: 'FRA', flight: 180, visa: 0 },
	Netherlands: { airport: 'AMS', flight: 150, visa: 0 },
	Belgium: { airport: 'BRU', flight: 160, visa: 0 },
	Italy: { airport: 'FCO', flight: 190, visa: 0 },
	Poland: { airport: 'WAW', flight: 180, visa: 0 },
	Romania: { airport: 'OTP', flight: 220, visa: 0 },
	Hungary: { airport: 'BUD', flight: 200, visa: 0 },
	Czechia: { airport: 'PRG', flight: 190, visa: 0 },
	Greece: { airport: 'ATH', flight: 260, visa: 0 },
	Sweden: { airport: 'ARN', flight: 210, visa: 0 },
	Ukraine: { airport: 'KRK', flight: 300, visa: 0 },
	Turkey: { airport: 'IST', flight: 350, visa: 85 },

	// Americas
	'United States': { airport: 'JFK', flight: 650, visa: 0 },
	Canada: { airport: 'YYZ', flight: 800, visa: 0 },
	Mexico: { airport: 'MEX', flight: 1000, visa: 0 },
	Brazil: { airport: 'GRU', flight: 1100, visa: 0 },
	Argentina: { airport: 'EZE', flight: 1300, visa: 0 },
	Colombia: { airport: 'BOG', flight: 1050, visa: 85 },
	Peru: { airport: 'LIM', flight: 1200, visa: null },

	// Africa & Middle East
	Egypt: { airport: 'CAI', flight: 600, visa: 85 },
	Morocco: { airport: 'CMN', flight: 350, visa: 85 },
	Nigeria: { airport: 'LOS', flight: 1100, visa: 85 },
	Kenya: { airport: 'NBO', flight: 1000, visa: 85 },
	'South Africa': { airport: 'JNB', flight: 1100, visa: null },
	'United Arab Emirates': { airport: 'DXB', flight: 600, visa: 0 },
	'Saudi Arabia': { airport: 'RUH', flight: 650, visa: null },
	Israel: { airport: 'TLV', flight: 450, visa: 0 },

	// Asia & Oceania
	India: { airport: 'DEL', flight: 750, visa: 85 },
	Pakistan: { airport: 'LHE', flight: 850, visa: 85 },
	Bangladesh: { airport: 'DAC', flight: 950, visa: 85 },
	Nepal: { airport: 'KTM', flight: 1000, visa: 85 },
	'Sri Lanka': { airport: 'CMB', flight: 900, visa: 85 },
	China: { airport: 'PEK', flight: 900, visa: 85 },
	Philippines: { airport: 'MNL', flight: 1100, visa: 85 },
	Indonesia: { airport: 'CGK', flight: 1000, visa: 85 },
	Vietnam: { airport: 'SGN', flight: 1000, visa: 85 },
	Malaysia: { airport: 'KUL', flight: 1000, visa: 0 },
	Singapore: { airport: 'SIN', flight: 1100, visa: 0 },
	Japan: { airport: 'NRT', flight: 1200, visa: 0 },
	'South Korea': { airport: 'ICN', flight: 1100, visa: 0 },
	Australia: { airport: 'SYD', flight: 1800, visa: 0 },
	'New Zealand': { airport: 'AKL', flight: 2000, visa: 0 },

	Ireland: { airport: 'DUB', flight: 0, visa: 0 }
};

export type TripEstimate = {
	airport: string;
	flight: number;
	visa: number | null;
	/** flight + visa (an unknown visa counts as 0 here) */
	total: number;
	/** approved hours needed to qualify for the travel stipend */
	hoursToQualify: number;
	/** what those hours are worth as stipend, at TRAVEL_RATE */
	stipendAtQualify: number;
	skyscanner: string;
};

/** Skyscanner.ie search from that airport to Dublin; they pick the dates. */
export const skyscannerUrl = (airport: string) =>
	`https://www.skyscanner.ie/transport/flights/${airport.toLowerCase()}/dub/`;

export function estimateTrip(country: string | null | undefined): TripEstimate | null {
	const r = country ? ROUTES[country] : undefined;
	if (!r) return null;
	const hours = r.flight ? hoursToQualify(r.flight) : 0;
	return {
		airport: r.airport,
		flight: r.flight,
		visa: r.visa,
		total: r.flight + (r.visa ?? 0),
		hoursToQualify: hours,
		stipendAtQualify: hours * TRAVEL_RATE,
		skyscanner: skyscannerUrl(r.airport)
	};
}
