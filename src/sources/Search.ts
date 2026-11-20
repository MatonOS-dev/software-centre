import type { StoreApp } from "./Source";

export class DebouncedSearch {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: string | null = null;
  private dispatched: string | null = null;
  private readonly search: (query: string) => void;
  private readonly delayMs: number;

  constructor(search: (query: string) => void, delayMs = 250) {
    this.search = search;
    this.delayMs = delayMs;
  }

  schedule(value: string): boolean {
    const query = value.trim();
    if (!query) {
      const hadQuery = this.pending !== null || this.dispatched !== null;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.pending = null;
      this.dispatched = null;
      return hadQuery;
    }
    if (query === this.pending) return false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (query === this.dispatched) {
      this.pending = null;
      return false;
    }
    this.pending = query;
    this.timer = setTimeout(() => {
      this.timer = null;
      const next = this.pending;
      this.pending = null;
      if (!next || next === this.dispatched) return;
      this.dispatched = next;
      this.search(next);
    }, this.delayMs);
    return true;
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }
}

function matchQuality(app: StoreApp, query: string): number {
  const name = app.name.toLocaleLowerCase();
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "u").test(name)) return 2;
  const text = `${app.summary} ${app.description}`.toLocaleLowerCase();
  return text.includes(query) ? 3 : 4;
}

/** Sorts by match quality while preserving each source's own result order. */
export function rankSearchResults(lists: StoreApp[][], term: string): StoreApp[] {
  const query = term.trim().toLocaleLowerCase();
  const ordered: StoreApp[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let sourceOrder = 0; sourceOrder < longest; sourceOrder++) {
    for (const list of lists) if (sourceOrder < list.length) ordered.push(list[sourceOrder]);
  }
  return ordered.map((app, originalOrder) => ({ app, originalOrder, quality: matchQuality(app, query) }))
    .sort((left, right) => left.quality - right.quality || left.originalOrder - right.originalOrder).map(({ app }) => app);
}
