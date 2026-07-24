const RELOAD_ON_FOCUS_PATHS = new Set(['pages/graph/graph.html']);

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
  if (existing) {
    const shouldReload = existing.url === targetUrl && RELOAD_ON_FOCUS_PATHS.has(targetPath);
    if (await focusExtensionTab(existing, targetUrl)) {
      if (shouldReload && existing.id != null) {
        await chrome.tabs.reload(existing.id, { bypassCache: true });
      }
      return;
    }
  }

  const created = await chrome.tabs.create({ url: targetUrl });
  if (created.id != null && RELOAD_ON_FOCUS_PATHS.has(targetPath)) {
    await chrome.tabs.reload(created.id, { bypassCache: true });
  }
}

/** Opens the AI classifier consistently from React extension pages. */
export async function openAiClassificationPanel(): Promise<'side-panel' | 'tab'> {
  const panelPath = 'ai/sidepanel.html';

  try {
    if (chrome.sidePanel?.setOptions) {
      await chrome.sidePanel.setOptions({ path: panelPath, enabled: true });
    }
    const currentWindow = chrome.windows?.getCurrent
      ? await chrome.windows.getCurrent()
      : null;
    if (chrome.sidePanel?.open && currentWindow?.id != null) {
      await chrome.sidePanel.open({ windowId: currentWindow.id });
      return 'side-panel';
    }
  } catch (error) {
    console.warn('AI side panel open failed; trying the background bridge.', error);
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: 'openSidePanel', action: 'openAiSidePanel' });
    if (response?.ok) return 'side-panel';
    if (response?.error) console.warn('AI side panel bridge failed.', response.error);
  } catch (error) {
    console.warn('AI side panel bridge failed.', error);
  }

  await openOrFocusExtensionPage(panelPath);
  return 'tab';
}
