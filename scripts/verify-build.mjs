import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
let ok = true;
const rootManifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const rootServiceWorker = rootManifest.background?.service_worker;
if (!rootServiceWorker || !existsSync(rootServiceWorker)) {
  console.error('root manifest service worker is missing:', rootServiceWorker);
  ok = false;
} else {
  console.log('OK root manifest service worker');
}
if (rootManifest.action?.default_popup !== 'src/timeline/pages/popup/popup.html') {
  console.error('root manifest should point action popup to unified timeline popup');
  ok = false;
}
if (rootManifest.options_page !== 'options.html') {
  console.error('root manifest should use redirecting unified options.html');
  ok = false;
}
const rootOptions = readFileSync('options.html', 'utf8');
const rootOptionsScript = readFileSync('options.js', 'utf8');
if (!rootOptions.includes('<script src="options.js"></script>') ||
    !rootOptionsScript.includes("location.replace('src/timeline/pages/settings/settings.html#ai')")) {
  console.error('root options.html should redirect to unified timeline settings');
  ok = false;
} else {
  console.log('OK root options redirect');
}

const required = [
  'manifest.json',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'licenses/MIT-Markline.txt',
  'licenses/Apache-2.0.txt',
  'licenses/MIT-React.txt',
  'licenses/ISC-Lucide.txt',
  'background/background.js',
  'background/ai-sw-bridge.js',
  'pages/popup/popup.html',
  'pages/settings/settings.html',
  'pages/checker/checker.html',
  'pages/graph/graph.html',
  'pages/standalone/standalone.html',
  'shared/page-router.js',
  'shared/smart-tagger.js',
  'shared/ai-tagger.js',
  'shared/bookmark-stats.js',
  'content/content-extractor.js',
  'rules/frame_allow.json',
  'icons/icon128.png',
  'ai/sidepanel.html',
  'ai/bookmark-nav.html',
  'ai/options.html',
  'ai/options.js',
  '_locales/zh_CN/messages.json',
  '_locales/en/messages.json',
];

for (const f of required) {
  if (!existsSync(join(dist, f))) {
    console.error('MISSING', f);
    ok = false;
  } else {
    console.log('OK', f);
  }
}

const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) {
  console.error('manifest_version must be 3');
  ok = false;
}
if (manifest.side_panel?.default_path !== 'ai/sidepanel.html') {
  console.error('side_panel should point to ai/sidepanel.html');
  ok = false;
}
if (manifest.action?.default_popup !== 'pages/popup/popup.html') {
  console.error('default_popup should be timeline popup');
  ok = false;
}

const bg = readFileSync(join(dist, 'background/background.js'), 'utf8');
if (!bg.includes('ai-sw-bridge.js')) {
  console.error('background missing ai-sw-bridge import');
  ok = false;
} else {
  console.log('OK bridge import');
}

// Full AI sidepanel bundle should include the complete i18n/runtime payload
const aiAssets = existsSync(join(dist, 'ai/assets')) ? readdirSync(join(dist, 'ai/assets')) : [];
console.log('ai assets', aiAssets.length);
if (!aiAssets.length) {
  console.error('ai assets missing');
  ok = false;
}
if (aiAssets.some((f) => /^options-/.test(f))) {
  console.error('legacy AI options bundle should not be packaged');
  ok = false;
} else {
  console.log('OK no legacy AI options bundle');
}

const aiOptions = readFileSync(join(dist, 'ai/options.html'), 'utf8');
const aiOptionsScript = readFileSync(join(dist, 'ai/options.js'), 'utf8');
if (!aiOptions.includes('<script src="options.js"></script>') ||
    !aiOptionsScript.includes("location.replace('../pages/settings/settings.html#ai')")) {
  console.error('ai/options.html should redirect to unified AI settings');
  ok = false;
} else {
  console.log('OK AI options redirects to unified settings');
}

const launch = readFileSync(join(dist, 'index.html'), 'utf8');
for (const legacyEntry of ['打开时间线弹窗', '打开完整管理窗口', '打开知识图谱', '打开失效检查', '打开通用设置']) {
  if (launch.includes(legacyEntry)) {
    console.error('launcher still exposes split entry:', legacyEntry);
    ok = false;
  }
}
if (!launch.includes('打开统一工作台') || !launch.includes('AI 金字塔分类') || !launch.includes('统一设置')) {
  console.error('launcher missing consolidated entries');
  ok = false;
} else {
  console.log('OK consolidated launcher entries');
}
if (!launch.includes('launchAiClassifyBtn') || !launch.includes('shared/page-router.js') || !launch.includes('openAiClassificationPanel')) {
  console.error('launcher AI classify entry should use the shared side panel opener');
  ok = false;
} else {
  console.log('OK launcher AI side panel entry');
}

