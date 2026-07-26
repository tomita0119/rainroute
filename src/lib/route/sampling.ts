import { decodePolyline } from "@/lib/google/polyline";
import type { DirectionsResult } from "@/lib/google/directions";

export interface TimedPoint {
  lat: number;
  lng: number;
  etaSeconds: number;
  cumulativeDistanceM: number;
}

const SAMPLE_DISTANCE_M = 20_000;
const SAMPLE_TIME_SEC = 30 * 60;
const MAX_SAMPLES = 15;

function buildDenseSamples(legs: DirectionsResult["legs"]): TimedPoint[] {
  const samples: TimedPoint[] = [];
  let elapsedSeconds = 0;
  let cumulativeDistanceM = 0;

  for (const leg of legs) {
    for (const step of leg.steps) {
      const stepPoints = decodePolyline(step.polyline.points);
      const stepDurationSec = step.duration.value;
      const stepDistanceM = step.distance.value;
      const lastIndex = Math.max(stepPoints.length - 1, 1);

      stepPoints.forEach((point, i) => {
        const fraction = i / lastIndex;
        samples.push({
          lat: point.lat,
          lng: point.lng,
          etaSeconds: elapsedSeconds + fraction * stepDurationSec,
          cumulativeDistanceM: cumulativeDistanceM + fraction * stepDistanceM,
        });
      });

      elapsedSeconds += stepDurationSec;
      cumulativeDistanceM += stepDistanceM;
    }
  }

  return samples;
}

// Picks at most maxCount items from the array, evenly spaced by index,
// always keeping the first and last item.
export function pickEvenSubset<T>(items: T[], maxCount: number): T[] {
  if (items.length <= maxCount) return items;
  const stride = (items.length - 1) / (maxCount - 1);
  const result: T[] = [];
  for (let i = 0; i < maxCount; i++) {
    result.push(items[Math.round(i * stride)]);
  }
  return result;
}

// Down-samples the dense polyline vertices to at most MAX_SAMPLES points,
// picking a new point whenever SAMPLE_DISTANCE_M or SAMPLE_TIME_SEC is
// crossed since the last pick (whichever triggers first). Always keeps the
// first and last point of the route.
export function buildTimedSamples(legs: DirectionsResult["legs"]): TimedPoint[] {
  const dense = buildDenseSamples(legs);
  if (dense.length === 0) return [];

  const picked: TimedPoint[] = [dense[0]];
  let lastDistM = dense[0].cumulativeDistanceM;
  let lastTimeSec = dense[0].etaSeconds;

  for (const point of dense.slice(1)) {
    const distTriggered = point.cumulativeDistanceM - lastDistM >= SAMPLE_DISTANCE_M;
    const timeTriggered = point.etaSeconds - lastTimeSec >= SAMPLE_TIME_SEC;
    if (distTriggered || timeTriggered) {
      picked.push(point);
      lastDistM = point.cumulativeDistanceM;
      lastTimeSec = point.etaSeconds;
    }
  }

  const last = dense[dense.length - 1];
  if (picked[picked.length - 1] !== last) {
    picked.push(last);
  }

  return pickEvenSubset(picked, MAX_SAMPLES);
}
