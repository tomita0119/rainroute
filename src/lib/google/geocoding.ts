import { env } from "@/lib/env";

interface RawAddressComponent {
  long_name: string;
  types: string[];
}

interface RawGeocodingResult {
  formatted_address: string;
  address_components: RawAddressComponent[];
}

interface RawGeocodingResponse {
  status: string;
  results: RawGeocodingResult[];
}

// Prefer a locality-level name (city/ward) over the full formatted address,
// so map labels read as "横浜市" rather than a full street address.
function extractPlaceName(result: RawGeocodingResult): string {
  const preferredTypes = ["locality", "administrative_area_level_2", "administrative_area_level_1"];
  for (const type of preferredTypes) {
    const component = result.address_components.find((c) => c.types.includes(type));
    if (component) return component.long_name;
  }
  return result.formatted_address;
}

// Best-effort reverse geocoding: returns null on any failure rather than
// throwing, since a missing city label shouldn't break the rain-risk check.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("language", "ja");
  url.searchParams.set("key", env.googleMapsServerApiKey);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`Geocoding API HTTP ${response.status} for (${lat}, ${lng})`);
      return null;
    }

    const data = (await response.json()) as RawGeocodingResponse;
    if (data.status !== "OK" || data.results.length === 0) {
      console.error(`Geocoding API status "${data.status}" for (${lat}, ${lng})`);
      return null;
    }

    return extractPlaceName(data.results[0]);
  } catch (cause) {
    console.error(`Geocoding API request failed for (${lat}, ${lng})`, cause);
    return null;
  }
}