const standaloneHtml = readFileSync(join(dist, 'pages/standalone/standalone.html'), 'utf8');
const standaloneJs = readFileSync(join(dist, 'pages/standalone/standalone.js'), 'utf8');
for (const id of ['saAiClassifyBtn', 'saBookmarkNavBtn', 'saCheckerBtn', 'saGraphBtn', 'saSettingsBtn']) {
  if (!standaloneHtml.includes(id) || !standaloneJs.includes(id)) {
    console.error('standalone workspace missing unified entry:', id);
    ok = false;
  }
}
if (['saAiClassifyBtn', 'saBookmarkNavBtn', 'saCheckerBtn', 'saGraphBtn', 'saSettingsBtn'].every((id) => standaloneHtml.includes(id) && standaloneJs.includes(id))) {
  console.log('OK standalone unified workspace entries');
}
if (!standaloneHtml.includes('shared/page-router.js') || !standaloneJs.includes('AIBookmarkPageRouter')) {
  console.error('standalone should use shared page router for feature entries');
  ok = false;
} else {
  console.log('OK standalone page router');
}
const standaloneCss = readFileSync(join(dist, 'pages/standalone/standalone.css'), 'utf8');
if (!standaloneCss.includes('grid-auto-rows: max-content') || !standaloneCss.includes('align-content: start')) {
  console.error('standalone grid cards should keep content-height rows');
  ok = false;
} else {
  console.log('OK standalone grid card row sizing');
}

for (const page of ['checker', 'graph']) {
  const html = readFileSync(join(dist, 'pages', page, `${page}.html`), 'utf8');
  const js = readFileSync(join(dist, 'pages', page, `${page}.js`), 'utf8');
  const css = readFileSync(join(dist, 'pages', page, `${page}.css`), 'utf8');
  for (const id of ['workspaceBtn', 'bookmarkNavBtn', 'aiClassifyBtn', 'checkerBtn', 'graphBtn', 'settingsBtn']) {
    if (!html.includes(id) || !js.includes(id)) {
      console.error(`${page} missing unified navigation entry:`, id);
      ok = false;
    }
  }
  if (!css.includes('.page-nav') || !js.includes('pages/standalone/standalone.html')) {
    console.error(`${page} should link back into the unified workspace navigation`);
    ok = false;
  } else {
    console.log('OK unified navigation', page);
  }
  if (!html.includes('shared/page-router.js') || !js.includes('AIBookmarkPageRouter') || !css.includes('aria-current')) {
    console.error(`${page} should reuse existing feature tabs and mark the active page`);
    ok = false;
  } else {
    console.log('OK page router navigation', page);
  }
}

// Ensure no old product names in user-facing popup banner
const popup = readFileSync(join(dist, 'pages/popup/popup.html'), 'utf8');
if (!popup.includes('shared/page-router.js')) {
  console.error('popup should load shared page router');
  ok = false;
} else {
  console.log('OK popup page router script');
}
if (/BookmarkPilot|Markline/i.test(popup)) {
  console.error('popup still contains old project names');
  ok = false;
} else {
  console.log('OK popup branding');
}

// Full smart tagger
const taggerSize = readFileSync(join(dist, 'shared/smart-tagger.js')).length;
console.log('smart-tagger bytes', taggerSize);
if (taggerSize < 50000) {
  console.error('smart-tagger looks truncated');
  ok = false;
}

for (const loc of readdirSync(join(dist, '_locales'))) {
  try {
    const json = JSON.parse(readFileSync(join(dist, '_locales', loc, 'messages.json'), 'utf8'));
    if (!json.extName?.message?.includes('AI Bookmark OS')) {
      console.error('locale brand missing', loc, json.extName?.message);
      ok = false;
    } else {
      console.log('OK locale', loc);
    }
  } catch (e) {
    console.error('INVALID locale', loc, e.message);
    ok = false;
  }
}


// No reference-project brand or third-party author links in AI UI
const aiSideHtml = readFileSync(join(dist, 'ai/sidepanel.html'), 'utf8');
const aiSideCss = aiAssets.map((f) => readFileSync(join(dist, 'ai/assets', f), 'utf8')).join('\n');
const popupJs = readFileSync(join(dist, 'pages/popup/popup.js'), 'utf8');
const brandBad = /BOOHHP|BookmarkPilot|(?<![A-Za-z])Markline(?![A-Za-z])|(?<![A-Za-z])Bookmark Pilot(?![A-Za-z])|github\.com\/BOOHHP/;
for (const [label, text] of [
  ['popup.html', popup],
  ['popup.js', popupJs],
  ['ai/sidepanel.html', aiSideHtml],
  ['ai assets', aiSideCss],
]) {
  if (brandBad.test(text)) {
    console.error('brand leak in', label);
    ok = false;
  } else {
    console.log('OK brand', label);
  }
}

