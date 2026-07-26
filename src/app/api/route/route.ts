import { NextResponse } from "next/server";
import { DirectionsNoRouteError, DirectionsUpstreamError, fetchDirections } from "@/lib/google/directions";
import { reverseGeocode } from "@/lib/google/geocoding";
import { requestSchema } from "@/lib/route/schema";
import type { TimedPoint } from "@/lib/route/sampling";
import { buildTimedSamples, pickEvenSubset } from "@/lib/route/sampling";
import type { PointForecast } from "@/lib/weather/forecast";
import { WeatherUpstreamError, fetchPointForecasts } from "@/lib/weather/forecast";
import { RISK_RANK, evaluateSegmentWeather, getHourlyWindow } from "@/lib/weather/rainRisk";
import { describeWeatherCode } from "@/lib/weather/weatherCode";
import type {
  ApiErrorBody,
  CityWeatherMarker,
  DepartureSuggestion,
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

// Departure-time suggestions: how far around the requested time to search,
// at what resolution, how many to surface, and how far apart they must be
// so the list isn't three near-identical adjacent hours.
const SUGGESTION_WINDOW_HOURS = 24;
const SUGGESTION_STEP_SECONDS = 60 * 60;
const MAX_SUGGESTIONS = 3;
const MIN_SUGGESTION_SPACING_SECONDS = 2 * 60 * 60;

function errorResponse(status: number, body: ApiErrorBody) {
  return NextResponse.json(body, { status });
}

function worstRiskAt(samples: TimedPoint[], forecasts: PointForecast[], departureUnixSeconds: number): RiskLevel {
  let worst: RiskLevel = "low";
  for (let i = 0; i < samples.length; i++) {
    const etaUnixSeconds = departureUnixSeconds + Math.round(samples[i].etaSeconds);
    const { risk } = evaluateSegmentWeather(forecasts[i], etaUnixSeconds);
    if (RISK_RANK[risk] > RISK_RANK[worst]) worst = risk;
  }
  return worst;
}

// Tries hourly-stepped candidate departure times within ±SUGGESTION_WINDOW_HOURS
// of the requested time (clipped to not be in the past), reusing the
// already-fetched samples/forecasts — no network calls, and no reverseGeocode.
// Only candidates strictly better than the actual search's worst risk qualify;
// up to MAX_SUGGESTIONS are kept, ranked by risk then by closeness to the
// requested time with MIN_SUGGESTION_SPACING_SECONDS between picks, and
// finally re-sorted chronologically for display.
function computeDepartureSuggestions(
  samples: TimedPoint[],
  forecasts: PointForecast[],
  requestedDepartureUnixSeconds: number,
  currentWorstRisk: RiskLevel
): DepartureSuggestion[] {
  const nowUnixSeconds = Math.floor(Date.now() / 1000);
  const candidates: { departureUnixSeconds: number; worstRisk: RiskLevel; timeDistance: number }[] = [];

  for (let hourOffset = -SUGGESTION_WINDOW_HOURS; hourOffset <= SUGGESTION_WINDOW_HOURS; hourOffset++) {
    if (hourOffset === 0) continue; // same as the requested time; can never be "strictly better"
    const departureUnixSeconds = requestedDepartureUnixSeconds + hourOffset * SUGGESTION_STEP_SECONDS;
    if (departureUnixSeconds < nowUnixSeconds) continue;

    const worstRisk = worstRiskAt(samples, forecasts, departureUnixSeconds);
    if (RISK_RANK[worstRisk] >= RISK_RANK[currentWorstRisk]) continue;

    candidates.push({
      departureUnixSeconds,
      worstRisk,
      timeDistance: Math.abs(departureUnixSeconds - requestedDepartureUnixSeconds),
    });
  }

  candidates.sort((a, b) => RISK_RANK[a.worstRisk] - RISK_RANK[b.worstRisk] || a.timeDistance - b.timeDistance);

  const picked: typeof candidates = [];
  for (const candidate of candidates) {
    if (picked.length >= MAX_SUGGESTIONS) break;
    const tooClose = picked.some(
      (p) => Math.abs(p.departureUnixSeconds - candidate.departureUnixSeconds) < MIN_SUGGESTION_SPACING_SECONDS
    );
    if (!tooClose) picked.push(candidate);
  }

  return picked
    .sort((a, b) => a.departureUnixSeconds - b.departureUnixSeconds)
    .map((c) => ({ departureTime: new Date(c.departureUnixSeconds * 1000).toISOString(), worstRisk: c.worstRisk }));
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

  // Usage history: visible in Vercel's Runtime Logs. Logged as soon as the
  // request is validated (not gated on the upstream calls below succeeding)
  // so a search still shows up even if Directions/Open-Meteo later fail.
  console.log(
    JSON.stringify({
      event: "route_search",
      origin: origin.label,
      destination: destination.label,
      departureTime,
    })
  );

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
    forecasts = await fetchPointForecasts(samples.map((sample) => ({ lat: sample.lat, lng: sample.lng })));
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

  const currentWorstRisk: RiskLevel = worstSegmentIndex !== null ? segments[worstSegmentIndex].risk : "low";
  const departureSuggestions: DepartureSuggestion[] =
    currentWorstRisk !== "low"
      ? computeDepartureSuggestions(samples, forecasts, departureUnixSeconds, currentWorstRisk)
      : [];

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
    departureSuggestions,
  };

  return NextResponse.json(response);
}
