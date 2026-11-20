import type { Rating, Review, StoreApp } from "./Source";

export const API_BASE = "https://maton.hanro50.net.za/api";
export type OwnedReview = { stars:number; title:string; body:string };
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; rating: Rating }>();

type ApiRating = { count?: unknown; avg?: unknown; histogram?: unknown };
export function appRatingKey(app: { id: string; packageName?: string }): string {
  const parts = app.id.split("/");
  if (parts.length === 4 && parts[0] === "app" && parts[1]) return parts[1];
  return app.packageName || app.id;
}
function normalizeRating(value: ApiRating): Rating {
  const histogram = Array.isArray(value.histogram) ? value.histogram.slice(0, 5).map((v) => Number(v) || 0) : [];
  while (histogram.length < 5) histogram.push(0);
  return { count: Number(value.count) || 0, average: Number(value.avg) || 0, histogram: histogram as Rating["histogram"] };
}
export async function fetchRatings(apps: Array<{ id: string; packageName?: string }>) {
  const keys = [...new Set(apps.map(appRatingKey))], now = Date.now();
  const stale = keys.filter((key) => !cache.has(key) || now - cache.get(key)!.at >= CACHE_MS);
  for (let i = 0; i < stale.length; i += 100) {
    const batch = stale.slice(i, i + 100);
    try {
      const response = await fetch(`${API_BASE}/reviews/ratings?apps=${batch.map(encodeURIComponent).join(",")}`);
      if (!response.ok) throw new Error(`Ratings request failed (${response.status})`);
      const values = await response.json() as Record<string, ApiRating>;
      for (const key of batch) cache.set(key, { at:now, rating:normalizeRating(values[key] ?? {}) });
    } catch (error) {
      console.warn("Fetching store ratings failed", error);
      for (const key of batch) if (!cache.has(key)) cache.set(key, { at:now, rating:normalizeRating({}) });
    }
  }
  return new Map(keys.flatMap((key) => cache.get(key) ? [[key, cache.get(key)!.rating] as const] : []));
}
export async function attachRatings<T extends StoreApp>(apps: T[]): Promise<T[]> {
  const ratings = await fetchRatings(apps);
  return apps.map((app) => {
    const rating = ratings.get(appRatingKey(app));
    return rating?.count ? { ...app, rating } : { ...app, rating:undefined };
  });
}
export async function submitRating(app: StoreApp, stars: number): Promise<void> {
  const response = await fetch(`${API_BASE}/reviews/ratings`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ app:appRatingKey(app), stars }) });
  if (!response.ok) throw new Error(`Rating could not be submitted (${response.status})`);
  cache.delete(appRatingKey(app));
}
export async function fetchReviews(app: StoreApp, offset = 0, limit = 20): Promise<Review[]> {
  const response = await fetch(`${API_BASE}/reviews/apps/${encodeURIComponent(appRatingKey(app))}?offset=${offset}&limit=${limit}`);
  if (!response.ok) throw new Error(`Reviews could not be loaded (${response.status})`);
  return (await response.json() as Array<{ display_name:string; stars:number; title:string; body:string; date:string | number }>).map((review) => ({
    id:`${review.display_name}:${review.date}`, author:review.display_name, rating:review.stars, summary:review.title, description:review.body, date:new Date(review.date),
  }));
}
export async function submitReview(app: StoreApp, token: string, machineId: string, review: { stars:number; title:string; body:string }): Promise<void> {
  const response = await fetch(`${API_BASE}/reviews/apps/${encodeURIComponent(appRatingKey(app))}`, { method:"POST", headers:{"content-type":"application/json", cookie:`maton_session=${token}`, "x-maton-machine-id":machineId}, body:JSON.stringify(review) });
  if (!response.ok) { const value = await response.json().catch(() => ({})) as { code?:string; error?:string; message?:string }; const error = new Error(value.message ?? `Review could not be submitted (${response.status})`) as Error & { code?:string; status?:number }; error.code = value.code ?? value.error; error.status = response.status; throw error; }
}
export async function writeReview(app:StoreApp, review:{stars:number; title:string; body:string}) {
  const { MatonOS } = await import("../../modules/matonos-software/src/MatonOS");
  let session = await MatonOS.accountSession();
  try { await submitReview(app, session.token, session.machineId, review); }
  catch (error) {
    if ((error as Error & {status?:number}).status !== 401) throw error;
    MatonOS.invalidateAccountSession(session.token); session = await MatonOS.accountSession();
    await submitReview(app, session.token, session.machineId, review);
  }
}
export async function getMyReview(app:StoreApp):Promise<OwnedReview | null> {
  const { MatonOS } = await import("../../modules/matonos-software/src/MatonOS");
  let session = await MatonOS.accountSession();
  const read = async () => fetch(`${API_BASE}/reviews/apps/${encodeURIComponent(appRatingKey(app))}?mine=1`, {headers:{cookie:`maton_session=${session.token}`, "x-maton-machine-id":session.machineId}});
  let response = await read();
  if (response.status === 401) { MatonOS.invalidateAccountSession(session.token); session = await MatonOS.accountSession(); response = await read(); }
  if (!response.ok) throw new Error(`Your review could not be loaded (${response.status})`);
  const value = await response.json() as {review:{stars:number;title:string;body:string}|null};
  return value.review;
}
export async function removeReview(app:StoreApp) {
  const { MatonOS } = await import("../../modules/matonos-software/src/MatonOS");
  let session = await MatonOS.accountSession();
  try { await deleteReview(app, session.token, session.machineId); }
  catch (error) {
    if ((error as Error & {status?:number}).status !== 401) throw error;
    MatonOS.invalidateAccountSession(session.token); session = await MatonOS.accountSession();
    await deleteReview(app, session.token, session.machineId);
  }
}
export async function deleteReview(app: StoreApp, token:string, machineId:string) {
  const response = await fetch(`${API_BASE}/reviews/apps/${encodeURIComponent(appRatingKey(app))}`, { method:"DELETE", headers:{cookie:`maton_session=${token}`, "x-maton-machine-id":machineId} });
  if (!response.ok) { const error = new Error(`Review could not be deleted (${response.status})`) as Error & {status?:number}; error.status = response.status; throw error; }
}
