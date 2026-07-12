const fs = require('fs');

function patchPopupJs() {
  let js = fs.readFileSync('src/timeline/pages/popup/popup.js', 'utf8');

  if (!js.includes('function openAiClassifyPanel')) {
    const openFn = [
      '',
      '// ===== AI Bookmark OS: open pilot classify side panel =====',
      'async function openAiClassifyPanel() {',
      '  try {',
      "    if (chrome.sidePanel && chrome.sidePanel.setOptions) {",
      "      await chrome.sidePanel.setOptions({ path: 'ai/sidepanel.html', enabled: true });",
      '    }',
      '    const win = await chrome.windows.getCurrent();',
      '    if (chrome.sidePanel && chrome.sidePanel.open && win && win.id != null) {',
      '      await chrome.sidePanel.open({ windowId: win.id });',
      '      return;',
      '    }',
      '  } catch (err) {',
      "    console.warn('sidePanel open failed, fallback tab', err);",
      '  }',
      "  chrome.tabs.create({ url: chrome.runtime.getURL('ai/sidepanel.html') });",
      '}',
      '',
      'function openAiSettingsPage() {',
      "  chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings/settings.html#ai') });",
      '}',
      '',
      ''
    ].join('\n');

    if (!js.includes('footerSettingsBtn.addEventListener')) {
      throw new Error('footerSettingsBtn binding missing');
    }
    js = js.replace('footerSettingsBtn.addEventListener', openFn + 'footerSettingsBtn.addEventListener');
  }

  if (!js.includes('menuAiClassifyBtn')) {
    const bind = [
      '',
      '// AI classify entries',
      "const aiClassifyBtn = $('aiClassifyBtn');",
      "const aiEntryBannerBtn = $('aiEntryBannerBtn');",
      "const menuAiClassifyBtn = $('menuAiClassifyBtn');",
      "const menuAiSettingsBtn = $('menuAiSettingsBtn');",
      "if (aiClassifyBtn) aiClassifyBtn.addEventListener('click', openAiClassifyPanel);",
      "if (aiEntryBannerBtn) aiEntryBannerBtn.addEventListener('click', openAiClassifyPanel);",
      "if (menuAiClassifyBtn) menuAiClassifyBtn.addEventListener('click', () => {",
      "  footerMenu.classList.remove('footer-menu--open');",
      '  openAiClassifyPanel();',
      '});',
      "if (menuAiSettingsBtn) menuAiSettingsBtn.addEventListener('click', () => {",
      "  footerMenu.classList.remove('footer-menu--open');",
      '  openAiSettingsPage();',
      '});',
      ''
    ].join('\n');

    const re = /menuStatsBtn\.addEventListener\('click', \(\) => \{\r?\n  footerMenu\.classList\.remove\('footer-menu--open'\);\r?\n  chrome\.tabs\.create\(\{ url: chrome\.runtime\.getURL\('pages\/settings\/settings\.html#stats'\) \}\);\r?\n\}\);/;
    if (!re.test(js)) throw new Error('menuStatsBtn regex miss');
    js = js.replace(re, (m) => m + bind);
  }

  fs.writeFileSync('src/timeline/pages/popup/popup.js', js);
  console.log('popup.js', js.includes('openAiClassifyPanel'), js.includes('menuAiClassifyBtn'));
}

function patchStandalone() {
  let html = fs.readFileSync('src/timeline/pages/standalone/standalone.html', 'utf8');
  if (!html.includes('saAiClassifyBtn')) {
    html = html.replace('<span class="sa-app-name">Markline</span>', '<span class="sa-app-name">AI Bookmark OS</span>');
    html = html.replace(
      '<button id="saSyncBtn" class="sa-icon-btn" data-i18n-title="syncBookmarks">',
      [
        '<button id="saAiClassifyBtn" class="sa-icon-btn sa-ai-btn" title="AI 金字塔分类">',
        '        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
        '          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/>',
        '          <path d="M12 12l8-4.5"/>',
        '          <path d="M12 12v9"/>',
        '          <path d="M12 12L4 7.5"/>',
        '        </svg>',
        '      </button>',
        '      <button id="saSyncBtn" class="sa-icon-btn" data-i18n-title="syncBookmarks">'
      ].join('\n')
    );
    fs.writeFileSync('src/timeline/pages/standalone/standalone.html', html);
    console.log('standalone.html ok');
  } else {
    console.log('standalone.html already');
  }

  let css = fs.readFileSync('src/timeline/pages/standalone/standalone.css', 'utf8');
  if (!css.includes('.sa-ai-btn')) {
    fs.writeFileSync(
      'src/timeline/pages/standalone/standalone.css',
      css + '\n.sa-ai-btn { color: #0A84FF !important; background: rgba(10,132,255,0.12); }\n.sa-ai-btn:hover { background: rgba(10,132,255,0.2) !important; }\n'
    );
    console.log('standalone.css ok');
  }

  let js = fs.readFileSync('src/timeline/pages/standalone/standalone.js', 'utf8');
  if (!js.includes('saAiClassifyBtn')) {
    const snip = [
      '',
      '// AI Bookmark OS entry',
      '(function bindAiClassifyEntry() {',
      '  async function openAi() {',
      '    try {',
      '      if (chrome.sidePanel && chrome.sidePanel.setOptions) {',
      "        await chrome.sidePanel.setOptions({ path: 'ai/sidepanel.html', enabled: true });",
      '      }',
      '      const win = await chrome.windows.getCurrent();',
      '      if (chrome.sidePanel && chrome.sidePanel.open && win && win.id != null) {',
      '        await chrome.sidePanel.open({ windowId: win.id });',
      '        return;',
      '      }',
      '    } catch (e) {}',
      "    chrome.tabs.create({ url: chrome.runtime.getURL('ai/sidepanel.html') });",
      '  }',
      "  const btn = document.getElementById('saAiClassifyBtn');",
      '  if (btn) btn.addEventListener("click", openAi);',
      '})();',
      ''
    ].join('\n');
    fs.writeFileSync('src/timeline/pages/standalone/standalone.js', js + snip);
    console.log('standalone.js ok');
  } else {
    console.log('standalone.js already');
  }
}

patchPopupJs();
patchStandalone();
console.log('DONE');
