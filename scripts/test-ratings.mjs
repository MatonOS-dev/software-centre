import assert from "node:assert/strict";
import { appRatingKey, attachRatings, fetchRatings, API_BASE, submitRating } from "../src/sources/ratings.ts";

assert.equal(API_BASE, "https://maton.hanro50.net.za/api");
assert.equal(appRatingKey({ id: "app/org.example.App/x86_64/stable", packageName: "flatpak.org.example.App" }), "flatpak.org.example.App");
assert.equal(appRatingKey({ id: "org.example.App", packageName: "org.example.App" }), "org.example.App");
assert.equal(appRatingKey({ id: "app/org.example.App/aarch64/beta", packageName: "flatpak.org.example.App" }), "flatpak.org.example.App");

const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  if (init?.method === "POST") return new Response(JSON.stringify({ ok: true }), { status: 200 });
  return new Response(JSON.stringify({ "flatpak.org.example.App": { count: 2, avg: 4.5, histogram: [0, 0, 0, 1, 1] } }), { status: 200 });
};
try {
  const rows = await attachRatings([{ id: "ref", packageName: "flatpak.org.example.App" }, { id: "org.example.App", packageName: "flatpak.org.example.App" }]);
  assert.equal(rows[0].rating.average, 4.5);
  assert.equal(rows[0].rating.count, 2);
  assert.equal(calls.length, 1, "duplicate app keys are fetched once in one batch");
  assert.match(calls[0].url, /\/reviews\/ratings\?apps=flatpak.org.example.App$/);
  await submitRating({ id: "ref", packageName: "flatpak.org.example.App" }, 5);
  assert.equal(calls[1].init.method, "POST");
  assert.match(calls[1].url, /\/reviews\/ratings$/);
  assert.deepEqual(JSON.parse(calls[1].init.body), { app: "flatpak.org.example.App", stars: 5 });
  const cached = await fetchRatings([{ packageName: "flatpak.org.example.App" }]);
  assert.equal(cached.get("flatpak.org.example.App").average, 4.5);
} finally {
  globalThis.fetch = originalFetch;
}
console.log("store rating client/key tests passed");
