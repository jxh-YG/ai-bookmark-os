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

const storage = {
  applyRecord: {
    createdAt: 1,
    rootFolderId: 'ai-root',
    moves: [],
    removedSourceFolders: [
      { sourceFolderId: 'old-a', title: 'A', oldParentId: 'bar', oldIndex: 0, depth: 1, removalStatus: 'removed' },
      { sourceFolderId: 'old-b', title: 'B', oldParentId: 'bar', oldIndex: 1, depth: 1, removalStatus: 'removed' },
      { sourceFolderId: 'old-c', title: 'C', oldParentId: 'bar', oldIndex: 2, depth: 1, removalStatus: 'removed' },
    ],
  },
};
const barChildren = [];
let serial = 0;

globalThis.chrome = {
  bookmarks: {
    get: async (id) => {
      if (id === 'old-a' || id === 'old-b' || id === 'old-c') throw new Error('removed');
      if (id === 'ai-root') return [{ id, title: 'AI', parentId: 'bar' }];
      return [{ id, title: id, parentId: 'bar' }];
    },
    create: async ({ parentId, title, index }) => {
      const id = `restored-${++serial}`;
      barChildren.splice(index, 0, title);
      return { id, title, parentId, index };
    },
    getChildren: async (id) => {
      assert.equal(id, 'ai-root');
      return [];
    },
    remove: async (id) => assert.equal(id, 'ai-root'),
  },
  storage: {
    local: {
      get: async (key) => ({ [key]: structuredClone(storage[key]) }),
      set: async (values) => Object.assign(storage, structuredClone(values)),
      remove: async (keys) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
      },
    },
  },
};

const { applyPartialToBookmarks, undoApply } = await importTypeScript('src/core/bookmarks.ts');
await undoApply();

assert.deepEqual(barChildren, ['A', 'B', 'C'], 'restored sibling folders must keep their original Chrome order');

const partialStorage = {};
const workChildren = ['A', 'B', 'U', 'source'];
const folderChildren = new Map([
  ['bar', ['work']],
  ['work', workChildren],
  ['source', ['C']],
]);
const nodes = new Map([
  ['bar', { id: 'bar', title: 'Bookmarks Bar', parentId: '0' }],
  ['work', { id: 'work', title: 'Work', parentId: 'bar' }],
  ['A', { id: 'A', title: 'A', url: 'https://example.com/a', parentId: 'work' }],
  ['B', { id: 'B', title: 'B', url: 'https://example.com/b', parentId: 'work' }],
  ['U', { id: 'U', title: 'U', url: 'https://example.com/unmoved', parentId: 'work' }],
  ['source', { id: 'source', title: 'Source', parentId: 'work' }],
  ['C', { id: 'C', title: 'C', url: 'https://example.com/c', parentId: 'source' }],
]);
let createCount = 0;
const movesToCategory = [];

function readNode(id) {
  const node = nodes.get(id);
  if (!node) throw new Error(`missing node: ${id}`);
  const siblings = node.parentId ? folderChildren.get(node.parentId) : undefined;
  return {
    ...node,
    ...(siblings ? { index: siblings.indexOf(id) } : {}),
  };
}

function readSubTree(id) {
  const node = readNode(id);
  if (node.url) return node;
  return {
    ...node,
    children: (folderChildren.get(id) ?? []).map(readSubTree),
  };
}

globalThis.chrome = {
  bookmarks: {
    get: async (id) => [readNode(id)],
    getSubTree: async (id) => [readSubTree(id)],
    create: async ({ parentId, title }) => {
      createCount++;
      if (createCount === 2) throw new Error('injected create failure');
      const id = 'category';
      nodes.set(id, { id, title, parentId });
      folderChildren.set(id, []);
      folderChildren.get(parentId).push(id);
      return readNode(id);
    },
    move: async (id, { parentId, index }) => {
      const node = nodes.get(id);
      const oldSiblings = folderChildren.get(node.parentId);
      oldSiblings.splice(oldSiblings.indexOf(id), 1);
      const newSiblings = folderChildren.get(parentId);
      newSiblings.splice(index ?? newSiblings.length, 0, id);
      node.parentId = parentId;
      if (parentId === 'category') movesToCategory.push(id);
      return readNode(id);
    },
    remove: async (id) => {
      const node = nodes.get(id);
      const children = folderChildren.get(id) ?? [];
      assert.equal(children.length, 0, 'only empty created folders may be removed');
      const siblings = folderChildren.get(node.parentId);
      siblings.splice(siblings.indexOf(id), 1);
      folderChildren.delete(id);
      nodes.delete(id);
    },
  },
  storage: {
    local: {
      get: async (key) => ({ [key]: structuredClone(partialStorage[key]) }),
      set: async (values) => Object.assign(partialStorage, structuredClone(values)),
      remove: async (keys) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete partialStorage[key];
      },
    },
  },
};

await assert.rejects(
  () => applyPartialToBookmarks([
    { name: 'Category', bookmarkIds: ['A', 'B'] },
    { name: 'Fail after moves', bookmarkIds: ['C'] },
  ], 'work'),
  /injected create failure/,
);

assert.deepEqual(movesToCategory, ['A', 'B'], 'the failure must happen after two bookmarks were moved');
assert.equal(nodes.get('U').parentId, 'work', 'the unplanned sibling must never be moved');
assert.deepEqual(
  workChildren.filter((id) => id !== 'source'),
  ['A', 'B', 'U'],
  'partial rollback must restore moved bookmarks ahead of their unmoved sibling in original order',
);
console.log('folder restore order tests passed');
