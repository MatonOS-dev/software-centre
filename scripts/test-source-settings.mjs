import assert from "node:assert/strict";
import { actionArguments, settingChildren } from "../src/sources/SourceSettings.ts";

const account = {
  id: "account", label: "Account", type: "group",
  children: [
    { id: "account-status", label: "Status", type: "text", value: "Not signed in", readOnly: true },
    { id: "sign-in", label: "Sign in", type: "action", fields: [] },
    { id: "sign-out", label: "Sign out", type: "action", fields: [] },
  ],
};
assert.deepEqual(settingChildren(account).map((row) => row.type), ["text", "action", "action"]);
assert.equal(settingChildren(account)[0].value, "Not signed in");
const addFields = [{ id: "url", label: "URL", type: "text" }, { id: "name", label: "Name", type: "text" }];
assert.deepEqual(actionArguments(addFields, { name: "Example", url: "https://example.test" }), ["https://example.test", "Example"]);
assert.deepEqual(actionArguments([], {}), []);
console.log("Source settings contract/store fixture: PASS (Account group, status, field ordering)");
