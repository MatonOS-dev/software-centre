import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, FlatList, Linking, View } from "react-native";
import { Image as ComposeImage, Button, Column, Host, LazyColumn, LinearProgressIndicator, OutlinedTextField, Row, Text, RNHostView, useNativeState } from "@expo/ui/jetpack-compose";
import { useMaterialColors } from "@expo/ui/jetpack-compose";
import { clickable, height, padding, paddingAll, size, weight, width } from "@expo/ui/jetpack-compose/modifiers";
import type { StoreApp } from "./sources/Source";
import { MatonOS } from "../modules/matonos-flathub/src/MatonOS";
import { runApp } from "./FlatpakBridge";
import { useSources, setPluginEnabled } from "./hooks/useStore";
import type { SourcePlugin } from "../modules/matonos-flathub/src/MatonOS";
import type { SourceProgress } from "./sources/Source";
import { sourceInfo } from "./sources/PluginSource";

type Page = "browse" | "installed" | "updates" | "sources";
type Feed = "popular" | "new";
type Repository = { id: string; url: string; label: string; official: boolean; broken: boolean };
type Operation = { app: StoreApp; id: string; kind: "install" | "update" | "uninstall"; progress: string; percent: number | null };

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

async function sourceCollection(source: ReturnType<typeof useSources>[number], kind: Feed): Promise<StoreApp[]> {
  const results: StoreApp[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await source.collection(kind, offset, 100);
    results.push(...page);
    if (page.length < 100) return results;
  }
}

function SourceBadge({ app }: { app: StoreApp }) {
  if (app.sourceUnavailable) return <Text style={{ typography: "bodySmall" }}>source unavailable</Text>;
  return <Text style={{ typography: "labelSmall" }}>{app.sourceLabel ?? app.source}</Text>;
}

