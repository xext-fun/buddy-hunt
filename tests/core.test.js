const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/core.js");

test("imports headered CSV, quoted fields, and deduplicates email", () => {
  const parsed = core.parseContacts('email,name,linkedin_url\n"A@Example.com","Ada, A.","https://www.linkedin.com/in/ada"\na@example.com,Duplicate,\ninvalid,Nope,');
  assert.equal(parsed.contacts.length, 1);
  assert.equal(parsed.invalid, 1);
  assert.equal(parsed.contacts[0].name, "Ada, A.");
  assert.equal(parsed.contacts[0].profileUrl, "https://www.linkedin.com/in/ada");
});

test("exports statuses and prevents external profile URLs", () => {
  const contact = core.normalizeContact({ email: "a@example.com", profileUrl: "https://evil.test/in/a", status: "connected" });
  assert.equal(contact.profileUrl, "");
  assert.match(core.exportCsv([contact]), /"connected"/);
  assert.match(core.searchUrl(contact), /a%40example.com/);
  assert.equal(core.parseContacts(core.exportCsv([contact])).contacts[0].status, "connected");
});
