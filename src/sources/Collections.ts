import type { ScoredApp, StoreApp } from "./Source";

/** Round-robin merge so each source's best matches appear near the top. */
export function interleave(lists: StoreApp[][]): StoreApp[] {
  const merged: StoreApp[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let index = 0; index < longest; index++) {
    for (const list of lists) if (index < list.length) merged.push(list[index]);
  }
  return merged;
}

export function mergePopular(lists: ScoredApp[][]): StoreApp[] {
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

export function mergeNew(lists: StoreApp[][]): StoreApp[] {
  return lists.flatMap((apps, sourceIndex) => apps.map((app, index) => ({ app, sourceIndex, index, added: appAdded(app) })))
    .sort((left, right) => {
      if (left.added && right.added && left.added !== right.added) return right.added - left.added;
      if (left.added && !right.added) return -1;
      if (!left.added && right.added) return 1;
      return left.index - right.index || left.sourceIndex - right.sourceIndex;
    }).map((entry) => entry.app);
}
