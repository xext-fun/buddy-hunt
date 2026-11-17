"use strict";

const ext = globalThis.browser || globalThis.chrome;
const $ = id => document.getElementById(id);
const KEY = "buddyHuntStateV1";
const PROFILES_KEY = "buddyHuntProfilesV1";
const ENABLED_KEY = "buddyHuntRecorderEnabledV1";
const HANDOFF_KEY = "buddyHuntChatGptHandoffV1";
const WATCHLIST_KEY = "buddyHuntWatchlistV1";
let state = { contacts: [], mode: "stopped", current: "" };
let recordedProfiles = [];
let watchlist = [];
let noticeTimer;

function call(api, method, ...args) {
  // Firefox and Safari expose Promise APIs; Chromium still accepts callbacks.
  if (globalThis.browser) return api[method](...args);
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error, value) => {
      if (done) return;
      done = true;
      error ? reject(error) : resolve(value);
    };
    try {
      const result = api[method](...args, value => {
        const error = ext.runtime && ext.runtime.lastError;
        finish(error ? new Error(error.message) : null, value);
      });
      if (result && typeof result.then === "function") result.then(value => finish(null, value), error => finish(error));
    } catch (error) { finish(error); }
  });
}

async function save() { await call(ext.storage.local, "set", { [KEY]: state }); }

function notify(message) {
  $("notice").textContent = message;
  $("notice").classList.add("show");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $("notice").classList.remove("show"), 4500);
}

function nextPending() { return state.contacts.find(item => item.status === "pending"); }

async function openContact(contact) {
  const url = contact.profileUrl || BuddyCore.searchUrl(contact);
  await call(ext.tabs, "create", { url });
}

async function advance() {
  // A status decision completes the current item and opens only one next search.
  if (state.mode !== "running") return;
  const next = nextPending();
  if (!next) {
    state.mode = "stopped";
    state.current = "";
    await save();
    render();
    notify("All contacts have been reviewed.");
    return;
  }
  state.current = next.email;
  await save();
  render();
  await openContact(next);
}

function button(label, className, handler) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.className = className;
  element.addEventListener("click", handler);
  return element;
}

function render() {
  const connected = state.contacts.filter(item => item.status === "connected").length;
  const remaining = state.contacts.filter(item => item.status === "pending").length;
  $("total").textContent = state.contacts.length;
  $("connected").textContent = connected;
  $("remaining").textContent = remaining;
  $("count-label").textContent = `${state.contacts.length} in list`;
  $("session-state").textContent = state.mode[0].toUpperCase() + state.mode.slice(1);
  $("session-state").className = "pill " + state.mode;
  $("start").textContent = state.mode === "paused" ? "Resume" : "Start";
  $("start").disabled = state.mode === "running" || !remaining;
  $("pause").disabled = state.mode !== "running";
  $("stop").disabled = state.mode === "stopped";

  const query = $("filter").value.trim().toLowerCase();
  const visible = state.contacts.filter(item => !query || item.email.includes(query) || item.name.toLowerCase().includes(query));
  $("empty").hidden = !!state.contacts.length;
  const list = $("list");
  list.replaceChildren();
  for (const contact of visible) {
    const li = document.createElement("li");
    li.className = "contact";
    const top = document.createElement("div");
    top.className = "contact-top";
    const identity = document.createElement("div");
    identity.className = "identity";
    const name = document.createElement("strong");
    name.textContent = contact.name || contact.email;
    const email = document.createElement("span");
    email.textContent = contact.name ? contact.email : (state.current === contact.email ? "Current contact" : "No name provided");
    identity.append(name, email);
    const status = document.createElement("span");
    status.className = "status " + contact.status;
    status.textContent = contact.status === "not_found" ? "Not found" : contact.status.replace("_", " ");
    top.append(identity, status);
    const actions = document.createElement("div");
    actions.className = "contact-actions";
    actions.append(
      button(contact.profileUrl ? "Open profile ↗" : "Search ↗", "search-link", () => openContact(contact).catch(showError)),
      button("Connected", "connected-button", () => setStatus(contact.email, "connected")),
      button("Reviewed", "", () => setStatus(contact.email, "reviewed")),
      button("Not found", "", () => setStatus(contact.email, "not_found")),
      button("Remove", "remove-button", () => removeContact(contact.email))
    );
    li.append(top, actions);
    list.append(li);
  }
}

function showError(error) { notify(error && error.message ? error.message : "Something went wrong."); }

