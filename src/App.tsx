import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { AppState, FlatList, ScrollView, View } from "react-native";
import { Button, Host, OutlinedTextField, Row, Text, useNativeState } from "@expo/ui/jetpack-compose";
import { useMaterialColors } from "@expo/ui/jetpack-compose";
import { fillMaxWidth, padding, paddingAll, weight } from "@expo/ui/jetpack-compose/modifiers";
import type { ScoredApp, StoreApp } from "./sources/Source";
import { mergeNew, mergePopular } from "./sources/Collections";
import { attachRatings, getMyReview, removeReview, submitRating, writeReview } from "./sources/ratings";
import { DebouncedSearch, rankSearchResults } from "./sources/Search";
import { MatonOS } from "../modules/matonos-software/src/MatonOS";
import { useSources, setPluginEnabled } from "./hooks/useStore";
import type { SourcePlugin } from "../modules/matonos-software/src/MatonOS";
import type { SourceProgress } from "./sources/Source";
import { sourceInfo } from "./sources/PluginSource";
import { StorePage, StoreNavRail } from "./components/StoreNavRail";
import { StoreSourceRow } from "./components/StoreSourceRow";
import { AppGridSection } from "./components/AppGridSection";
import { AppTile, busyButtonLabel, progressLabel } from "./components/AppTile";
import { DetailScreen } from "./screens/DetailScreen";
import { SourceSettingsScreen } from "./screens/SourceSettingsScreen";
import { SourcesScreen } from "./screens/SourcesScreen";
import { Show } from "./components/Show";

type Operation = { app: StoreApp; id: string; kind: "install" | "update" | "uninstall"; progress: string; percent: number | null; error?: string };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function updateAllButton(page: StorePage, apps: StoreApp[], onUpdate: (app: StoreApp) => void): ReactNode {
  if (page !== "updates" || apps.length === 0) return null;
  const updateAll = () => { void Promise.all(apps.map(onUpdate)); };
  return <Button onClick={updateAll}><Text>Update all</Text></Button>;
}

function installedEmptyState(page: StorePage, loading: boolean, error: string): ReactElement | null {
  if (loading || error) return null;
  const label = page === "installed" ? "No installed apps are listed yet." : "No updates are available.";
  return <Host style={{ width: "100%", height: 64 }}><Text modifiers={[paddingAll(20)]}>{label}</Text></Host>;
}

function searchEmptyState(loading: boolean, errors: Array<{ source: string; message: string }>, message: string): ReactElement | null {
  if (loading || errors.length > 0) return null;
  return <Host style={{ width: "100%", height: 64 }}><Text modifiers={[paddingAll(16)]}>{message || "No apps found."}</Text></Host>;
}

function AppTileRow({ item, installedIds, updateIds, operations, operationErrors, onOpenDetails, onInstall, onLaunch }: {
  item: StoreApp; installedIds: Set<string>; updateIds: Set<string>; operations: Record<string, Operation>; operationErrors: Record<string, string>;
  onOpenDetails: (app: StoreApp) => void; onInstall: (app?: StoreApp | null) => Promise<void>; onLaunch: (app: StoreApp) => Promise<void>;
}) {
  const operation = operations[item.ref];
  const busyLabel = operation ? busyButtonLabel(operation.kind) : "";
  const install = (app: StoreApp) => {
    const option = app.repoOptions?.find((entry) => entry.installable);
    void onInstall(option ? { ...app, repo: option.repoId } : app);
  };
  return <Host matchContents={{ vertical: true }} useViewportSizeMeasurement style={{ width: "100%", minHeight: 96 }}>
    <AppTile app={item} installed={installedIds.has(`${item.source}:${item.id}`)} updateAvailable={updateIds.has(`${item.source}:${item.id}`)} busy={Boolean(operation)}
      busyLabel={busyLabel} progress={operation?.progress ?? ""} percent={operation?.percent ?? null} error={operationErrors[item.ref]}
      onOpenDetails={onOpenDetails} onInstall={install} onLaunch={onLaunch} />
  </Host>;
}

