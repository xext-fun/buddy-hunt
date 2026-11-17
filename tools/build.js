const fs = require("node:fs");
const path = require("node:path");

const base = path.resolve(__dirname, "..");
const shared = ["panel.html", "panel.css", "panel.js", "core.js", "watchlist-matcher.js", "watchlist-worker.js", "watchlist-content.js", "watchlist-background.js", "chat-core.js", "chat-background.js", "recorder-background.js", "recorder-content.js", "chat-content.js", "chatgpt-handoff.js"];
const common = {
  manifest_version: 3,
  name: "Buddy Hunt",
  version: "1.0.0",
  description: "Review an email list and track LinkedIn connections locally.",
  permissions: ["storage", "tabs", "unlimitedStorage"],
  host_permissions: ["https://*.linkedin.com/*", "https://chatgpt.com/*", "https://api.openai.com/*"],
  content_scripts: [
    { matches: ["https://*.linkedin.com/*"], js: ["core.js", "watchlist-matcher.js", "watchlist-content.js", "recorder-content.js", "chat-content.js"], run_at: "document_idle" },
    { matches: ["https://chatgpt.com/*"], js: ["chatgpt-handoff.js"], run_at: "document_idle" }
  ],
  icons: { 48: "icon.png", 128: "icon.png" }
};

const manifests = {
  chromium: {
    ...common,
    minimum_chrome_version: "116",
    permissions: [...common.permissions, "sidePanel"],
    action: { default_title: "Open Buddy Hunt" },
    side_panel: { default_path: "panel.html" },
    background: { service_worker: "background.js" }
  },
  firefox: {
    ...common,
    browser_specific_settings: { gecko: { id: "buddy-hunt@example.com", strict_min_version: "115.0" } },
    action: { default_title: "Open Buddy Hunt sidebar" },
    sidebar_action: { default_title: "Buddy Hunt", default_panel: "panel.html" },
    background: { scripts: ["core.js", "watchlist-matcher.js", "watchlist-background.js", "chat-core.js", "recorder-background.js", "chat-background.js", "background.js"] }
  },
  safari: {
    ...common,
    action: { default_title: "Open Buddy Hunt" },
    background: { service_worker: "background.js" }
  }
};

for (const [target, manifest] of Object.entries(manifests)) {
  const dest = path.join(base, "dist", target);
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  for (const file of shared) fs.copyFileSync(path.join(base, "src", file), path.join(dest, file));
  fs.copyFileSync(path.join(base, "src", "icon.png"), path.join(dest, "icon.png"));
  fs.copyFileSync(path.join(base, "src", `background-${target}.js`), path.join(dest, "background.js"));
  console.log(`Built ${target}`);
}

const safariResources = path.join(base, "safari-app", "BuddyHunt", "BuddyHunt Extension", "Resources");
for (const file of [...shared, "background.js", "manifest.json", "icon.png"])
  fs.copyFileSync(path.join(base, "dist", "safari", file), path.join(safariResources, file));
console.log("Updated Safari Xcode resources");
