const fs = require('fs');

function mustReplace(file, from, to, label) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(from)) {
    if (s.includes('aiClassifyBtn') || s.includes('aiEntryBanner') || s.includes('saAiClassifyBtn')) {
      console.log('skip already', label || file);
      return s;
    }
    throw new Error('PATCH MISS ' + (label || file) + ' :: ' + from.slice(0, 100));
  }
  s = s.replace(from, to);
  fs.writeFileSync(file, s);
  console.log('ok', label || file);
  return s;
}

function appendOnce(file, marker, content) {
  let s = fs.readFileSync(file, 'utf8');
  if (s.includes(marker)) {
    console.log('skip append', file);
    return;
  }
  fs.writeFileSync(file, s + content);
  console.log('appended', file);
}

mustReplace(
  'src/timeline/pages/popup/popup.html',
  '<span class="app-name">Markline</span>',
  '<span class="app-name">AI Bookmark OS</span>',
  'popup title'
);

mustReplace(
  'src/timeline/pages/popup/popup.html',
  '<button id="paletteBtn" class="icon-btn" data-i18n-title="openCommandPalette">',
  `<button id="aiClassifyBtn" class="icon-btn ai-classify-btn" title="AI 金字塔分类">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/>
          <path d="M12 12l8-4.5"/>
          <path d="M12 12v9"/>
          <path d="M12 12L4 7.5"/>
        </svg>
      </button>

      <button id="paletteBtn" class="icon-btn" data-i18n-title="openCommandPalette">`,
  'popup top ai btn'
);

mustReplace(
  'src/timeline/pages/popup/popup.html',
  '<div class="view-toolbar">',
  `<div id="aiEntryBanner" class="ai-entry-banner">
    <div class="ai-entry-banner__text">
      <strong>AI 金字塔分类</strong>
      <span>来自 BookmarkPilot：一键智能整理书签树</span>
    </div>
    <button id="aiEntryBannerBtn" class="ai-entry-banner__btn" type="button">打开 AI 分类</button>
  </div>

  <div class="view-toolbar">`,
  'popup banner'
);

mustReplace(
  'src/timeline/pages/popup/popup.html',
  '<button class="footer-menu-item" id="menuCheckerBtn">',
  `<button class="footer-menu-item" id="menuAiClassifyBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/>
            <path d="M12 12l8-4.5"/>
            <path d="M12 12v9"/>
            <path d="M12 12L4 7.5"/>
          </svg>
          <span>AI 金字塔分类</span>
        </button>
        <button class="footer-menu-item" id="menuAiSettingsBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36 0 .7.13 1 .37H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <span>AI 模型设置</span>
        </button>
        <button class="footer-menu-item" id="menuCheckerBtn">`,
  'popup menu ai items'
);

appendOnce(
  'src/timeline/pages/popup/popup.css',
  '.ai-entry-banner',
  `

/* AI Bookmark OS entry */
.ai-classify-btn {
  color: #0A84FF !important;
  background: rgba(10, 132, 255, 0.12);
}
.ai-classify-btn:hover {
  background: rgba(10, 132, 255, 0.2) !important;
}
.ai-entry-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 8px 12px 0;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(10, 132, 255, 0.22);
  background: linear-gradient(135deg, rgba(10,132,255,0.12), rgba(94,92,230,0.10));
}
.ai-entry-banner__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ai-entry-banner__text strong {
  font-size: 12.5px;
  color: var(--text, #1c1c1e);
}
.ai-entry-banner__text span {
  font-size: 11px;
  color: var(--text-secondary, #636366);
}
.ai-entry-banner__btn {
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 650;
  color: #fff;
  background: #0A84FF;
  cursor: pointer;
}
.ai-entry-banner__btn:hover { filter: brightness(0.96); }
`
);

