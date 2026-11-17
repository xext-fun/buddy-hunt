const test = require("node:test");
const assert = require("node:assert/strict");
const { createMatcher } = require("../src/watchlist-matcher.js");

test("matches names and handles with word boundaries and longest match", () => {
  const matcher = createMatcher([
    { type: "name", value: "Jane" },
    { type: "name", value: "Jane Doe" },
    { type: "handle", value: "jane-7" }
  ]);
  const value = "Jane Doe and @jane-7, but not JaneDoe or @jane-70.";
  assert.deepEqual(matcher.matches(value).map(([start, end]) => value.slice(start, end)), ["Jane Doe", "@jane-7"]);
});

test("indexes 100,000 entries without a giant regular expression", () => {
  const entries = Array.from({ length: 100000 }, (_, index) => ({ type: "name", value: `Person ${String(index).padStart(6, "0")}` }));
  const matcher = createMatcher(entries);
  assert.equal(matcher.count, 100000);
  const value = "Contact Person 099999 today; Person 999999 is not listed.";
  assert.deepEqual(matcher.matches(value).map(([start, end]) => value.slice(start, end)), ["Person 099999"]);
});

test("keeps match offsets correct when Unicode lowercasing expands a character", () => {
  const matcher = createMatcher([{ type: "name", value: "İpek Yılmaz" }]);
  const value = "Meet İpek Yılmaz today";
  assert.deepEqual(matcher.matches(value).map(([start, end]) => value.slice(start, end)), ["İpek Yılmaz"]);
});
