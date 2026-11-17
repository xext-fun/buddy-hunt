const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const BuddyChat = require("../src/chat-core.js");

test("drafts from the selected LinkedIn chat and saves sent edits", async () => {
  const data = { buddyHuntOpenAiKeyV1: "sk-test-only" };
  let listener;
  let request;
  const browser = {
    runtime: { onMessage: { addListener(fn) { listener = fn; } } },
    storage: { local: {
      async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]])); },
      async set(values) { Object.assign(data, values); }
    } }
  };
  const code = fs.readFileSync(path.join(__dirname, "../src/chat-background.js"), "utf8");
  vm.runInNewContext(code, { browser, BuddyChat, AbortController, setTimeout, clearTimeout,
    async fetch(url, options) {
      request = { url, options };
      return { ok: true, async json() { return { output: [{ content: [{ type: "output_text", text: "Tuesday works for me." }] }] }; } };
    } });
  const sender = { url: "https://www.linkedin.com/messaging/thread/123/" };
  const chat = { id: "thread:123", recipient: "Ada", context: "Ada: Can we talk Tuesday?" };
  const draft = await listener({ type: "buddyHuntChatDraft", chat, mode: "generate" }, sender);
  assert.equal(draft.text, "Tuesday works for me.");
  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(request.options.headers.Authorization, "Bearer sk-test-only");
  const body = JSON.parse(request.options.body);
  assert.equal(body.store, false);
  assert.match(body.input, /Can we talk Tuesday/);
  await listener({ type: "buddyHuntChatSent", chat, text: "Yes, Tuesday works!", proposed: draft.text }, sender);
  assert.equal(data.buddyHuntChatHistoryV1["thread:123"].sent[0].text, "Yes, Tuesday works!");
  assert.equal(listener({ type: "buddyHuntChatDraft", chat }, { url: "https://example.com" }), undefined);
});
