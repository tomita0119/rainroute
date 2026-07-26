import { z } from "zod";

// Google technically allows up to 25 waypoints, but that's unreasonable for a
// sidebar form and would bloat the shareable `trip` URL (each waypoint carries
// a full formatted-address label).
export const MAX_WAYPOINTS = 5;

export const placeSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  label: z.string(),
});

export const requestSchema = z.object({
  origin: placeSchema,
  destination: placeSchema,
  waypoints: z.array(placeSchema).max(MAX_WAYPOINTS).optional().default([]),
  departureTime: z.iso.datetime({ offset: true }),
});

export type PlaceInput = z.infer<typeof placeSchema>;
export type RouteRequest = z.infer<typeof requestSchema>;
