const test = require("node:test");
const assert = require("node:assert/strict");
const chat = require("../src/chat-core.js");

test("keeps separate chat history and sent examples", () => {
  const snapshot = { id: "thread:123", recipient: "Ada Lovelace", url: "https://www.linkedin.com/messaging/thread/123/", context: "Ada: Could we talk Tuesday?" };
  const first = chat.mergeChat(null, snapshot);
  const sent = chat.mergeChat(first, snapshot, "Tuesday works for me.", "Sure, Tuesday works!");
  assert.equal(sent.sent.length, 1);
  assert.equal(sent.sent[0].text, "Tuesday works for me.");
  assert.equal(chat.mergeChat(sent, snapshot, "Tuesday works for me.").sent.length, 1);
  assert.equal(chat.normalizeChat({ ...snapshot, url: "https://example.com" }).url, "");
});

test("draft request uses visible chat and edited sent examples", () => {
  const snapshot = { id: "thread:123", recipient: "Ada Lovelace", context: "Ada: Could we talk Tuesday?" };
  const history = { "thread:123": chat.mergeChat(null, snapshot, "Tuesday works for me.", "Sure, Tuesday works!") };
  const request = chat.buildRequest(snapshot, history, "polish", "tuesday is good", "Sure, Tuesday works!");
  assert.match(request.instructions, /Preserve all facts/);
  assert.match(request.input, /tuesday is good/);
  assert.match(request.input, /Tuesday works for me/);
  assert.equal(chat.responseText({ output: [{ content: [{ type: "output_text", text: "Tuesday works for me." }] }] }), "Tuesday works for me.");
});
