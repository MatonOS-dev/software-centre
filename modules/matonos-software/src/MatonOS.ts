import { requireNativeModule, type EventSubscription } from "expo-modules-core";

type NativeApi = {
  addListener(name: "linuxAppStoreEvent", listener: (event: StoreEvent) => void): EventSubscription;
  storeInstall(ref: string, operationId: string): Promise<boolean>;
  storeUpdate(ref: string, operationId: string): Promise<boolean>;
  storeUninstall(ref: string, operationId: string): Promise<boolean>;
  storeListInstalled(): Promise<string>;
  storeListRemotes(): Promise<string>;
  startStubInstall(ref: string, operationId: string | null): Promise<boolean>;
  startStubUpdate(ref: string, operationId: string | null): Promise<boolean>;
  launchStub(appId: string): Promise<boolean>;
  sourcePlugins(): Promise<SourcePlugin[]>;
  getBrowseCache(key: string): Promise<string | null>;
  setBrowseCache(key: string, value: string): Promise<void>;
  sourceUnavailableOwners(): Promise<string>;
  setSourceEnabled(pkg: string, enabled: boolean): Promise<void>;
  sourceInfo(pkg: string): Promise<string>;
  sourceSearch(pkg: string, term: string, offset: number, limit: number): Promise<string>;
  sourceCollection(pkg: string, kind: "popular" | "new", offset: number, limit: number): Promise<string>;
  sourcePopularApps(pkg: string, limit: number): Promise<string>;
  sourceSetRepoEnabled(pkg: string, id: string, enabled: boolean): Promise<void>;
  describeAndroidPermissions(names: string[]): Promise<string>;
  sourceIcon(pkg: string): Promise<string | null>;
  launchAndroidApp(packageName: string): Promise<boolean>;
  sourceDetails(pkg: string, id: string, repo: string): Promise<string>;
  sourceReviews(pkg: string, id: string, offset: number, limit: number): Promise<string>;
  sourceInstalled(pkg: string, offset: number, limit: number): Promise<string>;
  sourceUpdates(pkg: string, offset: number, limit: number): Promise<string>;
  sourceRepos(pkg: string, offset: number, limit: number): Promise<string>;
  sourceAddRepo(pkg: string, url: string): Promise<void>;
  sourceAddRepoNamed(pkg: string, name: string, url: string): Promise<void>;
  sourceDelRepo(pkg: string, id: string): Promise<void>;
  sourceInstall(pkg: string, id: string, repo: string, operationId: string): Promise<void>;
  sourceCancel(pkg: string, operationId: string): Promise<void>;
  sourceRunning(pkg: string, operationId: string): Promise<boolean>;
  sourceUninstall(pkg: string, packageName: string, operationId: string): Promise<void>;
};
/** An installed store backend app. Preinstalled ones start enabled, others off. */
export type SourcePlugin = { package: string; service: string; label: string; preinstalled: boolean; enabled: boolean };
export type StoreEvent = { source?: string; operationId: string; phase: string; percent?: number; bytesDone?: number; bytesTotal?: number; result?: { ok?: boolean; error?: string; output?: string; operationId?: string } };
const Native = requireNativeModule<NativeApi>("MatonOSClient");
export const MatonOS = {
  startStubInstall: (ref: string, operationId?: string) => Native.startStubInstall(ref, operationId ?? null),
  startStubUpdate: (ref: string, operationId?: string) => Native.startStubUpdate(ref, operationId ?? null),
  launchStub: (appId: string) => Native.launchStub(appId),
  storeInstall: (ref: string, operationId: string) => Native.storeInstall(ref, operationId),
  storeUpdate: (ref: string, operationId: string) => Native.storeUpdate(ref, operationId),
  storeUninstall: (ref: string, operationId: string) => Native.storeUninstall(ref, operationId),
  storeListInstalled: () => Native.storeListInstalled(),
  storeListRemotes: () => Native.storeListRemotes(),
  sourcePlugins: () => Native.sourcePlugins(),
  getBrowseCache: (key: string) => Native.getBrowseCache(key),
  setBrowseCache: (key: string, value: string) => Native.setBrowseCache(key, value),
  sourceUnavailableOwners: () => Native.sourceUnavailableOwners(),
  setSourceEnabled: (pkg: string, enabled: boolean) => Native.setSourceEnabled(pkg, enabled),
  sourceInfo: (pkg: string) => Native.sourceInfo(pkg),
  sourceSearch: (pkg: string, term: string, offset: number, limit: number) => Native.sourceSearch(pkg, term, offset, limit),
  sourceCollection: (pkg: string, kind: "popular" | "new", offset: number, limit: number) => Native.sourceCollection(pkg, kind, offset, limit),
  sourcePopularApps: (pkg: string, limit: number) => Native.sourcePopularApps(pkg, limit),
  sourceSetRepoEnabled: (pkg: string, id: string, enabled: boolean) => Native.sourceSetRepoEnabled(pkg, id, enabled),
  describeAndroidPermissions: (names: string[]) => Native.describeAndroidPermissions(names),
  sourceIcon: (pkg: string) => Native.sourceIcon(pkg),
  launchAndroidApp: (packageName: string) => Native.launchAndroidApp(packageName),
  sourceDetails: (pkg: string, id: string, repo: string) => Native.sourceDetails(pkg, id, repo),
  sourceReviews: (pkg: string, id: string, offset: number, limit: number) => Native.sourceReviews(pkg, id, offset, limit),
  sourceInstalled: (pkg: string, offset: number, limit: number) => Native.sourceInstalled(pkg, offset, limit),
  sourceUpdates: (pkg: string, offset: number, limit: number) => Native.sourceUpdates(pkg, offset, limit),
  sourceRepos: (pkg: string, offset: number, limit: number) => Native.sourceRepos(pkg, offset, limit),
  sourceReposAll: async (pkg: string) => { const all: unknown[] = []; for (let offset = 0; ; offset += 100) { const page = JSON.parse(await Native.sourceRepos(pkg, offset, 100)) as unknown[]; all.push(...page); if (page.length < 100) return JSON.stringify(all); } },
  sourceAddRepo: (pkg: string, url: string) => Native.sourceAddRepo(pkg, url),
  sourceAddRepoNamed: (pkg: string, name: string, url: string) => Native.sourceAddRepoNamed(pkg, name, url),
  sourceDelRepo: (pkg: string, id: string) => Native.sourceDelRepo(pkg, id),
  sourceInstall: (pkg: string, id: string, repo: string, operationId: string) => Native.sourceInstall(pkg, id, repo, operationId),
  sourceCancel: (pkg: string, operationId: string) => Native.sourceCancel(pkg, operationId),
  sourceRunning: (pkg: string, operationId: string) => Native.sourceRunning(pkg, operationId),
  sourceUninstall: (pkg: string, packageName: string, operationId: string) => Native.sourceUninstall(pkg, packageName, operationId),
  addStoreListener: (listener: (event: StoreEvent) => void) => Native.addListener("linuxAppStoreEvent", listener),
};
