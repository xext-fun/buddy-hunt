browser.action.onClicked.addListener(() => {
  browser.sidebarAction.open().catch(console.error);
});
