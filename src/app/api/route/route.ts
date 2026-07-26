import { NextResponse } from "next/server";
import { DirectionsNoRouteError, DirectionsUpstreamError, fetchDirections } from "@/lib/google/directions";
import { reverseGeocode } from "@/lib/google/geocoding";
import { requestSchema } from "@/lib/route/schema";
import { buildTimedSamples, pickEvenSubset } from "@/lib/route/sampling";
import { WeatherUpstreamError, fetchPointForecast } from "@/lib/weather/forecast";
import { evaluateSegmentWeather, getHourlyWindow } from "@/lib/weather/rainRisk";
import { describeWeatherCode } from "@/lib/weather/weatherCode";
import type {
  ApiErrorBody,
  CityWeatherMarker,
  HourlyForecastPoint,
  RiskLevel,
  RouteResponse,
  RouteSegment,
} from "@/types/api";

// Matches sampling.ts's MAX_SAMPLES cap, so every point that can drive a
// segment's risk color also gets a visible marker — otherwise a red/yellow
// segment could appear with no matching weather marker nearby.
const MAX_CITY_MARKERS = 15;

// How many hours before/after a marker's ETA to include in its detail view.
const HOURLY_WINDOW_RADIUS_HOURS = 3;

const RISK_RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

function errorResponse(status: number, body: ApiErrorBody) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return errorResponse(400, { error: "INVALID_INPUT", message: "リクエストボディが不正なJSONです" });
  }

  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return errorResponse(400, {
      error: "INVALID_INPUT",
      message: parsed.error.issues.map((issue) => issue.message).join("; "),
    });
  }

  const { origin, destination, waypoints, departureTime, avoidTolls } = parsed.data;
  const departureUnixSeconds = Math.floor(new Date(departureTime).getTime() / 1000);

  let directions;
  try {
    directions = await fetchDirections(origin, destination, waypoints, avoidTolls);
  } catch (error) {
    if (error instanceof DirectionsNoRouteError) {
      return errorResponse(422, { error: "NO_ROUTE_FOUND", message: error.message });
    }
    if (error instanceof DirectionsUpstreamError) {
      return errorResponse(502, { error: "UPSTREAM_ERROR", provider: "google", message: error.message });
    }
    return errorResponse(500, { error: "INTERNAL_ERROR", message: "ルート取得中に予期しないエラーが発生しました" });
  }

  const samples = buildTimedSamples(directions.legs);
  if (samples.length < 2) {
    return errorResponse(422, { error: "NO_ROUTE_FOUND", message: "ルート上の座標を取得できませんでした" });
  }

  let forecasts;
  try {
    forecasts = await Promise.all(samples.map((sample) => fetchPointForecast(sample.lat, sample.lng)));
  } catch (error) {
    if (error instanceof WeatherUpstreamError) {
      return errorResponse(502, { error: "UPSTREAM_ERROR", provider: "open-meteo", message: error.message });
    }
    return errorResponse(500, { error: "INTERNAL_ERROR", message: "天気情報の取得中に予期しないエラーが発生しました" });
  }

  const sampleWeather = samples.map((sample, i) => {
    const etaUnixSeconds = departureUnixSeconds + Math.round(sample.etaSeconds);
    return {
      sample,
      etaUnixSeconds,
      weather: evaluateSegmentWeather(forecasts[i], etaUnixSeconds),
      forecast: forecasts[i],
    };
  });

  const segments: RouteSegment[] = [];
  for (let i = 0; i < sampleWeather.length - 1; i++) {
    const start = sampleWeather[i];
    const end = sampleWeather[i + 1];
    // Err toward warning: color the segment by whichever endpoint has higher risk.
    const worse = RISK_RANK[start.weather.risk] >= RISK_RANK[end.weather.risk] ? start.weather : end.weather;

    segments.push({
      startLat: start.sample.lat,
      startLng: start.sample.lng,
      endLat: end.sample.lat,
      endLng: end.sample.lng,
      etaStart: new Date(start.etaUnixSeconds * 1000).toISOString(),
      etaEnd: new Date(end.etaUnixSeconds * 1000).toISOString(),
      risk: worse.risk,
      pop: worse.pop,
      rainVolumeMm: worse.rainVolumeMm,
      forecastAvailable: worse.forecastAvailable,
    });
  }

  const worstSegmentIndex = segments.reduce<number | null>((worstIdx, segment, idx) => {
    if (worstIdx === null || RISK_RANK[segment.risk] > RISK_RANK[segments[worstIdx].risk]) return idx;
    return worstIdx;
  }, null);

  // Reuse the already-fetched forecasts instead of issuing new weather
  // calls. The first/last points reuse the user-entered place labels (more
  // accurate than reverse geocoding a raw coordinate); reverse geocoding
  // failures fall back to a generic label rather than failing the whole
  // request.
  const markerCandidates = pickEvenSubset(sampleWeather, MAX_CITY_MARKERS);
  const cityMarkers: CityWeatherMarker[] = await Promise.all(
    markerCandidates.map(async (candidate, index) => {
      let label: string;
      if (candidate === sampleWeather[0]) {
        label = origin.label;
      } else if (candidate === sampleWeather[sampleWeather.length - 1]) {
        label = destination.label;
      } else {
        label = (await reverseGeocode(candidate.sample.lat, candidate.sample.lng)) ?? `地点${index + 1}`;
      }

      const window = getHourlyWindow(candidate.forecast.hourly, candidate.etaUnixSeconds, HOURLY_WINDOW_RADIUS_HOURS);
      const hourly: HourlyForecastPoint[] = window.buckets.map((bucket, bucketIndex) => ({
        time: new Date(bucket.dt * 1000).toISOString(),
        temperatureC: bucket.temperatureC,
        weatherCode: bucket.weatherCode,
        weatherDescription: describeWeatherCode(bucket.weatherCode),
        pop: bucket.pop,
        rainVolumeMm: bucket.rainVolumeMm,
        isClosest: bucketIndex === window.closestOffset,
      }));

      return {
        lat: candidate.sample.lat,
        lng: candidate.sample.lng,
        label,
        eta: new Date(candidate.etaUnixSeconds * 1000).toISOString(),
        temperatureC: candidate.weather.temperatureC,
        weatherCode: candidate.weather.weatherCode,
        weatherDescription: describeWeatherCode(candidate.weather.weatherCode),
        pop: candidate.weather.pop,
        risk: candidate.weather.risk,
        hourly,
      };
    })
  );

  const response: RouteResponse = {
    route: {
      overviewPolyline: directions.overviewPolyline,
      distanceMeters: directions.distanceMeters,
      durationSeconds: directions.durationSeconds,
    },
    segments,
    cityMarkers,
    summary: {
      hasRainRisk: segments.some((segment) => segment.risk !== "low"),
      worstSegmentIndex,
      arrivalTime: new Date(departureUnixSeconds * 1000 + directions.durationSeconds * 1000).toISOString(),
    },
  };

  return NextResponse.json(response);
}
