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

  const api = { csvRows, parseContacts, normalizeContact, safeProfileUrl, exportCsv, searchUrl };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BuddyCore = api;
})(globalThis);
