"use strict";

(() => {
  const ext = globalThis.browser || globalThis.chrome;
  const KEY = "buddyHuntWatchlistV1";
  const excluded = "script, style, noscript, textarea, input, select, option, button, [contenteditable], [data-buddy-hunt-text]";
  const linkSelector = 'a[href*="/in/"], a[href*="/pub/"]';
  const style = document.createElement("style");
  style.textContent = ".buddy-hunt-match{outline:3px solid #16a765!important;outline-offset:2px!important;border-radius:3px!important;background:rgba(22,167,101,.13)!important;box-decoration-break:clone!important;-webkit-box-decoration-break:clone!important}";
  (document.head || document.documentElement).append(style);

  let version = 0;
  let handles = new Set();
  let ready = false;
  let fallback = null;
  let textCache = new WeakMap();
  let roots = new Set();
  let flushTimer;

  function call(api, method, ...args) {
    if (globalThis.browser) return api[method](...args);
    return new Promise((resolve, reject) => api[method](...args, value => {
      const error = ext.runtime.lastError;
      error ? reject(new Error(error.message)) : resolve(value);
    }));
  }

  function accept(node) {
    return !!node.nodeValue && !!node.nodeValue.trim() && !!node.parentElement && !node.parentElement.closest(excluded);
  }

  function highlightLink(anchor) {
    const matched = handles.has(BuddyCore.normalizeHandle(anchor.href));
    if (matched) {
      anchor.classList.add("buddy-hunt-match");
      anchor.setAttribute("data-buddy-hunt-link", "");
    } else if (anchor.hasAttribute("data-buddy-hunt-link")) {
      anchor.classList.remove("buddy-hunt-match");
      anchor.removeAttribute("data-buddy-hunt-link");
    }
  }

  function applyMatches(node, original, matches) {
    if (!matches.length || !node.isConnected || node.nodeValue !== original || !accept(node)) return;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const [start, end] of matches) {
      if (start < cursor || end > original.length) continue;
      if (start > cursor) fragment.append(document.createTextNode(original.slice(cursor, start)));
      const mark = document.createElement("span");
      mark.className = "buddy-hunt-match";
      mark.setAttribute("data-buddy-hunt-text", "");
      mark.textContent = original.slice(start, end);
      fragment.append(mark);
      cursor = end;
    }
    if (!cursor) return;
    if (cursor < original.length) fragment.append(document.createTextNode(original.slice(cursor)));
    node.replaceWith(fragment);
  }

  function useFallback() {
    if (fallback) return;
    fallback = BuddyWatchlistMatcher.createMatcher(BuddyCore.normalizeWatchlist(currentEntries));
    ready = true;
    textCache = new WeakMap();
    queueRoot(document.body);
  }

  let currentEntries = [];
  function setWatchlist(values) {
    currentEntries = Array.isArray(values) ? values : [];
    version++;
    ready = false;
    fallback = null;
    textCache = new WeakMap();
    handles = new Set();
    for (const entry of currentEntries) {
      const handle = typeof entry === "string" ? BuddyCore.normalizeHandle(entry) : entry && entry.type === "handle" ? BuddyCore.normalizeHandle(entry.value) : "";
      if (handle) handles.add(handle);
    }
    for (const mark of document.querySelectorAll("span.buddy-hunt-match[data-buddy-hunt-text]"))
      mark.replaceWith(document.createTextNode(mark.textContent));
    for (const anchor of document.querySelectorAll("a.buddy-hunt-match[data-buddy-hunt-link]")) {
      anchor.classList.remove("buddy-hunt-match");
      anchor.removeAttribute("data-buddy-hunt-link");
    }
    if (!currentEntries.length) { roots.clear(); return; }
    const currentVersion = version;
    call(ext.runtime, "sendMessage", { type: "buddyHuntWatchlistReady" }).then(result => {
      if (currentVersion !== version) return;
      if (result && result.error) throw new Error(result.error);
      ready = true;
      queueRoot(document.body);
    }).catch(() => { if (currentVersion === version) useFallback(); });
  }

  function queueRoot(node) {
    if (!node || !currentEntries.length) return;
    roots.add(node);
    if (!flushTimer && ready) flushTimer = setTimeout(flush, 35);
  }

  function flush() {
    flushTimer = null;
    if (!ready || !document.body) return;
    const scan = roots.has(document.body) ? [document.body] : [...roots];
    roots.clear();
    const items = [];
    const addText = node => {
      if (!accept(node) || textCache.get(node) === node.nodeValue) return;
      textCache.set(node, node.nodeValue);
      items.push({ node, text: node.nodeValue });
    };
    for (const root of scan) {
      if (!root.isConnected) continue;
      if (root.nodeType === Node.TEXT_NODE) { addText(root); continue; }
      if (root.nodeType !== Node.ELEMENT_NODE) continue;
      if (handles.size) {
        if (root.matches && root.matches(linkSelector)) highlightLink(root);
        for (const anchor of root.querySelectorAll(linkSelector)) highlightLink(anchor);
      }
      if (root.matches && root.matches(excluded)) continue;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) addText(walker.currentNode);
    }
    for (let offset = 0; offset < items.length;) {
      const batch = [];
      let characters = 0;
      while (offset < items.length && batch.length < 150 && (characters < 50000 || !batch.length)) {
        const item = items[offset++];
        batch.push(item);
        characters += item.text.length;
      }
      if (fallback) {
        for (const item of batch) applyMatches(item.node, item.text, fallback.matches(item.text));
      } else {
        const currentVersion = version;
        call(ext.runtime, "sendMessage", { type: "buddyHuntWatchlistMatch", items: batch.map((item, index) => ({ id: index, text: item.text })) })
          .then(response => {
            if (currentVersion !== version) return;
            if (response && response.error) throw new Error(response.error);
            for (const result of response.results || []) {
              const item = batch[result.id];
              if (item) applyMatches(item.node, item.text, result.matches);
            }
          }).catch(() => { if (currentVersion === version) useFallback(); });
      }
    }
  }

  ext.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KEY]) setWatchlist(changes[KEY].newValue);
  });
  call(ext.storage.local, "get", KEY).then(stored => setWatchlist(stored[KEY])).catch(error => console.error("Buddy Hunt watchlist:", error));
  new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") queueRoot(mutation.target);
      else if (mutation.type === "attributes") queueRoot(mutation.target);
      else for (const node of mutation.addedNodes) queueRoot(node);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href"] });
  window.addEventListener("popstate", () => queueRoot(document.body));
  window.addEventListener("hashchange", () => queueRoot(document.body));
})();
