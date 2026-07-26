import type { ForecastBucket, PointForecast } from "@/lib/weather/forecast";
import type { RiskLevel } from "@/types/api";

const POP_HIGH = 0.6;
const POP_MEDIUM = 0.3;
const VOLUME_HIGH_MM = 1.0;

// Hourly buckets are spaced 1h apart; a match further than this from the
// requested time means the ETA fell outside the fetched forecast range.
const MAX_BUCKET_GAP_SEC = 60 * 60;

export interface SegmentWeather {
  pop: number;
  rainVolumeMm: number;
  temperatureC: number;
  weatherCode: number;
  risk: RiskLevel;
  forecastAvailable: boolean;
}

function classify(pop: number, rainVolumeMm: number): RiskLevel {
  if (pop >= POP_HIGH || rainVolumeMm >= VOLUME_HIGH_MM) return "high";
  if (pop >= POP_MEDIUM || rainVolumeMm > 0) return "medium";
  return "low";
}

function closestBucketIndex(buckets: ForecastBucket[], targetUnixSeconds: number): number {
  let closestIndex = 0;
  let closestDiff = Infinity;
  buckets.forEach((bucket, index) => {
    const diff = Math.abs(bucket.dt - targetUnixSeconds);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestIndex = index;
    }
  });
  return closestIndex;
}

function closestBucket(buckets: ForecastBucket[], targetUnixSeconds: number): ForecastBucket | null {
  if (buckets.length === 0) return null;
  return buckets[closestBucketIndex(buckets, targetUnixSeconds)];
}

export interface HourlyWindow {
  buckets: ForecastBucket[];
  closestOffset: number; // index of the closest-match bucket within `buckets`, -1 if empty
}

// Returns up to `radiusHours` buckets on either side of the closest match to
// targetUnixSeconds (inclusive of the match itself), clipped near the start/
// end of the available forecast range.
export function getHourlyWindow(
  buckets: ForecastBucket[],
  targetUnixSeconds: number,
  radiusHours: number
): HourlyWindow {
  if (buckets.length === 0) return { buckets: [], closestOffset: -1 };
  const centerIndex = closestBucketIndex(buckets, targetUnixSeconds);
  const start = Math.max(0, centerIndex - radiusHours);
  const end = Math.min(buckets.length, centerIndex + radiusHours + 1);
  return { buckets: buckets.slice(start, end), closestOffset: centerIndex - start };
}

export function evaluateSegmentWeather(forecast: PointForecast, etaUnixSeconds: number): SegmentWeather {
  const bucket = closestBucket(forecast.hourly, etaUnixSeconds);

  if (!bucket || Math.abs(bucket.dt - etaUnixSeconds) > MAX_BUCKET_GAP_SEC) {
    return { pop: 0, rainVolumeMm: 0, temperatureC: 0, weatherCode: 0, risk: "low", forecastAvailable: false };
  }

  return {
    pop: bucket.pop,
    rainVolumeMm: bucket.rainVolumeMm,
    temperatureC: bucket.temperatureC,
    weatherCode: bucket.weatherCode,
    risk: classify(bucket.pop, bucket.rainVolumeMm),
    forecastAvailable: true,
  };
}
