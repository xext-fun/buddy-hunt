"use strict";

importScripts("core.js");

self.onmessage = async event => {
  const { id, type } = event.data || {};
  try {
    if (type === "parse") {
      const file = event.data.file;
      const format = file.name.toLowerCase().endsWith(".json") ? "json" : file.name.toLowerCase().endsWith(".csv") ? "csv" : "text";
      const parsed = BuddyCore.parseWatchlist(await file.text(), format);
      const existing = BuddyCore.normalizeWatchlist(event.data.existing);
      const entries = BuddyCore.normalizeWatchlist([...existing, ...parsed.entries]);
      if (entries.length > 100000) throw new Error("The Watchlist can contain up to 100,000 names and handles.");
      self.postMessage({ id, type: "entries", entries, added: entries.length - existing.length, invalid: parsed.invalid });
    } else if (type === "profiles") {
      const existing = BuddyCore.normalizeWatchlist(event.data.existing);
      const additions = BuddyCore.watchlistFromProfiles(event.data.profiles);
      const entries = BuddyCore.normalizeWatchlist([...existing, ...additions]);
      if (entries.length > 100000) throw new Error("The Watchlist can contain up to 100,000 names and handles.");
      self.postMessage({ id, type: "entries", entries, added: entries.length - existing.length });
    } else if (type === "remove") {
      const entry = event.data.entry;
      const entries = BuddyCore.normalizeWatchlist(event.data.existing).filter(item => item.type !== entry.type || item.value !== entry.value);
      self.postMessage({ id, type: "entries", entries });
    } else if (type === "normalize") {
      self.postMessage({ id, type: "entries", entries: BuddyCore.normalizeWatchlist(event.data.existing) });
    }
  } catch (error) {
    self.postMessage({ id, type: "error", message: error.message || "Watchlist processing failed." });
  }
};
