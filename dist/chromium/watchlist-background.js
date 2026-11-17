"use strict";

(() => {
  const ext = globalThis.browser || globalThis.chrome;
  const KEY = "buddyHuntWatchlistV1";
  let matcher = BuddyWatchlistMatcher.createMatcher([]);
  let build = Promise.resolve();
  let initialized = false;
  let loading = null;

  function call(api, method, ...args) {
    if (globalThis.browser) return api[method](...args);
    return new Promise((resolve, reject) => api[method](...args, value => {
      const error = ext.runtime.lastError;
      error ? reject(new Error(error.message)) : resolve(value);
    }));
  }

  function rebuild(values) {
    const job = build.then(() => { matcher = BuddyWatchlistMatcher.createMatcher(BuddyCore.normalizeWatchlist(values)); initialized = true; });
    build = job.catch(() => {});
    return job;
  }

  function ensure() {
    if (initialized) return build;
    if (!loading) loading = call(ext.storage.local, "get", KEY).then(stored => rebuild(stored[KEY])).finally(() => { loading = null; });
    return loading;
  }

  ext.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KEY]) rebuild(changes[KEY].newValue).catch(error => console.error("Buddy Hunt watchlist index:", error));
  });

  ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !["buddyHuntWatchlistReady", "buddyHuntWatchlistMatch"].includes(message.type)) return;
    const url = sender.url || sender.tab && sender.tab.url || "";
    if (!/^https:\/\/([a-z0-9-]+\.)*linkedin\.com\//i.test(url)) return;
    const job = message.type === "buddyHuntWatchlistReady"
      ? call(ext.storage.local, "get", KEY).then(stored => rebuild(stored[KEY])).then(() => ({ ready: true }))
      : ensure().then(() => ({ results: (Array.isArray(message.items) ? message.items.slice(0, 150) : []).map(item => ({ id: item.id, matches: matcher.matches(item.text) })) }));
    if (globalThis.browser) return job;
    job.then(sendResponse, error => sendResponse({ error: error.message }));
    return true;
  });
})();
