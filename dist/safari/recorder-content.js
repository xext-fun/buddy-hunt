"use strict";

(() => {
  const ext = globalThis.browser || globalThis.chrome;
  const ENABLED_KEY = "buddyHuntRecorderEnabledV1";
  const WATCHLIST_KEY = "buddyHuntWatchlistV1";
  let enabled = false;
  let watchlist = [];
  let highlightPattern = null;
  let timer;
  let pageUrl = location.href;
  const sent = new Map();
  const style = document.createElement("style");
  style.textContent = ".buddy-hunt-match{outline:3px solid #16a765!important;outline-offset:2px!important;border-radius:3px!important;background:rgba(22,167,101,.13)!important;box-decoration-break:clone!important;-webkit-box-decoration-break:clone!important}";
  (document.head || document.documentElement).append(style);

  function call(api, method, ...args) {
    if (globalThis.browser) return api[method](...args);
    return new Promise((resolve, reject) => api[method](...args, value => {
      const error = ext.runtime.lastError;
      error ? reject(new Error(error.message)) : resolve(value);
    }));
  }

  function text(node, limit = 2000) {
    return String(node && (node.innerText === undefined ? node.textContent : node.innerText) || "").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function firstText(root, selectors, limit) {
    for (const selector of selectors) {
      const value = text(root && root.querySelector(selector), limit);
      if (value) return value;
    }
    return "";
  }

  function profileSection(main, id, limit = 8000) {
    const heading = main && main.querySelector(`#${id}`);
    const section = heading && heading.closest("section");
    return text(section, limit);
  }

  function ownProfile(main, url) {
    const top = main && (main.querySelector(".pv-top-card, .pv-text-details__left-panel") || main);
    const image = top && top.querySelector("img.profile-photo-edit__preview, img.pv-top-card-profile-picture__image, img[alt]");
    const experience = profileSection(main, "experience");
    const topOrganization = firstText(top, [
      ".pv-text-details__right-panel li:first-child a",
      ".pv-text-details__right-panel li:first-child"
    ], 300);
    const experienceSection = main.querySelector("#experience")?.closest("section");
    const experienceCompany = firstText(experienceSection, [
      ".pvs-list__paged-list-item:first-child .t-14.t-normal",
      ".pvs-entity .t-14.t-normal"
    ], 300);
    const company = topOrganization && (!experience || experience.toLowerCase().includes(topOrganization.toLowerCase()))
      ? topOrganization : experienceCompany;
    return {
      url,
      sourceUrl: location.href,
      name: firstText(top, ["h1"], 300) || firstText(main, ["h1"], 300),
      headline: firstText(top, [".pv-text-details__left-panel .text-body-medium", ".text-body-medium", "[data-test-id='headline']"], 500),
      location: firstText(top, [".pv-text-details__left-panel .text-body-small", ".text-body-small"], 300),
      company,
      about: profileSection(main, "about", 8000),
      experience,
      education: profileSection(main, "education", 8000),
      imageUrl: image && /^https?:\/\//.test(image.src) ? image.src : "",
      visibleText: text(main, 30000)
    };
  }

  function cardFor(anchor) {
    const card = anchor.closest(".entity-result, .mn-connection-card, .update-components-actor, .feed-shared-actor, .comments-comment-item, .artdeco-card, li, article, [data-view-name], .feed-shared-update-v2");
    if (card && text(card, 5000).length <= 4000) return card;
    return anchor.parentElement;
  }

  function setWatchlist(values) {
    watchlist = BuddyCore.normalizeWatchlist(values);
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const terms = watchlist.map(entry => entry.type === "handle" ? `@${entry.value}` : entry.value)
      .sort((a, b) => b.length - a.length).map(escape);
    highlightPattern = terms.length ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${terms.join("|")})(?![\\p{L}\\p{N}_])`, "giu") : null;
    for (const mark of document.querySelectorAll("span.buddy-hunt-match[data-buddy-hunt-text]"))
      mark.replaceWith(document.createTextNode(mark.textContent));
    for (const anchor of document.querySelectorAll("a.buddy-hunt-match[data-buddy-hunt-link]")) {
      anchor.classList.remove("buddy-hunt-match");
      anchor.removeAttribute("data-buddy-hunt-link");
    }
    schedule();
  }

  function highlightMatches() {
    const handles = new Set(watchlist.filter(entry => entry.type === "handle").map(entry => entry.value));
    for (const anchor of document.querySelectorAll("a.buddy-hunt-match[data-buddy-hunt-link]")) {
      if (handles.has(BuddyCore.normalizeHandle(anchor.href))) continue;
      anchor.classList.remove("buddy-hunt-match");
      anchor.removeAttribute("data-buddy-hunt-link");
    }
    for (const anchor of document.querySelectorAll('a[href*="/in/"], a[href*="/pub/"]')) {
      if (!handles.has(BuddyCore.normalizeHandle(anchor.href)) || anchor.hasAttribute("data-buddy-hunt-link")) continue;
      anchor.classList.add("buddy-hunt-match");
      anchor.setAttribute("data-buddy-hunt-link", "");
    }
    if (!highlightPattern || !document.body) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest("script, style, noscript, textarea, input, select, option, button, [contenteditable], [data-buddy-hunt-text], [data-buddy-hunt-link]"))
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const value = node.nodeValue;
      highlightPattern.lastIndex = 0;
      const matches = [...value.matchAll(highlightPattern)];
      if (!matches.length) continue;
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      for (const match of matches) {
        if (match.index > cursor) fragment.append(document.createTextNode(value.slice(cursor, match.index)));
        const mark = document.createElement("span");
        mark.className = "buddy-hunt-match";
        mark.setAttribute("data-buddy-hunt-text", "");
        mark.textContent = match[0];
        fragment.append(mark);
        cursor = match.index + match[0].length;
      }
      if (cursor < value.length) fragment.append(document.createTextNode(value.slice(cursor)));
      node.replaceWith(fragment);
    }
  }

  function collect() {
    highlightMatches();
    if (!enabled) return Promise.resolve();
    if (pageUrl !== location.href) { pageUrl = location.href; sent.clear(); }
    const profiles = new Map();
    const ownUrl = BuddyCore.canonicalProfileUrl(location.href);
    if (ownUrl) {
      const main = document.querySelector("main");
      if (main) profiles.set(ownUrl, ownProfile(main, ownUrl));
    }
    for (const anchor of document.querySelectorAll('a[href*="/in/"], a[href*="/pub/"]')) {
      const url = BuddyCore.canonicalProfileUrl(anchor.href);
      if (!url) continue;
      if (url === ownUrl && profiles.has(url)) continue;
      const card = cardFor(anchor);
      const image = card && card.querySelector("img");
      const heading = anchor.querySelector("strong, span[aria-hidden='true']") || anchor;
      const name = text(heading, 300) || (image && image.alt) || "";
      const lines = card ? text(card, 4000) : "";
      const ownPage = url === ownUrl;
      const profile = {
        url,
        sourceUrl: location.href,
        name: ownPage ? text(document.querySelector("main h1, h1"), 300) || name : name,
        headline: ownPage ? text(document.querySelector("main .text-body-medium"), 500) : firstText(card, [".entity-result__primary-subtitle", ".mn-connection-card__occupation", ".update-components-actor__description", ".feed-shared-actor__description"], 500),
        location: ownPage ? text(document.querySelector("main .text-body-small"), 300) : firstText(card, [".entity-result__secondary-subtitle"], 300),
        company: "",
        about: "",
        experience: "",
        education: "",
        imageUrl: image && /^https?:\/\//.test(image.src) ? image.src : "",
        visibleText: ownPage ? text(document.querySelector("main"), 30000) : lines
      };
      const previous = profiles.get(url);
      if (!previous || profile.visibleText.length > previous.visibleText.length) profiles.set(url, profile);
    }
    const batch = [];
    for (const profile of profiles.values()) {
      const fingerprint = JSON.stringify(profile);
      if (sent.get(profile.url) !== fingerprint) { sent.set(profile.url, fingerprint); batch.push(profile); }
    }
    const jobs = [];
    for (let index = 0; index < batch.length; index += 100)
      jobs.push(call(ext.runtime, "sendMessage", { type: "buddyHuntRecordProfiles", profiles: batch.slice(index, index + 100) }));
    return Promise.all(jobs);
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; collect().catch(error => console.error("Buddy Hunt recorder:", error)); }, 700);
  }

  ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "buddyHuntCollectNow") return;
    const job = collect().then(() => ({ collected: true }));
    if (globalThis.browser) return job;
    job.then(sendResponse, error => sendResponse({ error: error.message }));
    return true;
  });

  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[WATCHLIST_KEY]) {
      setWatchlist(changes[WATCHLIST_KEY].newValue);
    }
    if (changes[ENABLED_KEY]) {
      enabled = changes[ENABLED_KEY].newValue !== false;
      sent.clear();
      if (enabled) schedule();
    }
  });
  call(ext.storage.local, "get", [ENABLED_KEY, WATCHLIST_KEY]).then(result => {
    enabled = result[ENABLED_KEY] !== false;
    setWatchlist(result[WATCHLIST_KEY]);
    schedule();
  }).catch(error => console.error("Buddy Hunt recorder:", error));
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href"] });
  window.addEventListener("popstate", schedule);
  window.addEventListener("hashchange", schedule);
  window.addEventListener("scroll", schedule, { passive: true });
})();
