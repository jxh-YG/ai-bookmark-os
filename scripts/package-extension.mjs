import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const timelineSource = path.join(root, 'src', 'timeline');
const aiDist = path.join(dist, 'ai');

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const name of readdirSync(src)) {
    if (name === '.git' || name === '_metadata' || name === 'node_modules') continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}

function mustExist(p, label) {
  if (!existsSync(p)) throw new Error('Missing ' + label + ': ' + p);
}

mustExist(timelineSource, 'src/timeline');
mustExist(aiDist, 'dist/ai (run vite build first)');
mustExist(path.join(aiDist, 'sidepanel.html'), 'dist/ai/sidepanel.html');
mustExist(path.join(aiDist, 'bookmark-nav.html'), 'dist/ai/bookmark-nav.html');

ensureDir(dist);
for (const name of readdirSync(dist)) {
  if (name === 'ai') continue;
  rmSync(path.join(dist, name), { recursive: true, force: true });
}

// 1) Full timeline modules at extension root
for (const part of ['background', 'content', 'pages', 'shared', 'rules', 'icons']) {
  const src = path.join(timelineSource, part);
  if (existsSync(src)) copyDir(src, path.join(dist, part));
}

const licenseFiles = [
  [path.join(root, 'LICENSE'), path.join(dist, 'LICENSE')],
  [path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(dist, 'THIRD_PARTY_NOTICES.md')],
  [path.join(timelineSource, 'LICENSE.markline'), path.join(dist, 'licenses', 'MIT-Markline.txt')],
  [path.join(root, 'LICENSES', 'Apache-2.0.txt'), path.join(dist, 'licenses', 'Apache-2.0.txt')],
  [path.join(root, 'LICENSES', 'MIT-React.txt'), path.join(dist, 'licenses', 'MIT-React.txt')],
  [path.join(root, 'LICENSES', 'ISC-Lucide.txt'), path.join(dist, 'licenses', 'ISC-Lucide.txt')],
];
for (const [source, destination] of licenseFiles) {
  mustExist(source, path.relative(root, source));
  ensureDir(path.dirname(destination));
  copyFileSync(source, destination);
}

// 2) Full AI UI under /ai

// Prefer branded AI Bookmark OS icons over vendor defaults
const projectIcons = path.join(root, 'icons');
for (const name of ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png']) {
  const src = path.join(projectIcons, name);
  if (existsSync(src)) {
    copyFileSync(src, path.join(dist, 'icons', name));
  }
}

