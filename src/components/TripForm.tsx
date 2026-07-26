"use client";

import { useState, type FormEvent } from "react";
import { PlaceAutocompleteInput, type SelectedPlace } from "@/components/PlaceAutocompleteInput";
import { MAX_WAYPOINTS } from "@/lib/route/schema";

export interface WaypointField {
  id: string;
  place: SelectedPlace | null;
}

interface TripFormProps {
  isLoaded: boolean;
  loading: boolean;
  origin: SelectedPlace | null;
  destination: SelectedPlace | null;
  waypoints: WaypointField[];
  departureTime: string;
  avoidTolls: boolean;
  onOriginChange: (place: SelectedPlace | null) => void;
  onDestinationChange: (place: SelectedPlace | null) => void;
  onWaypointsChange: (waypoints: WaypointField[]) => void;
  onDepartureTimeChange: (value: string) => void;
  onAvoidTollsChange: (value: boolean) => void;
  onSubmit: () => void;
}

export function TripForm({
  isLoaded,
  loading,
  origin,
  destination,
  waypoints,
  departureTime,
  avoidTolls,
  onOriginChange,
  onDestinationChange,
  onWaypointsChange,
  onDepartureTimeChange,
  onAvoidTollsChange,
  onSubmit,
}: TripFormProps) {
  const [validationError, setValidationError] = useState<string | null>(null);

  function addWaypoint() {
    onWaypointsChange([...waypoints, { id: crypto.randomUUID(), place: null }]);
  }

  function removeWaypoint(id: string) {
    onWaypointsChange(waypoints.filter((w) => w.id !== id));
  }

  function updateWaypoint(id: string, place: SelectedPlace | null) {
    onWaypointsChange(waypoints.map((w) => (w.id === id ? { ...w, place } : w)));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!origin || !destination) {
      setValidationError("出発地と目的地を候補一覧から選択してください");
      return;
    }
    if (waypoints.some((w) => w.place === null)) {
      setValidationError("経由地を候補一覧から選択するか、削除してください");
      return;
    }
    setValidationError(null);
    onSubmit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/10"
    >
      <PlaceAutocompleteInput
        label="出発地"
        isLoaded={isLoaded}
        initialValue={origin?.label}
        onPlaceSelected={onOriginChange}
      />
      <PlaceAutocompleteInput
        label="目的地"
        isLoaded={isLoaded}
        initialValue={destination?.label}
        onPlaceSelected={onDestinationChange}
      />

      <div className="flex flex-col gap-2">
        <span className="text-sm">経由地（任意）</span>
        {waypoints.map((waypoint, index) => (
          <div key={waypoint.id} className="flex items-end gap-2">
            <div className="flex-1">
              <PlaceAutocompleteInput
                label={`経由地${index + 1}`}
                isLoaded={isLoaded}
                initialValue={waypoint.place?.label}
                onPlaceSelected={(place) => updateWaypoint(waypoint.id, place)}
              />
            </div>
            <button
              type="button"
              onClick={() => removeWaypoint(waypoint.id)}
              aria-label="経由地を削除"
              className="rounded border border-black/20 px-3 py-2 text-sm dark:border-white/20"
            >
              ✕
            </button>
          </div>
        ))}
        {waypoints.length < MAX_WAYPOINTS && (
          <button
            type="button"
            onClick={addWaypoint}
            className="self-start text-sm text-blue-600 dark:text-blue-400"
          >
            ＋ 経由地を追加
          </button>
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        出発時刻
        <input
          type="datetime-local"
          value={departureTime}
          onChange={(event) => onDepartureTimeChange(event.target.value)}
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-black/20"
          required
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={avoidTolls}
          onChange={(event) => onAvoidTollsChange(event.target.checked)}
          className="h-4 w-4"
        />
        有料道路を使わない
      </label>
      {validationError && <p className="text-sm text-red-600">{validationError}</p>}
      <button
        type="submit"
        disabled={!isLoaded || loading}
        className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {loading ? "確認中…" : "雨予報をチェック"}
      </button>
    </form>
  );
}
