/* ===== RSS Feed View Module ===== */
/* 独立窗口的 RSS 阅读视图：订阅列表、文章列表、添加订阅、已读/未读/加星/存书签 */
/* 依赖（由 standalone.js 提供到全局）：i18n, showToast, escapeHtml, openBookmarkInWindow, mdiManager, mdiWindowEnabled */

(function () {
  'use strict';

  // ===== SVG 图标 =====
  const SVG_RSS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>';
  const SVG_STAR = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
  const SVG_STAR_FILL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
  const SVG_BOOKMARK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  const SVG_BOOKMARK_FILL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  const SVG_REFRESH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
  const SVG_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  const SVG_EXTERNAL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
  const SVG_ADD = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  const SVG_CLOSE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  const SVG_SEARCH = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  const SVG_EDIT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
  const SVG_DELETE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

  const DEFAULT_FAVICON = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%239aa0a6%22><path d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z%22/></svg>';

  // ===== 状态 =====
  let feeds = [];
  let currentItems = [];
  let currentView = 'all'; // 'all' | 'starred' | feedId
  let showUnreadOnly = false;
  let isRefreshing = false;
  let feedUnreadCounts = new Map(); // feedId -> unread count
  let totalUnread = 0;
  let addDialogEl = null;

  // ===== DOM 引用（延迟获取） =====
  let feedListEl = null;
  let feedViewEl = null;

  function getFeedListEl() {
    if (!feedListEl) feedListEl = document.getElementById('saRssFeedList');
    return feedListEl;
  }

  function getFeedViewEl() {
    if (!feedViewEl) feedViewEl = document.getElementById('saFeedView');
    return feedViewEl;
  }

  // ===== 工具函数 =====
  function t(key, subs) {
    if (typeof window.i18n === 'function') return window.i18n(key, subs);
    return key;
  }

  function esc(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type);
  }

  function getFaviconForUrl(url) {
    try {
      const u = new URL(url);
      // 国内可访问的公共 favicon 服务
      return `https://api.iowen.cn/favicon/${u.hostname}.png`;
    } catch {
      return DEFAULT_FAVICON;
    }
  }

  function formatRelative(ts) {
    if (!ts) return '';
    const now = Date.now();
    const diff = now - ts;
    const min = Math.floor(diff / 60000);
    const hr = Math.floor(diff / 3600000);
    const day = Math.floor(diff / 86400000);
    if (min < 1) return t('justNow');
    if (min < 60) return t('minutesAgo', [min]);
    if (hr < 24) return t('hoursAgo', [hr]);
    if (day < 7) return t('daysAgo', [day]);
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function send(action, payload) {
    return chrome.runtime.sendMessage({ action, ...payload });
  }

  // ===== 初始化 =====
  let _renderDebounceTimer = null;
  let _loadDebounceTimer = null;

  // 防抖：合并短时间内的多次渲染请求
  function scheduleRender() {
    if (_renderDebounceTimer) return;
    _renderDebounceTimer = requestAnimationFrame(() => {
      _renderDebounceTimer = null;
      if (isVisible()) renderCurrentView();
    });
  }

  function scheduleLoad() {
    if (_loadDebounceTimer) clearTimeout(_loadDebounceTimer);
    _loadDebounceTimer = setTimeout(async () => {
      _loadDebounceTimer = null;
      await loadFeedsAndRender();
      scheduleRender();
    }, 80);
  }

  async function init() {
    // 监听后台数据变化
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'rssDataChanged' || message.action === 'rssUnreadChanged') {
        scheduleLoad();
      }
    });

    // 监听 storage 变化（跨窗口同步）
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.rss_feeds || changes.rss_settings) {
        scheduleLoad();
        return;
      }
      // 文章条目变化（如另一窗口标记已读）→ 刷新当前视图
      for (const key of Object.keys(changes)) {
        if (key.startsWith('rss_items_')) {
          scheduleLoad();
          return;
        }
      }
    });

    await loadFeedsAndRender();
    wireSidebarActions();
  }

  // 更新侧栏 Tab 未读徽标
  function updateSidebarTabBadge() {
    const badge = document.getElementById('saRssUnreadCount');
    if (!badge) return;
    if (totalUnread > 0) {
      badge.textContent = totalUnread > 99 ? '99+' : String(totalUnread);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  async function loadFeedsAndRender() {
    try {
      // 使用批量接口，一次获取所有 feeds + 未读数，消除 N+1 查询
      const resp = await send('rssGetFeedsWithUnread', {});
      if (resp && resp.success) {
        feeds = resp.feeds;
        feedUnreadCounts.clear();
        totalUnread = 0;
        const uc = resp.unreadCounts || {};
        for (const feed of feeds) {
          const cnt = uc[feed.id] || 0;
          feedUnreadCounts.set(feed.id, cnt);
          totalUnread += cnt;
        }
      } else {
        feeds = [];
        feedUnreadCounts.clear();
        totalUnread = 0;
      }
      renderFeedList();
      updateSidebarTabBadge();
    } catch (err) {
      console.warn('RSS load feeds failed:', err);
    }
  }

  // ===== 侧栏订阅列表渲染 =====
  function renderFeedList() {
    const el = getFeedListEl();
    if (!el) return;
    el.innerHTML = '';

    // "全部订阅" 节点
    const allNode = createFeedListNode({
      id: 'all',
      title: t('rssAllFeeds'),
      icon: SVG_RSS,
      unread: totalUnread,
      active: currentView === 'all' && isVisible()
    });
    el.appendChild(allNode);

    // "已加星" 节点
    const starredNode = createFeedListNode({
      id: 'starred',
      title: t('rssStarred'),
      icon: SVG_STAR,
      unread: 0,
      active: currentView === 'starred' && isVisible(),
      hideUnread: true
    });
    el.appendChild(starredNode);

    // 各订阅源
    for (const feed of feeds) {
      const node = createFeedListNode({
        id: feed.id,
        title: feed.title || feed.url,
        favicon: feed.favicon || (feed.siteUrl ? getFaviconForUrl(feed.siteUrl) : ''),
        unread: feedUnreadCounts.get(feed.id) || 0,
        active: currentView === feed.id && isVisible(),
        draggable: true
      });
      node.dataset.feedId = feed.id;
      node.title = feed.url;
      el.appendChild(node);
    }

    // 空状态提示
    if (feeds.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sa-rss-feed-empty-hint';
      empty.style.cssText = 'padding:6px 10px;font-size:11px;color:var(--text-tertiary);';
      empty.textContent = t('rssNoFeeds');
      el.appendChild(empty);
    }
  }

  // ===== 订阅源拖拽排序 =====
  let draggedFeedId = null;

  // 根据拖拽源与目标 id，在 feeds 数组中重排，返回新的 id 序列；
  // position: 'before' 插到目标之前 / 'after' 插到目标之后；不修改 feeds
  function computeReorderedFeedIds(fromId, toId, position) {
    const ids = feeds.map(f => f.id);
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return null;
    ids.splice(fromIdx, 1);
    // 源被移除后，目标的新索引（若源在目标之前，目标会前移一位）
    const targetNewIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
    const insertIdx = position === 'after' ? targetNewIdx + 1 : targetNewIdx;
    ids.splice(insertIdx, 0, fromId);
    return ids;
  }

  async function applyFeedReorder(fromId, toId, position) {
    const newIds = computeReorderedFeedIds(fromId, toId, position);
    if (!newIds) return;
    // 本地立即重排 feeds，UI 即时响应
    const map = new Map(feeds.map(f => [f.id, f]));
    feeds = newIds.map(id => map.get(id)).filter(Boolean);
    renderFeedList();
    // 全部订阅 / 已收藏视图（卡片网格）也按 feeds 顺序渲染，拖完即时刷新
    if (currentView === 'all' || currentView === 'starred') renderCurrentView();
    // 持久化（失败时回滚由 storage.onChanged 触发的 scheduleLoad 修正）
    try {
      await send('rssReorderFeeds', { orderedIds: newIds });
    } catch (err) {
      console.warn('[RSS] reorder failed:', err);
    }
  }

  function bindFeedNodeDrag(div, feedId) {
    div.draggable = true;
    div.addEventListener('dragstart', (e) => {
      draggedFeedId = feedId;
      div.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', feedId); } catch { /* ignore */ }
    });
    div.addEventListener('dragend', () => {
      draggedFeedId = null;
      div.classList.remove('dragging');
      // 清理所有残留的 drag-over 标记
      const list = getFeedListEl();
      if (list) list.querySelectorAll('.sa-rss-feed-item.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
    div.addEventListener('dragover', (e) => {
      if (!draggedFeedId || draggedFeedId === feedId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      div.classList.add('drag-over');
    });
    div.addEventListener('dragleave', () => {
      div.classList.remove('drag-over');
    });
    div.addEventListener('drop', (e) => {
      e.preventDefault();
      div.classList.remove('drag-over');
      if (draggedFeedId && draggedFeedId !== feedId) {
        const fromId = draggedFeedId;
        draggedFeedId = null;
        // 垂直列表：上半部分插到目标前，下半部分插到目标后
        const rect = div.getBoundingClientRect();
        const position = e.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
        applyFeedReorder(fromId, feedId, position);
      }
    });
  }

  // 卡片网格（全部订阅视图）拖拽：水平方向用左/右半区决定 before/after
  function bindOverviewCardDrag(card, feedId) {
    card.draggable = true;
    card.addEventListener('dragstart', (e) => {
      draggedFeedId = feedId;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', feedId); } catch { /* ignore */ }
    });
    card.addEventListener('dragend', () => {
      draggedFeedId = null;
      card.classList.remove('dragging');
      card.classList.remove('drag-over-left', 'drag-over-right');
    });
    card.addEventListener('dragover', (e) => {
      if (!draggedFeedId || draggedFeedId === feedId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = card.getBoundingClientRect();
      const isRightHalf = e.clientX > rect.left + rect.width / 2;
      card.classList.toggle('drag-over-right', isRightHalf);
      card.classList.toggle('drag-over-left', !isRightHalf);
    });
    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over-left', 'drag-over-right');
    });
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      const rect = card.getBoundingClientRect();
      const position = e.clientX > rect.left + rect.width / 2 ? 'after' : 'before';
      card.classList.remove('drag-over-left', 'drag-over-right');
      if (draggedFeedId && draggedFeedId !== feedId) {
        const fromId = draggedFeedId;
        draggedFeedId = null;
        applyFeedReorder(fromId, feedId, position);
      }
    });
  }

  function createFeedListNode(opts) {
    const div = document.createElement('div');
    div.className = 'sa-rss-feed-item' + (opts.active ? ' active' : '');
    div.dataset.feedId = opts.id;

    let iconHtml = '';
    if (opts.favicon) {
      iconHtml = `<img class="sa-rss-feed-favicon" src="${esc(opts.favicon)}" draggable="false" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'sa-rss-feed-icon',innerHTML:'${SVG_RSS.replace(/"/g, '&quot;')}'}))">`;
    } else {
      iconHtml = `<span class="sa-rss-feed-icon">${opts.icon || SVG_RSS}</span>`;
    }

    const unreadHtml = opts.hideUnread ? '' : `<span class="sa-rss-feed-unread${opts.unread === 0 ? ' zero' : ''}">${opts.unread}</span>`;

    div.innerHTML = `${iconHtml}<span class="sa-rss-feed-label">${esc(opts.title)}</span>${unreadHtml}`;
    div.addEventListener('click', () => {
      show(opts.id);
    });
    // 右键菜单：管理订阅源
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showFeedContextMenu(opts.id, e.clientX, e.clientY);
    });
    // 仅真实订阅源节点可拖拽排序（排除 "全部订阅" / "已收藏"）
    if (opts.draggable) bindFeedNodeDrag(div, opts.id);
    return div;
  }

  // ===== 订阅源右键菜单 =====
  let feedContextMenuEl = null;
  let feedContextMenuOutsideHandler = null;

  function showFeedContextMenu(feedId, x, y) {
    hideFeedContextMenu();
    const feed = feeds.find((f) => f.id === feedId);
    if (!feed) return;

    const menu = document.createElement('div');
    menu.className = 'sa-feed-context-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    const items = [
      { label: t('rssRefresh'), action: () => refreshFeed(feedId) },
      { label: t('rssMarkAllRead'), action: async () => {
        await send('rssMarkAllRead', { feedId });
        feedUnreadCounts.set(feedId, 0);
        totalUnread = Array.from(feedUnreadCounts.values()).reduce((a, b) => a + b, 0);
        renderFeedList();
        if (currentView === feedId) renderCurrentView();
        toast(t('rssUpdated'), 'success');
      }},
      { label: t('rssRemoveFeed'), danger: true, action: () => confirmRemoveFeed(feedId) }
    ];

    for (const item of items) {
      const btn = document.createElement('button');
      btn.className = 'sa-feed-context-item' + (item.danger ? ' danger' : '');
      btn.textContent = item.label;
      btn.addEventListener('click', () => {
        hideFeedContextMenu();
        item.action();
      });
      menu.appendChild(btn);
    }

    document.body.appendChild(menu);
    feedContextMenuEl = menu;

    // 调整位置避免超出视口
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
      if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
    });

    // 点击/右键外部关闭：用一个具名 handler，便于关闭时同步移除监听，
    // 避免 { once:true } 残留的 contextmenu 监听在新一次右键时把新菜单立刻关掉
    feedContextMenuOutsideHandler = (e) => {
      if (feedContextMenuEl && feedContextMenuEl.contains(e.target)) return; // 点在菜单内，交给按钮处理
      hideFeedContextMenu();
    };
    // 延迟到下一事件循环再绑定，避免触发本次右键事件立即关闭菜单
    setTimeout(() => {
      if (feedContextMenuOutsideHandler) {
        document.addEventListener('click', feedContextMenuOutsideHandler, true);
        document.addEventListener('contextmenu', feedContextMenuOutsideHandler, true);
      }
    }, 0);
  }

  function hideFeedContextMenu() {
    if (feedContextMenuEl) {
      feedContextMenuEl.remove();
      feedContextMenuEl = null;
    }
    if (feedContextMenuOutsideHandler) {
      document.removeEventListener('click', feedContextMenuOutsideHandler, true);
      document.removeEventListener('contextmenu', feedContextMenuOutsideHandler, true);
      feedContextMenuOutsideHandler = null;
    }
  }

  async function confirmRemoveFeed(feedId) {
    const feed = feeds.find((f) => f.id === feedId);
    if (!feed) return;
    if (!window.confirm(t('rssConfirmRemove', [feed.title]))) return;
    try {
      await send('rssRemoveFeed', { feedId });
      toast(t('rssFeedRemoved'), 'success');
      // 如果当前在查看该 feed，切回全部视图
      if (currentView === feedId) currentView = 'all';
      await loadFeedsAndRender();
      if (isVisible()) renderCurrentView();
    } catch (err) {
      console.warn('RSS removeFeed failed:', err);
      toast(t('rssFeedRemoveFailed') || 'Failed to remove', 'error');
    }
  }

  // ===== 侧栏按钮绑定 =====
  function wireSidebarActions() {
    const addBtn = document.getElementById('saRssAddBtn');
    if (addBtn) addBtn.addEventListener('click', () => openAddDialog());

    const refreshAllBtn = document.getElementById('saRssRefreshAllBtn');
    if (refreshAllBtn) refreshAllBtn.addEventListener('click', () => refreshAll());
  }

  // ===== 视图显示/隐藏 =====
  function isVisible() {
    const el = getFeedViewEl();
    return el && el.style.display !== 'none';
  }

  function show(viewId) {
    if (viewId !== undefined) currentView = viewId;
    const el = getFeedViewEl();
    if (!el) return;

    // 显示 RSS 视图（书签视图由 switchSidebarTab 统一管理）
    el.style.display = 'flex';

    // 高亮当前节点
    renderFeedList();
    renderCurrentView();
  }

  function hide() {
    const el = getFeedViewEl();
    if (el) el.style.display = 'none';
  }

  // ===== 主视图渲染 =====
  async function renderCurrentView() {
    const el = getFeedViewEl();
    if (!el) return;

    // 先构建完整内容再一次性替换，避免 innerHTML='' 导致布局抖动
    const wrapper = document.createDocumentFragment();

    // 头部
    const header = buildHeader();
    wrapper.appendChild(header);

    // 内容区
    const content = document.createElement('div');
    content.className = 'sa-feed-article-list';
    wrapper.appendChild(content);

    // 显示加载占位
    content.appendChild(buildLoading());

    // 一次性替换 DOM
    el.innerHTML = '';
    el.appendChild(wrapper);

    try {
      // "全部订阅"视图：卡片概览模式
      if (currentView === 'all') {
        content.className = 'sa-feed-overview';
        const allResp = await send('rssGetItems', {});
        const allItems = allResp && allResp.success ? allResp.items : [];
        currentItems = allItems;

        // 更新头部未读数
        const unreadCount = allItems.filter((i) => !i.read).length;
        const unreadEl = header.querySelector('.sa-feed-header-unread');
        if (unreadEl) unreadEl.textContent = t('rssTotalUnread', [unreadCount]);

        content.innerHTML = '';
        if (feeds.length === 0) {
          content.appendChild(buildEmpty());
        } else {
          content.appendChild(buildFeedOverviewCards(allItems));
        }
        return;
      }

      // "已加星"视图：按卡片标题分组展示
      if (currentView === 'starred') {
        content.className = 'sa-feed-overview';
        const allResp = await send('rssGetItems', {});
        const starredItems = allResp && allResp.success ? allResp.items.filter((i) => i.starred) : [];
        currentItems = starredItems;

        // 更新头部统计
        const unreadCount = starredItems.filter((i) => !i.read).length;
        const unreadEl = header.querySelector('.sa-feed-header-unread');
        if (unreadEl) unreadEl.textContent = t('rssTotalUnread', [unreadCount]);

        content.innerHTML = '';
        if (starredItems.length === 0) {
          content.appendChild(buildEmpty());
        } else {
          content.appendChild(buildStarredOverviewCards(starredItems));
        }
        return;
      }

      // 单个 feed 视图
      let items = [];
      {
        const resp = await send('rssGetItems', { feedId: currentView });
        items = resp && resp.success ? resp.items : [];
      }

      currentItems = items;

      // 过滤未读
      let display = showUnreadOnly ? items.filter((i) => !i.read) : items;
      // 排序：最新在前
      display = [...display].sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));

      content.innerHTML = '';
      if (display.length === 0) {
        content.appendChild(buildEmpty());
      } else {
        // 更新头部未读数
        const unreadCount = items.filter((i) => !i.read).length;
        const unreadEl = header.querySelector('.sa-feed-header-unread');
        if (unreadEl) unreadEl.textContent = t('rssTotalUnread', [unreadCount]);

        const frag = document.createDocumentFragment();
        for (const item of display) {
          frag.appendChild(buildArticleCard(item));
        }
        content.appendChild(frag);
      }
    } catch (err) {
      console.error('RSS render failed:', err);
      content.innerHTML = '';
      content.appendChild(buildError(err.message));
    }
  }

  function buildHeader() {
    const header = document.createElement('div');
    header.className = 'sa-feed-header';

    let title = t('rssAllFeeds');
    let favicon = '';
    if (currentView === 'starred') {
      title = t('rssStarred');
    } else if (currentView !== 'all') {
      const feed = feeds.find((f) => f.id === currentView);
      if (feed) {
        title = feed.title || feed.url;
        favicon = feed.favicon || (feed.siteUrl ? getFaviconForUrl(feed.siteUrl) : '');
      }
    }

    const titleHtml = favicon
      ? `<img class="sa-rss-feed-favicon" src="${esc(favicon)}" style="width:18px;height:18px;">`
      : `<span class="sa-rss-feed-icon" style="width:18px;height:18px;">${currentView === 'starred' ? SVG_STAR : SVG_RSS}</span>`;

    header.innerHTML = `
      <div class="sa-feed-header-title">
        ${titleHtml}
        <h2>${esc(title)}</h2>
        <span class="sa-feed-header-unread"></span>
      </div>
      <div class="sa-feed-header-actions">
        <button class="sa-feed-btn icon-only" id="saFeedUnreadToggle" data-i18n-title="rssShowUnreadOnly">
          ${SVG_CHECK}
        </button>
        <button class="sa-feed-btn icon-only" id="saFeedRefreshBtn" data-i18n-title="rssRefresh">
          ${SVG_REFRESH}
        </button>
        <button class="sa-feed-btn" id="saFeedMarkAllReadBtn">
          ${SVG_CHECK}<span>${esc(t('rssMarkAllRead'))}</span>
        </button>
      </div>
    `;

    // 未读过滤按钮状态
    if (showUnreadOnly) {
      header.querySelector('#saFeedUnreadToggle').classList.add('active');
    }

    // 绑定事件
    header.querySelector('#saFeedUnreadToggle').addEventListener('click', (e) => {
      showUnreadOnly = !showUnreadOnly;
      e.currentTarget.classList.toggle('active', showUnreadOnly);
      e.currentTarget.title = showUnreadOnly ? t('rssShowAll') : t('rssShowUnreadOnly');
      renderCurrentView();
    });

    header.querySelector('#saFeedRefreshBtn').addEventListener('click', () => {
      if (currentView === 'all' || currentView === 'starred') {
        refreshAll();
      } else {
        refreshFeed(currentView);
      }
    });

    header.querySelector('#saFeedMarkAllReadBtn').addEventListener('click', () => {
      markAllRead();
    });

    return header;
  }

  // ===== 全部订阅：订阅源卡片概览 =====
  function buildFeedOverviewCards(allItems) {
    const container = document.createElement('div');
    container.className = 'sa-feed-overview-grid';

    // 按 feedId 分组
    const itemsByFeed = new Map();
    for (const item of allItems) {
      if (!itemsByFeed.has(item.feedId)) itemsByFeed.set(item.feedId, []);
      itemsByFeed.get(item.feedId).push(item);
    }
    // 每个 feed 内按时间排序
    for (const [, arr] of itemsByFeed) {
      arr.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
    }

    // 按 feeds 数组顺序渲染（即用户自定义的拖拽顺序，与侧栏一致），
    // 让拖拽排序的结果在卡片网格中稳定生效
    for (const feed of feeds) {
      const items = itemsByFeed.get(feed.id) || [];
      container.appendChild(buildFeedOverviewCard(feed, items));
    }
    return container;
  }

  // 已收藏视图：按卡片标题分组展示收藏的文章
  function buildStarredOverviewCards(starredItems) {
    const container = document.createElement('div');
    container.className = 'sa-feed-overview-grid';

    // 按 feedId 分组
    const itemsByFeed = new Map();
    for (const item of starredItems) {
      if (!itemsByFeed.has(item.feedId)) itemsByFeed.set(item.feedId, []);
      itemsByFeed.get(item.feedId).push(item);
    }
    // 每个 feed 内按时间排序
    for (const [, arr] of itemsByFeed) {
      arr.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
    }

    // 按 feeds 数组顺序渲染（仅含有收藏文章的 feed），
    // 与侧栏/全部订阅保持一致的拖拽顺序
    for (const feed of feeds) {
      if (!itemsByFeed.has(feed.id)) continue;
      const items = itemsByFeed.get(feed.id) || [];
      container.appendChild(buildFeedOverviewCard(feed, items));
    }
    return container;
  }

  function buildFeedOverviewCard(feed, items) {
    const card = document.createElement('div');
    card.className = 'sa-feed-overview-card';
    card.dataset.feedId = feed.id;
    // 全部订阅 / 已收藏视图下卡片均可拖拽排序
    const isDraggable = currentView === 'all' || currentView === 'starred';
    if (isDraggable) bindOverviewCardDrag(card, feed.id);

    const favicon = feed.favicon || (feed.siteUrl ? getFaviconForUrl(feed.siteUrl) : '');
    const unread = feedUnreadCounts.get(feed.id) || 0;
    const top5 = items.slice(0, 5);
    const totalCount = items.length;
    const isStarredFeed = currentView === 'starred';

    // 卡片头部
    const faviconHtml = favicon
      ? `<img class="sa-feed-overview-favicon" src="${esc(favicon)}" draggable="false" onerror="this.style.display='none'">`
      : `<span class="sa-feed-overview-favicon-placeholder">${SVG_RSS}</span>`;

    const unreadHtml = unread > 0
      ? `<span class="sa-feed-overview-unread">${unread}</span>`
      : '';

    // 头部操作按钮：刷新 + 取消订阅 + 编辑 + 加星
    const refreshBtnHtml = `<button class="sa-feed-overview-action" draggable="false" data-act="refresh-feed" title="${esc(t('rssRefresh'))}">${SVG_REFRESH}</button>`;
    const deleteBtnHtml = `<button class="sa-feed-overview-action danger" draggable="false" data-act="remove-feed" title="${esc(t('rssRemoveFeed'))}">${SVG_DELETE}</button>`;
    const starBtnHtml = feed.starred
      ? `<button class="sa-feed-overview-action starred" draggable="false" data-act="star-feed" title="${esc(t('rssUnstar'))}">${SVG_STAR_FILL}</button>`
      : `<button class="sa-feed-overview-action" draggable="false" data-act="star-feed" title="${esc(t('rssStar'))}">${SVG_STAR}</button>`;
    const editBtnHtml = `<button class="sa-feed-overview-action" draggable="false" data-act="edit-feed" title="${esc(t('rssFeedSettings') || 'Edit')}">${SVG_EDIT}</button>`;

    // 文章预览行（含加星按钮）
    let itemsHtml = '';
    for (const item of top5) {
      const titleClass = item.read ? 'read' : 'unread';
      const time = formatRelative(item.publishedAt);
      const itemStarHtml = item.starred
        ? `<button class="sa-feed-overview-item-star starred" draggable="false" data-act="star-item" data-item-id="${esc(item.id)}" title="${esc(t('rssUnstar'))}">${SVG_STAR_FILL}</button>`
        : `<button class="sa-feed-overview-item-star" draggable="false" data-act="star-item" data-item-id="${esc(item.id)}" title="${esc(t('rssStar'))}">${SVG_STAR}</button>`;
      itemsHtml += `
        <div class="sa-feed-overview-item ${titleClass}" data-item-id="${esc(item.id)}">
          <span class="sa-feed-overview-item-title"><span class="sa-feed-overview-item-title-text">${esc(item.title || t('untitled'))}</span></span>
          ${itemStarHtml}
          <span class="sa-feed-overview-item-time">${esc(time)}</span>
        </div>`;
    }

    // 底部
    const footerText = totalCount > 5
      ? (t('rssFeedCardTotal') || '$1 articles').replace('$1', totalCount) + ' · ' + (t('rssFeedCardViewAll') || 'View all') + ' →'
      : (t('rssFeedCardTotal') || '$1 articles').replace('$1', totalCount);

    card.innerHTML = `
      <div class="sa-feed-overview-header">
        ${faviconHtml}
        <span class="sa-feed-overview-title"><span class="sa-feed-overview-title-text">${esc(feed.title || feed.url)}</span></span>
        <div class="sa-feed-overview-actions">
          ${refreshBtnHtml}
          ${deleteBtnHtml}
          ${starBtnHtml}
          ${editBtnHtml}
        </div>
        ${unreadHtml}
      </div>
      ${top5.length > 0 ? `<div class="sa-feed-overview-items">${itemsHtml}</div>` : `<div class="sa-feed-overview-empty">${esc(t('rssNoItems'))}</div>`}
      <div class="sa-feed-overview-footer">${esc(footerText)}</div>
    `;

    // 点击标题区域 → 进入该 feed 完整视图
    card.querySelector('.sa-feed-overview-title').addEventListener('click', (e) => {
      e.stopPropagation();
      show(feed.id);
    });

    // 点击 favicon → 进入该 feed 完整视图
    const faviconEl = card.querySelector('.sa-feed-overview-favicon, .sa-feed-overview-favicon-placeholder');
    if (faviconEl) faviconEl.addEventListener('click', (e) => {
      e.stopPropagation();
      show(feed.id);
    });

    // 点击底部 → 进入该 feed 完整视图
    card.querySelector('.sa-feed-overview-footer').addEventListener('click', () => {
      show(feed.id);
    });

    // 头部刷新按钮
    card.querySelector('[data-act="refresh-feed"]').addEventListener('click', (e) => {
      e.stopPropagation();
      refreshFeed(feed.id);
    });

    // 头部取消订阅按钮
    card.querySelector('[data-act="remove-feed"]').addEventListener('click', (e) => {
      e.stopPropagation();
      confirmRemoveFeed(feed.id);
    });

    // 头部加星按钮
    card.querySelector('[data-act="star-feed"]').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFeedStar(feed);
    });

    // 头部编辑按钮
    card.querySelector('[data-act="edit-feed"]').addEventListener('click', (e) => {
      e.stopPropagation();
      openFeedEditDialog(feed);
    });

    // 点击文章预览行 → 标记已读 + 打开原文
    for (const itemEl of card.querySelectorAll('.sa-feed-overview-item')) {
      itemEl.addEventListener('click', (e) => {
        // 如果点击的是星标按钮，不打开文章
        if (e.target.closest('[data-act="star-item"]')) return;
        e.stopPropagation();
        const itemId = itemEl.dataset.itemId;
        const item = items.find((i) => i.id === itemId);
        if (item) openArticle(item);
      });
    }

    // 文章加星按钮
    for (const starBtn of card.querySelectorAll('[data-act="star-item"]')) {
      starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const itemId = starBtn.dataset.itemId;
        const item = items.find((i) => i.id === itemId);
        if (item) toggleStar(item);
      });
    }

    // 标题溢出时启用跑马灯：悬浮标题时从左到右完整展示
    function applyMarquee(titleEl, textEl) {
      requestAnimationFrame(() => {
        const overflow = textEl.scrollWidth - titleEl.clientWidth;
        if (overflow > 4) {
          titleEl.style.setProperty('--marquee-distance', `-${overflow}px`);
          const duration = Math.max(3, Math.min(8, overflow / 28));
          titleEl.style.setProperty('--marquee-duration', `${duration.toFixed(1)}s`);
          titleEl.classList.add('marquee');
        }
      });
    }

    const titleEl = card.querySelector('.sa-feed-overview-title');
    const titleTextEl = titleEl.querySelector('.sa-feed-overview-title-text');
    applyMarquee(titleEl, titleTextEl);

    // 文章标题同样启用跑马灯
    for (const itemTitleEl of card.querySelectorAll('.sa-feed-overview-item-title')) {
      const itemTextEl = itemTitleEl.querySelector('.sa-feed-overview-item-title-text');
      applyMarquee(itemTitleEl, itemTextEl);
    }

    return card;
  }

  // ===== 订阅源级操作 =====

  // 切换订阅源加星状态
  async function toggleFeedStar(feed) {
    const newStarred = !feed.starred;
    try {
      await send('rssUpdateFeed', { feedId: feed.id, patch: { starred: newStarred } });
      feed.starred = newStarred;
      toast(newStarred ? t('rssStarred') : t('rssUnstar'), 'success');
      renderCurrentView();
    } catch (err) {
      toast(t('rssSubscribeFailed'), 'error');
    }
  }

  // 编辑订阅源弹窗
  function openFeedEditDialog(feed) {
    const overlay = document.createElement('div');
    overlay.className = 'sa-feed-add-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const dialog = document.createElement('div');
    dialog.className = 'sa-feed-add-dialog';

    dialog.innerHTML = `
      <div class="sa-feed-add-header">
        <h3>${esc(t('rssFeedSettings'))}</h3>
        <button class="sa-feed-add-close" id="saFeedEditClose">${SVG_CLOSE}</button>
      </div>
      <div class="sa-feed-add-body">
        <div class="sa-feed-add-field">
          <label>${esc(t('rssFeedUrl'))}</label>
          <input type="url" class="sa-feed-add-input" value="${esc(feed.url)}" readonly style="opacity:0.6;cursor:default;">
        </div>
        <div class="sa-feed-add-field">
          <label>${esc(t('rssFeedTitle'))}</label>
          <input type="text" class="sa-feed-add-input" id="saFeedEditTitle" value="${esc(feed.title || '')}">
        </div>
        <div class="sa-feed-add-field sa-feed-add-toggle-row">
          <span class="sa-feed-edit-label">${esc(t('rssAutoBookmark'))}</span>
          <label class="toggle-switch">
            <input type="checkbox" id="saFeedEditAutoBookmark" ${feed.autoBookmark ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="sa-feed-add-field sa-feed-add-toggle-row">
          <span class="sa-feed-edit-label">${esc(t('rssNotifyNew'))}</span>
          <label class="toggle-switch">
            <input type="checkbox" id="saFeedEditNotify" ${feed.notify !== false ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
      <div class="sa-feed-add-footer">
        <button class="sa-feed-btn" id="saFeedEditCancel">${esc(t('cancel'))}</button>
        <button class="sa-feed-btn sa-feed-btn--primary" id="saFeedEditSave">${esc(t('save'))}</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 关闭按钮
    dialog.querySelector('#saFeedEditClose').addEventListener('click', () => overlay.remove());
    dialog.querySelector('#saFeedEditCancel').addEventListener('click', () => overlay.remove());

    // 保存按钮
    dialog.querySelector('#saFeedEditSave').addEventListener('click', async () => {
      const title = dialog.querySelector('#saFeedEditTitle').value.trim();
      const autoBookmark = dialog.querySelector('#saFeedEditAutoBookmark').checked;
      const notify = dialog.querySelector('#saFeedEditNotify').checked;

      try {
        await send('rssUpdateFeed', {
          feedId: feed.id,
          patch: { title, autoBookmark, notify }
        });
        feed.title = title;
        feed.autoBookmark = autoBookmark;
        feed.notify = notify;
        toast(t('rssUpdated'), 'success');
        renderCurrentView();
        renderFeedList();
        overlay.remove();
      } catch (err) {
        toast(t('rssSubscribeFailed'), 'error');
      }
    });
  }

  function buildArticleCard(item) {
    const card = document.createElement('div');
    const hasImage = !!item.imageUrl;
    card.className = 'sa-feed-article ' + (item.read ? 'read' : 'unread') + (hasImage ? ' has-image' : ' no-image');
    card.dataset.itemId = item.id;
    card.dataset.feedId = item.feedId;

    const feed = feeds.find((f) => f.id === item.feedId);
    const sourceName = feed ? feed.title : '';
    const sourceFavicon = feed ? (feed.favicon || (feed.siteUrl ? getFaviconForUrl(feed.siteUrl) : '')) : '';

    const starBtn = item.starred
      ? `<button class="sa-feed-article-action starred" data-act="star" title="${esc(t('rssUnstar'))}">${SVG_STAR_FILL}</button>`
      : `<button class="sa-feed-article-action" data-act="star" title="${esc(t('rssStar'))}">${SVG_STAR}</button>`;

    const bookmarkBtn = item.bookmarkId
      ? `<button class="sa-feed-article-action saved" data-act="bookmark" title="${esc(t('rssSaved'))}">${SVG_BOOKMARK_FILL}</button>`
      : `<button class="sa-feed-article-action" data-act="bookmark" title="${esc(t('rssSaveBookmark'))}">${SVG_BOOKMARK}</button>`;

    const openBtn = `<button class="sa-feed-article-action" data-act="open" title="${esc(t('rssOpenOriginal'))}">${SVG_EXTERNAL}</button>`;

    const sourceHtml = sourceFavicon
      ? `<img src="${esc(sourceFavicon)}" onerror="this.style.display='none'">`
      : '';
    const sourceLine = sourceName
      ? `<span class="sa-feed-article-source">${sourceHtml}${esc(sourceName)}</span><span class="sa-feed-article-dot">·</span>`
      : '';

    // 缩略图（有图时渲染，加载失败自动隐藏）
    const thumbHtml = hasImage
      ? `<div class="sa-feed-article-thumb"><img src="${esc(item.imageUrl)}" loading="lazy" onerror="this.parentElement.style.display='none';this.closest('.sa-feed-article').classList.remove('has-image');this.closest('.sa-feed-article').classList.add('no-image');"></div>`
      : '';

    card.innerHTML = `
      ${thumbHtml}
      <div class="sa-feed-article-main">
        <div class="sa-feed-article-title">${esc(item.title || t('untitled'))}</div>
        ${item.summary ? `<div class="sa-feed-article-snippet">${esc(item.summary)}</div>` : ''}
        <div class="sa-feed-article-meta">
          ${sourceLine}
          <span>${esc(formatRelative(item.publishedAt))}</span>
        </div>
      </div>
      <div class="sa-feed-article-actions">
        ${starBtn}
        ${bookmarkBtn}
        ${openBtn}
      </div>
    `;

    // 点击文章主体：标记已读 + 打开原文
    card.querySelector('.sa-feed-article-main').addEventListener('click', () => {
      openArticle(item);
    });

    // 点击缩略图也打开文章
    const thumbEl = card.querySelector('.sa-feed-article-thumb');
    if (thumbEl) thumbEl.addEventListener('click', () => {
      openArticle(item);
    });

    // 操作按钮
    card.querySelector('[data-act="star"]').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleStar(item);
    });
    card.querySelector('[data-act="bookmark"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.bookmarkId) {
        toast(t('rssSaved'), 'info');
      } else {
        saveBookmark(item);
      }
    });
    card.querySelector('[data-act="open"]').addEventListener('click', (e) => {
      e.stopPropagation();
      openArticle(item);
    });

    return card;
  }

  function buildEmpty() {
    const div = document.createElement('div');
    div.className = 'sa-feed-empty';
    const isStarred = currentView === 'starred';
    div.innerHTML = `
      <span class="sa-rss-icon" style="color:var(--text-disabled);">${isStarred ? SVG_STAR : SVG_RSS}</span>
      <p class="sa-feed-empty-title">${esc(isStarred ? t('rssStarred') : t('rssNoItems'))}</p>
      <p class="sa-feed-empty-hint">${esc(t('rssNoItemsHint'))}</p>
    `;
    return div;
  }

  function buildLoading() {
    const div = document.createElement('div');
    div.className = 'sa-feed-loading';
    div.innerHTML = `<div class="sa-loading-dots"><span></span><span></span><span></span></div><span>${esc(t('rssFetching'))}</span>`;
    return div;
  }

  function buildError(msg) {
    const div = document.createElement('div');
    div.className = 'sa-feed-empty';
    div.innerHTML = `<p class="sa-feed-empty-title">${esc(t('rssFetchFailed'))}</p><p class="sa-feed-empty-hint">${esc(msg || '')}</p>`;
    return div;
  }

  // ===== 文章操作 =====
  function openArticle(item) {
    // 标记已读
    if (!item.read) {
      setRead(item, true);
    }
    // 在 MDI 窗口或新标签页打开
    // 注意：mdiManager / mdiWindowEnabled 是 standalone.js 的 let 变量，不在 window 上，
    // 由 openBookmarkInWindow 内部检查并返回 false 以回退到新标签页
    if (typeof window.openBookmarkInWindow === 'function') {
      const opened = window.openBookmarkInWindow(item.link, item.title);
      if (opened) return;
    }
    window.open(item.link, '_blank');
  }

  async function setRead(item, read) {
    try {
      await send('rssSetItemRead', { itemId: item.id, feedId: item.feedId, read });
      item.read = read;
      // 更新卡片 UI
      const card = getFeedViewEl().querySelector(`[data-item-id="${item.id}"]`);
      if (card) {
        card.classList.remove('read', 'unread');
        card.classList.add(read ? 'read' : 'unread');
      }
      // 更新未读计数
      if (read) {
        const cnt = feedUnreadCounts.get(item.feedId) || 0;
        feedUnreadCounts.set(item.feedId, Math.max(0, cnt - 1));
        totalUnread = Math.max(0, totalUnread - 1);
      } else {
        feedUnreadCounts.set(item.feedId, (feedUnreadCounts.get(item.feedId) || 0) + 1);
        totalUnread++;
      }
      renderFeedList();
    } catch (err) {
      console.warn('RSS setRead failed:', err);
    }
  }

  async function toggleStar(item) {
    try {
      await send('rssSetItemStarred', { itemId: item.id, feedId: item.feedId, starred: !item.starred });
      item.starred = !item.starred;
      // 更新按钮 UI
      const card = getFeedViewEl().querySelector(`[data-item-id="${item.id}"]`);
      if (card) {
        const btn = card.querySelector('[data-act="star"]');
        btn.classList.toggle('starred', item.starred);
        btn.innerHTML = item.starred ? SVG_STAR_FILL : SVG_STAR;
        btn.title = item.starred ? t('rssUnstar') : t('rssStar');
      }
      // 如果当前是已加星视图且取消加星，则移除该卡片
      if (currentView === 'starred' && !item.starred) {
        if (card) card.remove();
      }
    } catch (err) {
      console.warn('RSS toggleStar failed:', err);
    }
  }

  async function saveBookmark(item) {
    try {
      const resp = await send('rssSaveItemAsBookmark', { itemId: item.id, feedId: item.feedId });
      if (resp && resp.success) {
        item.bookmarkId = resp.bookmarkId;
        toast(t('rssItemSaved'), 'success');
        // 更新按钮 UI
        const card = getFeedViewEl().querySelector(`[data-item-id="${item.id}"]`);
        if (card) {
          const btn = card.querySelector('[data-act="bookmark"]');
          btn.classList.add('saved');
          btn.innerHTML = SVG_BOOKMARK_FILL;
          btn.title = t('rssSaved');
        }
      } else {
        toast(t('rssItemSaveFailed'), 'error');
      }
    } catch (err) {
      console.warn('RSS saveBookmark failed:', err);
      toast(t('rssItemSaveFailed'), 'error');
    }
  }

  async function markAllRead() {
    try {
      if (currentView === 'all') {
        await send('rssMarkAllFeedsRead', {});
      } else if (currentView === 'starred') {
        // 仅标记当前可见的加星项
        for (const item of currentItems.filter((i) => !i.read)) {
          await send('rssSetItemRead', { itemId: item.id, feedId: item.feedId, read: true });
        }
      } else {
        await send('rssMarkAllRead', { feedId: currentView });
      }
      // 重置未读计数
      if (currentView === 'all') {
        feedUnreadCounts.clear();
        totalUnread = 0;
      } else if (currentView !== 'starred') {
        feedUnreadCounts.set(currentView, 0);
        totalUnread = Array.from(feedUnreadCounts.values()).reduce((a, b) => a + b, 0);
      }
      renderFeedList();
      renderCurrentView();
      toast(t('rssUpdated'), 'success');
    } catch (err) {
      console.warn('RSS markAllRead failed:', err);
    }
  }

  // ===== 刷新 =====
  async function refreshAll() {
    if (isRefreshing) return;
    isRefreshing = true;
    toast(t('rssFetching'), 'info');
    try {
      const response = await send('rssRefreshAll', {});
      if (!response?.success) throw new Error(response?.error || 'rss_refresh_failed');
      await loadFeedsAndRender();
      if (isVisible()) renderCurrentView();
      const summary = response.result?.summary || {};
      const summaryText = (t('rssRefreshSummary') || 'Succeeded $1, failed $2, skipped $3, new articles $4')
        .replace('$1', String(summary.succeeded || 0))
        .replace('$2', String(summary.failed || 0))
        .replace('$3', String(summary.skipped || 0))
        .replace('$4', String(summary.added || 0));
      toast(summaryText, summary.failed > 0 ? 'error' : 'success');
    } catch (err) {
      toast(`${t('rssFetchFailed')}: ${err?.message || 'unknown_error'}`, 'error');
    } finally {
      isRefreshing = false;
    }
  }

  async function refreshFeed(feedId) {
    if (isRefreshing) return;
    isRefreshing = true;
    try {
      const response = await send('rssRefreshFeed', { feedId });
      if (response?.error) throw new Error(response.error);
      await loadFeedsAndRender();
      if (isVisible()) renderCurrentView();
      toast(t('rssUpdated'), 'success');
    } catch (err) {
      toast(`${t('rssFetchFailed')}: ${err?.message || 'unknown_error'}`, 'error');
    } finally {
      isRefreshing = false;
    }
  }

  // ===== 添加订阅弹窗 =====
  function openAddDialog() {
    if (addDialogEl) {
      addDialogEl.remove();
      addDialogEl = null;
    }

    const overlay = document.createElement('div');
    overlay.className = 'sa-feed-add-overlay';

    overlay.innerHTML = `
      <div class="sa-feed-add-dialog">
        <div class="sa-feed-add-header">
          <h3>${esc(t('rssAddFeedTitle'))}</h3>
          <button class="sa-feed-btn icon-only" id="saFeedAddClose">${SVG_CLOSE}</button>
        </div>
        <div class="sa-feed-add-body">
          <div class="sa-feed-add-field">
            <label>${esc(t('rssFeedUrl'))}</label>
            <input class="sa-feed-add-input" id="saFeedAddUrl" type="url" placeholder="${esc(t('rssFeedUrlPlaceholder'))}">
          </div>
          <div class="sa-feed-add-field">
            <label>${esc(t('rssFeedTitleLabel'))}</label>
            <input class="sa-feed-add-input" id="saFeedAddTitle" type="text" placeholder="">
          </div>
          <div class="sa-feed-add-options">
            <label class="sa-feed-add-option">
              <input type="checkbox" id="saFeedAddNotify" checked>
              ${esc(t('rssNotify'))}
            </label>
            <label class="sa-feed-add-option">
              <input type="checkbox" id="saFeedAddAutoBookmark">
              ${esc(t('rssAutoBookmark'))}
            </label>
          </div>
          <div class="sa-feed-add-discover" id="saFeedAddDiscoverWrap">
            <button class="sa-feed-btn" id="saFeedAddDiscoverBtn" style="width:100%;justify-content:center;">
              ${SVG_SEARCH}<span>${esc(t('rssDiscover'))}</span>
            </button>
            <div class="sa-feed-add-discovered" id="saFeedAddDiscovered" style="display:none;"></div>
          </div>
          <div class="sa-feed-add-status" id="saFeedAddStatus"></div>
        </div>
        <div class="sa-feed-add-footer">
          <button class="sa-feed-btn" id="saFeedAddCancel">${esc(t('cancel'))}</button>
          <button class="sa-feed-btn sa-feed-btn--primary" id="saFeedAddSubmit">
            ${SVG_ADD}<span>${esc(t('rssSubscribe'))}</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    addDialogEl = overlay;

    const urlInput = overlay.querySelector('#saFeedAddUrl');
    const titleInput = overlay.querySelector('#saFeedAddTitle');
    const statusEl = overlay.querySelector('#saFeedAddStatus');
    const submitBtn = overlay.querySelector('#saFeedAddSubmit');

    // 自动发现
    overlay.querySelector('#saFeedAddDiscoverBtn').addEventListener('click', async () => {
      const discoveredEl = overlay.querySelector('#saFeedAddDiscovered');
      discoveredEl.innerHTML = `<div class="sa-feed-loading" style="padding:8px;"><div class="sa-loading-dots"><span></span><span></span><span></span></div></div>`;
      discoveredEl.style.display = 'flex';
      try {
        const resp = await send('rssDiscoverActive', {});
        const found = resp && resp.success ? resp.feeds : [];
        discoveredEl.innerHTML = '';
        if (found.length === 0) {
          discoveredEl.innerHTML = `<div style="padding:6px;font-size:12px;color:var(--text-tertiary);">${esc(t('rssNoFeedsDiscovered'))}</div>`;
        } else {
          for (const f of found) {
            const item = document.createElement('div');
            item.className = 'sa-feed-add-discovered-item';
            item.innerHTML = `<span class="sa-rss-feed-icon">${SVG_RSS}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.title || f.url)}</span><span class="sa-feed-add-discovered-item-url">${esc(f.url)}</span>`;
            item.addEventListener('click', () => {
              urlInput.value = f.url;
              if (!titleInput.value && f.title) titleInput.value = f.title;
              discoveredEl.style.display = 'none';
            });
            discoveredEl.appendChild(item);
          }
        }
      } catch (err) {
        discoveredEl.innerHTML = `<div style="padding:6px;font-size:12px;color:var(--danger);">${esc(t('rssFetchFailed'))}</div>`;
      }
    });

    // 提交订阅
    let subscribeProgressTimer = null;
    let subscribeProgressStage = 0;
    const PROGRESS_STAGES = [
      { at: 0,    label: t('rssProgressFetch') || 'Fetching feed…' },
      { at: 2500, label: t('rssProgressParse') || 'Parsing content…' },
      { at: 6000, label: t('rssProgressLoad')  || 'Loading articles…' },
      { at: 11000,label: t('rssProgressWait')  || 'Still working, please wait…' }
    ];

    function setSubscribeProgress(active) {
      // 清理上一次的定时器
      if (subscribeProgressTimer) {
        clearInterval(subscribeProgressTimer);
        subscribeProgressTimer = null;
      }
      if (!active) return;
      subscribeProgressStage = 0;
      let elapsed = 0;
      // 每 250ms 推进进度条（到 95% 后保持，等待实际返回）
      // 进度曲线：前 3s 较快到 60%，3-11s 缓慢到 90%，之后维持 95%
      const tick = 250;
      subscribeProgressTimer = setInterval(() => {
        elapsed += tick;
        let pct;
        if (elapsed < 3000) pct = (elapsed / 3000) * 60;
        else if (elapsed < 11000) pct = 60 + ((elapsed - 3000) / 8000) * 30;
        else pct = Math.min(95, 90 + ((elapsed - 11000) / 20000) * 5);
        const bar = overlay.querySelector('#saFeedAddProgress');
        if (bar) bar.style.width = pct.toFixed(1) + '%';
        // 阶段文案切换
        const labelEl = overlay.querySelector('#saFeedAddProgressLabel');
        let stage = subscribeProgressStage;
        while (stage + 1 < PROGRESS_STAGES.length && elapsed >= PROGRESS_STAGES[stage + 1].at) {
          stage++;
        }
        if (stage !== subscribeProgressStage) {
          subscribeProgressStage = stage;
          if (labelEl) labelEl.textContent = PROGRESS_STAGES[stage].label;
        }
      }, tick);
    }

    async function doSubscribe() {
      const url = urlInput.value.trim();
      if (!url) {
        urlInput.focus();
        return;
      }
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<div class="sa-loading-dots"><span></span><span></span><span></span></div><span>${esc(t('rssSubscribing'))}</span>`;
      statusEl.className = 'sa-feed-add-status';
      statusEl.innerHTML = `
        <div class="sa-feed-add-progress-wrap">
          <div class="sa-feed-add-progress-track"><div class="sa-feed-add-progress-bar" id="saFeedAddProgress" style="width:0%"></div></div>
          <span class="sa-feed-add-progress-label" id="saFeedAddProgressLabel">${esc(PROGRESS_STAGES[0].label)}</span>
        </div>`;
      setSubscribeProgress(true);

      try {
        const resp = await send('rssAddFeed', {
          url,
          title: titleInput.value.trim(),
          notify: overlay.querySelector('#saFeedAddNotify').checked,
          autoBookmark: overlay.querySelector('#saFeedAddAutoBookmark').checked
        });
        setSubscribeProgress(false);
        if (resp && resp.success) {
          // 进度条直接拉满再短暂停留，给用户完成感
          const bar = overlay.querySelector('#saFeedAddProgress');
          if (bar) bar.style.width = '100%';
          statusEl.className = 'sa-feed-add-status success';
          statusEl.textContent = t('rssSubscribeSuccess', [resp.feed.title || url, resp.itemCount || 0]);
          // storage.onChanged 会自动触发 scheduleLoad，无需手动调用
          // 但立即刷新一次确保 UI 即时更新
          await loadFeedsAndRender();
          if (isVisible()) renderCurrentView();
          setTimeout(() => closeAddDialog(), 800);
        } else {
          statusEl.className = 'sa-feed-add-status error';
          const err = (resp && resp.error) || 'unknown';
          // 根据错误类型显示更具体的提示
          if (err === 'duplicate') {
            statusEl.textContent = t('rssAlreadySubscribed');
          } else if (err === 'network_timeout' || err === 'Failed to fetch' || err === 'NetworkError') {
            statusEl.textContent = t('rssErrorNetwork') || 'Network error: could not reach the feed. Check the URL or try again later.';
          } else if (err === 'parse_failed') {
            statusEl.textContent = t('rssErrorParse') || 'Failed to parse feed. The URL may not be a valid RSS/Atom feed.';
          } else if (err === 'empty_feed') {
            statusEl.textContent = t('rssErrorEmpty') || 'Feed found but contains no articles.';
          } else if (err.startsWith('http_') || err.startsWith('HTTP ')) {
            const code = err.replace(/^(http_|HTTP )/, '');
            statusEl.textContent = (t('rssErrorHttp') || 'HTTP error: $1').replace('$1', code);
          } else {
            statusEl.textContent = t('rssSubscribeFailed');
          }
          submitBtn.disabled = false;
          submitBtn.innerHTML = `${SVG_ADD}<span>${esc(t('rssSubscribe'))}</span>`;
        }
      } catch (err) {
        setSubscribeProgress(false);
        statusEl.className = 'sa-feed-add-status error';
        statusEl.textContent = t('rssSubscribeFailed');
        submitBtn.disabled = false;
        submitBtn.innerHTML = `${SVG_ADD}<span>${esc(t('rssSubscribe'))}</span>`;
      }
    }

    submitBtn.addEventListener('click', doSubscribe);
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSubscribe();
    });

    function closeAddDialog() {
      setSubscribeProgress(false);
      if (addDialogEl) {
        addDialogEl.remove();
        addDialogEl = null;
      }
    }

    overlay.querySelector('#saFeedAddClose').addEventListener('click', closeAddDialog);
    overlay.querySelector('#saFeedAddCancel').addEventListener('click', closeAddDialog);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAddDialog();
    });

    urlInput.focus();
  }

  // ===== 公共 API =====
  window.FeedView = {
    init,
    show,
    hide,
    isVisible,
    refreshAll,
    openAddDialog,
    renderFeedList,
    renderCurrentView,
    getFeeds: () => feeds,
    getTotalUnread: () => totalUnread
  };
})();
