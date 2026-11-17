"use strict";

(() => {
  const ext = globalThis.browser || globalThis.chrome;
  const EDITORS = '.msg-form__contenteditable[contenteditable="true"], .msg-form [contenteditable="true"], [role="textbox"][contenteditable="true"][aria-label*="message" i], [contenteditable="true"][data-placeholder*="message" i]';
  let editor = null;
  let chatRoot = null;
  let observer = null;
  let snapshotTimer = null;
  let lastDraft = "";
  let activeChatId = "";
  let busy = false;

  function call(message) {
    if (globalThis.browser) return ext.runtime.sendMessage(message);
    return new Promise((resolve, reject) => ext.runtime.sendMessage(message, value => {
      const error = ext.runtime.lastError;
      if (error) reject(new Error(error.message));
      else if (value && value.error) reject(new Error(value.error));
      else resolve(value);
    }));
  }

  const text = node => String(node && (node.innerText || node.textContent) || "").replace(/\s+/g, " ").trim();
  const threadText = node => String(node && (node.innerText || node.textContent) || "")
    .replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const editorText = () => text(editor);
  const first = (root, selectors) => selectors.map(selector => root && root.querySelector(selector)).find(Boolean);

  function rootFor(input) {
    return input.closest(".msg-overlay-conversation-bubble, .msg-convo-wrapper, .msg-thread, .msg-conversation-container") ||
      (/\/messaging\//.test(location.pathname) && document.querySelector("main"));
  }

  function snapshot() {
    if (!editor || !editor.isConnected || !chatRoot) return null;
    const header = first(chatRoot, [
      ".msg-overlay-bubble-header__title", ".msg-overlay-bubble-header__title-text", ".msg-overlay-conversation-bubble__title",
      ".msg-thread__link-to-profile", ".msg-entity-lockup__entity-title",
      ".msg-conversation-card__participant-names", ".msg-thread__name", "h2"
    ]);
    const recipient = text(header).slice(0, 200);
    const list = first(chatRoot, [".msg-s-message-list", ".msg-s-message-list-content", ".msg-s-event-list", "[data-view-name='message-list']"]);
    const context = list ? threadText(list).slice(-16000) : "";
    const threadPath = location.pathname.match(/\/messaging\/thread\/([^/?#]+)/);
    const profile = header && header.closest("a[href*='/in/']") || chatRoot.querySelector(".msg-overlay-bubble-header a[href*='/in/'], .msg-thread__link-to-profile[href*='/in/']");
    const profileId = profile && profile.href.match(/linkedin\.com\/in\/([^/?#]+)/i);
    const idNode = chatRoot.querySelector("[data-conversation-id], [data-thread-id]");
    const rootId = chatRoot.getAttribute("data-conversation-id") || chatRoot.getAttribute("data-thread-id") ||
      idNode && (idNode.getAttribute("data-conversation-id") || idNode.getAttribute("data-thread-id"));
    const id = threadPath ? `thread:${threadPath[1]}` : rootId ? `thread:${rootId}` : profileId ? `profile:${profileId[1]}` : recipient ? `recipient:${recipient.toLowerCase()}` : "";
    if (!recipient || !id) return null;
    return { id, recipient, url: threadPath ? location.href : profile ? profile.href : "", context };
  }

  const toolbar = document.createElement("div");
  toolbar.className = "buddy-hunt-chat-tools";
  toolbar.hidden = true;
  toolbar.innerHTML = '<strong>Buddy Hunt reply</strong><div class="buddy-hunt-chat-buttons"><button type="button" data-action="generate">Generate</button><button type="button" data-action="refresh">Refresh</button><button type="button" data-action="polish">Polish edits</button><button type="button" data-action="send">Send</button></div><small role="status"></small>';
  const style = document.createElement("style");
  style.textContent = '.buddy-hunt-chat-tools{position:fixed;right:18px;bottom:18px;z-index:2147483647;width:292px;padding:12px;border:1px solid #bddfca;border-radius:12px;background:#f5fbf7;box-shadow:0 6px 24px #143c2540;color:#183c2e;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.buddy-hunt-chat-tools[hidden]{display:none}.buddy-hunt-chat-tools strong{display:block;margin-bottom:8px}.buddy-hunt-chat-buttons{display:flex;flex-wrap:wrap;gap:5px}.buddy-hunt-chat-buttons button{padding:5px 7px;border:1px solid #bfd8c8;border-radius:7px;background:white;color:#176b50;font:inherit;cursor:pointer}.buddy-hunt-chat-buttons button:last-child{background:#176b50;color:white}.buddy-hunt-chat-buttons button:disabled{opacity:.5;cursor:default}.buddy-hunt-chat-tools small{display:block;margin-top:7px;color:#536b5e}';
  (document.head || document.documentElement).append(style);
  (document.body || document.documentElement).append(toolbar);

  function status(message) { toolbar.querySelector("small").textContent = message; }
  function positionToolbar() {
    if (toolbar.hidden || !editor || !editor.isConnected) return;
    const rect = editor.getBoundingClientRect();
    toolbar.style.right = "auto";
    toolbar.style.bottom = "auto";
    toolbar.style.left = `${Math.max(8, Math.min(rect.right - 292, window.innerWidth - 300))}px`;
    toolbar.style.top = `${Math.max(8, rect.top - toolbar.offsetHeight - 8)}px`;
  }
  function setBusy(value) {
    busy = value;
    for (const button of toolbar.querySelectorAll("button")) button.disabled = value;
  }

  function setEditor(value) {
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
    if (!document.execCommand("insertText", false, value)) {
      editor.textContent = value;
    }
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    editor.focus();
  }

  function scheduleSnapshot() {
    clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => {
      const chat = snapshot();
      if (chat) {
        if (activeChatId && activeChatId !== chat.id) lastDraft = "";
        activeChatId = chat.id;
        call({ type: "buddyHuntChatSnapshot", chat }).catch(() => {});
      }
    }, 700);
  }

  function selectEditor(input) {
    const root = rootFor(input);
    if (!root) return;
    const changed = editor !== input || chatRoot !== root;
    editor = input;
    chatRoot = root;
    if (changed) lastDraft = "";
    toolbar.hidden = false;
    status("Generate a reply from this conversation. Review it before sending.");
    const current = snapshot();
    if (current && activeChatId !== current.id) { activeChatId = current.id; lastDraft = ""; }
    positionToolbar();
    if (observer) observer.disconnect();
    observer = new MutationObserver(scheduleSnapshot);
    const list = first(root, [".msg-s-message-list", ".msg-s-message-list-content", ".msg-s-event-list", "[data-view-name='message-list']"]);
    if (list) observer.observe(list, { childList: true, subtree: true, characterData: true });
    scheduleSnapshot();
  }

  async function generate(mode) {
    const chat = snapshot();
    if (!chat || !chat.context) { status("Open a chat with visible messages, then focus its message box."); return; }
    if (mode === "polish" && !editorText()) { status("Write or generate a message before polishing it."); return; }
    if (chat.id !== activeChatId) { activeChatId = chat.id; lastDraft = ""; }
    const targetEditor = editor;
    const targetRoot = chatRoot;
    setBusy(true);
    status(mode === "polish" ? "Polishing your edits…" : "Writing a reply…");
    try {
      const currentText = editorText();
      const result = await call({ type: "buddyHuntChatDraft", chat, mode, currentText, previousDraft: lastDraft });
      if (!targetEditor.isConnected || editor !== targetEditor || chatRoot !== targetRoot || snapshot()?.id !== chat.id)
        throw new Error("The selected chat changed. Focus its message box again.");
      setEditor(result.text);
      lastDraft = result.text;
      status("Review and edit the reply. Send uses LinkedIn’s message button.");
    } catch (error) { status(error.message || "Could not write a reply."); }
    finally { setBusy(false); }
  }

  function noteSent(input, outgoing) {
    if (!outgoing) return;
    const chat = snapshot();
    if (!chat) return;
    const proposed = lastDraft;
    let checks = 0;
    const check = () => {
      if (!input.isConnected) return;
      if (text(input) && checks++ < 8) { setTimeout(check, 500); return; }
      if (text(input)) return;
      call({ type: "buddyHuntChatSent", chat, text: outgoing, proposed }).catch(() => {});
      if (editor === input) lastDraft = "";
      scheduleSnapshot();
    };
    setTimeout(check, 500);
  }

  toolbar.addEventListener("mousedown", event => event.preventDefault());
  toolbar.addEventListener("click", event => {
    const action = event.target && event.target.dataset && event.target.dataset.action;
    if (!action || busy || !editor || !editor.isConnected) return;
    if (action === "generate" || action === "refresh" || action === "polish") { generate(action); return; }
    const send = chatRoot.querySelector(".msg-form button.msg-form__send-button:not([disabled]), .msg-form button[type='submit']:not([disabled])");
    if (!editorText()) { status("Write or generate a message first."); return; }
    if (!send) { status("Use LinkedIn’s Send button for this chat."); return; }
    send.click();
  });

  document.addEventListener("focusin", event => {
    const input = event.target && event.target.closest && event.target.closest(EDITORS);
    if (input) selectEditor(input);
    else if (!toolbar.contains(event.target)) toolbar.hidden = true;
  }, true);
  document.addEventListener("click", event => {
    const send = event.target && event.target.closest && event.target.closest(".msg-form button.msg-form__send-button, .msg-form button[type='submit']");
    if (send && editor && chatRoot && chatRoot.contains(send)) noteSent(editor, editorText());
  }, true);
  document.addEventListener("keydown", event => {
    if (event.target === editor && event.key === "Enter" && !event.shiftKey && !event.isComposing) noteSent(editor, editorText());
  }, true);
  window.addEventListener("resize", positionToolbar);
  window.addEventListener("scroll", positionToolbar, true);
})();