async function setStatus(email, status) {
  const contact = state.contacts.find(item => item.email === email);
  if (!contact) return;
  contact.status = status;
  contact.updatedAt = new Date().toISOString();
  const wasCurrent = state.current === email;
  if (wasCurrent) state.current = "";
  await save();
  render();
  if (wasCurrent) await advance();
}

async function removeContact(email) {
  const wasCurrent = state.current === email;
  state.contacts = state.contacts.filter(item => item.email !== email);
  if (wasCurrent) state.current = "";
  await save();
  render();
  if (wasCurrent) await advance();
}

function download() {
  const blob = new Blob([BuddyCore.exportCsv(state.contacts)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "buddy-hunt-contacts.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function selectTab(name) {
  const profiles = name === "profiles";
  const watchlistSelected = name === "watchlist";
  $("contacts-view").hidden = profiles || watchlistSelected;
  $("profiles-view").hidden = !profiles;
  $("watchlist-view").hidden = !watchlistSelected;
  for (const [id, selected] of [["contacts-tab", !profiles && !watchlistSelected], ["profiles-tab", profiles], ["watchlist-tab", watchlistSelected]]) {
    $(id).classList.toggle("active", selected);
    $(id).setAttribute("aria-selected", String(selected));
  }
  if (profiles) renderProfiles();
  if (watchlistSelected) renderWatchlist();
}

function renderWatchlist() {
  $("watchlist-tab-count").textContent = watchlist.length;
  $("watchlist-count").textContent = `${watchlist.length} handle${watchlist.length === 1 ? "" : "s"}`;
  $("clear-watchlist").disabled = !watchlist.length;
  $("watchlist-empty").hidden = !!watchlist.length;
  const query = $("watchlist-filter").value.trim().toLowerCase();
  const list = $("watchlist-list");
  list.replaceChildren();
  for (const handle of watchlist.filter(value => value.includes(query))) {
    const row = document.createElement("li");
    row.className = "watchlist-item";
    const link = document.createElement("a");
    link.href = `https://www.linkedin.com/in/${encodeURIComponent(handle)}/`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `@${handle}`;
    row.append(link, button("Remove", "", () => {
      call(ext.storage.local, "set", { [WATCHLIST_KEY]: watchlist.filter(value => value !== handle) }).catch(showError);
    }));
    list.append(row);
  }
}

async function importWatchlist(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose a file smaller than 5 MB.");
  const format = file.name.toLowerCase().endsWith(".json") ? "json" : file.name.toLowerCase().endsWith(".csv") ? "csv" : "text";
  const parsed = BuddyCore.parseHandles(await file.text(), format);
  const existing = new Set(watchlist);
  for (const handle of parsed.handles) existing.add(handle);
  const added = existing.size - watchlist.length;
  await call(ext.storage.local, "set", { [WATCHLIST_KEY]: [...existing] });
  notify(`Added ${added} handle${added === 1 ? "" : "s"}.${parsed.invalid ? ` Skipped ${parsed.invalid} invalid entr${parsed.invalid === 1 ? "y" : "ies"}.` : ""}`);
}

function renderProfiles() {
  $("profile-tab-count").textContent = recordedProfiles.length;
  $("profile-count").textContent = `${recordedProfiles.length} unique`;
  $("download-profiles").disabled = !recordedProfiles.length;
  $("clear-profiles").disabled = !recordedProfiles.length;
  $("chatgpt-export-hint").textContent = recordedProfiles.length
    ? `${recordedProfiles.length} recorded profile${recordedProfiles.length === 1 ? "" : "s"} ready to upload. ChatGPT will deduplicate and merge them into Google Sheets.`
    : "Record LinkedIn profiles, then send them through ChatGPT to deduplicate and merge with an existing Sheet.";
  const query = $("profile-filter").value.trim().toLowerCase();
  const visible = recordedProfiles.filter(profile => !query ||
    [profile.name, profile.headline, profile.location, profile.company, profile.about, profile.experience, profile.education, profile.url, profile.visibleText]
      .some(value => String(value || "").toLowerCase().includes(query)));
  $("profiles-empty").hidden = !!recordedProfiles.length;
  const list = $("profiles-list");
  list.replaceChildren();
  for (const profile of visible) {
    const li = document.createElement("li");
    li.className = "profile";
    const name = document.createElement("a");
    name.href = BuddyCore.canonicalProfileUrl(profile.url);
    name.target = "_blank";
    name.rel = "noopener noreferrer";
    name.textContent = profile.name || profile.url;
    const heading = document.createElement("div");
    heading.className = "profile-heading";
    heading.append(name);
    const sources = Array.isArray(profile.sources) ? profile.sources : [];
    const sourceTypes = [...new Set(sources.map(item => item.type))];
    const badge = document.createElement("span");
    badge.className = "status";
    badge.textContent = `${sources.length} source${sources.length === 1 ? "" : "s"}`;
    heading.append(badge);
    li.append(heading);
    if (profile.headline) {
      const headline = document.createElement("p");
      headline.className = "profile-headline";
      headline.textContent = profile.headline;
      li.append(headline);
    }
    if (profile.company || profile.location || sourceTypes.length) {
      const meta = document.createElement("p");
      meta.className = "profile-meta";
      meta.textContent = [profile.company, profile.location, sourceTypes.join(", ")].filter(Boolean).join(" · ");
      li.append(meta);
    }
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Details and sources";
    details.append(summary);
    for (const [label, value] of [["About", profile.about], ["Experience", profile.experience], ["Education", profile.education]]) {
      if (!value) continue;
      const section = document.createElement("p");
      section.className = "profile-visible-text";
      section.textContent = `${label}: ${value}`;
      details.append(section);
    }
    if (profile.visibleText) {
      const excerpt = document.createElement("p");
      excerpt.className = "profile-visible-text";
      excerpt.textContent = profile.visibleText;
      details.append(excerpt);
    }
    const sourceList = document.createElement("ul");
    sourceList.className = "source-list";
    for (const source of sources) {
      const row = document.createElement("li");
      row.textContent = `${source.type || "other"} · seen ${source.count || 1} time${source.count === 1 ? "" : "s"} · `;
      const link = document.createElement("a");
      link.textContent = source.url;
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      row.append(link);
      sourceList.append(row);
    }
    details.append(sourceList);
    li.append(details);
    list.append(li);
  }
}

function downloadProfiles() {
  const data = { version: 1, exportedAt: new Date().toISOString(), profiles: recordedProfiles };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "buddy-hunt-profiles.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function sendToChatGpt() {
  const activeTabs = await call(ext.tabs, "query", { active: true, currentWindow: true });
  const active = activeTabs && activeTabs[0];
  if (active && /^https:\/\/([a-z0-9-]+\.)*linkedin\.com\//i.test(active.url || "")) {
    try { await call(ext.tabs, "sendMessage", active.id, { type: "buddyHuntCollectNow" }); }
    catch (error) { console.warn("Buddy Hunt current-page capture:", error); }
    const stored = await call(ext.storage.local, "get", PROFILES_KEY);
    recordedProfiles = Array.isArray(stored[PROFILES_KEY]) ? stored[PROFILES_KEY] : [];
    renderProfiles();
  }
  if (!recordedProfiles.length) {
    selectTab("profiles");
    notify("No handles recorded yet. Browse LinkedIn with profile recording on, then use this button.");
    return;
  }
  const handoff = BuddyCore.profileHandoff(recordedProfiles);
  await call(ext.storage.local, "set", { [HANDOFF_KEY]: { ...handoff, tabId: null, createdAt: Date.now() } });
  try {
    const tab = await call(ext.tabs, "create", { url: "https://chatgpt.com/" });
    await call(ext.storage.local, "set", { [HANDOFF_KEY]: { ...handoff, tabId: tab.id, createdAt: Date.now() } });
    notify("ChatGPT opened. The export and request are being prepared there.");
  } catch (error) {
    await call(ext.storage.local, "remove", HANDOFF_KEY);
    throw error;
  }
}

async function loadProfiles() {
  const stored = await call(ext.storage.local, "get", [PROFILES_KEY, ENABLED_KEY]);
  recordedProfiles = Array.isArray(stored[PROFILES_KEY]) ? stored[PROFILES_KEY] : [];
  $("record-enabled").checked = stored[ENABLED_KEY] !== false;
  renderProfiles();
}

async function importFile(file) {
  // Preserve existing local statuses when a later upload contains the same email.
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { notify("Choose a file smaller than 5 MB."); return; }
  const text = await file.text();
  let imported;
  if (file.name.toLowerCase().endsWith(".json")) {
    const data = JSON.parse(text);
    const records = Array.isArray(data) ? data : data.contacts;
    if (!Array.isArray(records)) throw new Error("JSON must contain a contacts array.");
    imported = records.map(BuddyCore.normalizeContact).filter(Boolean);
  } else imported = BuddyCore.parseContacts(text).contacts;
  const existing = new Map(state.contacts.map(item => [item.email, item]));
  let added = 0;
  for (const contact of imported) {
    if (!existing.has(contact.email)) { existing.set(contact.email, contact); added++; }
  }
  state.contacts = [...existing.values()];
  await save();
  render();
  notify(`Loaded ${added} new contact${added === 1 ? "" : "s"}.`);
}

async function loadSaved() {
  const saved = (await call(ext.storage.local, "get", KEY))[KEY];
  if (saved && Array.isArray(saved.contacts)) {
    state.contacts = saved.contacts.map(BuddyCore.normalizeContact).filter(Boolean);
    state.mode = ["running", "paused", "stopped"].includes(saved.mode) ? saved.mode : "stopped";
    state.current = typeof saved.current === "string" ? saved.current : "";
    if (state.mode === "running") state.mode = "paused";
  }
  render();
  return !!saved;
}

$("upload").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", event => {
  importFile(event.target.files[0]).catch(showError);
  event.target.value = "";
});
$("download").addEventListener("click", download);
$("load").addEventListener("click", () => loadSaved().then(found => notify(found ? "Saved list loaded." : "No saved list yet.")).catch(showError));
$("clear").addEventListener("click", async () => {
  if (!state.contacts.length || confirm("Clear all contacts and saved progress?")) {
    state = { contacts: [], mode: "stopped", current: "" };
    await save(); render(); notify("List cleared.");
  }
});
$("start").addEventListener("click", () => {
  state.mode = "running";
  state.current = "";
  advance().catch(showError);
});
$("pause").addEventListener("click", () => { state.mode = "paused"; save().then(render).catch(showError); });
$("stop").addEventListener("click", () => { state.mode = "stopped"; state.current = ""; save().then(render).catch(showError); });
$("filter").addEventListener("input", render);
$("contacts-tab").addEventListener("click", () => selectTab("contacts"));
$("profiles-tab").addEventListener("click", () => selectTab("profiles"));
$("watchlist-tab").addEventListener("click", () => selectTab("watchlist"));
$("watchlist-filter").addEventListener("input", renderWatchlist);
$("upload-watchlist").addEventListener("click", () => $("watchlist-file").click());
$("watchlist-file").addEventListener("change", event => {
  importWatchlist(event.target.files[0]).catch(showError);
  event.target.value = "";
});
$("clear-watchlist").addEventListener("click", () => {
  if (watchlist.length && confirm("Clear all highlighted handles?"))
    call(ext.storage.local, "set", { [WATCHLIST_KEY]: [] }).catch(showError);
});
$("profile-filter").addEventListener("input", renderProfiles);
$("record-enabled").addEventListener("change", event => {
  call(ext.storage.local, "set", { [ENABLED_KEY]: event.target.checked }).catch(showError);
});
$("download-profiles").addEventListener("click", downloadProfiles);
$("send-chatgpt").addEventListener("click", () => sendToChatGpt().catch(showError));
$("clear-profiles").addEventListener("click", () => {
  if (confirm("Clear all recorded profiles and source history?"))
    call(ext.storage.local, "set", { [PROFILES_KEY]: [] }).then(() => notify("Recorded profiles cleared.")).catch(showError);
});
ext.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[PROFILES_KEY]) {
    recordedProfiles = Array.isArray(changes[PROFILES_KEY].newValue) ? changes[PROFILES_KEY].newValue : [];
    renderProfiles();
  }
  if (changes[ENABLED_KEY]) $("record-enabled").checked = changes[ENABLED_KEY].newValue !== false;
  if (changes[WATCHLIST_KEY]) {
    watchlist = Array.isArray(changes[WATCHLIST_KEY].newValue) ? changes[WATCHLIST_KEY].newValue.map(BuddyCore.normalizeHandle).filter(Boolean) : [];
    renderWatchlist();
  }
});
loadSaved().catch(showError);
loadProfiles().catch(showError);
call(ext.storage.local, "get", WATCHLIST_KEY).then(stored => {
  watchlist = Array.isArray(stored[WATCHLIST_KEY]) ? [...new Set(stored[WATCHLIST_KEY].map(BuddyCore.normalizeHandle).filter(Boolean))] : [];
  renderWatchlist();
}).catch(showError);