export default function App() {
  const sources = useSources();
  const [plugins, setPlugins] = useState<SourcePlugin[]>([]);
  const [settingsSource, setSettingsSource] = useState("");
  const themeColors = useMaterialColors();
  const [page, setPage] = useState<StorePage>("browse");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const searchNative = useNativeState("");
  const [apps, setApps] = useState<StoreApp[]>([]);
  const [popularApps, setPopularApps] = useState<StoreApp[]>([]);
  const [newApps, setNewApps] = useState<StoreApp[]>([]);
  const [collectionLoading, setCollectionLoading] = useState({ popular: true, new: true });
  const [collectionErrors, setCollectionErrors] = useState({ popular: "", new: "" });
  const [installedApps, setInstalledApps] = useState<StoreApp[]>([]);
  const [updateApps, setUpdateApps] = useState<StoreApp[]>([]);
  const [installedError, setInstalledError] = useState("");
  const [selected, setSelected] = useState<StoreApp | null>(null);
  const [detailError, setDetailError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [searchErrors, setSearchErrors] = useState<Array<{ source: string; message: string }>>([]);
  const [operations, setOperations] = useState<Record<string, Operation>>({});
  const [operationErrors, setOperationErrors] = useState<Record<string, string>>({});
  const [sourceIcons, setSourceIcons] = useState<Record<string, string>>({});
  const collectionRequestId = useRef(0);
  const searchRequestId = useRef(0);
  const searchScrollStarted = useRef(false);
  const searchPages = useRef(new Map<string, { offset: number; hasMore: boolean; inFlight: boolean }>());
  const searchDispatch = useRef<(query: string) => void>(() => {});
  const searchFetchMore = useRef<((source: string) => void) | null>(null);
  const searchController = useRef<DebouncedSearch | null>(null);
  if (!searchController.current) searchController.current = new DebouncedSearch((query) => searchDispatch.current(query));
  const refreshes = useRef(new Map<string, Promise<void>>());
  const installedIds = useMemo(() => new Set(installedApps.map((app) => `${app.source}:${app.id}`)), [installedApps]);
  const updateIds = useMemo(() => new Set(updateApps.map((app) => `${app.source}:${app.id}`)), [updateApps]);
  const updateOperation = (ref: string, change: Operation | null) => setOperations((current) => {
    if (change === null) { const next = { ...current }; delete next[ref]; return next; }
    return { ...current, [ref]: change };
  });

  function refreshOnce(key: string, task: () => Promise<void>): Promise<void> {
    const existing = refreshes.current.get(key);
    if (existing) return existing;
    const pending = task().finally(() => {
      if (refreshes.current.get(key) === pending) refreshes.current.delete(key);
    });
    refreshes.current.set(key, pending);
    return pending;
  }

  function refreshInstalled(): Promise<void> {
    return refreshOnce(`installed:${sources.map((source) => source.name).join(",")}`, async () => {
      setInstalledError("");
      try {
        const entries = (await Promise.all(sources.map((source) => source.installed().catch((error) => {
          console.error(`${source.name}: listing installed apps failed`, error);
          return [] as StoreApp[];
        })))).flat();
        const unavailable = JSON.parse(await MatonOS.sourceUnavailableOwners()) as Array<{ packageName: string; source: string; id: string; name: string }>;
        entries.push(...unavailable.map((owned) => ({ id: owned.id, source: owned.source, name: owned.name, summary: "Installed app; its source is unavailable.", icon: "", developer: "", description: "", screenshots: [], permissions: [], ref: owned.packageName, packageName: owned.packageName, sourceUnavailable: true })));
        setInstalledApps(await attachRatings(entries));
      } catch (error) {
        setInstalledApps([]); setInstalledError(errorText(error));
      }
    });
  }

  function refreshUpdates(): Promise<void> {
    return refreshOnce(`updates:${sources.map((source) => source.name).join(",")}`, async () => {
      try {
        const entries = (await Promise.all(sources.map((source) => source.updates().catch((error) => {
          console.error(`${source.name}: listing updates failed`, error);
          return [] as StoreApp[];
        })))).flat();
        setUpdateApps(await attachRatings(entries));
      } catch (error) { console.error("Listing updates failed", error); setUpdateApps([]); setMessage(errorText(error)); }
    });
  }

  function loadCollections(): Promise<void> {
    return refreshOnce(`collections:${sources.map((source) => source.name).join(",")}`, async () => {
    const request = ++collectionRequestId.current;
    setMessage(""); setSearchErrors([]);
    setCollectionErrors({ popular: "", new: "" });
    setCollectionLoading({ popular: true, new: true });
    const popularResults: ScoredApp[][] = sources.map(() => []);
    const newResults: StoreApp[][] = sources.map(() => []);
    let popularReceived = false;
    let newReceived = false;
    const publishPopular = () => {
      if (request !== collectionRequestId.current) return;
      popularReceived = true;
      const rows = mergePopular(popularResults).slice(0, 250);
      void attachRatings(rows).then((rated) => {
        if (request !== collectionRequestId.current) return;
        setPopularApps(rated); setCollectionLoading((state) => ({ ...state, popular: false }));
        void MatonOS.setBrowseCache("popular-score-v2", JSON.stringify(rated)).catch((error) => console.warn("Writing Popular browse cache failed", error));
      });
    };
    const publishNew = () => {
      if (request !== collectionRequestId.current) return;
      newReceived = true;
      const rows = mergeNew(newResults).slice(0, 250);
      void attachRatings(rows).then((rated) => {
        if (request !== collectionRequestId.current) return;
        setNewApps(rated); setCollectionLoading((state) => ({ ...state, new: false }));
        void MatonOS.setBrowseCache("new", JSON.stringify(rated)).catch((error) => console.warn("Writing New browse cache failed", error));
      });
    };
    // Popular is versioned because its ordering comes from plugin scores; do not
    // show a persisted collection from a prior scoring implementation as current.
    const caches = ["popular-score-v2", "new"].map(async (key) => {
      try {
        const cached = await MatonOS.getBrowseCache(key);
        if (!cached || request !== collectionRequestId.current) return;
        const rows = await attachRatings(JSON.parse(cached) as StoreApp[]);
        if (key === "popular-score-v2" && !popularReceived) setPopularApps(rows);
        if (key === "new" && !newReceived) setNewApps(rows);
      } catch (error) { console.warn(`Reading ${key} browse cache failed`, error); }
    });
    const tasks = sources.flatMap((source, index) => [
      (async () => {
        try {
          if (!source.getPopularApps) {
            console.error(`${source.name}: scored Popular call is unavailable; skipping this source`);
            return;
          }
          popularResults[index] = await source.getPopularApps(50);
          publishPopular();
        } catch (error) {
          console.error(`${source.name}: Popular feed failed`, error);
          setCollectionErrors((state) => ({ ...state, popular: state.popular || errorText(error) }));
        }
      })(),
      (async () => {
        try {
          newResults[index] = await source.collection("new", 0, 50);
          publishNew();
        } catch (error) {
          console.error(`${source.name}: New feed failed`, error);
          setCollectionErrors((state) => ({ ...state, new: state.new || errorText(error) }));
        }
      })(),
    ]);
    await Promise.allSettled([...caches, ...tasks]);
    if (request === collectionRequestId.current) {
      if (!popularReceived) { setPopularApps([]); setCollectionLoading((state) => ({ ...state, popular: false })); }
      if (!newReceived) { setNewApps([]); setCollectionLoading((state) => ({ ...state, new: false })); }
    }
    });
  }

  function executeSearch(query: string) {
    const request = ++searchRequestId.current;
    setSearchErrors([]);
    setLoading(true); setMessage("");
    const perSource: StoreApp[][] = sources.map(() => []);
    const errors: Array<{ source: string; message: string }> = [];
    searchPages.current.clear();
    searchScrollStarted.current = false;
    for (const source of sources) searchPages.current.set(`${request}:${source.name}`, { offset: 0, hasMore: true, inFlight: false });
    const publish = () => {
      if (request !== searchRequestId.current) return;
      void attachRatings(rankSearchResults(perSource, query)).then((rated) => {
        if (request === searchRequestId.current) setApps(rated);
      });
      setSearchErrors([...errors]);
    };
    if (sources.length === 0) setLoading(false);
    const fetchPage = (source: (typeof sources)[number], index: number) => {
      const key = `${request}:${source.name}`;
      const state = searchPages.current.get(key);
      if (!state || state.inFlight || !state.hasMore || request !== searchRequestId.current) return;
      state.inFlight = true;
      const offset = state.offset;
      source.searchPage(query, offset, 100).then(({ apps: results, hasMore }) => {
        if (request !== searchRequestId.current) return;
        state.offset += 100;
        state.hasMore = hasMore;
        perSource[index] = mergeSearchPage(perSource[index], results);
        publish();
      }).catch((error: unknown) => {
        if (request !== searchRequestId.current) return;
        console.error(`${source.name}: search page failed`, error);
        errors.push({ source: source.label ?? source.name, message: errorText(error) });
        state.hasMore = false;
        publish();
      }).finally(() => {
        state.inFlight = false;
        if (request === searchRequestId.current) setLoading(false);
      });
    };
    sources.forEach(fetchPage);
    searchFetchMore.current = (name) => {
      const index = sources.findIndex((source) => source.name === name);
      if (index >= 0) fetchPage(sources[index], index);
    };
  }

  function mergeSearchPage(existing: StoreApp[], incoming: StoreApp[]): StoreApp[] {
    const merged = [...existing];
    for (const app of incoming) {
      const index = merged.findIndex((entry) => entry.source === app.source && entry.id === app.id);
      if (index < 0) { merged.push(app); continue; }
      const current = merged[index];
      const candidates = [...(current.candidates ?? [current]), ...(app.candidates ?? [app])];
      const options = new Map([...(current.repoOptions ?? []), ...(app.repoOptions ?? [])].map((option) => [option.repoId, option]));
      merged[index] = { ...current, candidates, repoOptions: [...options.values()] };
    }
    return merged;
  }

  searchDispatch.current = executeSearch;

  function runSearch(value: string) {
    setSearchText(value);
    searchNative.set(value);
    const query = value.trim();
    if (!query) {
      const changed = searchController.current?.schedule("") ?? false;
      if (!changed) return;
      searchRequestId.current += 1;
      searchPages.current.clear();
      searchScrollStarted.current = false;
      setLoading(false);
      void loadCollections();
      return;
    }
    if (searchController.current?.schedule(query)) {
      searchRequestId.current += 1;
      searchPages.current.clear();
      searchScrollStarted.current = false;
      setLoading(true);
      setMessage("");
      setSearchErrors([]);
    }
  }

  async function openDetails(app: StoreApp) {
    const preferred = app.repoOptions?.find((option) => option.installable);
    const detailApp = preferred ? { ...app, repo: preferred.repoId } : app;
    setSelected(detailApp); setMessage(""); setDetailError("");
    try {
      const source = sources.find((candidate) => candidate.name === app.source);
      if (!source) throw new Error("This app's source is no longer enabled.");
      const [rated] = await attachRatings([await source.details(detailApp)]);
      setSelected({ ...rated, repo: detailApp.repo });
    } catch (error) { setDetailError(errorText(error)); }
  }

  async function chooseRepository(repoId: string) {
    if (!selected || selected.repo === repoId) return;
    const next = { ...selected, repo: repoId }; setSelected(next);
    if (next.repoOptions?.find((option) => option.repoId === repoId)?.installable === false) { setDetailError(""); return; }
    try { const source = sources.find((candidate) => candidate.name === next.source); if (source) setSelected(await source.details(next)); }
    catch (error) { setDetailError(errorText(error)); }
  }

  async function startInstall(app: StoreApp | null = selected) {
    if (!app || operations[app.ref]) return;
    const operationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const kind = installedIds.has(`${app.source}:${app.id}`) ? "update" : "install";
    setOperationErrors((current) => { const next = { ...current }; delete next[app.ref]; return next; });
    updateOperation(app.ref, { app, id: operationId, kind, progress: "Preparing installation…", percent: null }); setMessage("");
    try {
      await sources.find((source) => source.name === app.source)!.install(app, operationId);
      setOperations((current) => current[app.ref]?.id === operationId ? { ...current, [app.ref]: { ...current[app.ref], progress: "Downloading and installing…" } } : current);
    } catch (error) { updateOperation(app.ref, null); setOperationErrors((current) => ({ ...current, [app.ref]: errorText(error) })); }
  }

  async function startUninstall(app: StoreApp | null = selected) {
    if (!app || operations[app.ref]) return;
    const operationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setOperationErrors((current) => { const next = { ...current }; delete next[app.ref]; return next; });
    updateOperation(app.ref, { app, id: operationId, kind: "uninstall", progress: "Preparing removal…", percent: null }); setMessage("");
    try {
      await sources.find((source) => source.name === app.source)!.uninstall(app, operationId);
      setOperations((current) => current[app.ref]?.id === operationId ? { ...current, [app.ref]: { ...current[app.ref], progress: "Removing app…" } } : current);
    } catch (error) { updateOperation(app.ref, null); setOperationErrors((current) => ({ ...current, [app.ref]: errorText(error) })); }
  }

  async function cancelOperation(ref: string) {
    const operation = operations[ref];
    if (!operation) return;
    if (operation.app.source) {
      const source = sources.find((candidate) => candidate.name === operation.app.source);
      if (source?.cancel) {
        try { await source.cancel(operation.id); }
        catch (error) { setOperationErrors((current) => ({ ...current, [ref]: errorText(error) })); }
      }
    }
  }

  useEffect(() => {
    if (sources.length > 0) {
      void refreshInstalled();
      void refreshUpdates();
    }
    const timer = setTimeout(() => { void loadCollections(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- collection loader is keyed by source registry
  }, [sources]);
  useEffect(() => {
    const handleProgress = (payload: SourceProgress) => {
      if (payload.phase === "complete") {
        const ref = Object.keys(operations).find((key) => operations[key].id === payload.result?.operationId);
        if (!ref) return;
        const completed = payload.result;
        updateOperation(ref, null);
        if (!completed?.ok) setOperationErrors((current) => ({ ...current, [ref]: completed?.error || completed?.output?.trim() || "The operation did not complete." }));
        else setOperationErrors((current) => { const next = { ...current }; delete next[ref]; return next; });
        void refreshInstalled();
        void refreshUpdates();
        return;
      }
      const ref = Object.keys(operations).find((key) => operations[key].id === payload.operationId);
      if (!ref) return;
      // The installer reports -1 for phases without a known fraction.
      const eventPercent = typeof payload.percent === "number" && payload.percent >= 0 ? payload.percent : null;
      const done = typeof payload.bytesDone === "number" ? payload.bytesDone : 0;
      const total = typeof payload.bytesTotal === "number" ? payload.bytesTotal : 0;
      setOperations((current) => current[ref]?.id === payload.operationId ? { ...current, [ref]: { ...current[ref], percent: eventPercent, progress: progressLabel(payload.phase || "Working…", eventPercent, done, total) } } : current);
    };
    const subscriptions = sources.map((source) => source.progress(handleProgress));
    return () => subscriptions.forEach((subscription) => subscription.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resubscribe only when source registry changes
  }, [sources, operations]);

  useEffect(() => {
    // Packages can be removed outside the store (Settings, pm uninstall).
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") { void refreshInstalled(); void refreshUpdates(); }
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh functions read current sources
  }, [sources]);
  useEffect(() => {
    const pluginOperations = Object.values(operations).filter((operation) => sources.some((source) => source.name === operation.app.source && source.cancel));
    if (!pluginOperations.length) return;
    let active = true;
    const timer = setInterval(() => {
      for (const operation of pluginOperations) {
        void MatonOS.sourceRunning(operation.app.source, operation.id).then(async (running) => {
          if (!active || running) return;
          console.error(`Store source ${operation.app.source} lost operation ${operation.id}`);
          try { await MatonOS.sourceCancel(operation.app.source, operation.id); }
          catch (error) { console.error(`Abandoning lost source operation ${operation.id} failed`, error); }
          if (active) { updateOperation(operation.app.ref, null); setOperationErrors((current) => ({ ...current, [operation.app.ref]: `${operation.app.source} lost the operation` })); }
        }).catch((error) => {
          // A dead binder also emits a terminal result from the native manager.
          console.error(`Checking source operation ${operation.id} failed`, error);
        });
      }
    }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [operations, sources]);
  async function togglePlugin(plugin: SourcePlugin) {
    try {
      await setPluginEnabled(plugin.package, !plugin.enabled); setPlugins(await MatonOS.sourcePlugins());
      if (plugin.enabled) {
        setApps((current) => current.filter((app) => app.source !== plugin.package));
        if (selected?.source === plugin.package) setSelected(null);
        if (settingsSource === plugin.package) setSettingsOpen(false);
      }
    }
    catch (error) { console.error("Toggling plugin failed", error); setMessage(errorText(error)); }
  }
  function openSourceSettings(pkg: string) { setSettingsSource(pkg); setSettingsOpen(true); setSelected(null); }
  const sourceRows = plugins.map((plugin) => <StoreSourceRow key={plugin.package} plugin={plugin} icon={sourceIcons[plugin.package]} onSettings={() => openSourceSettings(plugin.package)} onToggle={(enabled) => void togglePlugin({ ...plugin, enabled })} />);
  const searchErrorRows = searchErrors.map((error) => <Host key={error.source} matchContents={{ vertical: true }}><Text style={{ typography: "bodySmall" }} modifiers={[paddingAll(12)]}>{error.source} results failed: {error.message}</Text></Host>);

  async function selectPage(next: StorePage) {
    setPage(next); setSelected(null); setMessage("");
    setSettingsOpen(false);
    if (next === "installed") await refreshInstalled();
    if (next === "updates") await refreshUpdates();
    if (next === "sources") {
      try {
        const available = await MatonOS.sourcePlugins();
        const described = await Promise.all(available.map(async (plugin) => {
          try { const info = sourceInfo(plugin.package, await MatonOS.sourceInfo(plugin.package)); return { ...plugin, label: info.label, description: info.description }; }
          catch (error) { console.error(`Reading source metadata for ${plugin.package} failed`, error); return plugin; }
        }));
        setPlugins(described);
        const icons = await Promise.all(available.map(async (plugin) => [plugin.package, await MatonOS.sourceIcon(plugin.package)] as const));
        setSourceIcons(Object.fromEntries(icons.filter((entry): entry is [string, string] => Boolean(entry[1]))));
      }
      catch (error) { setMessage(errorText(error)); }
    }
  }

  async function launchApp(app: StoreApp) {
    setMessage("");
    try {
      await MatonOS.launchAndroidApp(app.packageName ?? app.id);
    } catch (error) { setOperationErrors((current) => ({ ...current, [app.ref]: errorText(error) })); }
  }

  const renderApp = ({ item }: { item: StoreApp }) => (
      <AppTileRow item={item} installedIds={installedIds} updateIds={updateIds} operations={operations} operationErrors={operationErrors} onOpenDetails={openDetails} onInstall={startInstall} onLaunch={launchApp} />
  );
  const renderAppRow = (app: StoreApp) => renderApp({ item: app });
  const keyApp = (app: StoreApp) => `${app.source}:${app.id}`;

  let content: ReactNode;
  if (settingsOpen) {
    const settingPlugin = plugins.find((plugin) => plugin.package === settingsSource);
    content = <SourceSettingsScreen source={settingsSource} label={settingPlugin?.label ?? "Source"} onBack={() => setSettingsOpen(false)} onChanged={() => void runSearch(searchText)} />;
  } else if (selected) {
    const currentOperation = operations[selected.ref];
    const currentBusyLabel = currentOperation ? busyButtonLabel(currentOperation.kind) : "";
    const appBar = <AppTileRow item={selected} installedIds={installedIds} updateIds={updateIds} operations={operations} operationErrors={operationErrors} onOpenDetails={openDetails} onInstall={startInstall} onLaunch={launchApp} />;
    content = <DetailScreen app={selected} installed={installedIds.has(`${selected.source}:${selected.id}`)} updateAvailable={updateIds.has(`${selected.source}:${selected.id}`)} busy={Boolean(currentOperation)}
      busyLabel={currentBusyLabel} progress={currentOperation?.progress ?? ""} percent={currentOperation?.percent ?? null}
      canCancel={Boolean(sources.find((source) => source.name === selected.source)?.cancel)} error={operationErrors[selected.ref] ?? detailError}
      onRate={(stars) => submitRating(selected, stars)}
      onSignIn={() => getMyReview(selected)}
      onSubmitReview={(stars,title,body) => writeReview(selected,{stars,title,body})}
      onDeleteReview={() => removeReview(selected)}
      onCancel={() => void cancelOperation(selected.ref)} onBack={() => setSelected(null)} onInstall={() => void startInstall(selected)} onRemove={() => void startUninstall(selected)} onOpen={() => void launchApp(selected)} onChooseRepository={(repoId) => void chooseRepository(repoId)} appBar={appBar} />;
  } else if (page === "sources") {
    content = <SourcesScreen rows={sourceRows} />;
  } else if (page === "installed" || page === "updates") {
    const entries = page === "installed" ? installedApps : updateApps;
    const heading = page === "installed" ? "Installed" : "Updates";
    content = <View style={{ flex: 1 }}>
      <Host matchContents={{ vertical: true }}><Row verticalAlignment="center" modifiers={[paddingAll(16)]}>
        <Text style={{ typography: "headlineSmall" }} modifiers={[weight(1)]}>{heading}</Text>
        {updateAllButton(page, updateApps, startInstall)}
      </Row></Host>
      <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
        <Show when={loading}><Text modifiers={[paddingAll(20)]}>Loading {page}…</Text></Show>
        <Show when={Boolean(installedError) && !loading}><Text modifiers={[paddingAll(20)]}>{installedError}</Text></Show>
      </Host>
      <FlatList removeClippedSubviews={false} style={{ flex: 1 }} data={entries} renderItem={renderApp} keyExtractor={keyApp}
        ListEmptyComponent={installedEmptyState(page, loading, installedError)} />
    </View>;
  } else if (searchText.trim()) {
    content = <View style={{ flex: 1 }}>
      <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
        <Show when={loading}><Text modifiers={[paddingAll(16)]}>Searching…</Text></Show>
      </Host>
      <FlatList removeClippedSubviews={false} style={{ flex: 1 }} data={apps} renderItem={renderApp} keyExtractor={keyApp}
        onScrollBeginDrag={() => { searchScrollStarted.current = true; }}
        onEndReached={() => { if (!searchScrollStarted.current) return; sources.forEach((source) => {
          const request = searchRequestId.current;
          const state = searchPages.current.get(`${request}:${source.name}`);
          if (state?.hasMore && !state.inFlight) {
            searchFetchMore.current?.(source.name);
          }
        }); }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={searchEmptyState(loading, searchErrors, message)} />
      {searchErrorRows}
    </View>;
  } else {
    content = <ScrollView style={{ flex: 1 }}>
      <AppGridSection title="Popular" apps={popularApps} renderApp={renderAppRow} loading={collectionLoading.popular} error={collectionErrors.popular} />
      <AppGridSection title="New" apps={newApps} renderApp={renderAppRow} loading={collectionLoading.new} error={collectionErrors.new} />
    </ScrollView>;
  }

  return <View style={{ flex: 1, flexDirection: "row", backgroundColor: themeColors.background }}>
    <StoreNavRail page={page} updateCount={updateApps.length} onSelect={(next) => void selectPage(next)} />
    <View style={{ flex: 1 }}>
      <Host matchContents={{ vertical: true }}><OutlinedTextField value={searchNative} singleLine keyboardOptions={{ imeAction: "search" }} onValueChange={(value) => void runSearch(value)} modifiers={[padding(16, 12, 16, 12)]}>
        <OutlinedTextField.Placeholder><Text modifiers={[fillMaxWidth()]}>Search apps</Text></OutlinedTextField.Placeholder>
      </OutlinedTextField></Host>
      {content}
    </View>
  </View>;
}
