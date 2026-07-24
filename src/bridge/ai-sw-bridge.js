// AI Bookmark OS bridge — loaded by AI Bookmark OS service worker
// 探测逻辑由 probe-core.js（须先加载）提供，此文件只做消息路由。

(function initAiBookmarkBridge() {
  // probe-core.js 须在此文件之前通过 importScripts 加载，暴露 self.AiProbeCore
  const core = self.AiProbeCore || {};
  const checkUrl       = core.checkUrl       || ((url) => Promise.resolve({
    state: 'transient_failure',
    reason: 'probe-core-not-loaded',
    statusCode: null,
    finalUrl: url,
    checkedAt: Date.now(),
    probeMode: 'anonymous',
  }));
  const probeUrl       = core.probeUrl       || (() => Promise.resolve({ kind: 'suspect', detail: 'probe-core not loaded' }));
  const fetchPageMeta  = core.fetchPageMeta  || (() => Promise.resolve(null));
  const fetchPageContext = core.fetchPageContext || (() => Promise.resolve(null));
  const resolveSessionRecheck = core.resolveSessionRecheck || ((result) => result);
  const confirmedMissingPatterns = core.getConfirmedMissingPatterns
    ? core.getConfirmedMissingPatterns()
    : [];
  const checkRuns = new Map();
  const cancelledRuns = new Map();
  const ownedMessageTypes = new Set([
    'probeUrl',
    'checkUrl',
    'recheckUrlWithSession',
    'cancelLinkCheckRun',
    'fetchMeta',
    'fetchPageContext',
    'openSidePanel',
  ]);
  const ownedMessageActions = new Set(['fetchMeta', 'openAiSidePanel']);

  function ownsRuntimeMessage(message) {
    return Boolean(
      message
      && typeof message === 'object'
      && (ownedMessageTypes.has(message.type) || ownedMessageActions.has(message.action)),
    );
  }

  self.AIBookmarkBridge = { ownsRuntimeMessage };

  function controllerForRun(runId) {
    if (!runId) return null;
    const key = String(runId);
    const cancelledAt = cancelledRuns.get(key);
    if (Number.isFinite(cancelledAt) && Date.now() - cancelledAt < 60_000) {
      const controller = new AbortController();
      controller.abort();
      return { controller, active: 0, cancelled: true };
    }
    cancelledRuns.delete(key);
    let run = checkRuns.get(key);
    if (!run) {
      run = { controller: new AbortController(), active: 0 };
      checkRuns.set(key, run);
    }
    run.active += 1;
    return run;
  }

  function releaseRun(runId, run) {
    if (!runId || !run) return;
    run.active -= 1;
    if (run.active <= 0 && checkRuns.get(String(runId)) === run) {
      checkRuns.delete(String(runId));
    }
  }

  function failedResult(url, probeMode, reason) {
    return {
      state: 'transient_failure',
      reason,
      statusCode: null,
      finalUrl: typeof url === 'string' ? url : '',
      checkedAt: Date.now(),
      probeMode,
    };
  }

  function collectRenderedSignals(missingPatterns) {
    const title = String(document.title || '').slice(0, 240);
    const text = String(document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 6000);
    const page = `${title} ${text}`;
    const missingSignal = Array.isArray(missingPatterns) && missingPatterns.some((pattern) => {
      try {
        return new RegExp(pattern.source, pattern.flags).test(page);
      } catch (_) {
        return false;
      }
    });
    return {
      url: location.href,
      title,
      missingSignal,
      challengeSignal: /captcha|verify you are human|access denied|just a moment|cloudflare|安全验证|验证码|人机验证|访问过于频繁/i.test(page),
    };
  }

  function waitForTabLoad(tabId, timeoutMs, signal) {
    return new Promise((resolve, reject) => {
      let finished = false;
      const timer = setTimeout(() => done(new Error('render-tab-timeout')), timeoutMs);
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') done();
      };
      const abort = () => {
        const error = new Error('render-tab-aborted');
        error.name = 'AbortError';
        done(error);
      };
      function done(error) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        signal?.removeEventListener('abort', abort);
        error ? reject(error) : resolve();
      }
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener('abort', abort, { once: true });
      chrome.tabs.onUpdated.addListener(listener);
      chrome.tabs.get(tabId).then((tab) => {
        if (tab.status === 'complete') done();
      }).catch(() => {});
    });
  }

  async function recheckUrlWithSession(url, options, runId) {
    const run = controllerForRun(runId);
    let sessionResult;
    let tab;
    try {
      sessionResult = await checkUrl(url, {
        ...(options && typeof options === 'object' ? options : {}),
        probeMode: 'authenticated',
        signal: run?.controller.signal,
      });
      if (sessionResult.state === 'reachable' || sessionResult.reason === 'aborted') return sessionResult;
      tab = await chrome.tabs.create({ url, active: false });
      if (!tab.id) throw new Error('render-tab-unavailable');
      if (tab.status !== 'complete') await waitForTabLoad(tab.id, 10_000, run?.controller.signal);
      if (run?.controller.signal.aborted) throw new Error('render-tab-aborted');
      const injected = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: collectRenderedSignals,
        args: [confirmedMissingPatterns],
      });
      return resolveSessionRecheck(sessionResult, injected?.[0]?.result);
    } catch (_) {
      return sessionResult
        ? resolveSessionRecheck(sessionResult, null)
        : failedResult(url, 'authenticated', 'session-recheck-failed');
    } finally {
      if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
      releaseRun(runId, run);
    }
  }

  try {
    chrome.sidePanel &&
      chrome.sidePanel.setPanelBehavior &&
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  } catch (_) {}

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!ownsRuntimeMessage(msg)) return;
    if (msg.type === 'probeUrl' && typeof msg.url === 'string') {
      probeUrl(msg.url).then(sendResponse);
      return true;
    }
    if (msg.type === 'checkUrl' && typeof msg.url === 'string') {
      const run = controllerForRun(msg.runId);
      (async () => {
        let result;
        try {
          result = await checkUrl(msg.url, {
            ...(msg.options && typeof msg.options === 'object' ? msg.options : {}),
            probeMode: 'anonymous',
            credentials: 'omit',
            signal: run?.controller.signal,
          });
        } catch (_) {
          result = failedResult(msg.url, 'anonymous', 'probe-failed');
        } finally {
          releaseRun(msg.runId, run);
        }
        sendResponse({ success: true, result });
      })();
      return true;
    }
    if (msg.type === 'recheckUrlWithSession' && typeof msg.url === 'string') {
      recheckUrlWithSession(msg.url, msg.options, msg.runId).then((result) => sendResponse({ success: true, result }));
      return true;
    }
    if (msg.type === 'cancelLinkCheckRun') {
      const key = String(msg.runId || '');
      const run = checkRuns.get(key);
      if (run) run.controller.abort();
      checkRuns.delete(key);
      if (key) {
        cancelledRuns.set(key, Date.now());
      }
      sendResponse({ cancelled: Boolean(run) });
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
