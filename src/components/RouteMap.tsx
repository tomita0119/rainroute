"use client";

import { useEffect, useRef, useState } from "react";
import { GoogleMap, InfoWindow, Marker, Polyline } from "@react-google-maps/api";
import { isPrecipitationCode, weatherEmoji } from "@/lib/weather/weatherCode";
import { RISK_COLORS } from "@/lib/weather/riskColors";
import type { CityWeatherMarker, RouteResponse } from "@/types/api";

const containerStyle = { width: "100%", height: "100%" };

interface RouteMapProps {
  isLoaded: boolean;
  result: RouteResponse;
}

function formatEta(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RouteMap({ isLoaded, result }: RouteMapProps) {
  // Tracked as state (not a plain ref) so the fitting effect below can
  // depend on it: `onLoad` firing is not guaranteed to happen before this
  // component's own effects run (that ordering isn't something React
  // promises), and a ref read inside an effect keyed only on `result` would
  // silently and permanently skip fitBounds if the map wasn't loaded yet on
  // that one run — there's no `result` change afterward to retry on.
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeMarker, setActiveMarker] = useState<CityWeatherMarker | null>(null);
  // GoogleMap treats a new `center` object reference as an explicit recenter
  // request, so a literal computed fresh on every render (e.g. after
  // setActiveMarker below triggers one) would keep snapping the map back to
  // the origin at zoom 10, undoing fitBounds. RouteMap fully unmounts between
  // searches (page.tsx only renders it while `result` is set), so this
  // lazy-initial value is naturally refreshed per route while staying a
  // stable reference for the lifetime of a single result.
  const [initialCenter] = useState(() => ({
    lat: result.segments[0]?.startLat ?? 0,
    lng: result.segments[0]?.startLng ?? 0,
  }));

  useEffect(() => {
    if (!map || result.segments.length === 0 || !containerRef.current) return;

    function fitToRoute() {
      if (!map) return;
      const bounds = new google.maps.LatLngBounds();
      result.segments.forEach((segment) => {
        bounds.extend({ lat: segment.startLat, lng: segment.startLng });
        bounds.extend({ lat: segment.endLat, lng: segment.endLng });
      });
      // Padding keeps the route off the container edges — with no padding,
      // an endpoint can land flush against the edge (or behind the
      // Google logo / fullscreen control in a corner), reading as "cut off"
      // even though it's technically within fitBounds' view.
      map.fitBounds(bounds, 48);
    }

    fitToRoute();
    setActiveMarker(null);

    // fitBounds can miscalculate its zoom if called before Maps has fully
    // measured the container (a well-known quirk right after a map is
    // created) — re-fitting once the map reports itself idle guards against
    // that regardless of why the first call may have been off.
    const idleListener = google.maps.event.addListenerOnce(map, "idle", fitToRoute);

    // The map container's height comes from a flex layout (see page.tsx)
    // that can settle asynchronously — e.g. once the summary banner wraps to
    // a second line, or the suggestion-pills row toggles — so fitBounds can
    // run against a stale container size and zoom in tighter than the route
    // actually needs. Re-measure and re-fit whenever the container's real
    // size changes instead of trusting its size at mount time.
    const observer = new ResizeObserver(() => {
      google.maps.event.trigger(map, "resize");
      fitToRoute();
    });
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      google.maps.event.removeListener(idleListener);
    };
  }, [map, result]);

  if (!isLoaded || result.segments.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="h-[400px] min-h-0 overflow-hidden rounded-lg border border-black/10 dark:border-white/10 lg:h-auto lg:flex-1"
    >
      <GoogleMap
        mapContainerStyle={containerStyle}
        onLoad={setMap}
        center={initialCenter}
        zoom={10}
      >
        {result.segments.map((segment, index) => (
          <Polyline
            key={index}
            path={[
              { lat: segment.startLat, lng: segment.startLng },
              { lat: segment.endLat, lng: segment.endLng },
            ]}
            options={{ strokeColor: RISK_COLORS[segment.risk], strokeWeight: 6 }}
          />
        ))}
        {result.cityMarkers.map((marker, index) => {
          // The first/last cityMarkers are always the searched origin/destination
          // (route.ts forces them in regardless of the even-subset sampling used
          // for the rest), so they can be picked out purely by position — but
          // visually they're identical to every other weather checkpoint, making
          // the actual start/end hard to spot at a glance. A distinct ring color
          // marks them without needing a second icon shape.
          const isOrigin = index === 0;
          const isDestination = index === result.cityMarkers.length - 1;
          const strokeColor = isOrigin ? "#16a34a" : isDestination ? "#dc2626" : "#1f2937";
          return (
            <Marker
              key={index}
              position={{ lat: marker.lat, lng: marker.lng }}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: isOrigin || isDestination ? 18 : 16,
                fillColor: "#ffffff",
                fillOpacity: 1,
                strokeColor,
                strokeWeight: isOrigin || isDestination ? 3 : 2,
              }}
              label={{ text: weatherEmoji(marker.weatherCode), fontSize: "14px" }}
              onClick={() => setActiveMarker(marker)}
            />
          );
        })}
        {activeMarker && (
          <InfoWindow
            position={{ lat: activeMarker.lat, lng: activeMarker.lng }}
            onCloseClick={() => setActiveMarker(null)}
          >
            <div className="text-sm text-black">
              <p className="font-bold">{activeMarker.label}</p>
              <p>{formatEta(activeMarker.eta)} 時点</p>
              <p>
                {activeMarker.weatherDescription} / {Math.round(activeMarker.temperatureC)}°C
              </p>
              <p>降水確率 {Math.round(activeMarker.pop * 100)}%</p>
              {activeMarker.risk !== "low" && !isPrecipitationCode(activeMarker.weatherCode) && (
                <p className="text-yellow-700">※晴れ表示でもにわか雨の可能性あり</p>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
}
