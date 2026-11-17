"use strict";

(() => {
  const ext = globalThis.browser || globalThis.chrome;
  const PROFILES_KEY = "buddyHuntProfilesV1";
  const HANDOFF_KEY = "buddyHuntChatGptHandoffV1";
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  function call(api, method, ...args) {
    if (globalThis.browser) return api[method](...args);
    return new Promise((resolve, reject) => api[method](...args, value => {
      const error = ext.runtime.lastError;
      error ? reject(new Error(error.message)) : resolve(value);
    }));
  }

  async function waitFor(get, timeout = 20000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = get();
      if (value) return value;
      await delay(400);
    }
    return null;
  }

  function download(filename, contents) {
    const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function fallback(handoff, contents, reason) {
    const box = document.createElement("aside");
    box.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(360px,calc(100vw - 32px));padding:16px;border:1px solid #b6c7bf;border-radius:12px;background:white;color:#21362d;box-shadow:0 8px 35px #0003;font:14px/1.4 system-ui,sans-serif";
    const title = document.createElement("strong");
    title.textContent = "Buddy Hunt handoff";
    const message = document.createElement("p");
    message.textContent = `${reason} Download the JSON, attach it in this chat, and paste the prepared request.`;
    const save = document.createElement("button");
    save.textContent = "Download JSON";
    save.onclick = () => download(handoff.filename, contents);
    const copy = document.createElement("button");
    copy.textContent = "Copy request";
    copy.style.marginLeft = "8px";
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(handoff.prompt);
        copy.textContent = "Copied";
      } catch { copy.textContent = "Select the request below"; }
    };
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Show request";
    const request = document.createElement("textarea");
    request.readOnly = true;
    request.value = handoff.prompt;
    request.style.cssText = "display:block;width:100%;height:120px;margin-top:8px";
    details.append(summary, request);
    box.append(title, message, save, copy, details);
    document.body.append(box);
  }

  function findComposer() {
    return document.querySelector('[data-testid="composer-rich-text-input"], #prompt-textarea, [contenteditable="true"][role="textbox"], textarea');
  }

  function composerText(composer) {
    return composer instanceof HTMLTextAreaElement ? composer.value : composer.innerText || composer.textContent || "";
  }

  function hasPrompt(composer, prompt) {
    return !!composer && composerText(composer).replace(/\s+/g, " ").trim().includes(prompt.replace(/\s+/g, " ").trim());
  }

  async function enterPrompt(prompt) {
    const composer = await waitFor(findComposer);
    if (!composer) throw new Error("ChatGPT composer was not available.");
    if (hasPrompt(composer, prompt)) return;
    composer.focus();
    if (composer instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(composer, prompt);
      composer.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      document.execCommand("insertText", false, prompt);
    }
    if (!await waitFor(() => {
      const current = findComposer();
      return hasPrompt(current, prompt);
    }, 5000)) throw new Error("ChatGPT did not accept the prepared request.");
  }

  async function attachAndSend(handoff, contents) {
    await enterPrompt(handoff.prompt);
    let input = document.querySelector('input[type="file"]');
    if (!input) {
      const attach = document.querySelector('button[data-testid="composer-plus-btn"], button[aria-label="Add files"], button[aria-label="Attach files"], button[aria-label="Add photos and files"]');
      if (attach) attach.click();
      input = await waitFor(() => document.querySelector('input[type="file"]'), 5000);
      if (!input) {
        const upload = [...document.querySelectorAll("button, [role=menuitem]")].find(node => /upload (from|file)|add photos and files/i.test(node.textContent || ""));
        if (upload) upload.click();
        input = await waitFor(() => document.querySelector('input[type="file"]'), 5000);
      }
    }
    if (!input) throw new Error("ChatGPT file control was not available.");
    const transfer = new DataTransfer();
    transfer.items.add(new File([contents], handoff.filename, { type: "application/json" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const attached = await waitFor(() => document.body.innerText.includes(handoff.filename), 30000);
    if (!attached) throw new Error("ChatGPT did not confirm the file attachment.");
    if (!hasPrompt(findComposer(), handoff.prompt))
      await enterPrompt(handoff.prompt);
    const send = await waitFor(() => {
      const composer = findComposer();
      if (!hasPrompt(composer, handoff.prompt) || !document.body.innerText.includes(handoff.filename)) return null;
      const button = document.querySelector('button[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"]');
      return button && !button.disabled ? button : null;
    }, 30000);
    if (!send) throw new Error("ChatGPT was not ready to send the request.");
    send.click();
  }

  async function start() {
    let handoff = null;
    for (let attempt = 0; attempt < 25 && !handoff; attempt++) {
      handoff = await call(ext.runtime, "sendMessage", { type: "buddyHuntGetChatGptHandoff" });
      if (!handoff) await delay(400);
    }
    if (!handoff) return;
    const stored = await call(ext.storage.local, "get", PROFILES_KEY);
    const profiles = Array.isArray(stored[PROFILES_KEY]) ? stored[PROFILES_KEY] : [];
    const contents = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), suggestedSpreadsheetName: handoff.spreadsheetName, profiles }, null, 2);
    try {
      await attachAndSend(handoff, contents);
      await call(ext.storage.local, "remove", HANDOFF_KEY);
    } catch (error) {
      fallback(handoff, contents, error.message || "Automatic handoff did not finish.");
    }
  }

  start().catch(error => console.error("Buddy Hunt ChatGPT handoff:", error));
})();
