import { env } from "@/lib/env";

interface RawDirectionsStep {
  distance: { value: number };
  duration: { value: number };
  polyline: { points: string };
}

interface RawDirectionsLeg {
  steps: RawDirectionsStep[];
  distance: { value: number };
  duration: { value: number };
}

interface RawDirectionsRoute {
  legs: RawDirectionsLeg[];
  overview_polyline: { points: string };
}

interface RawDirectionsResponse {
  status: string;
  error_message?: string;
  routes: RawDirectionsRoute[];
}

export class DirectionsNoRouteError extends Error {}
export class DirectionsUpstreamError extends Error {}

export interface DirectionsResult {
  legs: RawDirectionsLeg[];
  overviewPolyline: string;
  distanceMeters: number;
  durationSeconds: number;
}

export async function fetchDirections(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  waypoints: { lat: number; lng: number }[] = [],
  avoidTolls = false
): Promise<DirectionsResult> {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("key", env.googleMapsServerApiKey);
  if (avoidTolls) {
    url.searchParams.set("avoid", "tolls");
  }

  // No "via:" prefix and no "optimize:true" — each waypoint should become a
  // real leg boundary (so sampling.ts's per-leg accumulation applies) and the
  // user's entered order must be preserved, not silently reordered.
  if (waypoints.length > 0) {
    url.searchParams.set("waypoints", waypoints.map((w) => `${w.lat},${w.lng}`).join("|"));
  }

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch (cause) {
    throw new DirectionsUpstreamError("Failed to reach Google Directions API", { cause });
  }

  if (!response.ok) {
    throw new DirectionsUpstreamError(`Google Directions API returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as RawDirectionsResponse;

  if (data.status === "ZERO_RESULTS") {
    throw new DirectionsNoRouteError("No driving route found between the given points");
  }
  if (data.status !== "OK" || data.routes.length === 0) {
    throw new DirectionsUpstreamError(
      `Google Directions API error: ${data.status}${data.error_message ? ` (${data.error_message})` : ""}`
    );
  }

  const route = data.routes[0];
  const distanceMeters = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0);
  const durationSeconds = route.legs.reduce((sum, leg) => sum + leg.duration.value, 0);

  return {
    legs: route.legs,
    overviewPolyline: route.overview_polyline.points,
    distanceMeters,
    durationSeconds,
  };
}
