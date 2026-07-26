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

export async function fetchPointForecast(lat: number, lng: number): Promise<PointForecast> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toString());
  url.searchParams.set("longitude", lng.toString());
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

  const data = (await response.json()) as RawForecastResponse;
  const time = data.hourly?.time ?? [];
  const pop = data.hourly?.precipitation_probability ?? [];
  const precipitation = data.hourly?.precipitation ?? [];
  const temperature = data.hourly?.temperature_2m ?? [];
  const weatherCode = data.hourly?.weather_code ?? [];

  const hourly: ForecastBucket[] = time.map((isoTime, i) => ({
    dt: Math.floor(Date.parse(`${isoTime}Z`) / 1000),
    pop: (pop[i] ?? 0) / 100,
    rainVolumeMm: precipitation[i] ?? 0,
    temperatureC: temperature[i] ?? 0,
    weatherCode: weatherCode[i] ?? 0,
  }));

  return { hourly };
}
