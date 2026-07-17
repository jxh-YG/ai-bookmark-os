/* ===== MDI Window Manager ===== */
(function () {
  'use strict';

  const MDI_DEFAULTS = {
    maxWindows: 8,
    minWindowWidth: 200,
    minWindowHeight: 150,
    defaultWindowWidth: 560,
    defaultWindowHeight: 380,
    cascadeOffsetX: 30,
    cascadeOffsetY: 30,
    iframeLoadTimeout: 15000,
    minZIndex: 100,
    titleBarMinVisible: 30
  };

  // SVG Icons
  const SVG_MDI_MINIMIZE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  const SVG_MDI_MAXIMIZE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="1"/></svg>';
  const SVG_MDI_RESTORE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="14" height="14" rx="1"/><path d="M7 7V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-2"/></svg>';
  const SVG_MDI_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>';
  const SVG_MDI_RELOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
  const SVG_MDI_EXTERNAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>';
  const SVG_MDI_VOLUME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
  const SVG_MDI_MUTED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
  const SVG_MDI_WARNING = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  const SVG_MDI_DESKTOP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';

  function i18n(key, substitutions) {
    if (typeof window.i18n === 'function') {
      return window.i18n(key, substitutions);
    }
    return key;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function normalizeUrl(url) {
    try {
      const u = new URL(url);
      // Remove trailing slash and common tracking params
      let path = u.pathname.replace(/\/+$/, '');
      u.searchParams.delete('utm_source');
      u.searchParams.delete('utm_medium');
      u.searchParams.delete('utm_campaign');
      u.searchParams.delete('utm_content');
      u.searchParams.delete('ref');
      return u.origin + path + (u.search ? u.search : '');
    } catch {
      return url;
    }
  }

  // ===== MDIWindowManager =====

  class MDIWindowManager {
    constructor(containerEl, taskbarEl, options) {
      this.container = containerEl;
      this.taskbarEl = taskbarEl;
      this.opts = Object.assign({}, MDI_DEFAULTS, options || {});
      this.windows = new Map(); // id -> windowData
      this.topZIndex = this.opts.minZIndex;
      this.focusedWindowId = null;
      this.cascadeCounter = 0;
      this._tileDropdown = null;
      this._iframeShield = null;
      this._tabMuted = false; // 标签页级别静音状态
      this._contextMenu = null;

      this._initTileDropdown();
      this._initEmptyPlaceholder();
      this._updateDesktopActive();
    }

    // --- Public API ---

    openWindow(url, title, faviconUrl) {
      if (!url) return null;

      // Check deduplication
      const existing = this.getWindowByUrl(url);
      if (existing) {
        if (existing.state === 'minimized') {
          this.restoreWindow(existing.id);
        }
        this.focusWindow(existing.id);
        return existing.id;
      }

      // Check max window limit
      if (this.windows.size >= this.opts.maxWindows) {
        if (typeof window.showToast === 'function') {
          window.showToast(i18n('mdiMaxWindows', [this.opts.maxWindows]), 'warning');
        }
        return null;
      }

      const id = 'mdi_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const zIndex = ++this.topZIndex;

      const windowData = {
        id,
        url,
        title: title || url,
        faviconUrl: faviconUrl || '',
        state: 'normal',
        position: { x: 0, y: 0, w: this.opts.defaultWindowWidth, h: this.opts.defaultWindowHeight },
        zIndex,
        createdAt: Date.now(),
        _iframeLoaded: false // iframe 加载状态标记
      };

      // 先加入 Map，这样 _updateDesktopActive 才能感知到窗口存在
      this.windows.set(id, windowData);

      // 激活桌面（display: none → flex）
      this._updateDesktopActive();

      // 强制浏览器 reflow，确保容器尺寸可用
      // eslint-disable-next-line no-unused-expressions
      this.container.offsetHeight;

      // 在已有正确尺寸的容器上计算窗口位置
      const pos = this._calcNewWindowPosition();
      windowData.position = { x: pos.x, y: pos.y, w: pos.w, h: pos.h };

      this._createWindowDOM(windowData);
      this.focusWindow(id);
      this._updateTaskbar();
      this._updateEmptyPlaceholder();

      return id;
    }

    closeWindow(windowId) {
      const data = this.windows.get(windowId);
      if (!data) return;

      const el = this.container.querySelector(`[data-mdi-id="${windowId}"]`);
      if (el) {
        // Stop iframe before removing to free resources
        const iframe = el.querySelector('.mdi-window-iframe');
        if (iframe) iframe.src = 'about:blank';
        el.remove();
      }

      this.windows.delete(windowId);

      if (this.focusedWindowId === windowId) {
        this.focusedWindowId = null;
        // Focus the most recently created window
        let lastWin = null;
        for (const [, w] of this.windows) {
          if (w.state !== 'minimized') {
            if (!lastWin || w.zIndex > lastWin.zIndex) lastWin = w;
          }
        }
        if (lastWin) this.focusWindow(lastWin.id);
      }

      this._updateTaskbar();
      this._updateEmptyPlaceholder();
      this._updateDesktopActive();
    }

    focusWindow(windowId) {
      const data = this.windows.get(windowId);
      if (!data) return;

      // Unfocus previous
      if (this.focusedWindowId && this.focusedWindowId !== windowId) {
        const prevEl = this.container.querySelector(`[data-mdi-id="${this.focusedWindowId}"]`);
        if (prevEl) prevEl.classList.remove('mdi-window--focused');
      }

      data.zIndex = ++this.topZIndex;
      this.focusedWindowId = windowId;

      const el = this.container.querySelector(`[data-mdi-id="${windowId}"]`);
      if (el) {
        el.classList.add('mdi-window--focused');
        el.style.zIndex = data.zIndex;
      }

      this._updateTaskbar();
    }

    minimizeWindow(windowId) {
      const data = this.windows.get(windowId);
      if (!data || data.state === 'minimized') return;

      const el = this.container.querySelector(`[data-mdi-id="${windowId}"]`);
      if (el) el.style.display = 'none';

      data.state = 'minimized';

      if (this.focusedWindowId === windowId) {
        this.focusedWindowId = null;
        let lastWin = null;
        for (const [, w] of this.windows) {
          if (w.state !== 'minimized' && w.id !== windowId) {
            if (!lastWin || w.zIndex > lastWin.zIndex) lastWin = w;
          }
        }
        if (lastWin) this.focusWindow(lastWin.id);
      }

      this._updateTaskbar();
    }

    maximizeWindow(windowId) {
      const data = this.windows.get(windowId);
      if (!data) return;

      const el = this.container.querySelector(`[data-mdi-id="${windowId}"]`);
      if (!el) return;

      if (data.state === 'maximized') {
        // Restore
        this.restoreWindow(windowId);
        return;
      }

      // Save current position
      data.position.x = parseInt(el.style.left);
      data.position.y = parseInt(el.style.top);
      data.position.w = el.offsetWidth;
      data.position.h = el.offsetHeight;

      // Maximize
      const containerRect = this.container.getBoundingClientRect();
      el.style.left = '0px';
      el.style.top = '0px';
      el.style.width = containerRect.width + 'px';
      el.style.height = containerRect.height + 'px';
      el.classList.add('mdi-window--maximized');
      data.state = 'maximized';

      // Update maximize button icon to restore
      const maxBtn = el.querySelector('.mdi-btn--maximize');
      if (maxBtn) maxBtn.innerHTML = SVG_MDI_RESTORE;

      this._updateTaskbar();
    }

    restoreWindow(windowId) {
      const data = this.windows.get(windowId);
      if (!data) return;

      const el = this.container.querySelector(`[data-mdi-id="${windowId}"]`);
      if (!el) return;

      el.style.display = '';
      el.style.left = data.position.x + 'px';
      el.style.top = data.position.y + 'px';
      el.style.width = data.position.w + 'px';
      el.style.height = data.position.h + 'px';
      el.classList.remove('mdi-window--maximized');

      data.state = 'normal';

      // Update maximize button icon
      const maxBtn = el.querySelector('.mdi-btn--maximize');
      if (maxBtn) maxBtn.innerHTML = SVG_MDI_MAXIMIZE;

      this.focusWindow(windowId);
      this._updateTaskbar();
    }

    tileWindows(layout) {
      const visibleWindows = [];
      for (const [id, w] of this.windows) {
        if (w.state !== 'minimized') visibleWindows.push(w);
        else this.restoreWindow(id); // restore minimized for tiling
      }
      if (visibleWindows.length === 0) return;

      // Re-collect after restore
      const wins = [];
      for (const [id, w] of this.windows) {
        wins.push(w);
      }
      if (wins.length === 0) return;

      const containerRect = this.container.getBoundingClientRect();
      const n = wins.length;

      for (let i = 0; i < n; i++) {
        const w = wins[i];
        const el = this.container.querySelector(`[data-mdi-id="${w.id}"]`);
        if (!el) continue;

        el.classList.remove('mdi-window--maximized');
        const maxBtn = el.querySelector('.mdi-btn--maximize');
        if (maxBtn) maxBtn.innerHTML = SVG_MDI_MAXIMIZE;
        w.state = 'normal';
        el.style.display = '';

        if (layout === 'cascade') {
          const x = this.opts.cascadeOffsetX * i;
          const y = this.opts.cascadeOffsetY * i;
          const ww = Math.max(this.opts.minWindowWidth, containerRect.width - x - 40);
          const wh = Math.max(this.opts.minWindowHeight, containerRect.height - y - 40);
          el.style.left = x + 'px';
          el.style.top = y + 'px';
          el.style.width = ww + 'px';
          el.style.height = wh + 'px';
          w.position = { x, y, w: ww, h: wh };
        } else if (layout === 'horizontal') {
          const hh = Math.floor(containerRect.height / n);
          const y = hh * i;
          el.style.left = '0px';
          el.style.top = y + 'px';
          el.style.width = containerRect.width + 'px';
          el.style.height = hh + 'px';
          w.position = { x: 0, y, w: containerRect.width, h: hh };
        } else if (layout === 'vertical') {
          const ww = Math.floor(containerRect.width / n);
          const x = ww * i;
          el.style.left = x + 'px';
          el.style.top = '0px';
          el.style.width = ww + 'px';
          el.style.height = containerRect.height + 'px';
          w.position = { x, y: 0, w: ww, h: containerRect.height };
        }
      }

      // Focus last window
      if (wins.length > 0) this.focusWindow(wins[wins.length - 1].id);
    }

    getOpenWindows() {
      return Array.from(this.windows.values());
    }

    getWindowByUrl(url) {
      const norm = normalizeUrl(url);
      for (const [, w] of this.windows) {
        if (normalizeUrl(w.url) === norm) return w;
      }
      return null;
    }

    closeAllWindows() {
      const ids = Array.from(this.windows.keys());
      for (const id of ids) {
        this.closeWindow(id);
      }
    }

    // --- Internal ---

    _calcNewWindowPosition() {
      const containerRect = this.container.getBoundingClientRect();
      const availW = Math.max(200, containerRect.width - 20);
      const availH = Math.max(150, containerRect.height - 20);

      const w = Math.min(this.opts.defaultWindowWidth, availW);
      const h = Math.min(this.opts.defaultWindowHeight, availH);

      // Cascade offset
      const offsetIndex = this.cascadeCounter % 10;
      this.cascadeCounter++;
      const x = Math.min(offsetIndex * this.opts.cascadeOffsetX, Math.max(0, containerRect.width - w - 10));
      const y = Math.min(offsetIndex * this.opts.cascadeOffsetY, Math.max(0, containerRect.height - h - 10));

      return { x: Math.max(0, x), y: Math.max(0, y), w: Math.max(this.opts.minWindowWidth, w), h: Math.max(this.opts.minWindowHeight, h) };
    }

    _createWindowDOM(windowData) {
      const { id, url, title, faviconUrl, position } = windowData;

      const win = document.createElement('div');
      win.className = 'mdi-window mdi-window--focused';
      win.dataset.mdiId = id;
      win.style.left = position.x + 'px';
      win.style.top = position.y + 'px';
      win.style.width = position.w + 'px';
      win.style.height = position.h + 'px';
      win.style.zIndex = windowData.zIndex;

      win.innerHTML = `
        <div class="mdi-window-titlebar">
          <img class="mdi-window-favicon" src="${escapeHtml(faviconUrl)}" alt="" onerror="this.style.display='none'">
          <span class="mdi-window-title">${escapeHtml(title)}</span>
          <div class="mdi-window-controls">
            <button class="mdi-btn mdi-btn--external" title="${escapeHtml(i18n('mdiOpenNewTab'))}">${SVG_MDI_EXTERNAL}</button>
            <button class="mdi-btn mdi-btn--reload" title="${escapeHtml(i18n('mdiReload'))}">${SVG_MDI_RELOAD}</button>
            <button class="mdi-btn mdi-btn--minimize" title="${escapeHtml(i18n('mdiMinimize'))}">${SVG_MDI_MINIMIZE}</button>
            <button class="mdi-btn mdi-btn--maximize" title="${escapeHtml(i18n('mdiMaximize'))}">${SVG_MDI_MAXIMIZE}</button>
            <button class="mdi-btn mdi-btn--close" title="${escapeHtml(i18n('mdiClose'))}">${SVG_MDI_CLOSE}</button>
          </div>
        </div>
        <div class="mdi-window-body">
          <div class="mdi-window-loading">
            <div class="sa-loading-dots"><span></span><span></span><span></span></div>
          </div>
          <iframe class="mdi-window-iframe" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"></iframe>
          <div class="mdi-window-fallback">
            ${SVG_MDI_WARNING}
            <p>${escapeHtml(i18n('mdiCannotEmbed'))}</p>
            <button class="mdi-fallback-open">${escapeHtml(i18n('mdiOpenNewTab'))}</button>
          </div>
        </div>
        <div class="mdi-window-resize-handle mdi-resize-n" data-dir="n"></div>
        <div class="mdi-window-resize-handle mdi-resize-s" data-dir="s"></div>
        <div class="mdi-window-resize-handle mdi-resize-e" data-dir="e"></div>
        <div class="mdi-window-resize-handle mdi-resize-w" data-dir="w"></div>
        <div class="mdi-window-resize-handle mdi-resize-ne" data-dir="ne"></div>
        <div class="mdi-window-resize-handle mdi-resize-nw" data-dir="nw"></div>
        <div class="mdi-window-resize-handle mdi-resize-se" data-dir="se"></div>
        <div class="mdi-window-resize-handle mdi-resize-sw" data-dir="sw"></div>
      `;

      // --- Button handlers ---
      win.querySelector('.mdi-btn--external').addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.tabs.create({ url });
      });

      win.querySelector('.mdi-btn--reload').addEventListener('click', (e) => {
        e.stopPropagation();
        this._rebuildIframe(win, id);
      });

      win.querySelector('.mdi-btn--minimize').addEventListener('click', (e) => {
        e.stopPropagation();
        this.minimizeWindow(id);
      });

      win.querySelector('.mdi-btn--maximize').addEventListener('click', (e) => {
        e.stopPropagation();
        this.maximizeWindow(id);
      });

      win.querySelector('.mdi-btn--close').addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeWindow(id);
      });

      // Fallback "open in new tab" button
      win.querySelector('.mdi-fallback-open').addEventListener('click', () => {
        chrome.tabs.create({ url });
      });

      // --- Click to focus ---
      win.addEventListener('mousedown', () => {
        if (this.focusedWindowId !== id) {
          this.focusWindow(id);
        }
      });

      // --- Double-click titlebar to toggle maximize ---
      win.querySelector('.mdi-window-titlebar').addEventListener('dblclick', () => {
        this.maximizeWindow(id);
      });

      // --- Drag ---
      this._initDrag(win, id);

      // --- Resize ---
      this._initResize(win, id);

      // --- iframe load ---
      this._initIframeLoad(win, id, url);

      this.container.appendChild(win);

      // 延迟设置 iframe src，让窗口先渲染出来
      setTimeout(() => {
        const iframe = win.querySelector('.mdi-window-iframe');
        if (iframe) iframe.src = url;
      }, 50);
    }

    _initDrag(winEl, windowId) {
      const titlebar = winEl.querySelector('.mdi-window-titlebar');
      let startX, startY, startLeft, startTop;
      let dragging = false;

      const onMouseMove = (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let newLeft = startLeft + dx;
        let newTop = startTop + dy;

        // Constrain: titlebar must remain at least partially visible
        const containerRect = this.container.getBoundingClientRect();
        const winWidth = winEl.offsetWidth;
        const minVisible = this.opts.titleBarMinVisible;

        newLeft = Math.max(minVisible - winWidth, newLeft);
        newLeft = Math.min(containerRect.width - minVisible, newLeft);
        newTop = Math.max(0, newTop);
        newTop = Math.min(containerRect.height - minVisible, newTop);

        winEl.style.left = newLeft + 'px';
        winEl.style.top = newTop + 'px';
      };

      const onMouseUp = () => {
        if (!dragging) return;
        dragging = false;
        this._hideIframeShield();
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // Update stored position
        const data = this.windows.get(windowId);
        if (data && data.state === 'normal') {
          data.position.x = parseInt(winEl.style.left);
          data.position.y = parseInt(winEl.style.top);
        }
      };

      titlebar.addEventListener('mousedown', (e) => {
        // Don't drag from control buttons
        if (e.target.closest('.mdi-window-controls')) return;
        if (e.target.closest('.mdi-btn')) return;

        const data = this.windows.get(windowId);
        if (data && data.state === 'maximized') return; // No drag when maximized

        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseInt(winEl.style.left) || 0;
        startTop = parseInt(winEl.style.top) || 0;

        e.preventDefault();
        this._showIframeShield();
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    }

    _initResize(winEl, windowId) {
      const handles = winEl.querySelectorAll('.mdi-window-resize-handle');

      handles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
          const data = this.windows.get(windowId);
          if (data && data.state === 'maximized') return;

          e.preventDefault();
          e.stopPropagation();

          const dir = handle.dataset.dir;
          const startX = e.clientX;
          const startY = e.clientY;
          const startRect = {
            left: parseInt(winEl.style.left),
            top: parseInt(winEl.style.top),
            width: winEl.offsetWidth,
            height: winEl.offsetHeight
          };

          const onMouseMove = (e2) => {
            const dx = e2.clientX - startX;
            const dy = e2.clientY - startY;
            let newLeft = startRect.left;
            let newTop = startRect.top;
            let newWidth = startRect.width;
            let newHeight = startRect.height;

            // Apply based on direction
            if (dir.includes('e')) {
              newWidth = Math.max(this.opts.minWindowWidth, startRect.width + dx);
            }
            if (dir.includes('w')) {
              const possibleWidth = startRect.width - dx;
              if (possibleWidth >= this.opts.minWindowWidth) {
                newWidth = possibleWidth;
                newLeft = startRect.left + dx;
              }
            }
            if (dir.includes('s')) {
              newHeight = Math.max(this.opts.minWindowHeight, startRect.height + dy);
            }
            if (dir.includes('n')) {
              const possibleHeight = startRect.height - dy;
              if (possibleHeight >= this.opts.minWindowHeight) {
                newHeight = possibleHeight;
                newTop = startRect.top + dy;
              }
            }

            winEl.style.left = newLeft + 'px';
            winEl.style.top = newTop + 'px';
            winEl.style.width = newWidth + 'px';
            winEl.style.height = newHeight + 'px';
          };

          const onMouseUp = () => {
            this._hideIframeShield();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // Update stored position
            const data = this.windows.get(windowId);
            if (data && data.state === 'normal') {
              data.position = {
                x: parseInt(winEl.style.left),
                y: parseInt(winEl.style.top),
                w: winEl.offsetWidth,
                h: winEl.offsetHeight
              };
            }
          };

          this._showIframeShield();
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        });
      });
    }

    _showIframeShield() {
      // 在所有 iframe 上方添加透明遮罩，防止 iframe 拦截鼠标事件
      if (this._iframeShield) return;
      const shield = document.createElement('div');
      shield.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:inherit;';
      shield.id = 'mdi-iframe-shield';
      document.body.appendChild(shield);
      this._iframeShield = shield;
    }

    _hideIframeShield() {
      if (this._iframeShield) {
        this._iframeShield.remove();
        this._iframeShield = null;
      }
    }

    _initIframeLoad(winEl, windowId, url) {
      const iframe = winEl.querySelector('.mdi-window-iframe');
      const loading = winEl.querySelector('.mdi-window-loading');
      const fallback = winEl.querySelector('.mdi-window-fallback');

      const hideLoading = () => {
        if (loading) loading.style.display = 'none';
      };

      const showFallback = () => {
        hideLoading();
        if (fallback) fallback.classList.add('mdi-window-fallback--visible');
        if (iframe) iframe.style.display = 'none';
      };

      const isLoaded = () => {
        const data = this.windows.get(windowId);
        return data && data._iframeLoaded;
      };

      const markLoaded = () => {
        const data = this.windows.get(windowId);
        if (data) data._iframeLoaded = true;
      };

      iframe.addEventListener('load', () => {
        if (isLoaded()) return;
        markLoaded();
        const data = this.windows.get(windowId);
        if (data && data._loadTimeout) { clearTimeout(data._loadTimeout); data._loadTimeout = null; }
        hideLoading();
      });

      iframe.addEventListener('error', () => {
        if (isLoaded()) return;
        markLoaded();
        const data = this.windows.get(windowId);
        if (data && data._loadTimeout) { clearTimeout(data._loadTimeout); data._loadTimeout = null; }
        showFallback();
      });

      // Timeout fallback
      const data = this.windows.get(windowId);
      if (data) {
        data._loadTimeout = setTimeout(() => {
          if (!isLoaded()) {
            markLoaded();
            showFallback();
          }
        }, this.opts.iframeLoadTimeout);
      }
    }

    _initTileDropdown() {
      // 静音按钮（标签页级别）
      const muteBtn = document.createElement('button');
      muteBtn.className = 'mdi-taskbar-mute-btn';
      muteBtn.title = i18n('mdiMute');
      muteBtn.innerHTML = SVG_MDI_VOLUME;
      muteBtn.addEventListener('click', () => {
        this._toggleTabMute();
      });
      this.taskbarEl.appendChild(muteBtn);
      this._muteBtn = muteBtn;

      // Tile dropdown button in taskbar
      const tileBtn = document.createElement('button');
      tileBtn.className = 'mdi-taskbar-tile-btn';
      tileBtn.title = i18n('mdiTileCascade');
      tileBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>';

      const dropdown = document.createElement('div');
      dropdown.className = 'mdi-taskbar-tile-dropdown';
      dropdown.innerHTML = `
        <button class="mdi-taskbar-tile-item" data-tile="cascade">${SVG_MDI_DESKTOP} ${escapeHtml(i18n('mdiTileCascade'))}</button>
        <button class="mdi-taskbar-tile-item" data-tile="horizontal"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="7"/><rect x="3" y="14" width="18" height="7"/></svg> ${escapeHtml(i18n('mdiTileHorizontal'))}</button>
        <button class="mdi-taskbar-tile-item" data-tile="vertical"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="18"/><rect x="14" y="3" width="7" height="18"/></svg> ${escapeHtml(i18n('mdiTileVertical'))}</button>
      `;

      tileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('mdi-taskbar-tile-dropdown--open');
      });

      dropdown.addEventListener('click', (e) => {
        const item = e.target.closest('[data-tile]');
        if (!item) return;
        this.tileWindows(item.dataset.tile);
        dropdown.classList.remove('mdi-taskbar-tile-dropdown--open');
      });

      // Close dropdown on outside click
      document.addEventListener('click', (e) => {
        if (!tileBtn.contains(e.target) && !dropdown.contains(e.target)) {
          dropdown.classList.remove('mdi-taskbar-tile-dropdown--open');
        }
      });

      this.taskbarEl.appendChild(tileBtn);
      this.taskbarEl.appendChild(dropdown);
      this._tileDropdown = dropdown;
    }

    _initEmptyPlaceholder() {
      const placeholder = document.createElement('div');
      placeholder.className = 'mdi-desktop-empty';
      placeholder.innerHTML = `
        ${SVG_MDI_DESKTOP}
        <p>${escapeHtml(i18n('mdiNoWindows'))}</p>
      `;
      this.container.appendChild(placeholder);
      this._emptyPlaceholder = placeholder;
    }

    _updateEmptyPlaceholder() {
      if (this._emptyPlaceholder) {
        this._emptyPlaceholder.style.display = this.windows.size === 0 ? '' : 'none';
      }
    }

    _updateDesktopActive() {
      const desktop = document.getElementById('saMdiDesktop');
      const taskbar = document.getElementById('saMdiTaskbar');
      const hasWindows = this.windows.size > 0;

      if (desktop) {
        if (hasWindows) {
          desktop.classList.add('sa-mdi-desktop--active');
        } else {
          desktop.classList.remove('sa-mdi-desktop--active');
        }
      }

      if (taskbar) {
        if (hasWindows) {
          taskbar.classList.add('sa-mdi-taskbar--active');
        } else {
          taskbar.classList.remove('sa-mdi-taskbar--active');
        }
      }
    }

    _updateTaskbar() {
      // Remove existing entries (but keep tile dropdown)
      const entries = this.taskbarEl.querySelectorAll('.mdi-taskbar-entry');
      entries.forEach(e => e.remove());

      for (const [id, w] of this.windows) {
        const entry = document.createElement('button');
        entry.className = 'mdi-taskbar-entry';
        if (id === this.focusedWindowId) entry.classList.add('mdi-taskbar-entry--active');
        entry.dataset.mdiId = id;

        entry.innerHTML = `
          <img class="mdi-taskbar-entry-favicon" src="${escapeHtml(w.faviconUrl)}" alt="" onerror="this.style.display='none'">
          <span class="mdi-taskbar-entry-title">${escapeHtml(w.title)}</span>
        `;

        entry.addEventListener('click', () => {
          if (w.state === 'minimized') {
            this.restoreWindow(id);
          } else if (this.focusedWindowId === id) {
            this.minimizeWindow(id);
          } else {
            this.focusWindow(id);
          }
        });

        // 右键菜单
        entry.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._showTaskbarContextMenu(e, id);
        });

        // Insert before the tile dropdown button
        const tileBtn = this.taskbarEl.querySelector('.mdi-taskbar-tile-btn');
        if (tileBtn) {
          this.taskbarEl.insertBefore(entry, tileBtn);
        } else {
          this.taskbarEl.appendChild(entry);
        }
      }
    }

    _showTaskbarContextMenu(e, targetId) {
      // 移除已有菜单
      this._hideTaskbarContextMenu();

      const menu = document.createElement('div');
      menu.className = 'mdi-taskbar-context-menu';
      menu.innerHTML = `
        <button class="mdi-context-item" data-action="close">${escapeHtml(i18n('mdiClose'))}</button>
        <button class="mdi-context-item" data-action="closeOthers">${escapeHtml(i18n('mdiCloseOthers'))}</button>
        <button class="mdi-context-item" data-action="closeRight">${escapeHtml(i18n('mdiCloseRight'))}</button>
        <button class="mdi-context-item" data-action="closeLeft">${escapeHtml(i18n('mdiCloseLeft'))}</button>
      `;

      // 计算菜单位置（在任务栏条目上方弹出）
      const rect = e.target.closest('.mdi-taskbar-entry').getBoundingClientRect();
      menu.style.left = rect.left + 'px';
      menu.style.top = (rect.top - 4) + 'px';
      menu.style.transform = 'translateY(-100%)';

      document.body.appendChild(menu);
      this._contextMenu = menu;

      // 菜单操作
      menu.addEventListener('click', (ev) => {
        const item = ev.target.closest('[data-action]');
        if (!item) return;
        const action = item.dataset.action;

        switch (action) {
          case 'close':
            this.closeWindow(targetId);
            break;
          case 'closeOthers': {
            const ids = [...this.windows.keys()].filter(id => id !== targetId);
            ids.forEach(id => this.closeWindow(id));
            break;
          }
          case 'closeRight': {
            const ids = [...this.windows.keys()];
            const idx = ids.indexOf(targetId);
            if (idx >= 0) {
              ids.slice(idx + 1).forEach(id => this.closeWindow(id));
            }
            break;
          }
          case 'closeLeft': {
            const ids = [...this.windows.keys()];
            const idx = ids.indexOf(targetId);
            if (idx > 0) {
              ids.slice(0, idx).forEach(id => this.closeWindow(id));
            }
            break;
          }
        }
        this._hideTaskbarContextMenu();
      });

      // 点击外部关闭菜单
      const closeHandler = (ev) => {
        if (!menu.contains(ev.target)) {
          this._hideTaskbarContextMenu();
          document.removeEventListener('click', closeHandler);
          document.removeEventListener('contextmenu', closeHandler);
        }
      };
      setTimeout(() => {
        document.addEventListener('click', closeHandler);
        document.addEventListener('contextmenu', closeHandler);
      }, 0);
    }

    _hideTaskbarContextMenu() {
      if (this._contextMenu) {
        this._contextMenu.remove();
        this._contextMenu = null;
      }
    }

    /**
     * 切换标签页级别的静音状态
     * 使用 chrome.tabs.update(tabId, {muted: true/false}) API
     * 这是唯一能真正静音跨域 iframe 音频的方式
     */
    async _toggleTabMute() {
      try {
        // 获取当前窗口的活动标签页
        const tabs = await chrome.tabs.query({ currentWindow: true, active: true });
        if (tabs.length === 0) return;
        const tabId = tabs[0].id;
        this._tabMuted = !this._tabMuted;

        // 设置标签页静音
        await chrome.tabs.update(tabId, { muted: this._tabMuted });

        // 更新按钮状态
        this._updateMuteButton();
      } catch (e) {
        console.warn('MDI: Failed to toggle tab mute:', e);
        this._tabMuted = !this._tabMuted; // 回滚
      }
    }

    _updateMuteButton() {
      if (!this._muteBtn) return;
      if (this._tabMuted) {
        this._muteBtn.innerHTML = SVG_MDI_MUTED;
        this._muteBtn.title = i18n('mdiUnmute');
        this._muteBtn.classList.add('mdi-taskbar-mute-btn--muted');
      } else {
        this._muteBtn.innerHTML = SVG_MDI_VOLUME;
        this._muteBtn.title = i18n('mdiMute');
        this._muteBtn.classList.remove('mdi-taskbar-mute-btn--muted');
      }
    }

    /**
     * 重建 iframe（用于刷新窗口）。
     * 移除旧 iframe 后创建新的，确保 load 事件正确触发。
     */
    _rebuildIframe(winEl, windowId) {
      const data = this.windows.get(windowId);
      if (!data) return;

      const body = winEl.querySelector('.mdi-window-body');
      const oldIframe = winEl.querySelector('.mdi-window-iframe');
      const loading = winEl.querySelector('.mdi-window-loading');
      const fallback = winEl.querySelector('.mdi-window-fallback');
      if (!body || !oldIframe) return;

      // 重置加载状态
      data._iframeLoaded = false;
      if (data._loadTimeout) {
        clearTimeout(data._loadTimeout);
        data._loadTimeout = null;
      }

      // 显示 loading
      if (loading) loading.style.display = '';
      if (fallback) fallback.classList.remove('mdi-window-fallback--visible');

      // 移除旧 iframe
      oldIframe.remove();

      // 创建新 iframe
      const newIframe = document.createElement('iframe');
      newIframe.className = 'mdi-window-iframe';
      newIframe.sandbox.add('allow-same-origin', 'allow-scripts', 'allow-forms', 'allow-popups', 'allow-popups-to-escape-sandbox');
      newIframe.referrerPolicy = 'no-referrer';
      body.appendChild(newIframe);

      // 绑定 load/error 事件
      newIframe.addEventListener('load', () => {
        if (data._iframeLoaded) return;
        data._iframeLoaded = true;
        if (data._loadTimeout) { clearTimeout(data._loadTimeout); data._loadTimeout = null; }
        if (loading) loading.style.display = 'none';
      });

      newIframe.addEventListener('error', () => {
        if (data._iframeLoaded) return;
        data._iframeLoaded = true;
        if (data._loadTimeout) { clearTimeout(data._loadTimeout); data._loadTimeout = null; }
        if (loading) loading.style.display = 'none';
        if (fallback) fallback.classList.add('mdi-window-fallback--visible');
        newIframe.style.display = 'none';
      });

      // 启动加载超时
      data._loadTimeout = setTimeout(() => {
        if (!data._iframeLoaded) {
          data._iframeLoaded = true;
          if (loading) loading.style.display = 'none';
          if (fallback) fallback.classList.add('mdi-window-fallback--visible');
          newIframe.style.display = 'none';
        }
      }, this.opts.iframeLoadTimeout);

      // 延迟设置 src
      setTimeout(() => { newIframe.src = data.url; }, 50);
    }
  }

  // Export to global scope
  window.MDIWindowManager = MDIWindowManager;
})();
