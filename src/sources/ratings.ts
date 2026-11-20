import type { Rating } from "./Source";

export const RATINGS_API_BASE = "https://maton.hanro50.net.za/api";
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; rating: Rating }>();

export function appRatingKey(app: { id: string; packageName?: string }): string {
  // Normalize structured app refs such as app/<app-id>/<arch>/<branch>;
  // repository, architecture, and branch are not part of the app identity.
  const parts = app.id.split("/");
  if (parts.length === 4 && parts[0] === "app" && parts[1]) return parts[1];
  return app.packageName || app.id;
}

function normalizedRating(value: { count?: unknown; avg?: unknown; histogram?: unknown }): Rating {
  const histogram = Array.isArray(value.histogram) ? value.histogram.slice(0, 5).map((item) => Number(item) || 0) : [];
  while (histogram.length < 5) histogram.push(0);
  return { count: Number(value.count) || 0, average: Number(value.avg) || 0, histogram: histogram as Rating["histogram"] };
}

export async function fetchRatings(apps: Array<{ id: string; packageName?: string }>): Promise<Map<string, Rating>> {
  const now = Date.now();
  const keys = [...new Set(apps.map(appRatingKey))];
  const stale = keys.filter((key) => !cache.has(key) || now - cache.get(key)!.at >= CACHE_MS);
  for (let offset = 0; offset < stale.length; offset += 100) {
    const batch = stale.slice(offset, offset + 100);
    if (!batch.length) continue;
    try {
      const response = await fetch(`${RATINGS_API_BASE}/ratings?apps=${batch.map(encodeURIComponent).join(",")}`);
      if (!response.ok) throw new Error(`Ratings request failed (${response.status})`);
      const body = await response.json() as Record<string, { count?: unknown; avg?: unknown; histogram?: unknown }>;
      for (const key of batch) cache.set(key, { at: now, rating: normalizedRating(body[key] ?? {}) });
    } catch (error) {
      console.warn("Fetching store ratings failed", error);
      for (const key of batch) if (!cache.has(key)) cache.set(key, { at: now, rating: normalizedRating({}) });
    }
  }
  return new Map(keys.flatMap((key) => { const rating = cache.get(key)?.rating; return rating ? [[key, rating]] : []; }));
}

export async function attachRatings<T extends { id: string; packageName?: string; rating?: Rating }>(apps: T[]): Promise<T[]> {
  const ratings = await fetchRatings(apps);
  return apps.map((app) => {
    const rating = ratings.get(appRatingKey(app));
    return rating?.count ? { ...app, rating } : { ...app, rating: undefined };
  });
}

export async function submitRating(app: { id: string; packageName?: string }, stars: number): Promise<void> {
  const response = await fetch(`${RATINGS_API_BASE}/ratings`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ app: appRatingKey(app), stars }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? `Rating could not be submitted (${response.status})`);
  }
  cache.delete(appRatingKey(app));
}
