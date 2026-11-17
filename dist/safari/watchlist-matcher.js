(function (root) {
  "use strict";

  const word = /[\p{L}\p{N}_@]/u;

  function createMatcher(entries) {
    const buckets = new Map();
    const seen = new Set();
    for (const entry of entries || []) {
      if (!entry || typeof entry.value !== "string") continue;
      const term = (entry.type === "handle" ? `@${entry.value}` : entry.value).toLowerCase();
      if (!term || seen.has(term)) continue;
      seen.add(term);
      const key = term.slice(0, 12);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(term);
    }
    for (const values of buckets.values()) values.sort((a, b) => b.length - a.length);

    function matches(value) {
      const original = String(value || "");
      const lower = original.toLowerCase();
      let offsets = null;
      if (lower.length !== original.length) {
        offsets = [];
        let position = 0;
        for (const character of original) {
          for (let index = 0; index < character.toLowerCase().length; index++) offsets.push(position);
          position += character.length;
        }
        offsets.push(original.length);
        if (offsets.length !== lower.length + 1) offsets = null;
      }
      const before = position => position > 0 ? original.slice(position - (/[\uDC00-\uDFFF]/.test(original[position - 1]) ? 2 : 1), position) : "";
      const after = position => position < original.length ? String.fromCodePoint(original.codePointAt(position)) : "";
      const found = [];
      for (let index = 0; index < lower.length;) {
        const start = offsets ? offsets[index] : index;
        if (offsets && index && offsets[index] === offsets[index - 1] || word.test(before(start))) { index++; continue; }
        let end = 0;
        for (let size = Math.min(12, lower.length - index); size > 0 && !end; size--) {
          const candidates = buckets.get(lower.slice(index, index + size));
          if (!candidates) continue;
          for (const term of candidates) {
            const last = index + term.length;
            const originalEnd = offsets ? offsets[last] : last;
            if (lower.startsWith(term, index) && !(offsets && last < lower.length && offsets[last] === offsets[last - 1]) && !word.test(after(originalEnd))) {
              end = last;
              break;
            }
          }
        }
        if (end) { found.push([start, offsets ? offsets[end] : end]); index = end; }
        else index++;
      }
      return found;
    }
    return { matches, count: seen.size };
  }

  const api = { createMatcher };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BuddyWatchlistMatcher = api;
})(globalThis);
