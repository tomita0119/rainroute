export type { PlaceInput, RouteRequest } from "@/lib/route/schema";

export type RiskLevel = "low" | "medium" | "high";

export interface RouteSegment {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  etaStart: string; // ISO 8601
  etaEnd: string; // ISO 8601
  risk: RiskLevel;
  pop: number; // 0-1 probability of precipitation
  rainVolumeMm: number;
  forecastAvailable: boolean;
}

export interface HourlyForecastPoint {
  time: string; // ISO 8601
  temperatureC: number;
  weatherCode: number;
  weatherDescription: string;
  pop: number;
  rainVolumeMm: number;
  isClosest: boolean; // true for the bucket used to compute this marker's headline values
}

export interface CityWeatherMarker {
  lat: number;
  lng: number;
  label: string;
  eta: string; // ISO 8601
  temperatureC: number;
  weatherCode: number;
  weatherDescription: string;
  pop: number;
  risk: RiskLevel;
  hourly: HourlyForecastPoint[]; // surrounding hours, chronological order
}

export interface DepartureSuggestion {
  departureTime: string; // ISO 8601
  worstRisk: RiskLevel;
}

export interface RouteResponse {
  route: {
    overviewPolyline: string;
    distanceMeters: number;
    durationSeconds: number;
  };
  segments: RouteSegment[];
  cityMarkers: CityWeatherMarker[];
  summary: {
    hasRainRisk: boolean;
    worstSegmentIndex: number | null;
    arrivalTime: string; // ISO 8601
  };
  departureSuggestions: DepartureSuggestion[];
}

export type ApiErrorCode = "INVALID_INPUT" | "NO_ROUTE_FOUND" | "UPSTREAM_ERROR" | "INTERNAL_ERROR";

export interface ApiErrorBody {
  error: ApiErrorCode;
  message: string;
  provider?: "google" | "open-meteo";
}
