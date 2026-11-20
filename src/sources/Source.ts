import type { AgeRating, AntiFeature, Safety } from "./Safety";
export type { AgeRating, AgeRatingCategory, ContentLevel, AntiFeature, Safety, SafetyItem, SafetyLevel, SafetySeverity } from "./Safety";

/** Built-in source name, or a plugin's package name. */
export type SourceName = string;

export type RepoOption = { repoId: string; name: string; version?: string; installable: boolean; note?: string };

/** What search(), installed() and updates() return: just enough for a list row. */
export type AppListing = {
  id: string;
  source: SourceName;
  /** Human-readable source name shown on listings; falls back to `source`. */
  sourceLabel?: string;
  /** Android package id when it differs from the source listing id. */
  packageName?: string;
  name: string;
  summary: string;
  icon: string;
  developer: string;
  /** Store-owned rating summary, attached after source data is loaded. */
  rating?: Rating;
  installed?: boolean;
  /** Latest version the source offers. */
  versionName?: string;
  /** Repository the listing came from. */
  origin?: string;
  repo?: string;
  candidates?: StoreApp[];
  repoOptions?: RepoOption[];
  badges?: Array<{ id: string; label: string; icon: string }>;
  canLaunch?: boolean;
};

/** What details() returns: everything known about one app. */
export type AppDetails = AppListing & {
  description: string;
  descriptionMarkdown?: string;
  screenshots: string[];
  permissions: string[];
  license?: string;
  homepage?: string;
  /** Bytes; undefined when the source does not say. */
  downloadSize?: number;
  installedSize?: number;
  /** What the app can do and how risky that is. */
  safety?: Safety;
  /** Safety annotations supplied by the backend. */
  antiFeatures?: AntiFeature[];
  /** Backend supplied age rating; undefined when the app declares none. */
  ageRating?: AgeRating;
};

/** Source-internal app record: details plus what install needs. Not part of the hook API. */
export type StoreApp = AppDetails & {
  ref: string;
  versionCode?: number;
  apkName?: string;
  apkSha256?: string;
  apkFiles?: Array<{ name: string; sha256: string }>;
  repository?: string;
  repo?: string;
  candidates?: StoreApp[];
  repoOptions?: RepoOption[];
  /** Source-neutral app key input and Android package to uninstall when it differs from id. */
  packageName?: string;
  sourceUnavailable?: boolean;
  added?: number | string;
};
export type ScoredApp = { app: StoreApp; score: number };

export function toListing(app: StoreApp): AppListing {
  return { id: app.id, source: app.source, name: app.name, summary: app.summary, icon: app.icon, developer: app.developer,
    rating: app.rating, installed: app.installed, versionName: app.versionName, packageName: app.packageName, origin: app.origin ?? app.repository,
    badges: app.badges, repoOptions: app.repoOptions, canLaunch: app.canLaunch };
}

export function toDetails(app: StoreApp): AppDetails {
  return { ...toListing(app), description: app.description, screenshots: app.screenshots, permissions: app.permissions,
    license: app.license, homepage: app.homepage, downloadSize: app.downloadSize, installedSize: app.installedSize,
    safety: app.safety, antiFeatures: app.antiFeatures, ageRating: app.ageRating, descriptionMarkdown: app.descriptionMarkdown };
}

export type Rating = { average: number; count: number; histogram: [number, number, number, number, number] };

export type Review = {
  id: string;
  author: string;
  rating: number; // 1–5
  summary: string;
  description: string;
  date: Date;
};

export type SourceProgress = { source?: SourceName; operationId?: string; phase?: string; percent?: number; bytesDone?: number; bytesTotal?: number; result?: { ok?: boolean; error?: string; output?: string; operationId?: string } };

export interface Source {
  readonly name: SourceName;
  readonly label?: string;
  readonly capabilities?: string[];
  searchPage(query: string, offset: number, limit: number): Promise<{ apps: StoreApp[]; hasMore: boolean }>;
  collection(kind: "popular" | "new", offset: number, limit: number): Promise<StoreApp[]>;
  getPopularApps?(limit: number): Promise<ScoredApp[]>;
  details(app: StoreApp): Promise<StoreApp>;
  installed(): Promise<StoreApp[]>;
  updates(): Promise<StoreApp[]>;
  install(app: StoreApp, operationId: string): Promise<void>;
  uninstall(app: StoreApp, operationId: string): Promise<void>;
  cancel?(operationId: string): Promise<void>;
  progress(listener: (event: SourceProgress) => void): { remove(): void };
}

export function unsupported(operation: string): Error {
  return new Error(`${operation} is not supported for this source yet.`);
}
