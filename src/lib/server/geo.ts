import airportsRaw from './geo-data/airports.json';
import citiesRaw from './geo-data/cities.json';
import admin1Raw from './geo-data/admin1.json';
import countriesRaw from './geo-data/countries.json';

/**
 * Offline geography for travel estimates: a person's city → coordinates
 * (GeoNames cities over 15k people) → nearest airport with scheduled
 * flights (OurAirports). Nothing is sent to any outside service.
 *
 * Data: GeoNames (CC BY 4.0, geonames.org) and OurAirports (public domain).
 * Refresh by re-running the trim script described in geo-data/README.md.
 */

// [iata, name, city, iso2, lat, lon, large]
type AirportRow = [string, string, string, string, number, number, 0 | 1];
// [name, asciiName or '', iso2, admin1 code, lat, lon, population]
type CityRow = [string, string, string, string, number, number, number];

const airports = airportsRaw as AirportRow[];
const cities = citiesRaw as CityRow[];
const admin1 = admin1Raw as Record<string, string>;
const countries = countriesRaw as Record<string, string>;

export const DUBLIN = { lat: 53.421, lon: -6.27 };

/** "São Paulo" → "sao paulo" */
const fold = (s: string) =>
	s
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9 ]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

const COUNTRY_ALIASES: Record<string, string> = {
	usa: 'US', us: 'US', 'united states of america': 'US', america: 'US',
	uk: 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
	'republic of ireland': 'IE', eire: 'IE',
	uae: 'AE', korea: 'KR', 'republic of korea': 'KR', 'czech republic': 'CZ',
	turkiye: 'TR', brasil: 'BR', 'viet nam': 'VN', espana: 'ES', mexico: 'MX', peru: 'PE',
	deutschland: 'DE', russia: 'RU', 'russian federation': 'RU', iran: 'IR', syria: 'SY',
	'hong kong': 'HK', taiwan: 'TW', 'ivory coast': 'CI', macedonia: 'MK', burma: 'MM'
};
const countryByName = new Map(Object.entries(countries).map(([code, name]) => [fold(name), code]));
const iso3: Record<string, string> = {
	IND: 'IN', EGY: 'EG', USA: 'US', GBR: 'GB', IRL: 'IE', CAN: 'CA', MEX: 'MX', ESP: 'ES', PER: 'PE',
	ROU: 'RO', DEU: 'DE', FRA: 'FR', BRA: 'BR', PAK: 'PK', BGD: 'BD', NGA: 'NG', KEN: 'KE', PHL: 'PH',
	IDN: 'ID', AUS: 'AU', NZL: 'NZ', CHN: 'CN', JPN: 'JP', KOR: 'KR', ARE: 'AE', TUR: 'TR', ITA: 'IT'
};

/** Free-text country → ISO 3166-1 alpha-2, or null. */
export function countryCode(raw: string | null | undefined): string | null {
	if (!raw?.trim()) return null;
	const t = raw.trim();
	if (/^[A-Za-z]{2}$/.test(t) && countries[t.toUpperCase()]) return t.toUpperCase();
	if (/^[A-Za-z]{3}$/.test(t) && iso3[t.toUpperCase()]) return iso3[t.toUpperCase()];
	const f = fold(t);
	return COUNTRY_ALIASES[f] ?? countryByName.get(f) ?? null;
}

export const countryName = (code: string | null | undefined) => (code ? (countries[code] ?? code) : null);

function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
	const r = Math.PI / 180;
	const dLat = (bLat - aLat) * r;
	const dLon = (bLon - aLon) * r;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
	return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export type Located = { lat: number; lon: number; country: string; precision: 'city' | 'region' | 'country' };

/**
 * Where someone lives, to city precision when the city is one we know,
 * otherwise their region's biggest city, otherwise their country's.
 */
export function locate(city: string | null, state: string | null, country: string | null): Located | null {
	const cc = countryCode(country);
	if (!cc) return null;
	const inCountry = cities.filter((c) => c[2] === cc);
	if (!inCountry.length) return null;

	const st = state ? fold(state) : null;
	const inState = (c: CityRow) => !!st && fold(admin1[`${c[2]}.${c[3]}`] ?? '') === st;
	const biggest = (list: CityRow[]) => list.reduce((a, b) => (b[6] > a[6] ? b : a));

	if (city) {
		const want = fold(city);
		const hits = inCountry.filter((c) => fold(c[0]) === want || (c[1] && fold(c[1]) === want));
		if (hits.length) {
			const best = hits.find(inState) ?? biggest(hits);
			return { lat: best[4], lon: best[5], country: cc, precision: 'city' };
		}
	}
	if (st) {
		// "Delhi" is often typed as the state, or the city is a suburb we don't list
		const named = inCountry.filter((c) => fold(c[0]) === st || (c[1] && fold(c[1]) === st));
		const region = inCountry.filter(inState);
		const pick = named.length ? biggest(named) : region.length ? biggest(region) : null;
		if (pick) return { lat: pick[4], lon: pick[5], country: cc, precision: 'region' };
	}
	const capital = biggest(inCountry);
	return { lat: capital[4], lon: capital[5], country: cc, precision: 'country' };
}

export type Airport = { iata: string; name: string; city: string; country: string; large: boolean; toAirportKm: number; flightKm: number };

/**
 * International gateways people actually fly long-haul from, per country.
 * OurAirports' "large" covers dozens of regional airports in some places,
 * so for these countries the departure is the nearest gateway instead.
 */
