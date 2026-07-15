(() => {
  const ROUTES = {
    workspace: 'pages/standalone/standalone.html',
    aiClassify: 'ai/sidepanel.html',
    bookmarkNav: 'ai/bookmark-nav.html',
    checker: 'pages/checker/checker.html',
    graph: 'pages/graph/graph.html',
    settings: 'pages/settings/settings.html',
  };

  function cleanPath(path) {
    return String(path || '').replace(/^\/+/, '').split(/[?#]/)[0];
  }

  function getTabPath(url) {
    const runtimeBase = chrome.runtime.getURL('');
    if (!url || !url.startsWith(runtimeBase)) return '';
    return cleanPath(url.slice(runtimeBase.length));
  }

  async function focusTab(tab, url) {
    if (!tab?.id) return false;
    const update = { active: true };
    if (url && tab.url !== url) update.url = url;
    await chrome.tabs.update(tab.id, update);
    if (tab.windowId != null && chrome.windows?.update) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return true;
  }

  async function openOrFocusExtensionPage(path) {
    const targetPath = cleanPath(path);
    const targetUrl = chrome.runtime.getURL(path);

    if (!chrome.tabs?.query) {
      window.location.href = targetUrl;
      return null;
    }

    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((tab) => getTabPath(tab.url) === targetPath);
    if (existing) {
      await focusTab(existing, targetUrl);
      return existing;
    }

    return chrome.tabs.create({ url: targetUrl });
  }

  async function openAiClassificationPanel() {
    const panelPath = ROUTES.aiClassify;

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

  window.AIBookmarkPageRouter = {
    ROUTES,
    openOrFocusExtensionPage,
    openAiClassificationPanel,
  };
})();
