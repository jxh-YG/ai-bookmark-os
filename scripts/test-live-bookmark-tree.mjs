import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';

async function importTypeScript(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const { buildBookmarkCountByFolder } = await importTypeScript('src/sidepanel/LiveBookmarkTree.tsx');

const counts = buildBookmarkCountByFolder({
  version: 1,
  scope: { mode: 'full' },
  rootId: '0',
  capturedAt: 1,
  fingerprint: 'fingerprint',
  nodes: {
    '0': { id: '0', kind: 'folder', parentId: '', index: 0, title: '' },
    work: { id: 'work', kind: 'folder', parentId: '0', index: 0, title: '工作' },
    project: { id: 'project', kind: 'folder', parentId: 'work', index: 0, title: '项目' },
    one: { id: 'one', kind: 'bookmark', parentId: 'work', index: 1, title: '一', url: 'https://one.example' },
    two: { id: 'two', kind: 'bookmark', parentId: 'project', index: 0, title: '二', url: 'https://two.example' },
    empty: { id: 'empty', kind: 'folder', parentId: '0', index: 1, title: '空' },
  },
});

assert.equal(counts.get('0'), 2);
assert.equal(counts.get('work'), 2);
assert.equal(counts.get('project'), 1);
assert.equal(counts.get('empty'), 0);

const source = fs.readFileSync('src/sidepanel/LiveBookmarkTree.tsx', 'utf8');
assert.match(source, /useState<Set<string>>\(\(\) => new Set\(\)\)/, '当前书签树默认必须全部收起');
assert.match(source, /全部展开/, '当前书签树必须提供全部展开按钮');
assert.match(source, /全部收起/, '当前书签树必须提供全部收起按钮');
assert.match(source, /setExpandedFolderIds/, '批量操作必须统一控制所有目录展开状态');
assert.match(source, /className="live-folder-toggle"/, '目录展开控件必须使用独立按钮，避免与目录选择抢点击事件');
assert.match(
  source,
  /className="live-folder-toggle"[\s\S]*?onClick=\{\(\) => onToggleFolder\(node\.id\)\}/,
  '展开按钮只能切换展开状态',
);
assert.match(
  source,
  /className=\{`live-folder-row[\s\S]*?onClick=\{\(\) => onSelectFolder\(node\)\}/,
  '目录行点击必须独立触发目录选择',
);

const appSource = fs.readFileSync('src/sidepanel/App.tsx', 'utf8');
assert.match(
  appSource,
  /setSelectedLiveFolderId\(\(current\) => \([\s\S]*?snapshot\.nodes\[current\]\?\.kind !== 'folder' \? '' : current[\s\S]*?\)\);/,
  '刷新后已删除或失效的目标目录必须自动清空选择',
);
assert.match(
  appSource,
  /setSelectedLiveFolderId\(\(current\) => current === folder\.id \? '' : folder\.id\)/,
  '再次点击同一目录必须取消选择，点击其他目录必须切换选择',
);

const css = fs.readFileSync('src/sidepanel/sidepanel.css', 'utf8');
assert.match(css, /\.live-tree-toolbar\s*\{[^}]*display:\s*flex;/, '展开控制按钮必须使用统一的工具栏布局');
assert.match(css, /\.live-folder-row\.is-selected\s*\{[^}]*box-shadow:\s*inset 3px 0 0 var\(--accent\);/, '选中的实时书签目录必须有明确的视觉标识');
assert.match(css, /\.live-folder-toggle\s*\{[^}]*min-width:\s*32px;/, '目录展开控件必须提供足够大的点击热区');

console.log('live bookmark tree count tests passed');
