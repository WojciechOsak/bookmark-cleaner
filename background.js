chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("manager.html");
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(tab => tab.url === url);

  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }

  await chrome.tabs.create({ url });
});
