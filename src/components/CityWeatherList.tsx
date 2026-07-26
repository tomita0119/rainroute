"use client";

import { useState } from "react";
import { isPrecipitationCode, weatherEmoji } from "@/lib/weather/weatherCode";
import type { CityWeatherMarker, RiskLevel } from "@/types/api";

const RISK_COLORS: Record<RiskLevel, string> = {
  low: "#22c55e",
  medium: "#eab308",
  high: "#ef4444",
};

function formatEta(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

export function CityWeatherList({ markers }: { markers: CityWeatherMarker[] }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (markers.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
      <ul>
        {markers.map((marker, index) => {
          const isExpanded = expandedIndex === index;
          const isLast = index === markers.length - 1;
          return (
            <li key={index}>
              <button
                type="button"
                onClick={() => setExpandedIndex(isExpanded ? null : index)}
                aria-expanded={isExpanded}
                className="flex w-full gap-3 px-4 py-3 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                {/* Route rail: a dot per stop connected by a line, so the
                    list reads top-to-bottom as the route itself rather than
                    a flat list of unrelated cities. */}
                <div className="flex w-3 shrink-0 flex-col items-center">
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: RISK_COLORS[marker.risk] }}
                    aria-hidden
                  />
                  {!isLast && <span className="mt-1 w-px flex-1 bg-black/15 dark:bg-white/15" aria-hidden />}
                </div>
                <div className="flex flex-1 items-center gap-3">
                  <span className="text-xl" aria-hidden>
                    {weatherEmoji(marker.weatherCode)}
                  </span>
                  <div className="flex flex-1 flex-col">
                    <span className="font-medium">
                      {formatEta(marker.eta)}　{marker.label}
                    </span>
                    <span className="text-black/60 dark:text-white/60">
                      {marker.weatherDescription}・{Math.round(marker.temperatureC)}°C・降水確率
                      {Math.round(marker.pop * 100)}%
                    </span>
                    {marker.risk !== "low" && !isPrecipitationCode(marker.weatherCode) && (
                      <span className="text-yellow-600 dark:text-yellow-500">
                        ※晴れ表示でもにわか雨の可能性あり
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-black/40 dark:text-white/40" aria-hidden>
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="flex gap-4 overflow-x-auto border-t border-black/10 bg-black/[0.02] px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
                  {marker.hourly.map((hour, hourIndex) => (
                    <div
                      key={hourIndex}
                      className={`flex shrink-0 flex-col items-center gap-1 rounded-md px-2 py-1.5 text-xs ${
                        hour.isClosest ? "bg-blue-100 dark:bg-blue-950" : ""
                      }`}
                    >
                      <span className="text-black/60 dark:text-white/60">{formatHour(hour.time)}</span>
                      <span className="text-lg" aria-hidden>
                        {weatherEmoji(hour.weatherCode)}
                      </span>
                      <span>{Math.round(hour.temperatureC)}°C</span>
                      <span className="text-black/60 dark:text-white/60">
                        {Math.round(hour.pop * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