// AI entry hooks present
if (!popupJs.includes('openAiClassifyPanel') || !popup.includes('aiClassifyBtn')) {
  console.error('AI classify entry missing in popup');
  ok = false;
} else {
  console.log('OK AI entry hooks');
}


// AI classify opens Chrome side panel; popup should close to avoid overlap
const popupJsFull = readFileSync(join(dist, 'pages/popup/popup.js'), 'utf8');
const sharedPageRouter = readFileSync(join(dist, 'shared/page-router.js'), 'utf8');
if (!popupJsFull.includes('AIBookmarkPageRouter') || !popupJsFull.includes('openAiClassificationPanel')) {
  console.error('popup feature entries should reuse existing extension tabs');
  ok = false;
} else {
  console.log('OK popup feature tab reuse');
}
if (!sharedPageRouter.includes('function openAiClassificationPanel')
  || !sharedPageRouter.includes('sidePanel?.open')
  || !sharedPageRouter.includes('response?.ok')) {
  console.error('shared AI classify opener should use side panel and verify bridge responses');
  ok = false;
} else {
  console.log('OK shared side panel AI entry');
}
if (!popupJsFull.includes('window.close()')) {
  console.error('popup should close after opening AI side panel');
  ok = false;
} else {
  console.log('OK popup auto-close after AI open');
}

const settingsHtml = readFileSync(join(dist, 'pages/settings/settings.html'), 'utf8');
const settingsJs = readFileSync(join(dist, 'pages/settings/settings.js'), 'utf8');
const settingsCss = readFileSync(join(dist, 'pages/settings/settings.css'), 'utf8');
for (const id of ['workspaceBtn', 'bookmarkNavBtn', 'aiClassifyBtn', 'checkerBtn', 'graphBtn', 'settingsBtn']) {
  if (!settingsHtml.includes(id) || !settingsJs.includes(id)) {
    console.error('settings missing unified navigation entry:', id);
    ok = false;
  }
}
if (!settingsHtml.includes('shared/page-router.js') || !settingsJs.includes('AIBookmarkPageRouter') || !settingsJs.includes('openSettingsPanelFromLocation') || !settingsCss.includes('.page-nav')) {
  console.error('settings should use unified page router navigation and hash panel switching');
  ok = false;
} else {
  console.log('OK settings unified page navigation');
}
if (!settingsHtml.includes('aiTreeOpenSidepanelBtn') || !settingsJs.includes('openAiTreeClassifyPanel')) {
  console.error('settings AI tree side panel entry missing');
  ok = false;
} else if (!settingsJs.includes('openAiClassificationPanel')) {
  console.error('settings AI tree entry should use the shared side panel opener');
  ok = false;
} else {
  console.log('OK settings shared AI tree side panel entry');
}
for (const autosaveHook of [
  'treeProviderSelect.addEventListener',
  'treeApiKeyInput.addEventListener',
  'treeModelInput.addEventListener',
  'treeBaseUrlInput.addEventListener',
  'treePromptAssign.addEventListener',
]) {
  if (!settingsJs.includes(autosaveHook)) {
    console.error('settings AI tree autosave hook missing:', autosaveHook);
    ok = false;
  }
}
if (settingsJs.includes('treePromptAssign.addEventListener') && settingsJs.includes('treeApiKeyInput.addEventListener')) {
  console.log('OK settings AI tree autosave hooks');
}
if (!settingsJs.includes('function autoSaveTreeSettings') || settingsJs.includes('treeApiKeyInput.addEventListener(\'change\', () => { saveTreeSettings();')) {
  console.error('settings AI tree autosave should allow partial config');
  ok = false;
} else {
  console.log('OK settings AI tree partial autosave');
}
// AI page should not ship health/dup panel
const sideJs = aiAssets.map((f) => readFileSync(join(dist, 'ai/assets', f), 'utf8')).join('\n');
if (!sideJs.includes('topbar-nav-btn') || !sideJs.includes('bookmark-page-nav') || (!sideJs.includes('tabs.query') && !sideJs.includes('tabs?.query'))) {
  console.error('AI pages should include unified navigation and tab reuse helper');
  ok = false;
} else {
  console.log('OK AI pages unified navigation');
}
if (sideJs.includes('healthCheckDup') && sideJs.includes('HealthPanel')) {
  console.error('AI page still contains health panel');
  ok = false;
} else {
  console.log('OK AI page focused on classify');
}

// AI classify reconnect / timeout controls should ship in built assets
if (
  !sideJs.includes('AI 连接失败') ||
  !sideJs.includes('aiRetryCount') ||
  !sideJs.includes('aiRequestTimeoutSeconds')
) {
  console.error('AI reconnect settings or runtime retry hint missing');
  ok = false;
} else {
  console.log('OK AI reconnect controls');
}

if (!ok) process.exit(1);
console.log('VERIFY PASS — AI Bookmark OS package verified');
