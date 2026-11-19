import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, FlatList, ScrollView, View } from "react-native";
import { AlertDialog, Image as ComposeImage, Button, Column, Host, LazyColumn, LinearProgressIndicator, OutlinedTextField, Row, Switch, Text, useNativeState } from "@expo/ui/jetpack-compose";
import { useMaterialColors } from "@expo/ui/jetpack-compose";
import { clickable, padding, paddingAll, size, weight, width } from "@expo/ui/jetpack-compose/modifiers";
import type { ScoredApp, StoreApp } from "./sources/Source";
import { MatonOS } from "../modules/matonos-software/src/MatonOS";
import { useSources, setPluginEnabled } from "./hooks/useStore";
import type { SourcePlugin } from "../modules/matonos-software/src/MatonOS";
import type { SourceProgress } from "./sources/Source";
import { sourceInfo } from "./sources/PluginSource";
import { StorePage, StoreNavRail } from "./components/StoreNavRail";
import { StoreSourceRow } from "./components/StoreSourceRow";
import { AppGridSection } from "./components/AppGridSection";
import { MaterialSymbol } from "./components/MaterialSymbol";
import { DetailScreen } from "./screens/DetailScreen";

type Repository = { id: string; url: string; label: string; official: boolean; broken: boolean; enabled?: boolean; appCount?: number; lastRefreshed?: number; builtIn?: boolean; removable?: boolean; description?: string };
type Operation = { app: StoreApp; id: string; kind: "install" | "update" | "uninstall"; progress: string; percent: number | null; error?: string };
function RepoAddField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (id: string, value: string) => void }) {
  const native = useNativeState(value);
  useEffect(() => { native.set(value); }, [native, value]);
  return <OutlinedTextField value={native} onValueChange={(next) => { native.set(next); onChange(id, next); }}><OutlinedTextField.Label>{label}</OutlinedTextField.Label></OutlinedTextField>;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function Show({ when, children }: { when: boolean; children: ReactNode }) {
  if (!when) return null;
  return <>{children}</>;
}

function AppIcon({ app, imageSize }: { app: StoreApp; imageSize: number }) {
  if (!app.icon) return null;
  return <ComposeImage source={{ uri: app.icon }} contentDescription={`${app.name} icon`} modifiers={[size(imageSize, imageSize)]} />;
}

/** Round-robin merge so each source's best matches appear near the top. */
function interleave(lists: StoreApp[][]): StoreApp[] {
  const merged: StoreApp[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let index = 0; index < longest; index++) {
    for (const list of lists) if (index < list.length) merged.push(list[index]);
  }
  return merged;
}

function mergePopular(lists: ScoredApp[][]): StoreApp[] {
  const groups = new Map<number, ScoredApp[][]>();
  for (let sourceIndex = 0; sourceIndex < lists.length; sourceIndex++) {
    for (const entry of lists[sourceIndex]) {
      const score = Math.round(entry.score * 10) / 10;
      const group = groups.get(score) ?? lists.map(() => [] as ScoredApp[]);
      group[sourceIndex].push(entry);
      groups.set(score, group);
    }
  }
  const result: StoreApp[] = [];
  for (const score of [...groups.keys()].sort((a, b) => b - a)) {
    const group = groups.get(score)!;
    const longest = Math.max(0, ...group.map((entries) => entries.length));
    for (let index = 0; index < longest; index++) for (const entries of group) if (entries[index]) result.push(entries[index].app);
  }
  return result;
}

function appAdded(app: StoreApp): number {
  if (typeof app.added === "number") return app.added;
  if (typeof app.added === "string") return /^\d+$/.test(app.added) ? Number(app.added) : Date.parse(app.added) / 1000;
  return 0;
}

function mergeNew(lists: StoreApp[][]): StoreApp[] {
  return lists.flatMap((apps, sourceIndex) => apps.map((app, index) => ({ app, sourceIndex, index, added: appAdded(app) })))
    .sort((left, right) => {
      if (left.added && right.added && left.added !== right.added) return right.added - left.added;
      if (left.added && !right.added) return -1;
      if (!left.added && right.added) return 1;
      return left.index - right.index || left.sourceIndex - right.sourceIndex;
    }).map((entry) => entry.app);
}

function SourceBadge({ app }: { app: StoreApp }) {
  if (app.sourceUnavailable) return <Text style={{ typography: "bodySmall" }}>source unavailable</Text>;
  return <Text style={{ typography: "labelSmall" }}>{app.sourceLabel ?? app.source}</Text>;
}

function ProgressLine({ progress }: { progress: string }) {
  if (!progress) return null;
  return <Text style={{ typography: "bodyMedium" }} maxLines={2}>{progress}</Text>;
}

function busyButtonLabel(kind: "install" | "update" | "uninstall"): string {
  if (kind === "update") return "Updating…";
  return kind === "install" ? "Installing…" : "Working…";
}

function percentToRatio(percent: number | null): number | null {
  if (percent == null) return null;
  return Math.min(1, Math.max(0, percent / 100));
}

function progressLabel(phase: string, percent: number | null, bytesDone: number, bytesTotal: number): string {
  const fraction = percent == null ? "" : ` ${percent}%`;
  const size = bytesTotal > 0 ? ` · ${Math.floor(Math.max(0, bytesDone) / 1048576)} / ${Math.ceil(bytesTotal / 1048576)} MB` : "";
  return `${phase || "Working…"}${fraction}${size}`;
}

function AppTile({ app, installed, updateAvailable, busy, busyLabel, progress, percent, error, canCancel, onCancel, onOpenDetails, onInstall, onLaunch }: {
  app: StoreApp;
  installed: boolean;
  updateAvailable: boolean;
  busy: boolean;
  busyLabel: string;
  progress: string;
  percent: number | null;
  error?: string;
  canCancel: boolean;
  onCancel: () => void;
  onOpenDetails: (app: StoreApp) => void;
  onInstall: (app: StoreApp) => void;
  onLaunch: (app: StoreApp) => void;
}) {
  const isBusy = busy;
  const buttonLabel = app.sourceUnavailable ? "Unavailable" : isBusy ? (busyLabel || "Working…") : updateAvailable ? "Update" : installed ? "Open" : "Install";
  const buttonAction = updateAvailable ? () => onInstall(app) : installed ? () => onLaunch(app) : () => onInstall(app);
  const badgeIcons = app.badges?.map((badge) => <MaterialSymbol key={badge.id} name={badge.icon || "verified"} description={badge.label} />);
  return (
    <Column modifiers={app.sourceUnavailable ? [] : [clickable(() => onOpenDetails(app))]}>
      <Row verticalAlignment="center" modifiers={[paddingAll(12)]}>
        <AppIcon app={app} imageSize={48} />
        <Column modifiers={[weight(1), padding(12, 0, 12, 0)]}>
          <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 4 }}>
            <Text style={{ typography: "titleMedium" }} maxLines={1}>{app.name}</Text>
            {badgeIcons}
          </Row>
          <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 8 }}>
            <SourceBadge app={app} />
            {app.rating ? <Text style={{ typography: "bodySmall" }}>{`★ ${app.rating.average.toFixed(1)} (${app.rating.count})`}</Text> : null}
          </Row>
          <Text style={{ typography: "bodySmall" }} maxLines={1}>{app.summary}</Text>
        </Column>
        <Column modifiers={[width(112)]} verticalArrangement={{ spacedBy: 4 }}>
          {isBusy ? <LinearProgressIndicator progress={percentToRatio(percent)} /> : <Button enabled={!busy && !app.sourceUnavailable} onClick={buttonAction}><Text>{buttonLabel}</Text></Button>}
          {isBusy ? <ProgressLine progress={progress} /> : null}
          {error ? <Text style={{ typography: "bodySmall" }} color="#b3261e">{error}</Text> : null}
        </Column>
      </Row>
      <Show when={isBusy && canCancel}><Button onClick={onCancel}><Text>Cancel</Text></Button></Show>
    </Column>
  );
}

