"use strict";

const ext = globalThis.browser || globalThis.chrome;
const $ = id => document.getElementById(id);
const KEY = "buddyHuntStateV1";
let state = { contacts: [], mode: "stopped", current: "" };
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
loadSaved().catch(showError);
