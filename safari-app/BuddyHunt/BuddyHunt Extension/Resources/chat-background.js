"use strict";

(() => {
  const ext = globalThis.browser || globalThis.chrome;
  const KEY = "buddyHuntOpenAiKeyV1";
  const HISTORY = "buddyHuntChatHistoryV1";
  let queue = Promise.resolve();

  function call(api, method, ...args) {
    if (globalThis.browser) return api[method](...args);
    return new Promise((resolve, reject) => api[method](...args, value => {
      const error = ext.runtime.lastError;
      error ? reject(new Error(error.message)) : resolve(value);
    }));
  }

  async function record(snapshot, sentText, proposedText) {
    const chat = BuddyChat.normalizeChat(snapshot);
    if (!chat) return { saved: false };
    const stored = await call(ext.storage.local, "get", HISTORY);
    const history = stored[HISTORY] && typeof stored[HISTORY] === "object" ? stored[HISTORY] : {};
    history[chat.id] = BuddyChat.mergeChat(history[chat.id], chat, sentText, proposedText);
    await call(ext.storage.local, "set", { [HISTORY]: history });
    return { saved: true };
  }

  async function draft(message) {
    const chat = BuddyChat.normalizeChat(message.chat);
    if (!chat || !chat.context) throw new Error("Focus a LinkedIn conversation with visible messages first.");
    await queue;
    const stored = await call(ext.storage.local, "get", [KEY, HISTORY]);
    const key = String(stored[KEY] || "").trim();
    if (!key) throw new Error("Add your OpenAI API key in Buddy Hunt’s Chats tab first.");
    const history = stored[HISTORY] && typeof stored[HISTORY] === "object" ? stored[HISTORY] : {};
    const prompt = BuddyChat.buildRequest(chat, history, message.mode, message.currentText, message.previousDraft);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let response;
    try { response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-6-luna", reasoning: { effort: "none" }, store: false,
        max_output_tokens: 350, instructions: prompt.instructions, input: prompt.input }),
      signal: controller.signal
    }); } finally { clearTimeout(timeout); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error && data.error.message || `OpenAI request failed (${response.status}).`);
    const text = BuddyChat.responseText(data);
    if (!text) throw new Error("OpenAI returned no message. Try again.");
    const saved = queue.then(() => record(chat));
    queue = saved.catch(() => {});
    await saved;
    return { text };
  }

  ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !["buddyHuntChatSnapshot", "buddyHuntChatDraft", "buddyHuntChatSent"].includes(message.type)) return;
    const url = sender.url || sender.tab && sender.tab.url || "";
    if (!/^https:\/\/([a-z0-9-]+\.)*linkedin\.com\//i.test(url)) return;
    let job;
    if (message.type === "buddyHuntChatDraft") job = draft(message);
    else {
      job = queue.then(() => record(message.chat, message.type === "buddyHuntChatSent" ? message.text : "", message.proposed));
      queue = job.catch(() => {});
    }
    if (globalThis.browser) return job;
    job.then(sendResponse, error => sendResponse({ error: error.message }));
    return true;
  });
})();