// The React AI options page is kept in source for development, but the packaged
// extension must expose one settings surface only. Direct visits are forwarded
// to the unified settings page to avoid two competing AI settings UIs.
const aiOptionsRedirect = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Bookmark OS · 设置</title>
  <script src="options.js"></script>
  <style>
    :root{color-scheme:light dark}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:linear-gradient(180deg,#f8fbff 0%,#edf4fb 48%,#f6f8fb 100%);color:#1d1d1f}
    body::before{content:"";position:fixed;inset:0;pointer-events:none;background:linear-gradient(120deg,rgba(255,255,255,.78),rgba(224,237,255,.28) 42%,transparent 76%),linear-gradient(180deg,rgba(255,255,255,.52),rgba(238,244,251,0));}
    main{width:min(640px,100%);padding:28px;background:rgba(255,255,255,.76);border:1px solid rgba(255,255,255,.72);border-radius:24px;box-shadow:0 18px 52px rgba(35,66,112,.12),0 1px 0 rgba(255,255,255,.8) inset;backdrop-filter:blur(18px) saturate(170%);-webkit-backdrop-filter:blur(18px) saturate(170%)}
    h1{margin:0 0 10px;font-size:24px;line-height:1.2;letter-spacing:0}
    p{margin:0;color:#53606f;line-height:1.6}
    a{display:inline-flex;margin-top:20px;padding:12px 16px;border-radius:14px;background:linear-gradient(180deg,#4f89ff,#0a84ff);color:#fff;text-decoration:none;font-weight:600;box-shadow:0 18px 52px rgba(93,151,255,.18)}
  </style>
</head>
<body>
  <main>
    <h1>AI Bookmark OS</h1>
    <p>统一设置入口已收口到系统设置页，继续后将进入 AI 分类与书签管理的统一面板。</p>
    <a href="../pages/settings/settings.html#ai">打开统一设置</a>
  </main>
</body>
</html>`;
writeFileSync(path.join(dist, 'ai', 'options.html'), aiOptionsRedirect, 'utf8');
writeFileSync(
  path.join(dist, 'ai', 'options.js'),
  "location.replace('../pages/settings/settings.html#ai');\n",
  'utf8',
);

// 3) SW bridge
ensureDir(path.join(dist, 'background'));
copyFileSync(
  path.join(root, 'src', 'bridge', 'ai-sw-bridge.js'),
  path.join(dist, 'background', 'ai-sw-bridge.js'),
);

// 4) Inject bridge into SW
const bgPath = path.join(dist, 'background', 'background.js');
let bg = readFileSync(bgPath, 'utf8');
if (!bg.includes("importScripts('ai-sw-bridge.js')") && !bg.includes('importScripts("ai-sw-bridge.js")')) {
  writeFileSync(bgPath, "importScripts('ai-sw-bridge.js');\n" + bg, 'utf8');
}

// 5) Locales branded as AI Bookmark OS
const localeRoot = path.join(dist, '_locales');
ensureDir(localeRoot);
for (const loc of ['en', 'zh_CN']) {
  const src = path.join(timelineSource, '_locales', loc, 'messages.json');
  mustExist(src, 'locale ' + loc);
  const messages = JSON.parse(readFileSync(src, 'utf8'));
  if (loc === 'zh_CN') {
    messages.extName = { message: 'AI Bookmark OS' };
    messages.extDescription = {
      message: '统一时间线管理、智能标签与 AI 金字塔分类的 Apple OS 风格书签系统',
    };
    messages.actionTitle = { message: '打开 AI Bookmark OS' };
    messages.cmdOpenAiSidepanel = { message: '打开 AI 分类侧边栏' };
    messages.appName = { message: 'AI Bookmark OS' };
    messages.appDescription = {
      message: '时间线书签管理 + 规则/AI 标签 + 知识图谱 + RSS + AI 金字塔分类',
    };
  } else {
    messages.extName = { message: 'AI Bookmark OS' };
    messages.extDescription = {
      message: 'Timeline bookmarks, smart tags, and AI pyramid classification',
    };
    messages.actionTitle = { message: 'Open AI Bookmark OS' };
    messages.cmdOpenAiSidepanel = { message: 'Open AI classify side panel' };
    messages.appName = { message: 'AI Bookmark OS' };
    messages.appDescription = {
      message: 'Timeline bookmarks + smart tags + graph + RSS + AI pyramid classify',
    };
  }
  ensureDir(path.join(localeRoot, loc));
  writeFileSync(path.join(localeRoot, loc, 'messages.json'), JSON.stringify(messages, null, 2), 'utf8');
}

// 6) Unified manifest
const manifest = {
  manifest_version: 3,
  name: '__MSG_extName__',
  version: '1.0.1',
  homepage_url: 'https://github.com/jxh-YG/ai-bookmark-os',
  default_locale: 'zh_CN',
  description: '__MSG_extDescription__',
  icons: {
    '16': 'icons/icon16.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  },
  minimum_chrome_version: '114',
  permissions: [
    'bookmarks',
    'storage',
    'contextMenus',
    'activeTab',
    'alarms',
    'tabs',
    'history',
    'notifications',
    'scripting',
    'declarativeNetRequest',
    'sidePanel',
    'favicon',
    'windows',
  ],
  optional_host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'background/background.js',
  },
  action: {
    default_popup: 'pages/popup/popup.html',
    default_title: '__MSG_actionTitle__',
    default_icon: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
  },
  side_panel: {
    default_path: 'ai/sidepanel.html',
  },
  options_page: 'pages/settings/settings.html',
  commands: {
    'open-command-palette': {
      suggested_key: { default: 'Ctrl+Shift+E', mac: 'Command+Shift+E' },
      description: '__MSG_cmdOpenPalette__',
    },
    'open-popup': {
      suggested_key: { default: 'Alt+Shift+B', mac: 'Alt+Shift+B' },
      description: '__MSG_cmdOpenPopup__',
    },
    'quick-bookmark': {
      suggested_key: { default: 'Alt+Shift+D', mac: 'Alt+Shift+D' },
      description: '__MSG_cmdQuickBookmark__',
    },
    'open-ai-sidepanel': {
      suggested_key: { default: 'Alt+Shift+A', mac: 'Alt+Shift+A' },
      description: '__MSG_cmdOpenAiSidepanel__',
    },
  },
  omnibox: { keyword: 'bk' },
  declarative_net_request: {
    rule_resources: [
      {
        id: 'frame_allow_rules',
        enabled: true,
        path: 'rules/frame_allow.json',
      },
    ],
  },
};
writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

// 7) Launcher
const launchHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Bookmark OS</title>
  <style>
    :root{color-scheme:light dark}
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;margin:0;min-height:100vh;background:linear-gradient(180deg,#f8fbff 0%,#edf4fb 48%,#f6f8fb 100%);color:#1d1d1f;display:grid;place-items:center;padding:24px;letter-spacing:0}
    body::before{content:"";position:fixed;inset:0;pointer-events:none;background:linear-gradient(120deg,rgba(255,255,255,.78),rgba(224,237,255,.28) 42%,transparent 76%),linear-gradient(180deg,rgba(255,255,255,.52),rgba(238,244,251,0))}
    main{position:relative;width:min(820px,100%);padding:30px;background:rgba(255,255,255,.74);border:1px solid rgba(255,255,255,.74);border-radius:28px;box-shadow:0 28px 70px rgba(35,66,112,.16),0 1px 0 rgba(255,255,255,.82) inset;backdrop-filter:blur(22px) saturate(170%);-webkit-backdrop-filter:blur(22px) saturate(170%)}
    .brand{display:flex;align-items:center;gap:13px;margin-bottom:14px;min-width:0}
    .mark{width:42px;height:42px;border-radius:15px;background:linear-gradient(135deg,#10213c,#1f78ff 56%,#8fc7ff);color:white;display:grid;place-items:center;font-weight:800;box-shadow:0 16px 38px rgba(10,132,255,.28),0 1px 0 rgba(255,255,255,.38) inset}
    h1{margin:0;font-size:28px;line-height:1.16;letter-spacing:0}
    p{color:#53606f;line-height:1.6;margin:8px 0 0}
    .primary{display:block;margin-top:24px;padding:15px 18px;border-radius:16px;background:linear-gradient(180deg,#4f89ff,#0a84ff);color:#fff;text-decoration:none;font-weight:700;text-align:center;box-shadow:0 18px 52px rgba(93,151,255,.2),0 1px 0 rgba(255,255,255,.28) inset}
    .secondary{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:12px}
    .secondary a{display:block;min-width:0;padding:13px 14px;border:1px solid rgba(255,255,255,.68);border-radius:16px;background:rgba(255,255,255,.52);color:#0a84ff;text-decoration:none;font-weight:650;text-align:center;box-shadow:0 8px 22px rgba(35,66,112,.08),0 1px 0 rgba(255,255,255,.74) inset;transition:transform 160ms ease,box-shadow 160ms ease,background 160ms ease}
    .secondary a:hover{transform:translateY(-1px);background:rgba(255,255,255,.74);box-shadow:0 18px 44px rgba(35,66,112,.12)}
    .note{margin-top:18px;font-size:13px;color:#7b8796}
    @media(max-width:560px){body{padding:12px}.secondary{grid-template-columns:1fr}main{padding:22px;border-radius:22px}h1{font-size:24px}}
  </style>
</head>
<body>
  <main>
    <div class="brand"><div class="mark">AI</div><h1>AI Bookmark OS</h1></div>
    <p>完整书签管理从统一工作台进入；AI 分类和全部配置保留清晰的单一入口，避免在多个页面间反复跳转。</p>
    <a class="primary" href="pages/standalone/standalone.html">打开统一工作台</a>
    <div class="secondary">
      <a href="ai/bookmark-nav.html">书签导航</a>
      <a id="launchAiClassifyBtn" href="ai/sidepanel.html">AI 金字塔分类</a>
      <a href="pages/settings/settings.html#ai">统一设置</a>
    </div>
    <p class="note">失效检测、知识图谱、RSS、统计和最近删除均可从统一工作台或弹窗菜单进入。快捷键：Alt+Shift+D 快速收藏 · Alt+Shift+B 打开弹窗 · Alt+Shift+A 打开 AI 分类侧边栏。</p>
  </main>
  <script src="shared/page-router.js"></script>
  <script>
    document.getElementById('launchAiClassifyBtn')?.addEventListener('click', (event) => {
      event.preventDefault();
      const router = window.AIBookmarkPageRouter;
      void (router?.openAiClassificationPanel?.()
        ?? router?.openOrFocusExtensionPage('ai/sidepanel.html')
        ?? chrome.tabs.create({ url: chrome.runtime.getURL('ai/sidepanel.html') }));
    });
  </script>
</body>
</html>`;
writeFileSync(path.join(dist, 'index.html'), launchHtml, 'utf8');

console.log('PACKAGED -> dist/');
console.log('- Timeline modules at root');
console.log('- Full AI UI at dist/ai');
console.log('- Brand: AI Bookmark OS');
