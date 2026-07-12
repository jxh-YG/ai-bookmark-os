const fs = require('fs');

let t = fs.readFileSync('src/types.ts', 'utf8');
t = t.replace(/themeColor:\s*'#[0-9a-fA-F]+'/, "themeColor: '#0A84FF'");
fs.writeFileSync('src/types.ts', t);
console.log('theme ok');

let css = fs.readFileSync('src/sidepanel/pilot.css', 'utf8');
if (!css.includes('AI Bookmark OS unified tokens')) {
  const head = [
    '/* AI Bookmark OS unified tokens */',
    ':root{',
    '  --accent: #0A84FF;',
    '  --bg: #F2F2F7;',
    '  --card: rgba(255,255,255,.82);',
    '  --text: #1C1C1E;',
    '  --muted: #8E8E93;',
    '  --border: rgba(60,60,67,.12);',
    '  --shadow: 0 8px 24px rgba(0,0,0,.08);',
    '  --radius: 12px;',
    '}',
    ''
  ].join('\n');
  const tail = [
    '',
    '/* unified polish */',
    'body{background:var(--bg)!important;color:var(--text);}',
    '.header,.toolbar,.topbar{backdrop-filter:saturate(180%) blur(16px);}',
    '.btn-primary,.primary{background:var(--accent)!important;}',
    '.card,.panel,.modal{border-radius:var(--radius);box-shadow:var(--shadow);}',
    ''
  ].join('\n');
  fs.writeFileSync('src/sidepanel/pilot.css', head + css + tail);
  console.log('pilot css ok');
}

let ocss = fs.readFileSync('src/options/pilot-options.css', 'utf8');
if (!ocss.includes('AI Bookmark OS unified tokens')) {
  fs.writeFileSync(
    'src/options/pilot-options.css',
    '/* AI Bookmark OS unified tokens */\n:root{--accent:#0A84FF;--bg:#F2F2F7;--text:#1C1C1E;}\n' +
      ocss +
      '\nbody{background:var(--bg)!important;}\n.nav-item.active,.btn-primary{background:var(--accent)!important;}\n'
  );
  console.log('options css ok');
}

// Brand cleanup remaining product names in popup banner text
let ph = fs.readFileSync('src/timeline/pages/popup/popup.html', 'utf8');
ph = ph.replace(/来自 BookmarkPilot：|来自 AI Bookmark OS：|来自 Markline：/g, '');
ph = ph.replace(/<title>Markline<\/title>|<title>AI Bookmark OS<\/title>/, '<title>AI Bookmark OS</title>');
if (!ph.includes('一键智能整理书签树')) {
  // ensure banner text clean
}
ph = ph.replace(/<span>一键智能整理书签树<\/span>/, '<span>一键智能整理书签树（金字塔分类）</span>');
ph = ph.replace(/<span>.*?一键智能整理书签树.*?<\/span>/, '<span>一键智能整理书签树（金字塔分类）</span>');
fs.writeFileSync('src/timeline/pages/popup/popup.html', ph);
console.log('popup banner text ok');

// package-extension index.html rewrite branding
let pkg = fs.readFileSync('scripts/package-extension.mjs', 'utf8');
pkg = pkg.replace(/Markline|BookmarkPilot|bookmark-pilot/g, 'AI Bookmark OS');
pkg = pkg.replace(/AI Bookmark OS 全功能基础上，融合 AI Bookmark OS AI 金字塔分类。默认弹窗是 AI Bookmark OS 时间线；AI 分类在侧边栏。/g,
  '统一时间线书签管理与 AI 金字塔分类。默认弹窗为时间线主界面，侧边栏提供完整 AI 分类能力。');
pkg = pkg.replace(/打开 AI Bookmark OS 设置/g, '打开设置');
pkg = pkg.replace(/打开 AI Bookmark OS 时间线 Popup|打开时间线 Popup/g, '打开时间线弹窗');
fs.writeFileSync('scripts/package-extension.mjs', pkg);
console.log('package script branded');
