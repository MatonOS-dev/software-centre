import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { AppState, FlatList, ScrollView, View } from "react-native";
import { Button, Host, OutlinedTextField, Row, Text, useNativeState } from "@expo/ui/jetpack-compose";
import { useMaterialColors } from "@expo/ui/jetpack-compose";
import { padding, paddingAll, weight } from "@expo/ui/jetpack-compose/modifiers";
import type { ScoredApp, StoreApp } from "./sources/Source";
import { interleave, mergeNew, mergePopular } from "./sources/Collections";
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
import { RepositoryManagerScreen, type Repository, type RepoField } from "./screens/RepositoryManagerScreen";
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

function navigationPage(repositoryManager: boolean, page: StorePage): StorePage {
  if (repositoryManager) return "sources";
  return page;
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
  const [repoSource, setRepoSource] = useState("");
  const [repoRevision, setRepoRevision] = useState(0);
  const [repoAddFields, setRepoAddFields] = useState<RepoField[]>([]);
  const [repoFieldValues, setRepoFieldValues] = useState<Record<string, string>>({});
  const themeColors = useMaterialColors();
  const [page, setPage] = useState<StorePage>("browse");
  const [repoManager, setRepoManager] = useState(false);
  const [searchText, setSearchText] = useState("");
  const searchNative = useNativeState("");
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repoUrl, setRepoUrl] = useState("");
  const [repoName, setRepoName] = useState("");
  const repoUrlInput = useNativeState("");
  const repoNameInput = useNativeState("");
  const [repoHost, setRepoHost] = useState("");
  const [repoError, setRepoError] = useState("");
  const [repoChecking, setRepoChecking] = useState(false);
  const [addingRepository, setAddingRepository] = useState(false);
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
  const requestId = useRef(0);
  const initialInstalledRefresh = useRef(false);
  const installedIds = useMemo(() => new Set(installedApps.map((app) => `${app.source}:${app.id}`)), [installedApps]);
  const updateIds = useMemo(() => new Set(updateApps.map((app) => `${app.source}:${app.id}`)), [updateApps]);
  const updateOperation = (ref: string, change: Operation | null) => setOperations((current) => {
    if (change === null) { const next = { ...current }; delete next[ref]; return next; }
    return { ...current, [ref]: change };
  });

  async function refreshRepositories(pkg = repoSource) {
    if (!pkg) { setRepositories([]); return; }
    try {
      const [rows, info] = await Promise.all([MatonOS.sourceReposAll(pkg), MatonOS.sourceInfo(pkg)]);
      setRepositories(JSON.parse(rows) as Repository[]);
      const source = sourceInfo(pkg, info);
      setRepoRevision(source.revision);
      setRepoAddFields((source.addRepoFields ?? []).map((field) => { const [id, label] = field.split(":", 2); return { id, label }; }));
    } catch (error) { console.error("Repository operation failed", error); setRepoError(errorText(error)); }
  }

  const reviewRepository = useCallback(async (url: string) => {
    setRepoError(""); setRepoUrl(url); repoUrlInput.set(url);
    try {
      const host = new URL(url).hostname;
      setRepoHost(host);
      if (!repoName.trim()) { setRepoName(host); repoNameInput.set(host); }
    }
    catch (error) { setRepoHost(""); setRepoError(errorText(error)); }
  }, [repoUrlInput, repoNameInput, repoName, setRepoError, setRepoUrl, setRepoHost]);


  async function saveRepository() {
    if (!repoHost || repoChecking) return;
    setRepoChecking(true); setRepoError("");
    try {
      const share = new URL(repoUrl);
      for (const field of repoAddFields) if (repoFieldValues[field.id]) share.searchParams.set(field.id, repoFieldValues[field.id]);
      await MatonOS.sourceAddRepoNamed(repoSource, repoName.trim() || repoHost, share.toString());
      await refreshRepositories();
      setRepoError("Repository verified and added.");
      setRepoUrl(""); setRepoName(""); setRepoFieldValues({}); setRepoHost(""); repoUrlInput.set(""); repoNameInput.set("");
    } catch (error) { console.error("Adding repository failed", error); setRepoError(errorText(error)); await refreshRepositories(); }
    finally { setRepoChecking(false); }
  }

  async function removeRepository(repository: string) {
    try { await MatonOS.sourceDelRepo(repoSource, repository); await refreshRepositories(); await runSearch(""); }
    catch (error) { setRepoError(errorText(error)); }
  }

  async function toggleRepository(repository: Repository, enabled: boolean) {
    if (repoRevision < 5) { console.error(`${repoSource}: repository enable switch unavailable at contract revision ${repoRevision}`); return; }
    try { await MatonOS.sourceSetRepoEnabled(repoSource, repository.id, enabled); await refreshRepositories(); await runSearch(""); }
    catch (error) { console.error(`Changing repository state failed id=${repository.id}`, error); setRepoError(errorText(error)); }
  }

  async function refreshInstalled() {
    setInstalledError("");
    try {
      const entries = (await Promise.all(sources.map((source) => source.installed().catch((error) => {
        console.error(`${source.name}: listing installed apps failed`, error);
        return [] as StoreApp[];
      })))).flat();
      const unavailable = JSON.parse(await MatonOS.sourceUnavailableOwners()) as Array<{ packageName: string; source: string; id: string; name: string }>;
      entries.push(...unavailable.map((owned) => ({ id: owned.id, source: owned.source, name: owned.name, summary: "Installed app; its source is unavailable.", icon: "", developer: "", description: "", screenshots: [], permissions: [], ref: owned.packageName, packageName: owned.packageName, sourceUnavailable: true })));
      setInstalledApps(entries);
    } catch (error) {
      setInstalledApps([]); setInstalledError(errorText(error));
    }
  }

  async function refreshUpdates() {
    try {
      const entries = (await Promise.all(sources.map((source) => source.updates()))).flat();
      setUpdateApps(entries);
    } catch (error) { console.error("Listing updates failed", error); setUpdateApps([]); setMessage(errorText(error)); }
  }

  async function loadCollections() {
    const request = ++requestId.current;
    setMessage(""); setSearchErrors([]);
    setCollectionErrors({ popular: "", new: "" });
    setCollectionLoading({ popular: true, new: true });
    const popularResults: ScoredApp[][] = sources.map(() => []);
    const newResults: StoreApp[][] = sources.map(() => []);
    let popularReceived = false;
    let newReceived = false;
    const publishPopular = () => {
      if (request !== requestId.current) return;
      popularReceived = true;
      const rows = mergePopular(popularResults).slice(0, 250);
      setPopularApps(rows); setCollectionLoading((state) => ({ ...state, popular: false }));
      void MatonOS.setBrowseCache("popular", JSON.stringify(rows)).catch((error) => console.warn("Writing Popular browse cache failed", error));
    };
    const publishNew = () => {
      if (request !== requestId.current) return;
      newReceived = true;
      const rows = mergeNew(newResults).slice(0, 250);
      setNewApps(rows); setCollectionLoading((state) => ({ ...state, new: false }));
      void MatonOS.setBrowseCache("new", JSON.stringify(rows)).catch((error) => console.warn("Writing New browse cache failed", error));
    };
    const caches = ["popular", "new"].map(async (key) => {
      try {
        const cached = await MatonOS.getBrowseCache(key);
        if (!cached || request !== requestId.current) return;
        const rows = JSON.parse(cached) as StoreApp[];
        if (key === "popular" && !popularReceived) setPopularApps(rows);
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
    if (request === requestId.current) {
      if (!popularReceived) { setPopularApps([]); setCollectionLoading((state) => ({ ...state, popular: false })); }
      if (!newReceived) { setNewApps([]); setCollectionLoading((state) => ({ ...state, new: false })); }
    }
  }

  async function runSearch(value: string) {
    setSearchText(value);
    searchNative.set(value);
    const request = ++requestId.current;
    setSearchErrors([]);
    if (!value.trim()) {
      await loadCollections();
      return;
    }
    setLoading(true); setMessage("");
    try {
      const results = await Promise.allSettled(sources.map((source) => source.search(value.trim())));
      const perSource: StoreApp[][] = [];
      const errors: Array<{ source: string; message: string }> = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") perSource.push(result.value);
        else {
          const source = sources[index];
          const error = errorText(result.reason);
          console.error(`${source.name}: search failed`, result.reason);
          errors.push({ source: source.label ?? source.name, message: error });
        }
      });
      if (request === requestId.current) { setApps(interleave(perSource)); setSearchErrors(errors); }
    } catch (error) { if (request === requestId.current) setMessage(errorText(error)); }
    finally { if (request === requestId.current) setLoading(false); }
  }

  async function openDetails(app: StoreApp) {
    setSelected(app); setMessage(""); setDetailError("");
    try {
      const source = sources.find((candidate) => candidate.name === app.source);
      if (!source) throw new Error("This app's source is no longer enabled.");
      setSelected(await source.details(app));
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
    const timer = setTimeout(() => { void refreshRepositories(); }, 0);
    return () => { clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial collection; registry changes refresh app lists below
  }, []);
  useEffect(() => {
    if (sources.length > 0 && !initialInstalledRefresh.current) {
      initialInstalledRefresh.current = true;
      void refreshInstalled();
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
    const timer = setTimeout(() => { void refreshInstalled(); void refreshUpdates(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when the source registry changes
  }, [sources]);
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
        if (repoSource === plugin.package) setRepoManager(false);
      }
    }
    catch (error) { console.error("Toggling plugin failed", error); setMessage(errorText(error)); }
  }
  async function openRepositorySource(pkg: string) { setRepoSource(pkg); setRepoManager(true); setSelected(null); setRepoError(""); await refreshRepositories(pkg); }
  async function reviewRepositoryFromDialog() {
    await reviewRepository(repoUrl);
    setAddingRepository(false);
  }
  const sourceRows = plugins.map((plugin) => <StoreSourceRow key={plugin.package} plugin={plugin} icon={sourceIcons[plugin.package]} onSettings={() => void openRepositorySource(plugin.package)} onToggle={(enabled) => void togglePlugin({ ...plugin, enabled })} />);
  const searchErrorRows = searchErrors.map((error) => <Host key={error.source} matchContents={{ vertical: true }}><Text style={{ typography: "bodySmall" }} modifiers={[paddingAll(12)]}>{error.source} results failed: {error.message}</Text></Host>);

  async function selectPage(next: StorePage) {
    setPage(next); setSelected(null); setMessage("");
    setRepoManager(false);
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
  if (repoManager) {
    content = <RepositoryManagerScreen repositories={repositories} revision={repoRevision} fields={repoAddFields} fieldValues={repoFieldValues} error={repoError} host={repoHost} checking={repoChecking} adding={addingRepository} repoNameInput={repoNameInput} repoUrlInput={repoUrlInput}
      onBack={() => { setRepoManager(false); setRepoError(""); }} onAdd={() => { setAddingRepository(true); setRepoError(""); }} onDismissAdd={() => setAddingRepository(false)} onReviewAdd={() => void reviewRepositoryFromDialog()}
      onSetField={(id, value) => setRepoFieldValues((current) => ({ ...current, [id]: value }))}
      onSetName={(value) => { setRepoName(value); repoNameInput.set(value); }} onSetUrl={(value) => { setRepoUrl(value); repoUrlInput.set(value); }}
      onToggle={(repository, enabled) => void toggleRepository(repository, enabled)} onRemove={(id) => void removeRepository(id)} onSave={() => void saveRepository()} />;
  } else if (selected) {
    const currentOperation = operations[selected.ref];
    const currentBusyLabel = currentOperation ? busyButtonLabel(currentOperation.kind) : "";
    content = <DetailScreen app={selected} installed={installedIds.has(`${selected.source}:${selected.id}`)} updateAvailable={updateIds.has(`${selected.source}:${selected.id}`)} busy={Boolean(currentOperation)}
      busyLabel={currentBusyLabel} progress={currentOperation?.progress ?? ""} percent={currentOperation?.percent ?? null}
      canCancel={Boolean(sources.find((source) => source.name === selected.source)?.cancel)} error={operationErrors[selected.ref] ?? detailError}
      onCancel={() => void cancelOperation(selected.ref)} onBack={() => setSelected(null)} onInstall={() => void startInstall(selected)} onRemove={() => void startUninstall(selected)} onOpen={() => void launchApp(selected)} onChooseRepository={(repoId) => void chooseRepository(repoId)} />;
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
      <Show when={loading}><Text modifiers={[paddingAll(20)]}>Loading {page}…</Text></Show>
      <Show when={Boolean(installedError) && !loading}><Text modifiers={[paddingAll(20)]}>{installedError}</Text></Show>
      <FlatList removeClippedSubviews={false} style={{ flex: 1 }} data={entries} renderItem={renderApp} keyExtractor={keyApp}
        ListEmptyComponent={installedEmptyState(page, loading, installedError)} />
    </View>;
  } else if (searchText.trim()) {
    content = <View style={{ flex: 1 }}>
      <Show when={loading}><Text modifiers={[paddingAll(16)]}>Searching…</Text></Show>
      <FlatList removeClippedSubviews={false} style={{ flex: 1 }} data={apps} renderItem={renderApp} keyExtractor={keyApp}
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
    <StoreNavRail page={navigationPage(repoManager, page)} updateCount={updateApps.length} onSelect={(next) => void selectPage(next)} />
    <View style={{ flex: 1 }}>
      <Host matchContents={{ vertical: true }}><OutlinedTextField value={searchNative} singleLine keyboardOptions={{ imeAction: "search" }} onValueChange={(value) => void runSearch(value)} modifiers={[padding(16, 12, 16, 12)]}>
        <OutlinedTextField.Label>Search apps</OutlinedTextField.Label>
      </OutlinedTextField></Host>
      <Show when={repoManager}><Text style={{ typography: "titleMedium" }} modifiers={[padding(16, 0, 16, 0)]}>{plugins.find((plugin) => plugin.package === repoSource)?.label ?? "Source settings"}</Text></Show>
      {content}
    </View>
  </View>;
}
