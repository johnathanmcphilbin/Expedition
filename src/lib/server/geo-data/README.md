Trimmed, offline copies used by `../geo.ts` for travel estimates.

- `cities.json`: GeoNames cities15000 (CC BY 4.0, https://www.geonames.org). Rows are `[name, asciiName, iso2, admin1, lat, lon, population]`.
- `admin1.json`: GeoNames admin1CodesASCII, `"IN.07" → "Delhi"`.
- `countries.json`: GeoNames countryInfo, `"IN" → "India"`.
- `airports.json`: OurAirports (public domain, https://ourairports.com/data/), large and medium airports with scheduled service and an IATA code. Rows are `[iata, name, city, iso2, lat, lon, large]`.

To refresh, download `cities15000.zip`, `admin1CodesASCII.txt` and `countryInfo.txt` from https://download.geonames.org/export/dump/ and `airports.csv` from https://davidmegginson.github.io/ourairports-data/, then trim them to the shapes above.
