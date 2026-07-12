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
if (!rootOptions.includes("src/timeline/pages/settings/settings.html#ai")) {
  console.error('root options.html should redirect to unified timeline settings');
  ok = false;
} else {
  console.log('OK root options redirect');
}

const required = [
  'manifest.json',
  'background/background.js',
  'background/ai-sw-bridge.js',
  'pages/popup/popup.html',
  'pages/settings/settings.html',
  'pages/checker/checker.html',
  'pages/graph/graph.html',
  'pages/standalone/standalone.html',
  'shared/smart-tagger.js',
  'shared/ai-tagger.js',
  'shared/bookmark-stats.js',
  'content/content-extractor.js',
  'rules/frame_allow.json',
  'icons/icon128.png',
  'ai/sidepanel.html',
  'ai/options.html',
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

// Full AI sidepanel bundle should include pilot i18n weight
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
if (!aiOptions.includes("location.replace('../pages/settings/settings.html#ai')")) {
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

const standaloneHtml = readFileSync(join(dist, 'pages/standalone/standalone.html'), 'utf8');
const standaloneJs = readFileSync(join(dist, 'pages/standalone/standalone.js'), 'utf8');
for (const id of ['saAiClassifyBtn', 'saCheckerBtn', 'saGraphBtn', 'saSettingsBtn']) {
  if (!standaloneHtml.includes(id) || !standaloneJs.includes(id)) {
    console.error('standalone workspace missing unified entry:', id);
    ok = false;
  }
}
if (['saAiClassifyBtn', 'saCheckerBtn', 'saGraphBtn', 'saSettingsBtn'].every((id) => standaloneHtml.includes(id) && standaloneJs.includes(id))) {
  console.log('OK standalone unified workspace entries');
}

for (const page of ['checker', 'graph']) {
  const html = readFileSync(join(dist, 'pages', page, `${page}.html`), 'utf8');
  const js = readFileSync(join(dist, 'pages', page, `${page}.js`), 'utf8');
  const css = readFileSync(join(dist, 'pages', page, `${page}.css`), 'utf8');
  for (const id of ['workspaceBtn', 'aiClassifyBtn', 'settingsBtn']) {
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
}

// Ensure no old product names in user-facing popup banner
const popup = readFileSync(join(dist, 'pages/popup/popup.html'), 'utf8');
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
if (!popupJsFull.includes('sidePanel.open') || !popupJsFull.includes("path: 'ai/sidepanel.html'")) {
  console.error('AI classify should open side panel with ai/sidepanel.html');
  ok = false;
} else {
  console.log('OK side panel AI entry');
}
if (!popupJsFull.includes('window.close()')) {
  console.error('popup should close after opening AI side panel');
  ok = false;
} else {
  console.log('OK popup auto-close after AI open');
}
// AI page should not ship health/dup panel
const sideJs = aiAssets.map((f) => readFileSync(join(dist, 'ai/assets', f), 'utf8')).join('\n');
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
console.log('VERIFY PASS — full AI pilot UI + branded hybrid');
