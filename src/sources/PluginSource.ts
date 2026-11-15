import { MatonOS, type SourcePlugin } from "../../modules/matonos-flathub/src/MatonOS";
import type { Review, Source, SourceProgress, StoreApp } from "./Source";

/** ISoftwareSource.VERSION this store speaks (contract/SOURCE-PLUGINS.md). */
const CONTRACT_VERSION = 2;
/** ISoftwareSource.CAP_* bits, in bit order. */
const CAPABILITIES = ["HAS_REPOSITORIES", "HAS_AGE_RATINGS", "HAS_REVIEWS", "HAS_ANTI_FEATURES", "HAS_PERMISSIONS", "HAS_LOGIN", "REQUIRES_SETUP"];
/** search() page size; binder transactions are capped at 1 MB. */
const PAGE = 100;

export type SourceInfo = { version: number; revision: number; name: string; label: string; capabilities: string[] };

/** Decodes SourceInfo JSON from the native module (capabilities bitmask → names). */
export function sourceInfo(plugin: string, json: string): SourceInfo {
  const info = parse<{ version: number; revision: number; name: string; label: string; capabilities: number }>(plugin, "info", json);
  return { ...info, capabilities: CAPABILITIES.filter((_, bit) => (info.capabilities & (1 << bit)) !== 0) };
}

/** Plugin JSON: details fields are optional on listings. */
type PluginApp = Omit<StoreApp, "source" | "ref" | "description" | "screenshots" | "permissions">
  & Partial<Pick<StoreApp, "description" | "screenshots" | "permissions">>;

function parse<T>(plugin: string, call: string, json: string): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    throw new Error(`${plugin}: ${call} returned invalid JSON`, { cause: error });
  }
}

function toApp(plugin: string, app: PluginApp): StoreApp {
  return { ...app, description: app.description ?? "", screenshots: app.screenshots ?? [], permissions: app.permissions ?? [], source: plugin, ref: app.id };
}

/** Wraps one enabled plugin app as a Source. Data is the plugin's JSON, stamped with its package as source. */
export function pluginSource(plugin: SourcePlugin, capabilities: string[] = [], label = plugin.label): Source {
  const pkg = plugin.package;
  const list = async (call: string, json: Promise<string>) => parse<PluginApp[]>(pkg, call, await json).map((app) => toApp(pkg, app));
  return {
    name: pkg, label, capabilities,
    async search(term) {
      const found: StoreApp[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const page = await list("search", MatonOS.sourceSearch(pkg, term, offset, PAGE));
        found.push(...page);
        if (page.length < PAGE) return found;
      }
    },
    async details(app) {
      const { listing, ...details } = parse<PluginApp & { listing: PluginApp }>(pkg, "details", await MatonOS.sourceDetails(pkg, app.id));
      return toApp(pkg, { ...listing, ...details });
    },
    async reviews(app) {
      return parse<Array<Omit<Review, "date"> & { date: number }>>(pkg, "reviews", await MatonOS.sourceReviews(pkg, app.id))
        .map((review) => ({ ...review, date: new Date(review.date) }));
    },
    installed: () => list("installed", MatonOS.sourceInstalled(pkg)),
    updates: () => list("updates", MatonOS.sourceUpdates(pkg)),
    install: (app, operationId) => MatonOS.sourceInstall(pkg, app.id, operationId),
    uninstall: (app, operationId) => MatonOS.sourceUninstall(pkg, app.packageName ?? app.id, operationId),
    progress(listener: (event: SourceProgress) => void) {
      return MatonOS.addStoreListener((event) => { if (event.source === pkg) listener(event); });
    },
  };
}

/** Enabled plugins that speak this store's contract version. A plugin that fails is logged and skipped. */
export async function pluginSources(): Promise<Source[]> {
  const plugins = (await MatonOS.sourcePlugins()).filter((plugin) => plugin.enabled);
  const checked = await Promise.all(plugins.map(async (plugin) => {
    try {
      const info = sourceInfo(plugin.package, await MatonOS.sourceInfo(plugin.package));
      if (info.version !== CONTRACT_VERSION) throw new Error(`speaks contract ${info.version}, store speaks ${CONTRACT_VERSION}`);
      return pluginSource(plugin, info.capabilities, info.label);
    } catch (error) {
      console.error(`Store source ${plugin.package} unusable`, error);
      return null;
    }
  }));
  return checked.filter((source): source is Source => source !== null);
}
