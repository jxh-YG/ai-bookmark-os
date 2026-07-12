const fs = require('fs');

// OptionsPage extract
let s = fs.readFileSync('src/options/PilotOptions.tsx', 'utf8');
s = s.replace(/import \{ createRoot \} from 'react-dom\/client';\r?\n/, '');
s = s.replace(/import '\.\/styles\.css';/, "import './pilot-options.css';");
s = s.replace(/const GITHUB_REPO = 'https:\/\/github\.com\/[^']+';/, "const GITHUB_REPO = '';");
s = s.replace(/const GITHUB_PROFILE = 'https:\/\/github\.com\/[^']+';/, "const GITHUB_PROFILE = '';");
if (!s.includes('export function OptionsPage') && s.includes('function OptionsPage')) {
  s = s.replace('function OptionsPage', 'export function OptionsPage');
}
s = s.replace(/createRoot\(document\.getElementById\('root'\)!\)\.render\(<OptionsPage \/>\);\s*/, '');
// remove github-only UI pieces if they break with empty URL - keep simple
fs.writeFileSync('src/options/PilotOptions.tsx', s);
fs.writeFileSync(
  'src/options/main.tsx',
  "import { createRoot } from 'react-dom/client';\nimport { OptionsPage } from './PilotOptions';\n\ncreateRoot(document.getElementById('root')!).render(<OptionsPage />);\n"
);
console.log('options ok');

let d = fs.readFileSync('src/options/Donate.tsx', 'utf8');
d = d.replace(/BookmarkPilot|bookmark-pilot|Markline|AI Bookmark OS AI Bookmark OS/g, 'AI Bookmark OS');
fs.writeFileSync('src/options/Donate.tsx', d);
console.log('donate ok');

// transfer: keep backward-compatible import apps, export new name
let t = fs.readFileSync('src/core/transfer.ts', 'utf8');
t = t.replace(/app: 'bookmark-pilot'/g, "app: 'ai-bookmark-os'");
t = t.replace(/app: 'ai-bookmark-os' \| 'bookmark-pilot'/g, "app: 'ai-bookmark-os' | 'bookmark-pilot' | 'markline'");
if (!t.includes("bundle?.app !== 'bookmark-pilot'")) {
  t = t.replace(
    /if \(\s*bundle\?\.app !== 'ai-bookmark-os'[^\n]*\)/,
    "if (\n    (bundle?.app !== 'ai-bookmark-os' && bundle?.app !== 'bookmark-pilot' && bundle?.app !== 'markline') ||"
  );
}
// normalize invalid replacements
t = t.replace(/bundle\?\.app !== 'ai-bookmark-os' && bundle\?\.app !== 'ai-bookmark-os'/g,
  "bundle?.app !== 'ai-bookmark-os' && bundle?.app !== 'bookmark-pilot' && bundle?.app !== 'markline'");
fs.writeFileSync('src/core/transfer.ts', t);
console.log('transfer snippet', t.match(/app: '[^']+'/g));

// Ensure sidepanel title/html branding
for (const f of ['sidepanel.html', 'options.html']) {
  let h = fs.readFileSync(f, 'utf8');
  h = h.replace(/Markline|BookmarkPilot|bookmark-pilot/g, 'AI Bookmark OS');
  h = h.replace(/AI Bookmark OS · Settings|AI Bookmark OS 路 Settings/g, 'AI Bookmark OS · 设置');
  fs.writeFileSync(f, h);
}
console.log('html ok');
