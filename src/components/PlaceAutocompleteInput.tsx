"use client";

import { useRef } from "react";
import { Autocomplete } from "@react-google-maps/api";

export interface SelectedPlace {
  lat: number;
  lng: number;
  label: string;
}

interface PlaceAutocompleteInputProps {
  label: string;
  isLoaded: boolean;
  initialValue?: string;
  onPlaceSelected: (place: SelectedPlace | null) => void;
}

export function PlaceAutocompleteInput({
  label,
  isLoaded,
  initialValue,
  onPlaceSelected,
}: PlaceAutocompleteInputProps) {
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  function handlePlaceChanged() {
    const place = autocompleteRef.current?.getPlace();
    const location = place?.geometry?.location;
    if (!location) {
      onPlaceSelected(null);
      return;
    }
    onPlaceSelected({
      lat: location.lat(),
      lng: location.lng(),
      label: place.formatted_address ?? place.name ?? "",
    });
  }

  if (!isLoaded) {
    return (
      <label className="flex flex-col gap-1 text-sm">
        {label}
        <input
          disabled
          defaultValue={initialValue}
          placeholder="地図を読み込み中…"
          className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-black/20"
        />
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <Autocomplete
        onLoad={(autocomplete) => {
          autocompleteRef.current = autocomplete;
        }}
        onPlaceChanged={handlePlaceChanged}
        options={{ fields: ["geometry", "formatted_address", "name"] }}
      >
        <input
          type="text"
          defaultValue={initialValue}
          placeholder="住所や地名を入力"
          onChange={() => onPlaceSelected(null)}
          className="w-full rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-black/20"
        />
      </Autocomplete>
    </label>
  );
}
