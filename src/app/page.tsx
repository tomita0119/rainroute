"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLoadScript, type Libraries } from "@react-google-maps/api";
import { TripForm, type WaypointField } from "@/components/TripForm";
import { RouteMap } from "@/components/RouteMap";
import { CityWeatherList } from "@/components/CityWeatherList";
import { RainLegend } from "@/components/RainLegend";
import { ErrorBanner } from "@/components/ErrorBanner";
import { LoadingState } from "@/components/LoadingState";
import type { SelectedPlace } from "@/components/PlaceAutocompleteInput";
import { defaultDepartureTime, toDatetimeLocalValue } from "@/lib/dateTimeLocal";
import { buildGoogleMapsDirectionsUrl } from "@/lib/google/mapsUrl";
import type { RouteRequest } from "@/lib/route/schema";
import { parseTripState, tripStateToUrl } from "@/lib/tripUrl";
import type { ApiErrorBody, RouteResponse } from "@/types/api";

const GOOGLE_MAPS_LIBRARIES: Libraries = ["places"];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDistance(meters: number): string {
  return `${(meters / 1000).toLocaleString("ja-JP", { maximumFractionDigits: 1 })} km`;
}

function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}分`;
  if (minutes === 0) return `${hours}時間`;
  return `${hours}時間${minutes}分`;
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingState />}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY ?? "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only meaningful on the very first render (used by the lazy useState
  // initializers below and the mount-only effect further down); recomputed
  // on later renders too, but simply unused then.
  const restoredTrip = parseTripState(searchParams);

  const [origin, setOrigin] = useState<SelectedPlace | null>(() => restoredTrip?.origin ?? null);
  const [destination, setDestination] = useState<SelectedPlace | null>(() => restoredTrip?.destination ?? null);
  const [waypoints, setWaypoints] = useState<WaypointField[]>(
    () => restoredTrip?.waypoints.map((place) => ({ id: crypto.randomUUID(), place })) ?? []
  );
  const [departureTime, setDepartureTime] = useState(() =>
    restoredTrip ? toDatetimeLocalValue(new Date(restoredTrip.departureTime)) : defaultDepartureTime()
  );
  const [avoidTolls, setAvoidTolls] = useState(() => restoredTrip?.avoidTolls ?? false);

  const [result, setResult] = useState<RouteResponse | null>(null);
  // Tracks the exact payload that produced `result`, kept separate from the
  // live form state above so the "Googleマップで開く" link stays correct
  // even if the user tweaks the form afterward without re-searching.
  const [lastSearchedTrip, setLastSearchedTrip] = useState<RouteRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function executeSearch(payload: RouteRequest) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        setError((body as ApiErrorBody).message ?? "ルート情報の取得に失敗しました");
        return;
      }
      setResult(body as RouteResponse);
      setLastSearchedTrip(payload);
      router.replace(tripStateToUrl(payload), { scroll: false });
    } catch {
      setError("通信エラーが発生しました。ネットワーク接続を確認してください。");
    } finally {
      setLoading(false);
    }
  }

  // Form state was already seeded from the URL via the lazy useState
  // initializers above; this effect only needs to kick off the matching
  // search once on mount. The setTimeout defers executeSearch's state
  // updates to a later macrotask rather than running synchronously inside
  // the effect body, avoiding the cascading-render pattern the effect's
  // own render pass would otherwise trigger.
  useEffect(() => {
    if (!restoredTrip) return;
    const timeoutId = setTimeout(() => void executeSearch(restoredTrip), 0);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFormSubmit() {
    if (!origin || !destination) return; // TripForm already validated before calling this
    void executeSearch({
      origin,
      destination,
      waypoints: waypoints.map((w) => w.place!),
      departureTime: new Date(departureTime).toISOString(),
      avoidTolls,
    });
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS) — not a core-path failure.
    }
  }

  return (
    <main className="flex min-h-screen w-full flex-col gap-6 p-4 sm:p-8 lg:flex-row lg:items-start">
      <aside className="flex w-full flex-col gap-4 lg:sticky lg:top-8 lg:w-80 lg:shrink-0">
        <div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-bold">RainRoute</h1>
            <Link
              href="/how-to-use"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 underline dark:text-blue-400"
            >
              使い方
            </Link>
          </div>
          <p className="text-sm text-black/60 dark:text-white/60">移動ルート上の雨を、出発前に。</p>
        </div>

        {loadError && <ErrorBanner message="地図の読み込みに失敗しました。APIキー設定を確認してください。" />}

        <TripForm
          isLoaded={isLoaded}
          loading={loading}
          origin={origin}
          destination={destination}
          waypoints={waypoints}
          departureTime={departureTime}
          avoidTolls={avoidTolls}
          onOriginChange={setOrigin}
          onDestinationChange={setDestination}
          onWaypointsChange={setWaypoints}
          onDepartureTimeChange={setDepartureTime}
          onAvoidTollsChange={setAvoidTolls}
          onSubmit={handleFormSubmit}
        />

        {error && <ErrorBanner message={error} />}
        {loading && <LoadingState />}
      </aside>

      <section className="flex w-full flex-1 flex-col gap-4">
        {result && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div
                className={`flex-1 rounded-lg border px-4 py-3 text-sm ${
                  result.summary.hasRainRisk
                    ? "border-yellow-400 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950"
                    : "border-green-400 bg-green-50 dark:border-green-700 dark:bg-green-950"
                }`}
              >
                {result.summary.hasRainRisk
                  ? `ルート上で雨に降られる可能性があります（到着予定: ${formatTime(result.summary.arrivalTime)}）`
                  : `ルート上で雨に降られる心配はなさそうです（到着予定: ${formatTime(result.summary.arrivalTime)}）`}
                <div className="mt-1 text-black/60 dark:text-white/60">
                  総距離 {formatDistance(result.route.distanceMeters)}・所要時間 {formatDuration(result.route.durationSeconds)}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyLink}
                className="rounded border border-black/20 px-3 py-2 text-sm dark:border-white/20"
              >
                {copied ? "コピーしました" : "共有リンクをコピー"}
              </button>
              {lastSearchedTrip && (
                <a
                  href={buildGoogleMapsDirectionsUrl(
                    lastSearchedTrip.origin,
                    lastSearchedTrip.destination,
                    lastSearchedTrip.waypoints,
                    lastSearchedTrip.avoidTolls
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-black/20 px-3 py-2 text-sm dark:border-white/20"
                >
                  Googleマップで開く
                </a>
              )}
            </div>
            <RouteMap isLoaded={isLoaded} result={result} />
            <RainLegend />
            <CityWeatherList markers={result.cityMarkers} />
          </>
        )}
      </section>
    </main>
  );
}
