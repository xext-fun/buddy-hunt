const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const BuddyCore = require("../src/core.js");
const BuddyWatchlistMatcher = require("../src/watchlist-matcher.js");

test("background matching rebuilds after storage changes and service worker startup", async () => {
  let messageListener;
  let storageListener;
  const stored = { buddyHuntWatchlistV1: [{ type: "name", value: "Jane Doe" }] };
  const browser = {
    runtime: { onMessage: { addListener(fn) { messageListener = fn; } } },
    storage: { local: { async get(key) { return { [key]: stored[key] }; } }, onChanged: { addListener(fn) { storageListener = fn; } } }
  };
  const code = fs.readFileSync(path.join(__dirname, "../src/watchlist-background.js"), "utf8");
  vm.runInNewContext(code, { browser, BuddyCore, BuddyWatchlistMatcher, console });
  const sender = { url: "https://www.linkedin.com/feed/" };
  const items = [{ id: 0, text: "Meet Jane Doe" }];
  const first = await messageListener({ type: "buddyHuntWatchlistMatch", items }, sender);
  assert.equal(first.results[0].matches.length, 1);
  stored.buddyHuntWatchlistV1 = [{ type: "name", value: "Grace Hopper" }];
  storageListener({ buddyHuntWatchlistV1: { newValue: stored.buddyHuntWatchlistV1 } }, "local");
  await messageListener({ type: "buddyHuntWatchlistReady" }, sender);
  const second = await messageListener({ type: "buddyHuntWatchlistMatch", items: [{ id: 0, text: "Grace Hopper and Jane Doe" }] }, sender);
  assert.equal(second.results[0].matches.length, 1);
  assert.equal(messageListener({ type: "buddyHuntWatchlistMatch", items }, { url: "https://example.com" }), undefined);
});