let js = fs.readFileSync('src/timeline/pages/popup/popup.js', 'utf8');
if (!js.includes('function openAiClassifyPanel')) {
  const openFn = `
// ===== AI Bookmark OS: open pilot classify side panel =====
async function openAiClassifyPanel() {
  try {
    if (chrome.sidePanel && chrome.sidePanel.setOptions) {
      await chrome.sidePanel.setOptions({ path: 'ai/sidepanel.html', enabled: true });
    }
    const win = await chrome.windows.getCurrent();
    if (chrome.sidePanel && chrome.sidePanel.open && win && win.id != null) {
      await chrome.sidePanel.open({ windowId: win.id });
      return;
    }
  } catch (err) {
    console.warn('sidePanel open failed, fallback tab', err);
  }
  chrome.tabs.create({ url: chrome.runtime.getURL('ai/sidepanel.html') });
}

function openAiSettingsPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings/settings.html#ai') });
}

`;
  if (!js.includes('footerSettingsBtn.addEventListener')) throw new Error('cannot find footerSettingsBtn binding');
  js = js.replace('footerSettingsBtn.addEventListener', openFn + 'footerSettingsBtn.addEventListener');
}

if (!js.includes('menuAiClassifyBtn')) {
  const bind = `
// AI classify entries
const aiClassifyBtn = $('aiClassifyBtn');
const aiEntryBannerBtn = $('aiEntryBannerBtn');
const menuAiClassifyBtn = $('menuAiClassifyBtn');
const menuAiSettingsBtn = $('menuAiSettingsBtn');
if (aiClassifyBtn) aiClassifyBtn.addEventListener('click', openAiClassifyPanel);
if (aiEntryBannerBtn) aiEntryBannerBtn.addEventListener('click', openAiClassifyPanel);
if (menuAiClassifyBtn) menuAiClassifyBtn.addEventListener('click', () => {
  footerMenu.classList.remove('footer-menu--open');
  openAiClassifyPanel();
});
if (menuAiSettingsBtn) menuAiSettingsBtn.addEventListener('click', () => {
  footerMenu.classList.remove('footer-menu--open');
  openAiSettingsPage();
});
`;
  const anchor = `menuStatsBtn.addEventListener('click', () => {
  footerMenu.classList.remove('footer-menu--open');
  chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings/settings.html#stats') });
});`;
  if (!js.includes(anchor)) throw new Error('cannot find menuStatsBtn binding');
  js = js.replace(anchor, anchor + '\n' + bind);
}
fs.writeFileSync('src/timeline/pages/popup/popup.js', js);
console.log('ok popup.js');

mustReplace(
  'src/timeline/pages/standalone/standalone.html',
  '<span class="sa-app-name">Markline</span>',
  '<span class="sa-app-name">AI Bookmark OS</span>',
  'standalone title'
);
mustReplace(
  'src/timeline/pages/standalone/standalone.html',
  '<button id="saSyncBtn" class="sa-icon-btn" data-i18n-title="syncBookmarks">',
  `<button id="saAiClassifyBtn" class="sa-icon-btn sa-ai-btn" title="AI 金字塔分类">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/>
          <path d="M12 12l8-4.5"/>
          <path d="M12 12v9"/>
          <path d="M12 12L4 7.5"/>
        </svg>
      </button>
      <button id="saSyncBtn" class="sa-icon-btn" data-i18n-title="syncBookmarks">`,
  'standalone ai btn'
);

appendOnce(
  'src/timeline/pages/standalone/standalone.css',
  '.sa-ai-btn',
  `
.sa-ai-btn { color: #0A84FF !important; background: rgba(10,132,255,0.12); }
.sa-ai-btn:hover { background: rgba(10,132,255,0.2) !important; }
`
);

appendOnce(
  'src/timeline/pages/standalone/standalone.js',
  'saAiClassifyBtn',
  `
// AI Bookmark OS entry
(function bindAiClassifyEntry() {
  async function openAi() {
    try {
      if (chrome.sidePanel && chrome.sidePanel.setOptions) {
        await chrome.sidePanel.setOptions({ path: 'ai/sidepanel.html', enabled: true });
      }
      const win = await chrome.windows.getCurrent();
      if (chrome.sidePanel && chrome.sidePanel.open && win && win.id != null) {
        await chrome.sidePanel.open({ windowId: win.id });
        return;
      }
    } catch (e) {}
    chrome.tabs.create({ url: chrome.runtime.getURL('ai/sidepanel.html') });
  }
  const btn = document.getElementById('saAiClassifyBtn');
  if (btn) btn.addEventListener('click', openAi);
})();
`
);

console.log('ALL PATCHES DONE');
