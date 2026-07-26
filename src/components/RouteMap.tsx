"use client";

import { useEffect, useRef, useState } from "react";
import { GoogleMap, InfoWindow, Marker, Polyline } from "@react-google-maps/api";
import { isPrecipitationCode, weatherEmoji } from "@/lib/weather/weatherCode";
import type { CityWeatherMarker, RiskLevel, RouteResponse } from "@/types/api";

const RISK_COLORS: Record<RiskLevel, string> = {
  low: "#22c55e",
  medium: "#eab308",
  high: "#ef4444",
};

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
  const mapRef = useRef<google.maps.Map | null>(null);
  const [activeMarker, setActiveMarker] = useState<CityWeatherMarker | null>(null);

  useEffect(() => {
    if (!mapRef.current || result.segments.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    result.segments.forEach((segment) => {
      bounds.extend({ lat: segment.startLat, lng: segment.startLng });
      bounds.extend({ lat: segment.endLat, lng: segment.endLng });
    });
    mapRef.current.fitBounds(bounds);
    setActiveMarker(null);
  }, [result]);

  if (!isLoaded || result.segments.length === 0) return null;

  const first = result.segments[0];

  return (
    <div className="h-[400px] overflow-hidden rounded-lg border border-black/10 dark:border-white/10 lg:h-[75vh]">
      <GoogleMap
        mapContainerStyle={containerStyle}
        onLoad={(map) => {
          mapRef.current = map;
        }}
        center={{ lat: first.startLat, lng: first.startLng }}
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
        {result.cityMarkers.map((marker, index) => (
          <Marker
            key={index}
            position={{ lat: marker.lat, lng: marker.lng }}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 16,
              fillColor: "#ffffff",
              fillOpacity: 1,
              strokeColor: "#1f2937",
              strokeWeight: 2,
            }}
            label={{ text: weatherEmoji(marker.weatherCode), fontSize: "14px" }}
            onClick={() => setActiveMarker(marker)}
          />
        ))}
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
