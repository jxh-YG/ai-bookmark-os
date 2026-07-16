// AI Bookmark OS bridge — loaded by AI Bookmark OS service worker
// 探测逻辑由 probe-core.js（须先加载）提供，此文件只做消息路由。

(function initAiBookmarkBridge() {
  // probe-core.js 须在此文件之前通过 importScripts 加载，暴露 self.AiProbeCore
  const core = self.AiProbeCore || {};
  const probeUrl       = core.probeUrl       || (() => Promise.resolve({ kind: 'suspect', detail: 'probe-core not loaded' }));
  const fetchPageMeta  = core.fetchPageMeta  || (() => Promise.resolve(null));
  const fetchPageContext = core.fetchPageContext || (() => Promise.resolve(null));

  try {
    chrome.sidePanel &&
      chrome.sidePanel.setPanelBehavior &&
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  } catch (_) {}

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'probeUrl' && typeof msg.url === 'string') {
      probeUrl(msg.url).then(sendResponse);
      return true;
    }
    if ((msg.type === 'fetchMeta' || msg.action === 'fetchMeta') && typeof msg.url === 'string') {
      fetchPageMeta(msg.url).then(sendResponse);
      return true;
    }
    if (msg.type === 'fetchPageContext' && typeof msg.url === 'string') {
      fetchPageContext(msg.url).then(sendResponse);
      return true;
    }
    if (msg.type === 'openSidePanel' || msg.action === 'openAiSidePanel') {
      (async () => {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (chrome.sidePanel && chrome.sidePanel.setOptions) {
            await chrome.sidePanel.setOptions({ path: 'ai/sidepanel.html', enabled: true });
          }
          if (tab && tab.windowId != null && chrome.sidePanel && chrome.sidePanel.open) {
            await chrome.sidePanel.open({ windowId: tab.windowId });
            sendResponse({ ok: true });
            return;
          }
          sendResponse({ ok: false, error: 'sidePanel unavailable' });
        } catch (err) {
          sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
        }
      })();
      return true;
    }
  });


  // Extra command for AI side panel without overriding AI Bookmark OS commands
  if (chrome.commands && chrome.commands.onCommand) {
    chrome.commands.onCommand.addListener((command) => {
      if (command === 'open-ai-sidepanel') {
        chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
          const openFallback = () => chrome.tabs.create({ url: chrome.runtime.getURL('ai/sidepanel.html') });
          const open = () => {
            if (tab && tab.windowId != null && chrome.sidePanel && chrome.sidePanel.open) {
              return chrome.sidePanel.open({ windowId: tab.windowId }).catch(openFallback);
            }
            return openFallback();
          };
          if (chrome.sidePanel && chrome.sidePanel.setOptions) {
            chrome.sidePanel
              .setOptions({ path: 'ai/sidepanel.html', enabled: true })
              .catch(() => undefined)
              .then(open);
          } else {
            void open();
          }
        });
      }
    });
  }


  // After extension update, sidepanel can show changelog
  try {
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'update' && details.previousVersion) {
        const current = chrome.runtime.getManifest().version;
        if (details.previousVersion !== current) {
          chrome.storage.local.set({
            pendingWhatsNew: { from: details.previousVersion, to: current, at: Date.now() },
          });
        }
      }
    });
  } catch (_) {}

  // Clear legacy pending-pyramid-classify queue. AI assist tagging already handles new bookmarks.
  chrome.storage.local.remove('pendingNewBookmarks').then(() => {
    chrome.action.getBadgeText({}).then((text) => {
      if (text && /^\d+$/.test(text)) chrome.action.setBadgeText({ text: '' }).catch(() => {});
    }).catch(() => {});
  }).catch(() => {});
})();
