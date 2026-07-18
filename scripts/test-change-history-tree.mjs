import assert from 'node:assert/strict';
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

const {
  buildChangeHistoryTree,
  changeOriginLabel,
} = await importTypeScript('src/sidepanel/changeHistory.ts');

const changes = [
  {
    kind: 'moved', id: 'a', nodeKind: 'bookmark',
    before: { id: 'a', kind: 'bookmark', index: 0, title: 'API 文档' },
    after: { id: 'a', kind: 'bookmark', index: 0, title: 'API 文档' },
    beforePath: '书签栏 / 收集箱 / API 文档',
    afterPath: '书签栏 / AI 整理 / 开发 / API 文档',
  },
  {
    kind: 'moved', id: 'b', nodeKind: 'bookmark',
    before: { id: 'b', kind: 'bookmark', index: 1, title: '设计灵感' },
    after: { id: 'b', kind: 'bookmark', index: 0, title: '设计灵感' },
    beforePath: '书签栏 / 收集箱 / 设计灵感',
    afterPath: '书签栏 / AI 整理 / 设计 / 设计灵感',
  },
  {
    kind: 'removed', id: 'c', nodeKind: 'bookmark',
    before: { id: 'c', kind: 'bookmark', index: 2, title: '旧书签' },
    beforePath: '书签栏 / 收集箱 / 旧书签',
  },
];

const tree = buildChangeHistoryTree(changes);
assert.equal(tree.count, 3);
assert.deepEqual(tree.children.map((node) => node.name), ['书签栏']);
assert.equal(tree.children[0].children[0].name, 'AI 整理');
assert.equal(tree.children[0].children[0].count, 2);
assert.equal(tree.children[0].children[1].name, '收集箱');
assert.equal(tree.children[0].children[1].changes[0].id, 'c');
assert.equal(changeOriginLabel(changes[0]), '来自 书签栏 / 收集箱');

console.log('change history tree checks passed');