function SourceRow({ plugin, onToggle }: { plugin: SourcePlugin; onToggle: (plugin: SourcePlugin) => void }) {
  return <Row verticalAlignment="center" horizontalArrangement={{ spacedBy: 12 }} modifiers={[paddingAll(12)]}>
    <Column modifiers={[weight(1)]}>
      <Text style={{ typography: "titleMedium" }}>{plugin.label}</Text>
      <Text style={{ typography: "bodySmall" }}>{plugin.package}</Text>
      <Text style={{ typography: "bodySmall" }}>{plugin.enabled ? "Enabled" : "Disabled"}</Text>
    </Column>
    <Button onClick={() => onToggle(plugin)}><Text>{plugin.enabled ? "Disable" : "Enable"}</Text></Button>
  </Row>;
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

function Screenshots({ app }: { app: StoreApp }) {
  if (app.screenshots.length === 0) return null;
  return (
    <>
      <Text style={{ typography: "titleMedium" }}>Screenshots</Text>
      <RNHostView modifiers={[height(349)]}><FlatList removeClippedSubviews={false} horizontal style={{ height: 349 }} data={app.screenshots} keyExtractor={(_, index) => `${app.id}-${index}`}
        renderItem={({ item: src }) => <Host style={{ width: 620, height: 349 }} colorScheme="dark" seedColor="#79c75b"><ComposeImage source={{ uri: src }} contentDescription={`${app.name} screenshot`} modifiers={[width(620), height(349)]} /></Host>} /></RNHostView>
    </>
  );
}

function AppTile({ app, installed, updateAvailable, busy, busyLabel, progress, percent, canCancel, onCancel, onOpenDetails, onInstall, onUninstall, onLaunch }: {
  app: StoreApp;
  installed: boolean;
  updateAvailable: boolean;
  busy: boolean;
  busyLabel: string;
  progress: string;
  percent: number | null;
  canCancel: boolean;
  onCancel: () => void;
  onOpenDetails: (app: StoreApp) => void;
  onInstall: (app: StoreApp) => void;
  onUninstall: (app: StoreApp) => void;
  onLaunch: (app: StoreApp) => void;
}) {
  const isBusy = busy && Boolean(progress);
  const isFlatpak = app.sourceLabel === "Flatpak";
  const buttonLabel = app.sourceUnavailable ? "Unavailable" : isBusy ? (busyLabel || "Working…") : updateAvailable ? "Update" : installed ? isFlatpak ? "Open" : "Uninstall" : "Install";
  const buttonAction = updateAvailable ? () => onInstall(app) : installed ? isFlatpak ? () => onLaunch(app) : () => onUninstall(app) : () => onInstall(app);
  return (
    <Column modifiers={app.sourceUnavailable ? [] : [clickable(() => onOpenDetails(app))]}>
      <Row verticalAlignment="center" modifiers={[paddingAll(12)]}>
        <AppIcon app={app} imageSize={52} />
        <Column modifiers={[weight(1), padding(12, 0, 12, 0)]}>
          <Text style={{ typography: "titleMedium" }}>{app.name}</Text>
          <SourceBadge app={app} />
          {app.rating ? <Text style={{ typography: "bodySmall" }}>{app.rating.average.toFixed(1)} / 5 · {app.rating.count} ratings</Text> : null}
          <Text style={{ typography: "bodyMedium" }} maxLines={2}>{app.summary}</Text>
        </Column>
        <Button enabled={!busy && !app.sourceUnavailable} onClick={buttonAction}><Text>{buttonLabel}</Text></Button>
      </Row>
      <Show when={isBusy}>
        <LinearProgressIndicator progress={percentToRatio(percent)} modifiers={[padding(0, 12, 12, 12)]} />
        <ProgressLine progress={progress} />
        <Show when={canCancel}><Button onClick={onCancel}><Text>Cancel</Text></Button></Show>
      </Show>
    </Column>
  );
}

function DetailContent({ app, installed, updateAvailable, busy, busyLabel, progress, percent, canCancel, onCancel, onBack, onInstall, onUninstall }: {
  app: StoreApp; installed: boolean; updateAvailable: boolean; busy: boolean; busyLabel: string; progress: string; percent: number | null; canCancel: boolean; onCancel: () => void; onBack: () => void; onInstall: () => void; onUninstall: () => void;
}) {
  const permissionText = app.permissions.length ? app.permissions.join(" · ") : "Permission details are not included for this app's source.";
  const actionLabel = busy ? (busyLabel || "Working…") : updateAvailable ? "Update" : installed ? "Uninstall" : "Install";
  const action = updateAvailable ? onInstall : installed ? onUninstall : onInstall;
  return (
    <LazyColumn contentPadding={{ start: 20, top: 20, end: 20, bottom: 20 }} verticalArrangement={{ spacedBy: 14 }}>
      <Button onClick={onBack}><Text>‹  Back to apps</Text></Button>
      <Row verticalAlignment="center">
        <AppIcon app={app} imageSize={84} />
        <Column modifiers={[padding(18, 0, 18, 0)]}>
          <Text style={{ typography: "headlineSmall" }}>{app.name}</Text>
          <SourceBadge app={app} />
          {app.rating ? <Text style={{ typography: "bodySmall" }}>{app.rating.average.toFixed(1)} / 5 · {app.rating.count} ratings</Text> : null}
          <Text style={{ typography: "bodyLarge" }}>{app.summary}</Text>
          <Text style={{ typography: "bodySmall" }}>{app.developer}</Text>
        </Column>
      </Row>
      <Row horizontalArrangement={{ spacedBy: 10 }} verticalAlignment="center">
        <Button enabled={!busy} onClick={action}><Text>{actionLabel}</Text></Button>
        <Column modifiers={[weight(1)]}>
          <Show when={Boolean(progress)}><LinearProgressIndicator progress={percentToRatio(percent)} /></Show>
          <ProgressLine progress={progress} />
        </Column>
        <Show when={busy && canCancel}><Button onClick={onCancel}><Text>Cancel</Text></Button></Show>
      </Row>
      <Screenshots app={app} />
      <Text style={{ typography: "titleMedium" }}>Permissions</Text>
      <Text style={{ typography: "bodyMedium" }}>{permissionText}</Text>
      <Text style={{ typography: "titleMedium" }}>About this app</Text>
      <Text style={{ typography: "bodyMedium" }}>{app.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || app.summary}</Text>
      <Text style={{ typography: "bodySmall" }}>{app.id}</Text>
    </LazyColumn>
  );
}

export default function App() {
  const sources = useSources();
  const [plugins, setPlugins] = useState<SourcePlugin[]>([]);
  const [repoSource, setRepoSource] = useState("");
  const repositorySources = sources.filter((source) => source.capabilities?.includes("HAS_REPOSITORIES"));
  const themeColors = useMaterialColors({ colorScheme: "dark", seedColor: "#79c75b" });
  const [page, setPage] = useState<Page>("browse");
  const [feed, setFeed] = useState<Feed>("popular");
  const [repoManager, setRepoManager] = useState(false);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repoUrl, setRepoUrl] = useState("");
  const [repoFingerprint, setRepoFingerprint] = useState("");
  const repoUrlInput = useNativeState("");
  const repoFingerprintInput = useNativeState("");
  const [repoHost, setRepoHost] = useState("");
  const [repoError, setRepoError] = useState("");
  const [repoChecking, setRepoChecking] = useState(false);
  const [apps, setApps] = useState<StoreApp[]>([]);
  const [installedApps, setInstalledApps] = useState<StoreApp[]>([]);
  const [updateApps, setUpdateApps] = useState<StoreApp[]>([]);
  const [installedError, setInstalledError] = useState("");
  const [selected, setSelected] = useState<StoreApp | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [searchErrors, setSearchErrors] = useState<Array<{ source: string; message: string }>>([]);
  const [operations, setOperations] = useState<Record<string, Operation>>({});
  const requestId = useRef(0);
  const installedIds = useMemo(() => new Set(installedApps.map((app) => `${app.source}:${app.id}`)), [installedApps]);
  const updateIds = useMemo(() => new Set(updateApps.map((app) => `${app.source}:${app.id}`)), [updateApps]);
  const updateOperation = (ref: string, change: Operation | null) => setOperations((current) => {
    if (change === null) { const next = { ...current }; delete next[ref]; return next; }
    return { ...current, [ref]: change };
  });

  async function refreshRepositories(pkg = repoSource) {
    if (!pkg) { setRepositories([]); return; }
    try { setRepositories(JSON.parse(await MatonOS.sourceReposAll(pkg)) as Repository[]); } catch (error) { console.error("Repository operation failed", error); setRepoError(errorText(error)); }
  }

  const reviewRepository = useCallback(async (url: string, fingerprint: string) => {
    setRepoError(""); setRepoUrl(url); setRepoFingerprint(fingerprint); repoUrlInput.set(url); repoFingerprintInput.set(fingerprint);
    try { setRepoHost(new URL(url).hostname); }
    catch (error) { setRepoHost(""); setRepoError(errorText(error)); }
  }, [repoUrlInput, repoFingerprintInput, setRepoError, setRepoUrl, setRepoFingerprint, setRepoHost]);

  const handleRepositoryLink = useCallback(async (value: string) => {
    try {
      const link = new URL(value);
      if (link.protocol !== "fdroidrepos:") return;
      const pkg = "org.matonos.store.fdroid";
      const info = sourceInfo(pkg, await MatonOS.sourceInfo(pkg));
      if (!info.capabilities.includes("HAS_REPOSITORIES")) throw new Error("The F-Droid plugin does not manage repositories");
      const url = link.searchParams.get("url") || `https://${link.host}${link.pathname}`.replace(/\/$/, "");
      setRepoSource("org.matonos.store.fdroid"); setRepoManager(true); setSelected(null);
      setRepositories(JSON.parse(await MatonOS.sourceReposAll(pkg)) as Repository[]);
      await reviewRepository(url, link.searchParams.get("fingerprint") || "");
    } catch (error) { console.error("Invalid repository link", error); setRepoError("This F-Droid repository link is invalid."); }
  }, [reviewRepository, setRepoManager, setSelected, setRepoError, setRepoSource, setRepositories]);

  async function saveRepository() {
    if (!repoHost || repoChecking) return;
    setRepoChecking(true); setRepoError("");
    try {
      const share = new URL(repoUrl);
      if (repoFingerprint) share.searchParams.set("fingerprint", repoFingerprint);
      await MatonOS.sourceAddRepo(repoSource, share.toString());
      await refreshRepositories();
      setRepoError("Repository verified and added.");
      setRepoUrl(""); setRepoFingerprint(""); setRepoHost(""); repoUrlInput.set(""); repoFingerprintInput.set("");
    } catch (error) { console.error("Adding repository failed", error); setRepoError(errorText(error)); await refreshRepositories(); }
    finally { setRepoChecking(false); }
  }

  async function removeRepository(repository: string) {
    try { await MatonOS.sourceDelRepo(repoSource, repository); await refreshRepositories(); await runSearch(""); }
    catch (error) { setRepoError(errorText(error)); }
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

  async function loadCollection(nextFeed: Feed) {
    const request = ++requestId.current;
    setLoading(true); setMessage("");
    try {
      const results = await Promise.allSettled(sources.map((source) => sourceCollection(source, nextFeed)));
      const lists: StoreApp[][] = [];
      const errors: Array<{ source: string; message: string }> = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") lists.push(result.value);
        else {
          const source = sources[index];
          console.error(`${source.name}: ${nextFeed} collection failed`, result.reason);
          errors.push({ source: source.label ?? source.name, message: errorText(result.reason) });
        }
      });
      if (request === requestId.current) { setApps(interleave(lists)); setSearchErrors(errors); }
    }
    catch (error) { if (request === requestId.current) setMessage(errorText(error)); }
    finally { if (request === requestId.current) setLoading(false); }
  }

  async function runSearch(value: string) {
    const request = ++requestId.current;
    setSearchErrors([]);
    if (!value.trim()) {
      setLoading(true); setMessage("");
      try {
        const results = await Promise.allSettled(sources.map((source) => sourceCollection(source, feed)));
        const lists: StoreApp[][] = [];
        const errors: Array<{ source: string; message: string }> = [];
        results.forEach((result, index) => {
          if (result.status === "fulfilled") lists.push(result.value);
          else {
            const source = sources[index];
            console.error(`${source.name}: ${feed} collection failed`, result.reason);
            errors.push({ source: source.label ?? source.name, message: errorText(result.reason) });
          }
        });
        if (request === requestId.current) { setApps(interleave(lists)); setSearchErrors(errors); }
      }
      catch (error) { if (request === requestId.current) setMessage(errorText(error)); }
      finally { if (request === requestId.current) setLoading(false); }
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
    setSelected(app); setMessage("");
    try { setSelected(await sources.find((source) => source.name === app.source)!.details(app)); }
    catch (error) { setMessage(errorText(error)); }
  }

  async function startInstall(app: StoreApp | null = selected) {
    if (!app || operations[app.ref]) return;
    const operationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const kind = installedIds.has(`${app.source}:${app.id}`) ? "update" : "install";
    updateOperation(app.ref, { app, id: operationId, kind, progress: "Preparing installation…", percent: null }); setMessage("");
    try {
      await sources.find((source) => source.name === app.source)!.install(app, operationId);
      setOperations((current) => current[app.ref]?.id === operationId ? { ...current, [app.ref]: { ...current[app.ref], progress: "Downloading and installing…" } } : current);
    } catch (error) { updateOperation(app.ref, null); setMessage(errorText(error)); }
  }

  async function startUninstall(app: StoreApp | null = selected) {
    if (!app || operations[app.ref]) return;
    const operationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    updateOperation(app.ref, { app, id: operationId, kind: "uninstall", progress: "Preparing removal…", percent: null }); setMessage("");
    try {
      await sources.find((source) => source.name === app.source)!.uninstall(app, operationId);
      setOperations((current) => current[app.ref]?.id === operationId ? { ...current, [app.ref]: { ...current[app.ref], progress: "Removing app…" } } : current);
    } catch (error) { updateOperation(app.ref, null); setMessage(errorText(error)); }
  }

  async function cancelOperation(ref: string) {
    const operation = operations[ref];
    if (!operation) return;
    if (operation.app.source) {
      const source = sources.find((candidate) => candidate.name === operation.app.source);
      if (source?.cancel) {
        try { await source.cancel(operation.id); }
        catch (error) { setMessage(errorText(error)); }
      }
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void refreshInstalled(); void refreshUpdates(); void refreshRepositories(); }, 0);
    const initialLink = Linking.getInitialURL().then((url) => { if (url) void handleRepositoryLink(url); });
    const subscription = Linking.addEventListener("url", (event) => void handleRepositoryLink(event.url));
    return () => { clearTimeout(timer); subscription.remove(); void initialLink; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial collection and links; registry changes refresh app lists below
  }, [handleRepositoryLink]);
  useEffect(() => {
    const timer = setTimeout(() => { void loadCollection(feed); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- collection loader is keyed by source registry and feed
  }, [sources, feed]);
  useEffect(() => {
    const handleProgress = (payload: SourceProgress) => {
      if (payload.phase === "complete") {
        const ref = Object.keys(operations).find((key) => operations[key].id === payload.result?.operationId);
        if (!ref) return;
        const completed = payload.result;
        updateOperation(ref, null);
        if (!completed?.ok) setMessage(completed?.error || completed?.output?.trim() || "The operation did not complete.");
        else setMessage("Operation complete.");
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
          if (active) { updateOperation(operation.app.ref, null); setMessage(`${operation.app.source} lost the operation`); }
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
  const repositoryButtons = repositorySources.map((source) => <Button key={source.name} onClick={() => void openRepositorySource(source.name)}><Text>{source.label ?? source.name} repositories</Text></Button>);
  const repositoryRows = repositories.map((repository) => <Column key={repository.id} modifiers={[paddingAll(10)]}>
    <Text style={{ typography: "titleMedium" }}>{repository.label}</Text>
    <Text style={{ typography: "bodySmall" }}>{repository.url}</Text>
    <Text style={{ typography: "bodySmall" }}>{repository.broken ? "Broken: index verification or download failed." : "Trusted repository"}</Text>
    <Show when={!repository.official}><Button onClick={() => void removeRepository(repository.id)}><Text>Remove repository</Text></Button></Show>
  </Column>);
  const sourceRows = plugins.map((plugin) => <SourceRow key={plugin.package} plugin={plugin} onToggle={(item) => void togglePlugin(item)} />);
  const searchErrorRows = searchErrors.map((error) => <Host key={error.source} matchContents={{ vertical: true }} colorScheme="dark"><Text style={{ typography: "bodySmall" }} modifiers={[paddingAll(12)]}>{error.source} results failed: {error.message}</Text></Host>);

  async function selectFeed(next: Feed) {
    setFeed(next);
  }

  async function selectPage(next: Page) {
    setPage(next); setSelected(null); setMessage("");
    if (next === "installed") await refreshInstalled();
    if (next === "updates") await refreshUpdates();
    if (next === "sources") {
      try { setPlugins(await MatonOS.sourcePlugins()); }
      catch (error) { setMessage(errorText(error)); }
    }
  }

  async function launchApp(app: StoreApp) {
    setMessage("");
    try {
      await runApp(app.id.split("/")[1] ?? app.id);
      setMessage(`Opening ${app.name}…`);
    } catch (error) { setMessage(errorText(error)); }
  }

  const renderApp = ({ item }: { item: StoreApp }) => (
    <Host matchContents={{ vertical: true }} useViewportSizeMeasurement style={{ width: "100%", minHeight: 96 }} colorScheme="dark" seedColor="#79c75b">
      <AppTile app={item} installed={installedIds.has(`${item.source}:${item.id}`)} updateAvailable={updateIds.has(`${item.source}:${item.id}`)} busy={Boolean(operations[item.ref])}
        busyLabel={operations[item.ref] ? busyButtonLabel(operations[item.ref].kind) : ""}
        progress={operations[item.ref]?.progress ?? ""} percent={operations[item.ref]?.percent ?? null}
        canCancel={Boolean(sources.find((source) => source.name === item.source)?.cancel)} onCancel={() => void cancelOperation(item.ref)}
        onOpenDetails={openDetails}
        onInstall={(app) => void startInstall(app)} onUninstall={(app) => void startUninstall(app)} onLaunch={(app) => void launchApp(app)} />
    </Host>
  );
  const keyApp = (app: StoreApp) => `${app.source}:${app.id}`;

  let content: ReactNode;
  if (repoManager) {
    content = <Host style={{ flex: 1 }} colorScheme="dark" seedColor="#79c75b"><LazyColumn contentPadding={{ start: 20, top: 20, end: 20, bottom: 20 }} verticalArrangement={{ spacedBy: 12 }}>
      <Button onClick={() => { setRepoManager(false); setRepoError(""); }}><Text>‹  Back to apps</Text></Button>
      <Text style={{ typography: "headlineSmall" }}>Repositories</Text>
      <Text style={{ typography: "bodyMedium" }}>The Software Center verifies each repository's signed index using the fingerprint you confirm.</Text>
      {repositoryRows}
      <OutlinedTextField value={repoUrlInput} onValueChange={(value) => { setRepoUrl(value); repoUrlInput.set(value); }}><OutlinedTextField.Label>HTTPS repository URL</OutlinedTextField.Label></OutlinedTextField>
      <OutlinedTextField value={repoFingerprintInput} onValueChange={(value) => { setRepoFingerprint(value); repoFingerprintInput.set(value); }}><OutlinedTextField.Label>Signing fingerprint (SHA-256)</OutlinedTextField.Label></OutlinedTextField>
      <Button onClick={() => void reviewRepository(repoUrl, repoFingerprint)}><Text>Review repository</Text></Button>
      {repoHost ? <Column modifiers={[paddingAll(12)]}>
        <Text style={{ typography: "titleMedium" }}>Trust repository at {repoHost}?</Text>
        <Text style={{ typography: "bodySmall" }}>Fingerprint: {repoFingerprint.replace(/(.{2})/g, "$1:").replace(/:$/, "").toUpperCase()}</Text>
        <Text style={{ typography: "bodySmall" }}>Review the host and fingerprint before trusting this repository.</Text>
        <Button enabled={!repoChecking} onClick={() => void saveRepository()}><Text>{repoChecking ? "Checking…" : "Trust and add"}</Text></Button>
      </Column> : null}
      <Show when={Boolean(repoError)}><Text style={{ typography: "bodyMedium" }}>{repoError}</Text></Show>
    </LazyColumn></Host>;
  } else if (selected) {
    const currentDetail = selected;
    content = <Host style={{ flex: 1 }} colorScheme="dark" seedColor="#79c75b"><DetailContent app={currentDetail} installed={installedIds.has(`${currentDetail.source}:${currentDetail.id}`)} updateAvailable={updateIds.has(`${currentDetail.source}:${currentDetail.id}`)} busy={Boolean(operations[currentDetail.ref])}
      busyLabel={operations[currentDetail.ref] ? busyButtonLabel(operations[currentDetail.ref].kind) : ""} progress={operations[currentDetail.ref]?.progress ?? ""} percent={operations[currentDetail.ref]?.percent ?? null}
      canCancel={Boolean(sources.find((source) => source.name === currentDetail.source)?.cancel)} onCancel={() => void cancelOperation(currentDetail.ref)}
      onBack={() => setSelected(null)} onInstall={() => void startInstall(currentDetail)} onUninstall={() => void startUninstall()} /></Host>;
  } else if (page === "sources") {
    content = <Host style={{ flex: 1 }} colorScheme="dark" seedColor="#79c75b"><LazyColumn contentPadding={{ start: 20, top: 20, end: 20, bottom: 20 }} verticalArrangement={{ spacedBy: 12 }}>
      <Text style={{ typography: "headlineSmall" }}>Sources</Text>
      <Text style={{ typography: "bodyMedium" }}>Choose which app catalogs the Software Center searches.</Text>
      {sourceRows}
      <Text style={{ typography: "titleLarge" }}>Repositories</Text>
      <Text style={{ typography: "bodyMedium" }}>Manage repositories provided by enabled sources.</Text>
      {repositoryButtons}
    </LazyColumn></Host>;
  } else if (page === "installed" || page === "updates") {
    const entries = page === "installed" ? installedApps : updateApps;
    const heading = page === "installed" ? "Installed apps" : "Updates";
    content = <View style={{ flex: 1 }}>
      <Host matchContents={{ vertical: true }} colorScheme="dark" seedColor="#79c75b"><Column>
      <Text style={{ typography: "headlineSmall" }} modifiers={[paddingAll(20)]}>{heading}</Text>
      <Show when={loading}><Text modifiers={[paddingAll(20)]}>Loading {page === "installed" ? "installed apps" : "updates"}…</Text></Show>
      <Show when={Boolean(installedError) && !loading}><Text modifiers={[paddingAll(20)]}>{installedError}</Text></Show>
      </Column></Host>
      <FlatList removeClippedSubviews={false} style={{ flex: 1 }} data={entries} renderItem={renderApp} keyExtractor={keyApp}
        ListEmptyComponent={!loading && !installedError ? <Host style={{ width: "100%", height: 64 }} colorScheme="dark"><Text modifiers={[paddingAll(20)]}>{page === "installed" ? "No installed apps are listed yet." : "No updates are available."}</Text></Host> : null} />
    </View>;
  } else {
    content = <View style={{ flex: 1 }}>
      <Host matchContents={{ vertical: true }} colorScheme="dark" seedColor="#79c75b"><Column>
      <Text style={{ typography: "headlineSmall" }} modifiers={[padding(20, 18, 20, 0)]}>Explore apps</Text>
      <Row horizontalArrangement={{ spacedBy: 10 }} modifiers={[padding(16, 10, 16, 10)]}>
        <Button onClick={() => void selectFeed("popular")}><Text>Popular</Text></Button>
        <Button onClick={() => void selectFeed("new")}><Text>New</Text></Button>
      </Row>
      <OutlinedTextField singleLine keyboardOptions={{ imeAction: "search" }} onValueChange={(value) => void runSearch(value)} modifiers={[padding(16, 0, 16, 0)]}>
        <OutlinedTextField.Label>Search apps</OutlinedTextField.Label>
      </OutlinedTextField>
      </Column></Host>
      <FlatList removeClippedSubviews={false} style={{ flex: 1 }} data={apps} renderItem={renderApp} keyExtractor={keyApp}
        ListHeaderComponent={loading ? <Host style={{ width: "100%", height: 64 }} colorScheme="dark"><Text modifiers={[paddingAll(16)]}>Loading apps…</Text></Host> : null}
        ListEmptyComponent={!loading && !searchErrors.length ? <Host style={{ width: "100%", height: 64 }} colorScheme="dark"><Text modifiers={[paddingAll(16)]}>{message || "No apps found."}</Text></Host> : null} />
      {searchErrorRows}
    </View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
      <Host matchContents={{ vertical: true }} colorScheme="dark" seedColor="#79c75b"><Column>
        <Row horizontalArrangement={{ spacedBy: 12 }} modifiers={[paddingAll(14)]}>
          <Text style={{ typography: "titleLarge" }} modifiers={[weight(1)]}>Software Center</Text>
          <Button onClick={() => void selectPage("browse")}><Text>Browse</Text></Button>
          <Button onClick={() => void selectPage("installed")}><Text>Installed</Text></Button>
          <Button onClick={() => void selectPage("updates")}><Text>Updates</Text></Button>
          <Button onClick={() => void selectPage("sources")}><Text>Sources</Text></Button>
        </Row>
        <Host style={{ height: 48 }} matchContents={{ vertical: true }} colorScheme="dark"><Show when={Boolean(message)}><Text style={{ typography: "bodyMedium" }} maxLines={1} modifiers={[padding(18, 0, 18, 8)]}>{message}</Text></Show></Host>
      </Column></Host>
      {content}
    </View>
  );
}
