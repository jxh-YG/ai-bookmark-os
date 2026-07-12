import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

let ok = true;

function fail(message) {
  console.error('FAIL', message);
  ok = false;
}

function pass(message) {
  console.log('OK', message);
}

function mustExist(path) {
  if (!existsSync(path)) fail(`missing ${path}`);
  else pass(path);
}

function text(path) {
  return readFileSync(path, 'utf8');
}

function mustInclude(path, needles) {
  const content = text(path);
  for (const needle of needles) {
    if (!content.includes(needle)) fail(`${path} missing: ${needle}`);
  }
  if (needles.every((needle) => content.includes(needle))) pass(`${path} content`);
}

const requiredFiles = [
  'AI Bookmark OS.md',
  'README.md',
  'docs/SOURCE_ANALYSIS.md',
  'docs/FEATURE_MERGE.md',
  'docs/UI_APPLE_OS.md',
  'dist/manifest.json',
  'dist/pages/popup/popup.html',
  'dist/pages/settings/settings.html',
  'dist/pages/standalone/standalone.html',
  'dist/pages/checker/checker.html',
  'dist/pages/graph/graph.html',
  'dist/ai/sidepanel.html',
  'dist/ai/options.html',
  'dist/background/background.js',
  'dist/background/ai-sw-bridge.js',
  'dist/shared/smart-tagger.js',
  'dist/shared/ai-tagger.js',
  'dist/shared/apple-design-system.css',
  'dist/icons/icon128.png',
];

for (const file of requiredFiles) mustExist(file);

mustInclude('README.md', [
  '核心功能',
  '技术栈',
  '目录结构',
  '环境要求',
  '安装与构建',
  '本地加载',
  'AI 配置',
  '常见问题',
  '请加载 `dist/`',
]);

mustInclude('docs/SOURCE_ANALYSIS.md', ['技术栈', '目录结构', '核心能力', '合并策略', '构建与运行']);
mustInclude('docs/FEATURE_MERGE.md', ['功能对照表', '架构整合', '入口整合', '验收证据']);
mustInclude('docs/UI_APPLE_OS.md', ['设计原则', '统一设计变量', '组件规范', '页面改造点', '响应式与可用性']);

const manifest = JSON.parse(text('dist/manifest.json'));
for (const permission of ['bookmarks', 'storage', 'sidePanel', 'contextMenus', 'tabs']) {
  if (!manifest.permissions?.includes(permission)) fail(`manifest missing permission ${permission}`);
}
if (manifest.action?.default_popup !== 'pages/popup/popup.html') fail('manifest popup path mismatch');
else pass('manifest popup path');
if (manifest.side_panel?.default_path !== 'ai/sidepanel.html') fail('manifest side panel path mismatch');
else pass('manifest side panel path');
if (manifest.options_page !== 'pages/settings/settings.html') fail('manifest options path mismatch');
else pass('manifest options path');
if (!manifest.omnibox || manifest.omnibox.keyword !== 'bk') fail('manifest omnibox missing');
else pass('manifest omnibox');

const aiAssets = existsSync('dist/ai/assets') ? readdirSync('dist/ai/assets') : [];
if (aiAssets.some((file) => /^options-/.test(file))) fail('legacy AI options bundle should not be packaged');
else pass('no legacy AI options bundle');

const aiOptionsHtml = text('dist/ai/options.html');
if (!aiOptionsHtml.includes("location.replace('../pages/settings/settings.html#ai')")) {
  fail('dist/ai/options.html should redirect to unified settings');
} else {
  pass('AI options redirect');
}

const launchHtml = text('dist/index.html');
for (const legacyEntry of ['打开时间线弹窗', '打开完整管理窗口', '打开知识图谱', '打开失效检查', '打开通用设置']) {
  if (launchHtml.includes(legacyEntry)) fail(`launcher still exposes split entry: ${legacyEntry}`);
}
if (launchHtml.includes('打开统一工作台') && launchHtml.includes('AI 金字塔分类') && launchHtml.includes('统一设置')) {
  pass('launcher consolidated entries');
}

const standaloneHtml = text('dist/pages/standalone/standalone.html');
const standaloneJs = text('dist/pages/standalone/standalone.js');
for (const id of ['saAiClassifyBtn', 'saCheckerBtn', 'saGraphBtn', 'saSettingsBtn']) {
  if (!standaloneHtml.includes(id) || !standaloneJs.includes(id)) fail(`standalone missing unified entry ${id}`);
}
if (['saAiClassifyBtn', 'saCheckerBtn', 'saGraphBtn', 'saSettingsBtn'].every((id) => standaloneHtml.includes(id) && standaloneJs.includes(id))) {
  pass('standalone unified entries');
}

const aiText = aiAssets.map((file) => text(join('dist/ai/assets', file))).join('\n');
for (const needle of ['aiRetryCount', 'aiRequestTimeoutSeconds', 'AI 连接失败']) {
  if (!aiText.includes(needle)) fail(`AI asset missing ${needle}`);
}
if (['aiRetryCount', 'aiRequestTimeoutSeconds', 'AI 连接失败'].every((needle) => aiText.includes(needle))) {
  pass('AI reconnect assets');
}

const settingsText = text('dist/pages/settings/settings.html') + '\n' + text('dist/pages/settings/settings.js');
for (const needle of ['失败重连次数', '请求超时', 'aiRetryCount', 'aiRequestTimeoutSeconds']) {
  if (!settingsText.includes(needle)) fail(`unified settings missing ${needle}`);
}
if (['失败重连次数', '请求超时', 'aiRetryCount', 'aiRequestTimeoutSeconds'].every((needle) => settingsText.includes(needle))) {
  pass('unified AI reconnect settings');
}

const popupJs = text('dist/pages/popup/popup.js');
if (!popupJs.includes('openAiClassifyPanel') || !popupJs.includes('sidePanel.open') || !popupJs.includes('window.close()')) {
  fail('popup AI side panel handoff incomplete');
} else {
  pass('popup AI side panel handoff');
}

const docsText = ['README.md', 'docs/SOURCE_ANALYSIS.md', 'docs/FEATURE_MERGE.md', 'docs/UI_APPLE_OS.md', 'options.html', '_locales/zh_CN/messages.json']
  .map(text)
  .join('\n');
for (const bad of ['�', '璁', '缁', '鍒', 'BookmarkPilot', 'github.com/BOOHHP']) {
  if (docsText.includes(bad)) fail(`mojibake or old brand marker found: ${bad}`);
}

if (!ok) process.exit(1);
console.log('PROJECT AUDIT PASS — AI Bookmark OS deliverables verified');
