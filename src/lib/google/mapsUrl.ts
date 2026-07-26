// Google Maps "Urls API" directions link — no API key needed, opens the
// native app on mobile or maps.google.com on desktop with the route
// pre-filled for turn-by-turn navigation.
// https://developers.google.com/maps/documentation/urls/get-started#directions-action
export function buildGoogleMapsDirectionsUrl(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  waypoints: { lat: number; lng: number }[],
  avoidTolls = false
): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  if (waypoints.length > 0) {
    url.searchParams.set("waypoints", waypoints.map((w) => `${w.lat},${w.lng}`).join("|"));
  }
  url.searchParams.set("travelmode", "driving");
  if (avoidTolls) {
    url.searchParams.set("avoid", "tolls");
  }
  return url.toString();
}
