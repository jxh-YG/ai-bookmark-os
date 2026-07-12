// background/feed-discover.js
// 自动发现当前页 RSS/Atom feed 链接
// 通过 chrome.scripting 注入嗅探函数，读取 <link rel="alternate">
//
// 依赖：chrome.scripting, chrome.tabs

(function (global) {
  'use strict';

  function _isDiscoverable(url) {
    if (!url) return false;
    return !/^(chrome|chrome-extension|about|edge|view-source|file):/i.test(url);
  }

  // 在指定 tab 中嗅探 feed 链接
  async function discoverInTab(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!_isDiscoverable(tab.url)) return [];
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const links = Array.from(document.querySelectorAll('link[rel="alternate"]'));
          const out = [];
          for (const l of links) {
            const type = (l.type || '').toLowerCase();
            const href = l.href || l.getAttribute('href') || '';
            if (!href) continue;
            const isFeedType = type.includes('rss') || type.includes('atom') || type.includes('json');
            const isFeedUrl = /feed|rss|atom/i.test(href);
            if (isFeedType || isFeedUrl) {
              out.push({ url: href, title: l.title || '', type: l.type || '' });
            }
          }
          // 去重
          const seen = new Set();
          return out.filter(l => {
            if (seen.has(l.url)) return false;
            seen.add(l.url);
            return true;
          });
        },
        world: 'ISOLATED'
      });
      return (result && result.result) || [];
    } catch {
      return [];
    }
  }

  // 供 popup / sidepanel 查询当前活动页可订阅源
  async function discoverForActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0 || !tabs[0].id) return [];
    return discoverInTab(tabs[0].id);
  }

  global.FeedDiscover = { discoverInTab, discoverForActiveTab };
})(typeof self !== 'undefined' ? self : this);
