import { MatonOS, type SourcePlugin } from "../../modules/matonos-flathub/src/MatonOS";
import type { Review, Source, SourceProgress, StoreApp } from "./Source";

const CONTRACT_VERSION = 2;
const CAPABILITIES = ["HAS_REPOSITORIES", "HAS_AGE_RATINGS", "HAS_REVIEWS", "HAS_ANTI_FEATURES", "HAS_PERMISSIONS", "HAS_LOGIN", "REQUIRES_SETUP"];
const PAGE = 100;
export type SourceInfo = { version: number; revision: number; name: string; label: string; capabilities: string[] };
export function sourceInfo(plugin: string, json: string): SourceInfo {
  const info = parse<{ version: number; revision: number; name: string; label: string; capabilities: number }>(plugin, "info", json);
  return { ...info, capabilities: CAPABILITIES.filter((_, bit) => (info.capabilities & (1 << bit)) !== 0) };
}
type PluginApp = {
  id: string; name: string; summary: string; icon: string; developer: string;
  repo?: string; packageName?: string; listing?: PluginApp;
  description?: string; screenshots?: string[]; permissions?: string[];
  [key: string]: unknown;
};
function parse<T>(plugin: string, call: string, json: string): T {
  try { return JSON.parse(json) as T; } catch (error) { throw new Error(`${plugin}: ${call} returned invalid JSON`, { cause: error }); }
}
function toApp(plugin: string, app: PluginApp, label?: string): StoreApp {
  const repo = app.repo ?? "1";
  return { ...app, description: app.description ?? "", screenshots: app.screenshots ?? [], permissions: app.permissions ?? [], source: plugin,
    ref: app.id, repo, origin: repo, repository: repo, sourceLabel: label };
}
async function pages<T>(call: (offset: number, limit: number) => Promise<string>, plugin: string, name: string, start = 0, pageSize = PAGE): Promise<T[]> {
  const result: T[] = [];
  for (let offset = start; ; offset += pageSize) {
    const page = parse<T[]>(plugin, name, await call(offset, pageSize));
    result.push(...page);
    if (page.length < pageSize) return result;
  }
}
function groupCandidates(plugin: string, apps: StoreApp[]): StoreApp[] {
  const groups = new Map<string, StoreApp[]>();
  for (const app of apps) {
    const key = app.packageName || app.id;
    const group = groups.get(key) ?? []; group.push(app); groups.set(key, group);
  }
  return [...groups.values()].map((candidates) => ({ ...candidates[0], candidates }));
}
export function pluginSource(plugin: SourcePlugin, capabilities: string[] = [], label = plugin.label, revision = 0): Source {
  const pkg = plugin.package;
  let repoUrls: Promise<Map<string, string>> | undefined;
  const repoUrl = async (id: string) => {
    if (id === "1") return id;
    repoUrls ??= pages<{ id: string; url: string }>((offset, limit) => MatonOS.sourceRepos(pkg, offset, limit), pkg, "repos")
      .then((repos) => new Map(repos.map((repo) => [repo.id, repo.url])));
    return (await repoUrls).get(id) ?? id;
  };
  const decorate = async (app: PluginApp) => {
      const result = toApp(pkg, app, label);
      try { result.origin = await repoUrl(result.repo ?? "1"); }
      catch (error) {
        // Repository metadata is decoration; a repo index failure must not hide a valid listing.
        console.error(`${pkg}: resolving repository ${result.repo} for ${result.id} failed`, error);
        result.origin = result.repo ?? "1";
      }
      result.repository = result.origin;
      return result;
  };
  const list = async (call: string, getter: (offset: number, limit: number) => Promise<string>) =>
    Promise.all((await pages<PluginApp>(getter, pkg, call)).map(decorate));
  return {
    name: pkg, label, capabilities,
    async search(term) { return groupCandidates(pkg, await list("search", (offset, limit) => MatonOS.sourceSearch(pkg, term, offset, limit))); },
    async collection(kind, offset, limit) {
      if (revision < 2) return [];
      const page = parse<PluginApp[]>(pkg, "collection", await MatonOS.sourceCollection(pkg, kind, offset, limit));
      return groupCandidates(pkg, await Promise.all(page.map(decorate)));
    },
    async details(app) {
      const { listing, ...details } = parse<PluginApp & { listing: PluginApp }>(pkg, "details", await MatonOS.sourceDetails(pkg, app.id, app.repo ?? "1"));
      const result = toApp(pkg, { ...listing, ...details, repo: app.repo ?? listing.repo }, label);
      result.origin = await repoUrl(result.repo ?? "1");
      result.repository = result.origin;
      return result;
    },
    async reviews(app) {
      return pages<Omit<Review, "date"> & { date: number }>((offset, limit) => MatonOS.sourceReviews(pkg, app.id, offset, limit), pkg, "reviews")
        .then((reviews) => reviews.map((review) => ({ ...review, date: new Date(review.date) })));
    },
    installed: () => list("installed", (offset, limit) => MatonOS.sourceInstalled(pkg, offset, limit)),
    updates: () => list("updates", (offset, limit) => MatonOS.sourceUpdates(pkg, offset, limit)),
    install: (app, operationId) => MatonOS.sourceInstall(pkg, app.id, app.repo ?? "1", operationId),
    uninstall: (app, operationId) => MatonOS.sourceUninstall(pkg, app.packageName ?? app.id, operationId),
    cancel: (operationId) => MatonOS.sourceCancel(pkg, operationId),
    progress(listener: (event: SourceProgress) => void) {
      return MatonOS.addStoreListener((event) => { if (event.source === pkg) listener(event); });
    },
  };
}
export async function pluginSources(): Promise<Source[]> {
  const plugins = (await MatonOS.sourcePlugins()).filter((plugin) => plugin.enabled);
  const checked = await Promise.all(plugins.map(async (plugin) => {
    try {
      const info = sourceInfo(plugin.package, await MatonOS.sourceInfo(plugin.package));
      if (info.version !== CONTRACT_VERSION) throw new Error(`speaks contract ${info.version}, store speaks ${CONTRACT_VERSION}`);
      return pluginSource(plugin, info.capabilities, info.label, info.revision);
    } catch (error) { console.error(`Store source ${plugin.package} unusable`, error); return null; }
  }));
  return checked.filter((source): source is Source => source !== null);
}