export default function App() {
  const sources = useSources();
  const [plugins, setPlugins] = useState<SourcePlugin[]>([]);
  const [repoSource, setRepoSource] = useState("");
  const [repoRevision, setRepoRevision] = useState(0);
  const [repoAddFields, setRepoAddFields] = useState<Array<{ id: string; label: string }>>([]);
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
  const [relatedApps, setRelatedApps] = useState<StoreApp[]>([]);
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
    setSelected(app); setMessage(""); setDetailError(""); setRelatedApps([app]);
    const candidates = await Promise.allSettled(sources.map((source) => source.search(app.id)));
    const matches = candidates.flatMap((result) => result.status === "fulfilled" ? result.value.filter((candidate) => candidate.id === app.id) : []);
    const unique = [...new Map([app, ...matches].map((candidate) => [`${candidate.source}:${candidate.id}`, candidate])).values()];
    setRelatedApps(unique);
    try {
      const source = sources.find((candidate) => candidate.name === app.source);
      if (!source) throw new Error("This app's source is no longer enabled.");
      setSelected(await source.details(app));
    } catch (error) { setDetailError(errorText(error)); }
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
  const repositoryRows = repositories.map((repository) => <Column key={repository.id} modifiers={[paddingAll(10)]}>
    <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 10 }}>
      <Column modifiers={[weight(1)]}>
        <Text style={{ typography: "titleMedium" }}>{repository.label}</Text>
        {repository.description ? <Text style={{ typography: "bodySmall" }}>{repository.description}</Text> : null}
        <Text style={{ typography: "bodySmall" }}>{repository.url}</Text>
        <Text style={{ typography: "bodySmall" }}>{repository.broken ? "Broken: index verification or download failed." : "Trusted repository"}</Text>
        <Text style={{ typography: "bodySmall" }}>{repository.appCount != null && repository.appCount >= 0 ? `${repository.appCount} apps` : "App count not available yet"}</Text>
        <Text style={{ typography: "bodySmall" }}>{repository.lastRefreshed ? `Last refreshed ${new Date(repository.lastRefreshed * 1000).toLocaleString()}` : "Not refreshed yet"}</Text>
      </Column>
      {repoRevision >= 5 ? <Switch value={repository.enabled ?? true} onCheckedChange={(enabled) => void toggleRepository(repository, enabled)} /> : <Text style={{ typography: "labelSmall" }}>Enabled</Text>}
      {repository.removable !== false ? <Button onClick={() => void removeRepository(repository.id)}><Text>Remove</Text></Button> : null}
    </Row>
  </Column>);
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
      <Host matchContents={{ vertical: true }} useViewportSizeMeasurement style={{ width: "100%", minHeight: 96 }}>
      <AppTile app={item} installed={installedIds.has(`${item.source}:${item.id}`)} updateAvailable={updateIds.has(`${item.source}:${item.id}`)} busy={Boolean(operations[item.ref])}
        busyLabel={operations[item.ref] ? busyButtonLabel(operations[item.ref].kind) : ""}
        progress={operations[item.ref]?.progress ?? ""} percent={operations[item.ref]?.percent ?? null} error={operationErrors[item.ref]}
        canCancel={Boolean(sources.find((source) => source.name === item.source)?.cancel)} onCancel={() => void cancelOperation(item.ref)}
        onOpenDetails={openDetails}
        onInstall={(app) => void startInstall(app)} onLaunch={(app) => void launchApp(app)} />
    </Host>
  );
  const renderAppRow = (app: StoreApp) => renderApp({ item: app });
  const keyApp = (app: StoreApp) => `${app.source}:${app.id}`;

  let content: ReactNode;
  if (repoManager) {
    content = <Host style={{ flex: 1 }}><LazyColumn contentPadding={{ start: 20, top: 20, end: 20, bottom: 20 }} verticalArrangement={{ spacedBy: 12 }}>
      <Button onClick={() => { setRepoManager(false); setRepoError(""); }}><Text>‹  Back to sources</Text></Button>
      <Text style={{ typography: "headlineSmall" }}>Repositories</Text>
      <Text style={{ typography: "bodyMedium" }}>Review repository details before adding a source repository.</Text>
      {repositoryRows}
      <Button onClick={() => { setAddingRepository(true); setRepoError(""); }}><Text>Add repository</Text></Button>
      {addingRepository ? <AlertDialog onDismissRequest={() => setAddingRepository(false)}>
        <AlertDialog.Title>Add repository</AlertDialog.Title>
        <AlertDialog.Text><Column verticalArrangement={{ spacedBy: 10 }}>
          <OutlinedTextField value={repoNameInput} onValueChange={(value) => { setRepoName(value); repoNameInput.set(value); }}><OutlinedTextField.Label>Repository name</OutlinedTextField.Label></OutlinedTextField>
          <OutlinedTextField value={repoUrlInput} onValueChange={(value) => { setRepoUrl(value); repoUrlInput.set(value); }}><OutlinedTextField.Label>HTTPS repository URL</OutlinedTextField.Label></OutlinedTextField>
          {repoAddFields.map((field) => <RepoAddField key={field.id} id={field.id} label={field.label} value={repoFieldValues[field.id] ?? ""} onChange={(id, value) => setRepoFieldValues((current) => ({ ...current, [id]: value }))} />)}
        </Column></AlertDialog.Text>
        <AlertDialog.DismissButton><Button onClick={() => setAddingRepository(false)}><Text>Cancel</Text></Button></AlertDialog.DismissButton>
        <AlertDialog.ConfirmButton><Button onClick={() => void reviewRepositoryFromDialog()}><Text>Review</Text></Button></AlertDialog.ConfirmButton>
      </AlertDialog> : null}
      {repoHost ? <Column modifiers={[paddingAll(12)]}>
        <Text style={{ typography: "titleMedium" }}>Trust repository at {repoHost}?</Text>
        {repoAddFields.map((field) => <Text key={field.id} style={{ typography: "bodySmall" }}>{field.label}: {repoFieldValues[field.id] ?? ""}</Text>)}
        <Text style={{ typography: "bodySmall" }}>Review the repository details before adding it.</Text>
        <Button enabled={!repoChecking} onClick={() => void saveRepository()}><Text>{repoChecking ? "Checking…" : "Trust and add"}</Text></Button>
      </Column> : null}
      <Show when={Boolean(repoError)}><Text style={{ typography: "bodyMedium" }}>{repoError}</Text></Show>
    </LazyColumn></Host>;
  } else if (selected) {
    const detailChoices = relatedApps.filter((app) => app.id === selected.id);
    const currentOperation = operations[selected.ref];
    content = <DetailScreen app={selected} sources={detailChoices} installed={installedIds.has(`${selected.source}:${selected.id}`)} updateAvailable={updateIds.has(`${selected.source}:${selected.id}`)} busy={Boolean(currentOperation)}
      busyLabel={currentOperation ? busyButtonLabel(currentOperation.kind) : ""} progress={currentOperation?.progress ?? ""} percent={currentOperation?.percent ?? null}
      canCancel={Boolean(sources.find((source) => source.name === selected.source)?.cancel)} error={operationErrors[selected.ref] ?? detailError}
      onCancel={() => void cancelOperation(selected.ref)} onBack={() => setSelected(null)} onInstall={() => void startInstall(selected)} onRemove={() => void startUninstall(selected)} onOpen={() => void launchApp(selected)} onChooseSource={openDetails} />;
  } else if (page === "sources") {
    content = <Host style={{ flex: 1 }}><LazyColumn contentPadding={{ start: 20, top: 18, end: 20, bottom: 20 }} verticalArrangement={{ spacedBy: 12 }}>
      <Text style={{ typography: "headlineSmall" }}>Sources</Text>
      <Text style={{ typography: "bodyMedium" }}>Choose which app catalogs Software Center searches.</Text>
      {sourceRows}
    </LazyColumn></Host>;
  } else if (page === "installed" || page === "updates") {
    const entries = page === "installed" ? installedApps : updateApps;
    const heading = page === "installed" ? "Installed" : "Updates";
    content = <View style={{ flex: 1 }}>
      <Host matchContents={{ vertical: true }}><Row verticalAlignment="center" modifiers={[paddingAll(16)]}>
        <Text style={{ typography: "headlineSmall" }} modifiers={[weight(1)]}>{heading}</Text>
        {page === "updates" && updateApps.length > 0 ? <Button onClick={() => void Promise.all(updateApps.map((app) => startInstall(app)))}><Text>Update all</Text></Button> : null}
      </Row></Host>
      <Show when={loading}><Text modifiers={[paddingAll(20)]}>Loading {page}…</Text></Show>
      <Show when={Boolean(installedError) && !loading}><Text modifiers={[paddingAll(20)]}>{installedError}</Text></Show>
      <FlatList removeClippedSubviews={false} style={{ flex: 1 }} data={entries} renderItem={renderApp} keyExtractor={keyApp}
        ListEmptyComponent={!loading && !installedError ? <Host style={{ width: "100%", height: 64 }}><Text modifiers={[paddingAll(20)]}>{page === "installed" ? "No installed apps are listed yet." : "No updates are available."}</Text></Host> : null} />
    </View>;
  } else if (searchText.trim()) {
    content = <View style={{ flex: 1 }}>
      {loading ? <Text modifiers={[paddingAll(16)]}>Searching…</Text> : null}
      <FlatList removeClippedSubviews={false} style={{ flex: 1 }} data={apps} renderItem={renderApp} keyExtractor={keyApp}
        ListEmptyComponent={!loading && !searchErrors.length ? <Host style={{ width: "100%", height: 64 }}><Text modifiers={[paddingAll(16)]}>{message || "No apps found."}</Text></Host> : null} />
      {searchErrorRows}
    </View>;
  } else {
    content = <ScrollView style={{ flex: 1 }}>
      <AppGridSection title="Popular" apps={popularApps} renderApp={renderAppRow} loading={collectionLoading.popular} error={collectionErrors.popular} />
      <AppGridSection title="New" apps={newApps} renderApp={renderAppRow} loading={collectionLoading.new} error={collectionErrors.new} />
    </ScrollView>;
  }

  return <View style={{ flex: 1, flexDirection: "row", backgroundColor: themeColors.background }}>
    <StoreNavRail page={repoManager ? "sources" : selected ? page : page} updateCount={updateApps.length} onSelect={(next) => void selectPage(next)} />
    <View style={{ flex: 1 }}>
      <Host matchContents={{ vertical: true }}><OutlinedTextField value={searchNative} singleLine keyboardOptions={{ imeAction: "search" }} onValueChange={(value) => void runSearch(value)} modifiers={[padding(16, 12, 16, 12)]}>
        <OutlinedTextField.Label>Search apps</OutlinedTextField.Label>
      </OutlinedTextField></Host>
      {repoManager ? <Text style={{ typography: "titleMedium" }} modifiers={[padding(16, 0, 16, 0)]}>{plugins.find((plugin) => plugin.package === repoSource)?.label ?? "Source settings"}</Text> : null}
      {content}
    </View>
  </View>;
}
