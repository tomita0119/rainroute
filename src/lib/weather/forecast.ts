// Open-Meteo Forecast API: https://open-meteo.com/en/docs
// No API key required for non-commercial use.

export interface ForecastBucket {
  dt: number; // unix seconds
  pop: number; // 0-1 probability of precipitation
  rainVolumeMm: number;
  temperatureC: number;
  weatherCode: number; // WMO weather interpretation code
}

export interface PointForecast {
  hourly: ForecastBucket[];
}

export class WeatherUpstreamError extends Error {}

// Open-Meteo allows up to 16 forecast days; touring plans further out than
// that simply won't find a matching bucket (handled as forecastAvailable=false).
const FORECAST_DAYS = 16;

interface RawForecastResponse {
  hourly?: {
    time: string[];
    precipitation_probability: number[];
    precipitation: number[];
    temperature_2m: number[];
    weather_code: number[];
  };
}

function parseForecastEntry(entry: RawForecastResponse): PointForecast {
  const time = entry.hourly?.time ?? [];
  const pop = entry.hourly?.precipitation_probability ?? [];
  const precipitation = entry.hourly?.precipitation ?? [];
  const temperature = entry.hourly?.temperature_2m ?? [];
  const weatherCode = entry.hourly?.weather_code ?? [];

  const hourly: ForecastBucket[] = time.map((isoTime, i) => ({
    dt: Math.floor(Date.parse(`${isoTime}Z`) / 1000),
    pop: (pop[i] ?? 0) / 100,
    rainVolumeMm: precipitation[i] ?? 0,
    temperatureC: temperature[i] ?? 0,
    weatherCode: weatherCode[i] ?? 0,
  }));

  return { hourly };
}

// Fetches forecasts for every point in a single request instead of one
// request per point. Open-Meteo accepts comma-separated latitude/longitude
// lists and returns one result per point, in the same order — this keeps a
// whole route search (up to MAX_SAMPLES points) to one upstream call instead
// of firing them in parallel, which was tripping Open-Meteo's per-IP rate
// limit on Vercel (where many tenants share a small pool of egress IPs, so
// the effective budget per app is much smaller than testing from a home IP).
export async function fetchPointForecasts(points: { lat: number; lng: number }[]): Promise<PointForecast[]> {
  if (points.length === 0) return [];

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", points.map((p) => p.lat.toString()).join(","));
  url.searchParams.set("longitude", points.map((p) => p.lng.toString()).join(","));
  url.searchParams.set("hourly", "precipitation_probability,precipitation,temperature_2m,weather_code");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("forecast_days", FORECAST_DAYS.toString());

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch (cause) {
    throw new WeatherUpstreamError("Failed to reach Open-Meteo API", { cause });
  }

  if (!response.ok) {
    throw new WeatherUpstreamError(`Open-Meteo API returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as RawForecastResponse | RawForecastResponse[];
  // Open-Meteo returns a plain object for a single coordinate pair and an
  // array (one entry per point, same order as the request) once more than
  // one location is requested.
  const entries = Array.isArray(data) ? data : [data];
  return entries.map(parseForecastEntry);
}
