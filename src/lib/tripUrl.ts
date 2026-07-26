import { requestSchema, type RouteRequest } from "@/lib/route/schema";

export function tripStateToUrl(state: RouteRequest): string {
  const params = new URLSearchParams();
  params.set("trip", JSON.stringify(state));
  return `?${params.toString()}`;
}

// Fails soft: any malformed/tampered `trip` param falls back to null rather
// than throwing, so a broken share link just shows the empty form instead of
// crashing the page.
export function parseTripState(searchParams: URLSearchParams): RouteRequest | null {
  const raw = searchParams.get("trip");
  if (!raw) return null;

  try {
    const parsed = requestSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
