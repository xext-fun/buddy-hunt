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

test("deduplicates profile URL variants and keeps page sources", () => {
  const url = core.canonicalProfileUrl("https://uk.linkedin.com/in/ada/?trk=search");
  assert.equal(url, "https://www.linkedin.com/in/ada/");
  let profile = core.mergeProfile(null, { url, name: "Ada", visibleText: "Ada Engineer", sourceUrl: "https://www.linkedin.com/search/results/people/?keywords=ada" });
  profile = core.mergeProfile(profile, { url: "https://www.linkedin.com/in/ada/#about", headline: "Engineer", visibleText: "Ada Engineer London", sourceUrl: "https://www.linkedin.com/feed/" });
  assert.equal(profile.name, "Ada");
  assert.equal(profile.headline, "Engineer");
  assert.equal(profile.sources.length, 2);
  assert.deepEqual(profile.sources.map(source => source.type), ["search", "timeline"]);
  assert.equal(profile.visibleText, "Ada Engineer London");
  assert.equal(core.canonicalProfileUrl("https://evil.test/in/ada"), "");
});

test("keeps headline, company, and profile sections through later sparse captures", () => {
  const url = "https://www.linkedin.com/in/ada/";
  let profile = core.mergeProfile(null, {
    url, name: "Ada", headline: "Software Engineer", company: "Example Co",
    about: "About Ada", experience: "Experience Example Co", education: "Education University",
    visibleText: "Ada Software Engineer Example Co", sourceUrl: url
  });
  profile = core.mergeProfile(profile, {
    url, name: "Ada", headline: "", company: "", about: "", experience: "", education: "",
    visibleText: "Ada", sourceUrl: "https://www.linkedin.com/feed/"
  });
  assert.equal(profile.headline, "Software Engineer");
  assert.equal(profile.company, "Example Co");
  assert.equal(profile.about, "About Ada");
  assert.equal(profile.experience, "Experience Example Co");
  assert.equal(profile.education, "Education University");
  assert.equal(profile.visibleText, "Ada Software Engineer Example Co");
});

test("names the handoff from search parameters and requests an existing-sheet merge", () => {
  const plan = core.profileHandoff([{ sources: [
    { url: "https://www.linkedin.com/search/results/people/?keywords=Product%20Design" },
    { url: "https://www.linkedin.com/mynetwork/invite-connect/connections/" }
  ] }]);
  assert.equal(plan.spreadsheetName, "Buddy Hunt - LinkedIn - Search - Product Design");
  assert.match(plan.filename, /product-design\.json$/);
  assert.match(plan.prompt, /merge into it instead of creating a duplicate/);
  assert.match(plan.prompt, /one row per unique canonical LinkedIn profile URL/);
  assert.match(plan.prompt, /connected Google Drive and Google Sheets tools/);
  assert.match(plan.prompt, /company, about, experience, education/);
  assert.match(plan.prompt, /enable\.\n\nUse one row/);
});

test("imports and normalizes LinkedIn handles without matching display names", () => {
  assert.deepEqual(core.parseHandles("handle,name\n@Ada-7,Ada\nhttps://uk.linkedin.com/in/GRACE_8/?trk=feed,Grace\n@ada-7,Duplicate\nAda Lovelace,Bad", "csv"), {
    handles: ["ada-7", "grace_8"], invalid: 1
  });
  assert.deepEqual(core.parseHandles("Ada-7\nhttps://www.linkedin.com/in/grace_8/\n", "text").handles, ["ada-7", "grace_8"]);
  assert.deepEqual(core.parseHandles('{"handles":["@ada-7",{"url":"https://www.linkedin.com/in/grace_8/"}]}', "json").handles, ["ada-7", "grace_8"]);
  assert.equal(core.normalizeHandle("https://evil.test/in/ada-7"), "");
  assert.equal(core.normalizeHandle("Ada Lovelace"), "");
});
