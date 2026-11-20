import { DebouncedSearch, rankSearchResults } from "../src/sources/Search.ts";

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function app(name, summary = "", description = "") {
  return { id: name, name, summary, description, source: "test", icon: "", developer: "", ref: name };
}

const ranked = rankSearchResults([
  [app("Etar - Calendar"), app("A Better Etar", "calendar")],
  [app("Calendar", "Etar is a calendar"), app("Etar")],
], "Etar");
check(ranked.map((entry) => entry.name).join("|") === "Etar|Etar - Calendar|A Better Etar|Calendar",
  "exact name, prefix, word, then summary matches retain source order");

const calls = [];
const search = new DebouncedSearch((query) => calls.push(query), 10);
search.schedule(" Etar ");
search.schedule("Etar");
await new Promise((resolve) => setTimeout(resolve, 25));
search.schedule("Etar");
await new Promise((resolve) => setTimeout(resolve, 25));
check(calls.join("|") === "Etar", "one search dispatch for duplicate input and submit events");
search.schedule("");
search.schedule("Etar");
await new Promise((resolve) => setTimeout(resolve, 25));
check(calls.join("|") === "Etar|Etar", "clearing and re-entering permits a new query");
search.cancel();
console.log("Search ranking and single-dispatch tests passed");
