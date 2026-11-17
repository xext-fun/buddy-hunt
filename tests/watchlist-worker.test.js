const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const BuddyCore = require("../src/core.js");
const BuddyWatchlistMatcher = require("../src/watchlist-matcher.js");

test("worker parses 100,000 watchlist names and rejects overflow", async () => {
  const output = [];
  const self = { postMessage(value) { output.push(value); } };
  const code = fs.readFileSync(path.join(__dirname, "../src/watchlist-worker.js"), "utf8");
  vm.runInNewContext(code, { importScripts() {}, BuddyCore, BuddyWatchlistMatcher, self });
  const file = { name: "names.txt", async text() {
    return Array.from({ length: 100000 }, (_, index) => `Person ${String(index).padStart(6, "0")}`).join("\n");
  } };
  await self.onmessage({ data: { id: 1, type: "parse", file, existing: [] } });
  assert.equal(output[0].type, "entries");
  assert.equal(output[0].entries.length, 100000);
  await self.onmessage({ data: { id: 2, type: "profiles", existing: output[0].entries,
    profiles: [{ name: "Extra Person", url: "https://www.linkedin.com/in/extra-person/" }] } });
  assert.equal(output[1].type, "error");
  assert.match(output[1].message, /100,000/);
});
