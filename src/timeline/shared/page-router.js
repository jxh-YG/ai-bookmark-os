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

  window.AIBookmarkPageRouter = {
    ROUTES,
    openOrFocusExtensionPage,
  };
})();
