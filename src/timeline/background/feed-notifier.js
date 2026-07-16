// background/feed-notifier.js
// 新文章桌面通知 + popup badge 未读数
//
// 依赖：FeedStore, chrome.notifications, chrome.action
// 由 feed-fetcher 在 pollAll 完成后调用 global.onFeedPollComplete(results)

(function (global) {
  'use strict';

  const ICON = 'icons/icon128.png';

  // 更新 popup 图标 badge 未读数
  async function updateBadge() {
    try {
      const count = await FeedStore.getTotalUnreadCount();
      const text = count > 0 ? (count > 999 ? '999+' : String(count)) : '';
      await chrome.action.setBadgeText({ text });
      await chrome.action.setBadgeBackgroundColor({ color: '#e91e63' });
    } catch { /* 静默 */ }
  }

  // 拉取完成后：发通知 + 更新 badge
  async function onFeedPollComplete(results) {
    if (!Array.isArray(results)) return;
    const settings = await FeedStore.getSettings();
    const feeds = await FeedStore.getAllFeeds();
    const feedMap = new Map(feeds.map(f => [f.id, f]));

    for (const r of results) {
      if (!r || !r.added || r.added.length === 0) continue;
      const feed = feedMap.get(r.feedId) || r.feed;
      if (!feed) continue;

      // 通知：全局开关 + 该 feed 通知开关
      if (settings.notifyNew && feed.notify) {
        _notifyNewArticles(feed, r.added);
      }
    }

    await updateBadge();
  }

  function _notifyNewArticles(feed, items) {
    try {
      if (items.length === 1) {
        const it = items[0];
        chrome.notifications.create('rss_single_' + feed.id + '_' + it.id, {
          type: 'basic',
          iconUrl: ICON,
          title: `${feed.title} · ${_t('rssNewArticle')}`,
          message: it.title || '',
          contextMessage: (it.summary || '').slice(0, 100)
        });
      } else {
        chrome.notifications.create('rss_multi_' + feed.id, {
          type: 'basic',
          iconUrl: ICON,
          title: `${feed.title} · ${items.length} ${_t('rssNewArticles')}`,
          message: items.slice(0, 3).map(i => '• ' + (i.title || '')).join('\n')
        });
      }
    } catch { /* 静默 */ }
  }

  // 通知点击：打开 standalone 订阅视图
  if (chrome.notifications && chrome.notifications.onClicked) {
    chrome.notifications.onClicked.addListener((notifId) => {
      if (!notifId.startsWith('rss_')) return;
      const url = chrome.runtime.getURL('pages/standalone/standalone.html?view=feeds');
      chrome.tabs.create({ url });
      chrome.notifications.clear(notifId);
    });
  }

  // 简易 i18n 占位（background 无 DOM，回退中文）
  const _zhMap = {
    rssNewArticle: '新文章',
    rssNewArticles: '篇新文章'
  };
  function _t(key) {
    if (typeof global.i18n === 'function') {
      try { return global.i18n(key) || _zhMap[key] || key; } catch {}
    }
    return _zhMap[key] || key;
  }

  global.onFeedPollComplete = onFeedPollComplete;
  global.FeedNotifier = { updateBadge, onFeedPollComplete };
})(typeof self !== 'undefined' ? self : this);
