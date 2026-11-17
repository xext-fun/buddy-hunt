importScripts("core.js", "watchlist-matcher.js", "watchlist-background.js", "chat-core.js", "recorder-background.js", "chat-background.js");
browser.action.onClicked.addListener(() => {
  browser.tabs.create({ url: browser.runtime.getURL("panel.html") }).catch(console.error);
});
