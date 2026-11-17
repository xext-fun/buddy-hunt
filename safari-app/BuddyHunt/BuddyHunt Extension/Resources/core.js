(function (root) {
  "use strict";

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const STATUSES = new Set(["pending", "reviewed", "connected", "not_found"]);

  function csvRows(input) {
    const rows = [];
    let row = [], field = "", quoted = false;
    const text = String(input).replace(/^\uFEFF/, "");
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(field); field = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.some(value => value.trim())) rows.push(row);
        row = [];
      } else field += char;
    }
    row.push(field);
    if (row.some(value => value.trim())) rows.push(row);
    return rows;
  }

  function safeProfileUrl(value) {
    // Imported links must lead to a LinkedIn member profile before they can be opened.
    if (!value) return "";
    try {
      const url = new URL(value.trim());
      return url.protocol === "https:" && /(^|\.)linkedin\.com$/i.test(url.hostname) &&
        /^\/(in|pub)\//.test(url.pathname) ? url.href : "";
    } catch { return ""; }
  }

  function parseContacts(input) {
    // Accept both a headered CSV and a plain one-email-per-line text file.
    const rows = csvRows(input);
    if (!rows.length) return { contacts: [], invalid: 0 };
    const first = rows[0].map(value => value.trim().toLowerCase().replace(/[\s-]+/g, "_"));
    const emailIndex = first.findIndex(value => ["email", "email_address", "e_mail"].includes(value));
    const hasHeader = emailIndex !== -1;
    const column = key => first.findIndex(value => key.includes(value));
    const nameIndex = hasHeader ? column(["name", "full_name", "first_name"]) : 1;
    const urlIndex = hasHeader ? column(["linkedin_url", "profile_url", "linkedin", "url"]) : 2;
    const statusIndex = hasHeader ? column(["status"]) : -1;
    const updatedIndex = hasHeader ? column(["updated_at"]) : -1;
    const seen = new Set();
    const contacts = [];
    let invalid = 0;
    for (const row of rows.slice(hasHeader ? 1 : 0)) {
      const email = (row[hasHeader ? emailIndex : 0] || "").trim().toLowerCase();
      if (!EMAIL.test(email)) { invalid++; continue; }
      if (seen.has(email)) continue;
      seen.add(email);
      contacts.push({
        email,
        name: (row[nameIndex] || "").trim(),
        profileUrl: safeProfileUrl(row[urlIndex] || ""),
        status: STATUSES.has((row[statusIndex] || "").trim()) ? row[statusIndex].trim() : "pending",
        updatedAt: (row[updatedIndex] || "").trim()
      });
    }
    return { contacts, invalid };
  }

  function normalizeContact(value) {
    if (!value || typeof value.email !== "string" || !EMAIL.test(value.email.trim())) return null;
    return {
      email: value.email.trim().toLowerCase(),
      name: String(value.name || "").slice(0, 200),
      profileUrl: safeProfileUrl(value.profileUrl || ""),
      status: STATUSES.has(value.status) ? value.status : "pending",
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : ""
    };
  }

  function exportCsv(contacts) {
    const quote = value => '"' + String(value || "").replace(/"/g, '""') + '"';
    return ["email,name,linkedin_url,status,updated_at", ...contacts.map(item =>
      [item.email, item.name, item.profileUrl, item.status, item.updatedAt].map(quote).join(",")
    )].join("\r\n") + "\r\n";
  }

  function searchUrl(contact) {
    return "https://www.linkedin.com/search/results/people/?keywords=" + encodeURIComponent(contact.email);
  }

  function canonicalProfileUrl(value) {
    const safe = safeProfileUrl(value);
    if (!safe) return "";
    try {
      const url = new URL(safe);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 2) return "";
      const path = parts[0] === "pub" ? parts : parts.slice(0, 2);
      return `https://www.linkedin.com/${path.map(part => encodeURIComponent(decodeURIComponent(part))).join("/")}/`;
    } catch { return ""; }
  }

  function normalizeHandle(value) {
    if (value && typeof value === "object") value = value.handle || value.profileUrl || value.profile_url || value.linkedin_url || value.url;
    let input = String(value || "").trim();
    if (!input) return "";
    if (/^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\//i.test(input)) {
      const url = canonicalProfileUrl(/^https?:\/\//i.test(input) ? input : `https://${input}`);
      if (!url) return "";
      input = new URL(url).pathname.split("/")[2];
    } else input = input.replace(/^@/, "");
    return /^[a-z0-9][a-z0-9_-]{0,99}$/i.test(input) ? input.toLowerCase() : "";
  }

  function parseHandles(input, format = "text") {
    let values;
    if (format === "json") {
      const data = JSON.parse(input);
      values = Array.isArray(data) ? data : data && (data.handles || data.profiles);
      if (!Array.isArray(values)) throw new Error("JSON must contain a handles or profiles array.");
    } else if (format === "csv") {
      const rows = csvRows(input);
      const headers = (rows[0] || []).map(value => value.trim().toLowerCase().replace(/[\s-]+/g, "_"));
      const column = headers.findIndex(value => ["handle", "linkedin_handle", "profile_url", "linkedin_url", "url"].includes(value));
      values = rows.slice(column < 0 ? 0 : 1).map(row => row[column < 0 ? 0 : column]);
    } else values = String(input).split(/\r?\n/);
    const handles = new Set();
    let invalid = 0;
    for (const value of values) {
      const handle = normalizeHandle(value);
      if (handle) handles.add(handle);
      else if (String(value || "").trim()) invalid++;
    }
    return { handles: [...handles], invalid };
  }

  function sourceType(value) {
    try {
      const path = new URL(value).pathname;
      if (/^\/search\//.test(path)) return "search";
      if (/^\/feed(?:\/|$)/.test(path)) return "timeline";
      if (/^\/mynetwork(?:\/|$)/.test(path)) return "connections";
      if (/^\/(in|pub)\//.test(path)) return "profile";
    } catch { /* Unknown source. */ }
    return "other";
  }

  function cleanText(value, limit = 2000) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function mergeProfile(existing, incoming) {
    const url = canonicalProfileUrl(incoming && incoming.url);
    if (!url) return null;
    const now = new Date().toISOString();
    const previous = existing && existing.url === url ? existing : {};
    const fields = ["name", "headline", "location", "company", "about", "experience", "education", "imageUrl", "visibleText"];
    const profile = {
      url,
      name: cleanText(previous.name, 300),
      headline: cleanText(previous.headline, 500),
      location: cleanText(previous.location, 300),
      company: cleanText(previous.company, 300),
      about: cleanText(previous.about, 8000),
      experience: cleanText(previous.experience, 8000),
      education: cleanText(previous.education, 8000),
      imageUrl: cleanText(previous.imageUrl, 1000),
      visibleText: cleanText(previous.visibleText, 30000),
      firstSeenAt: previous.firstSeenAt || now,
      lastSeenAt: now,
      sources: Array.isArray(previous.sources) ? previous.sources.slice() : []
    };
    for (const field of fields) {
      const limit = field === "visibleText" ? 30000 : ["about", "experience", "education"].includes(field) ? 8000 : field === "imageUrl" ? 1000 : 500;
      const value = cleanText(incoming[field], limit);
      const isProfilePage = sourceType(incoming.sourceUrl) === "profile";
      const detail = ["about", "experience", "education", "visibleText"].includes(field);
      if (value && (detail ? value.length > profile[field].length : isProfilePage || !profile[field])) profile[field] = value;
    }
    const pageUrl = cleanText(incoming.sourceUrl, 2000);
    const type = sourceType(pageUrl);
    if (pageUrl) {
      const source = profile.sources.find(item => item.url === pageUrl);
      if (source) {
        source.lastSeenAt = now;
        source.type = type;
        source.count = Math.max(1, Number(source.count) || 1) + 1;
        if (cleanText(incoming.visibleText, 30000).length > cleanText(source.visibleText, 30000).length)
          source.visibleText = cleanText(incoming.visibleText, 30000);
      } else profile.sources.push({ url: pageUrl, type, firstSeenAt: now, lastSeenAt: now, count: 1, visibleText: cleanText(incoming.visibleText, 30000) });
    }
    return profile;
  }

  function profileHandoff(profiles) {
    const searches = new Set();
    const types = new Set();
    for (const profile of profiles) for (const source of Array.isArray(profile.sources) ? profile.sources : []) {
      types.add(sourceType(source.url));
      if (sourceType(source.url) !== "search") continue;
      try {
        const query = new URL(source.url).searchParams;
        const term = cleanText(query.get("keywords") || query.get("q"), 80);
        if (term) searches.add(term);
      } catch { /* Ignore malformed source URLs. */ }
    }
    const label = searches.size === 1 ? `Search - ${[...searches][0]}` :
      searches.size > 1 ? "Mixed Searches" : types.has("connections") ? "Connections" :
      types.has("timeline") ? "Timeline" : "Profiles";
    const spreadsheetName = `Buddy Hunt - LinkedIn - ${label}`;
    const filename = `buddy-hunt-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "profiles"}.json`;
    const prompt = `Use the connected Google Drive and Google Sheets tools to create or update a native Google Sheet from the attached Buddy Hunt profile export named "${spreadsheetName}". If a sheet with that exact name already exists, merge into it instead of creating a duplicate. If Google Drive or Google Sheets is not connected or write access is unavailable, tell me what I need to enable.

Use one row per unique canonical LinkedIn profile URL. Deduplicate the attached profiles and the existing sheet by that URL, merge nonempty fields, preserve existing information when the new export is blank, and keep the earliest first-seen and latest last-seen timestamps. Include name, profile URL, headline, location, company, about, experience, education, image URL, visible text, first seen, last seen, source types, source URLs, search terms from source URL parameters, and source history/counts. Read the structured profile fields from the JSON; do not drop headline or company when merging. Search pages, timeline/feed pages, connection pages, and profile pages should retain their distinct source labels. Add a main "Profiles" tab and, when applicable, tabs for each search term and for Connections or Timeline, with rows linked to the same canonical profiles. Name search tabs from their actual URL search parameters, using short valid tab names. Preserve all source history from both the export and existing sheet. Tell me the Sheet link and the count of new and updated profiles when done.`;
    return { spreadsheetName, filename, prompt, searchTerms: [...searches] };
  }

  const api = { csvRows, parseContacts, normalizeContact, safeProfileUrl, exportCsv, searchUrl, canonicalProfileUrl, normalizeHandle, parseHandles, sourceType, mergeProfile, profileHandoff };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BuddyCore = api;
})(globalThis);