const GATEWAYS: Record<string, string[]> = {
	IN: ['DEL', 'BOM', 'BLR', 'MAA', 'HYD', 'CCU', 'COK', 'AMD', 'ATQ', 'GOI', 'TRV', 'CCJ', 'PNQ', 'LKO'],
	PK: ['LHE', 'KHI', 'ISB', 'MUX', 'PEW'], BD: ['DAC', 'CGP'], NP: ['KTM'], LK: ['CMB'],
	EG: ['CAI', 'HRG', 'SSH', 'HBE'], MA: ['CMN', 'RAK', 'TNG'], NG: ['LOS', 'ABV'], KE: ['NBO', 'MBA'],
	ZA: ['JNB', 'CPT', 'DUR'], GH: ['ACC'], ET: ['ADD'], TN: ['TUN'], DZ: ['ALG'],
	US: ['JFK', 'EWR', 'BOS', 'IAD', 'PHL', 'ORD', 'ATL', 'MIA', 'MCO', 'CLT', 'DTW', 'MSP', 'DFW', 'IAH', 'AUS', 'DEN', 'PHX', 'LAS', 'LAX', 'SFO', 'SEA', 'SAN', 'SLC', 'HNL'],
	CA: ['YYZ', 'YUL', 'YVR', 'YYC', 'YEG', 'YOW', 'YHZ', 'YWG'],
	MX: ['MEX', 'CUN', 'GDL', 'MTY'], BR: ['GRU', 'GIG', 'BSB', 'REC', 'FOR'], AR: ['EZE'], CO: ['BOG', 'MDE', 'CLO'],
	PE: ['LIM'], CL: ['SCL'], EC: ['UIO', 'GYE'], VE: ['CCS'],
	GB: ['LHR', 'LGW', 'STN', 'LTN', 'MAN', 'BHX', 'BRS', 'EDI', 'GLA', 'NCL', 'LPL', 'BFS', 'EMA', 'LBA', 'ABZ'],
	IE: ['DUB', 'ORK', 'SNN', 'NOC', 'KIR'],
	ES: ['MAD', 'BCN', 'AGP', 'ALC', 'VLC', 'PMI', 'SVQ', 'BIO', 'SCQ', 'TFS', 'LPA'], PT: ['LIS', 'OPO', 'FAO'],
	FR: ['CDG', 'ORY', 'NCE', 'LYS', 'MRS', 'TLS', 'BOD', 'NTE'], DE: ['FRA', 'MUC', 'BER', 'DUS', 'HAM', 'CGN', 'STR'],
	NL: ['AMS', 'EIN'], BE: ['BRU', 'CRL'], IT: ['FCO', 'MXP', 'BGY', 'VCE', 'NAP', 'BLQ', 'PSA', 'CTA'],
	PL: ['WAW', 'KRK', 'GDN', 'WRO', 'KTW', 'POZ'], RO: ['OTP', 'CLJ', 'IAS', 'TSR'], HU: ['BUD'], CZ: ['PRG'],
	GR: ['ATH', 'SKG'], SE: ['ARN', 'GOT'], NO: ['OSL'], DK: ['CPH'], FI: ['HEL'], AT: ['VIE'], CH: ['ZRH', 'GVA'],
	TR: ['IST', 'SAW', 'AYT', 'ESB', 'ADB'], AE: ['DXB', 'AUH'], SA: ['RUH', 'JED', 'DMM'], IL: ['TLV'], QA: ['DOH'],
	CN: ['PEK', 'PKX', 'PVG', 'CAN', 'SZX', 'CTU', 'HKG'], HK: ['HKG'], TW: ['TPE'], JP: ['NRT', 'HND', 'KIX', 'NGO', 'FUK'],
	KR: ['ICN'], SG: ['SIN'], MY: ['KUL', 'PEN', 'BKI'], ID: ['CGK', 'DPS', 'SUB'], PH: ['MNL', 'CEB'],
	VN: ['SGN', 'HAN', 'DAD'], TH: ['BKK', 'HKT', 'CNX'], AU: ['SYD', 'MEL', 'BNE', 'PER', 'ADL'], NZ: ['AKL', 'CHC']
};

/**
 * The airport they'd realistically fly to Dublin from, always in their own
 * country (a nearer airport over a border usually means a visa and a land
 * crossing): the nearest international gateway where we know them,
 * otherwise the nearest big airport within 400 km, otherwise the nearest
 * with scheduled flights at all.
 */
export function nearestAirport(lat: number, lon: number, country?: string | null): Airport {
	const domestic = country ? airports.filter((a) => a[3] === country) : [];
	const gates = country && GATEWAYS[country] ? domestic.filter((a) => GATEWAYS[country].includes(a[0])) : [];
	const closest = (pool: AirportRow[]) =>
		pool.reduce<{ a: AirportRow; d: number } | null>((best, a) => {
			const d = km(lat, lon, a[4], a[5]);
			return !best || d < best.d ? { a, d } : best;
		}, null);

	let pick = gates.length ? closest(gates) : null;
	if (!pick) {
		const pool = domestic.length ? domestic : airports;
		const large = closest(pool.filter((a) => a[6]));
		pick = large && large.d <= 400 ? large : closest(pool)!;
	}
	const [iata, name, city, cc, aLat, aLon, isLarge] = pick.a;
	return {
		iata,
		name,
		city,
		country: cc,
		large: !!isLarge || gates.length > 0,
		toAirportKm: Math.round(pick.d),
		flightKm: Math.round(km(aLat, aLon, DUBLIN.lat, DUBLIN.lon))
	};
}
