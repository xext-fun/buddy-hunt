"use strict";

const recorderExt = globalThis.browser || globalThis.chrome;
const PROFILES_KEY = "buddyHuntProfilesV1";
const ENABLED_KEY = "buddyHuntRecorderEnabledV1";
const HANDOFF_KEY = "buddyHuntChatGptHandoffV1";
let recorderQueue = Promise.resolve();

function recorderCall(api, method, ...args) {
  if (globalThis.browser) return api[method](...args);
  return new Promise((resolve, reject) => api[method](...args, value => {
    const error = recorderExt.runtime.lastError;
    error ? reject(new Error(error.message)) : resolve(value);
  }));
}

async function recordProfiles(items) {
  const stored = await recorderCall(recorderExt.storage.local, "get", [PROFILES_KEY, ENABLED_KEY]);
  if (stored[ENABLED_KEY] === false) return { recorded: 0 };
  const profiles = Array.isArray(stored[PROFILES_KEY]) ? stored[PROFILES_KEY] : [];
  const byUrl = new Map(profiles.map(profile => [profile.url, profile]));
  let recorded = 0;
  for (const item of items.slice(0, 250)) {
    const url = BuddyCore.canonicalProfileUrl(item && item.url);
    if (!url) continue;
    const merged = BuddyCore.mergeProfile(byUrl.get(url), item);
    if (merged) { byUrl.set(url, merged); recorded++; }
  }
  if (recorded) await recorderCall(recorderExt.storage.local, "set", { [PROFILES_KEY]: [...byUrl.values()] });
  return { recorded };
}

recorderExt.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "buddyHuntGetChatGptHandoff") {
    const job = recorderCall(recorderExt.storage.local, "get", HANDOFF_KEY).then(stored => {
      const handoff = stored[HANDOFF_KEY];
      return handoff && sender.tab && handoff.tabId === sender.tab.id &&
        Date.now() - handoff.createdAt < 10 * 60 * 1000 ? handoff : null;
    });
    if (globalThis.browser) return job;
    job.then(sendResponse, () => sendResponse(null));
    return true;
  }
  if (!message || message.type !== "buddyHuntRecordProfiles" || !Array.isArray(message.profiles)) return;
  const senderUrl = sender.url || sender.tab && sender.tab.url || "";
  if (!/^https:\/\/([a-z0-9-]+\.)*linkedin\.com\//i.test(senderUrl)) return;
  const items = message.profiles.map(item => ({
    ...item,
    sourceUrl: /^https:\/\/([a-z0-9-]+\.)*linkedin\.com\//i.test(item && item.sourceUrl || "") ? item.sourceUrl : senderUrl
  }));
  const job = recorderQueue.then(() => recordProfiles(items));
  recorderQueue = job.catch(error => console.error("Buddy Hunt recorder:", error));
  if (globalThis.browser) return job;
  job.then(sendResponse, error => sendResponse({ error: error.message }));
  return true;
});
