import { requireNativeModule, type EventSubscription } from "expo-modules-core";

type NativeApi = {
  addListener(name: "linuxAppStoreEvent", listener: (event: StoreEvent) => void): EventSubscription;
  sourcePlugins(): Promise<SourcePlugin[]>;
  getBrowseCache(key: string): Promise<string | null>;
  setBrowseCache(key: string, value: string): Promise<void>;
  accountSession(): Promise<{ token: string; machineId: string }>;
  invalidateAccountSession(token: string): boolean;
  sourceUnavailableOwners(): Promise<string>;
  isLiveImage(): Promise<boolean>;
  setSourceEnabled(pkg: string, enabled: boolean): Promise<void>;
  sourceInfo(pkg: string): Promise<string>;
  sourceQuery(pkg: string, kind: string, term: string, offset: number, limit: number): Promise<string>;
  sourceRepositories(pkg: string): Promise<string>;
  sourceSettings(pkg: string): Promise<string>;
  sourceSetSetting(pkg: string, id: string, value: string | null): Promise<string | null>;
  sourceRunAction(pkg: string, id: string, values: string[], confirmed: boolean): Promise<string>;
  describeAndroidPermissions(names: string[]): Promise<string>;
  sourceIcon(pkg: string): Promise<string | null>;
  launchAndroidApp(packageName: string): Promise<boolean>;
  sourceDetails(pkg: string, id: string, repo: string): Promise<string>;
  sourceReviews(pkg: string, id: string, offset: number, limit: number): Promise<string>;
  sourceInstall(pkg: string, id: string, repo: string, operationId: string): Promise<void>;
  sourceCancel(pkg: string, operationId: string): Promise<void>;
  sourceRunning(pkg: string, operationId: string): Promise<boolean>;
  sourceUninstall(pkg: string, packageName: string, operationId: string): Promise<void>;
};
/** An installed store backend app. Preinstalled ones start enabled, others off. */
export type StoreEvent = { source?: string; operationId: string; phase: string; percent?: number; bytesDone?: number; bytesTotal?: number; result?: { ok?: boolean; error?: string; output?: string; operationId?: string } };
export type SourcePlugin = { package: string; service: string; label: string; description?: string; preinstalled: boolean; enabled: boolean };
const Native = requireNativeModule<NativeApi>("MatonOSClient");
export const MatonOS = {
  addStoreListener: (listener: (event: StoreEvent) => void) => Native.addListener("linuxAppStoreEvent", listener),
  sourcePlugins: () => Native.sourcePlugins(),
  getBrowseCache: (key: string) => Native.getBrowseCache(key),
  setBrowseCache: (key: string, value: string) => Native.setBrowseCache(key, value),
  accountSession: () => Native.accountSession(),
  invalidateAccountSession: (token: string) => Native.invalidateAccountSession(token),
  sourceUnavailableOwners: () => Native.sourceUnavailableOwners(),
  isLiveImage: () => Native.isLiveImage(),
  setSourceEnabled: (pkg: string, enabled: boolean) => Native.setSourceEnabled(pkg, enabled),
  sourceInfo: (pkg: string) => Native.sourceInfo(pkg),
  sourceQuery: (pkg: string, kind: string, term: string, offset: number, limit: number) => Native.sourceQuery(pkg, kind, term, offset, limit),
  sourceRepositories: (pkg: string) => Native.sourceRepositories(pkg),
  sourceSettings: (pkg: string) => Native.sourceSettings(pkg),
  sourceSetSetting: (pkg: string, id: string, value: string | null) => Native.sourceSetSetting(pkg, id, value),
  sourceRunAction: (pkg: string, id: string, values: string[], confirmed = false) => Native.sourceRunAction(pkg, id, values, confirmed),
  describeAndroidPermissions: (names: string[]) => Native.describeAndroidPermissions(names),
  sourceIcon: (pkg: string) => Native.sourceIcon(pkg),
  launchAndroidApp: (packageName: string) => Native.launchAndroidApp(packageName),
  sourceDetails: (pkg: string, id: string, repo: string) => Native.sourceDetails(pkg, id, repo),
  sourceReviews: (pkg: string, id: string, offset: number, limit: number) => Native.sourceReviews(pkg, id, offset, limit),
  sourceInstall: (pkg: string, id: string, repo: string, operationId: string) => Native.sourceInstall(pkg, id, repo, operationId),
  sourceCancel: (pkg: string, operationId: string) => Native.sourceCancel(pkg, operationId),
  sourceRunning: (pkg: string, operationId: string) => Native.sourceRunning(pkg, operationId),
  sourceUninstall: (pkg: string, packageName: string, operationId: string) => Native.sourceUninstall(pkg, packageName, operationId),
};
