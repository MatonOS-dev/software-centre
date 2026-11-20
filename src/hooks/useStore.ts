import { useEffect, useState, useSyncExternalStore } from "react";
import { pluginSources } from "../sources/PluginSource";
import { attachRatings } from "../sources/ratings";
import { MatonOS } from "../../modules/matonos-software/src/MatonOS";
import { toListing, type AppListing, type Source, type SourceName, type StoreApp } from "../sources/Source";

export type * from "../sources/Source";

let SOURCES: Source[] = [];
let sourceLoad: Promise<void> | null = null;
const sourceListeners = new Set<() => void>();
let progressSubscriptions: Array<{ remove(): void }> = [];
export function loadSources(): Promise<void> {
  sourceLoad ??= pluginSources().then((plugins) => {
    progressSubscriptions.forEach((subscription) => subscription.remove());
    SOURCES = plugins; installedIds = null;
    progressSubscriptions = SOURCES.map((source) => source.progress((event) => { if (event.result) installedIds = null; }));
    sourceListeners.forEach((listener) => listener());
  }).catch((error) => { sourceLoad = null; console.error("Loading source plugins failed", error); throw error; });
  return sourceLoad;
}
export async function setPluginEnabled(pkg: string, enabled: boolean): Promise<void> {
  await MatonOS.setSourceEnabled(pkg, enabled); sourceLoad = null; await loadSources();
}
function subscribeSources(listener: () => void) { sourceListeners.add(listener); return () => { sourceListeners.delete(listener); }; }
export function useSources(): Source[] {
  const sources = useSyncExternalStore(subscribeSources, () => SOURCES);
  useEffect(() => { void loadSources().catch((error) => console.error("Source discovery failed", error)); }, []);
  return sources;
}
const SEARCH_DEBOUNCE_MS = 300;

// Installed ids per source, cached for the session and dropped whenever an
// install/uninstall finishes so the next search sees the new state.
let installedIds: Promise<Set<string>> | null = null;


async function installed(): Promise<Set<string>> {
  await loadSources();
  installedIds ??= Promise.all(SOURCES.map((source) => source.installed().catch((error) => {
    console.warn(`${source.name}: listing installed apps failed`, error);
    return [] as StoreApp[];
  }))).then((lists) => new Set(lists.flat().map((app) => `${app.source}:${app.id}`)));
  return installedIds;
}

async function searchSource(source: Source, term: string, ids: Set<string>): Promise<AppListing[]> {
  const { apps: found } = await source.searchPage(term, 0, 100);
  const rated = await attachRatings(found);
  return rated.map((app) => toListing({ ...app, installed: ids.has(`${app.source}:${app.id}`) }));
}

export type SearchState = {
  apps: AppListing[];
  loading: boolean;
  /** One entry per source that failed; results from the other sources still show. */
  errors: Array<{ source: SourceName; message: string }>;
};

/** Searches every source (debounced). An empty term returns no apps. */
export function useAppSearch(term: string): SearchState {
  const sources = useSources();
  const query = term.trim();
  const [result, setResult] = useState<{ query: string; apps: AppListing[]; errors: SearchState["errors"] }>({ query: "", apps: [], errors: [] });

  useEffect(() => {
    if (!query) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const ids = await installed();
      const results = await Promise.allSettled(SOURCES.map((source) => searchSource(source, query, ids)));
      if (stale) return;
      const apps: AppListing[] = [];
      const errors: SearchState["errors"] = [];
      results.forEach((outcome, index) => {
        if (outcome.status === "fulfilled") apps.push(...outcome.value);
        else {
          console.error(`${SOURCES[index].name}: search for "${query}" failed`, outcome.reason);
          errors.push({ source: SOURCES[index].name, message: String(outcome.reason?.message ?? outcome.reason) });
        }
      });
      setResult({ query, apps, errors });
    }, SEARCH_DEBOUNCE_MS);
    return () => { stale = true; clearTimeout(timer); };
  }, [query, sources]);

  if (!query) return { apps: [], loading: false, errors: [] };
  // Keep the previous results on screen while the new search runs.
  return { apps: result.apps, loading: result.query !== query, errors: result.errors };
}
