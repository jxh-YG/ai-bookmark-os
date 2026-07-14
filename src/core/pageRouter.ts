function cleanPath(path: string) {
  return path.replace(/^\/+/, '').split(/[?#]/)[0];
}

function getExtensionTabPath(url?: string) {
  if (!url || typeof chrome === 'undefined' || !chrome.runtime?.getURL) return '';
  const runtimeBase = chrome.runtime.getURL('');
  if (!url.startsWith(runtimeBase)) return '';
  return cleanPath(url.slice(runtimeBase.length));
}

async function focusExtensionTab(tab: chrome.tabs.Tab, url: string) {
  if (tab.id == null) return false;
  const update: chrome.tabs.UpdateProperties = { active: true };
  if (tab.url !== url) update.url = url;
  await chrome.tabs.update(tab.id, update);
  if (tab.windowId != null && chrome.windows?.update) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
  return true;
}

export async function openOrFocusExtensionPage(path: string) {
  const targetPath = cleanPath(path);
  const targetUrl = chrome.runtime.getURL(path);

  if (!chrome.tabs?.query) {
    window.location.href = targetUrl;
    return;
  }

  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => getExtensionTabPath(tab.url) === targetPath);
  if (existing && await focusExtensionTab(existing, targetUrl)) return;

  await chrome.tabs.create({ url: targetUrl });
}
