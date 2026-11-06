browser.action.onClicked.addListener(() => {
  browser.tabs.create({ url: browser.runtime.getURL("panel.html") }).catch(console.error);
});
