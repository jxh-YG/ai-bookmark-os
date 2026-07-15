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
  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function readFunctionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `未找到函数 ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  assert.fail(`函数 ${name} 缺少闭合括号`);
}

async function testTreeEditing() {
  const { checkFolderDeletion, deleteEmptyFolder } = await importTypeScript('src/core/treeEdit.ts');
  const tree = [
    { name: '开发', bookmarkIds: ['1'], children: [{ name: '前端', bookmarkIds: ['2'] }] },
    { name: '空目录', children: [] },
  ];
  assert.deepEqual(checkFolderDeletion(tree, [0]), {
    canDelete: false,
    bookmarkCount: 2,
    folderName: '开发',
  });
  assert.deepEqual(deleteEmptyFolder(tree, [0]), tree, '含书签的分类目录不得自动删除或迁移书签');
  const next = deleteEmptyFolder(tree, [1]);
  assert.deepEqual(next, [{ name: '开发', bookmarkIds: ['1'], children: [{ name: '前端', bookmarkIds: ['2'] }] }]);
}

async function testApplyRecoveryPoint() {
  const events = [];
  let createdIndex = 0;
  let storedApplyRecord = null;
  globalThis.chrome = {
    bookmarks: {
      getTree: async () => [{ id: '0', children: [{ id: 'bar', title: '书签栏', children: [] }] }],
      getChildren: async () => [],
      create: async (options) => {
        events.push(`create:${options.title}`);
        createdIndex += 1;
        return { id: `folder-${createdIndex}`, ...options };
      },
      get: async (id) => [id === 'bookmark-1'
        ? { id, title: 'Bookmark', url: 'https://example.com', parentId: 'old-folder', index: 0 }
        : { id, title: 'Old folder', parentId: 'bar', index: 0 }],
      move: async (id) => {
        events.push(`move:${id}`);
        return { id };
      },
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async (value) => {
          if (value.applyRecord) {
            storedApplyRecord = structuredClone(value.applyRecord);
            events.push('save:applyRecord');
          }
        },
      },
    },
  };

  const { applyToBookmarks } = await importTypeScript('src/core/bookmarks.ts');
  await applyToBookmarks([{ name: '开发', bookmarkIds: ['bookmark-1'] }]);

  assert.equal(events[0], 'create:✨ AI 整理');
  assert.ok(storedApplyRecord, '移动前必须建立撤销记录');
  assert.ok(
    events.indexOf('save:applyRecord') < events.indexOf('move:bookmark-1'),
    '撤销记录必须先于书签移动落盘',
  );
}

async function testFullApplyRemovesNewlyEmptySourceFolders() {
  const events = [];
  const storage = {};
  const folders = new Map([
    ['bar', { title: 'Bookmarks Bar', parentId: '0', index: 0, children: ['old-parent', 'preempty'] }],
    ['old-parent', { title: 'Old Parent', parentId: 'bar', index: 0, children: ['old-child'] }],
    ['old-child', { title: 'Old Child', parentId: 'old-parent', index: 0, children: ['bookmark-1'] }],
    ['preempty', { title: 'Keep Empty', parentId: 'bar', index: 1, children: [] }],
  ]);
  const bookmark = { id: 'bookmark-1', title: 'One', url: 'https://example.com', parentId: 'old-child', index: 0 };
  let created = 0;
  const folderNode = (id) => ({ id, ...folders.get(id) });

  globalThis.chrome = {
    bookmarks: {
      getTree: async () => [{ id: '0', children: [{ id: 'bar', title: 'Bookmarks Bar', children: [] }] }],
      getChildren: async (id) => (folders.get(id)?.children ?? []).map((childId) => (
        childId === bookmark.id ? { ...bookmark } : folderNode(childId)
      )),
      get: async (id) => {
        if (id === bookmark.id) return [{ ...bookmark }];
        if (!folders.has(id)) throw new Error('missing folder');
        return [folderNode(id)];
      },
      create: async (options) => {
        created += 1;
        const id = `new-${created}`;
        folders.set(id, { title: options.title, parentId: options.parentId, index: folders.get(options.parentId).children.length, children: [] });
        folders.get(options.parentId).children.push(id);
        return folderNode(id);
      },
      move: async (id, destination) => {
        events.push(`move:${id}:${destination.parentId}`);
        const oldParent = folders.get(bookmark.parentId);
        oldParent.children = oldParent.children.filter((childId) => childId !== id);
        bookmark.parentId = destination.parentId;
        folders.get(destination.parentId).children.push(id);
        return { ...bookmark };
      },
      remove: async (id) => {
        events.push(`remove:${id}`);
        const folder = folders.get(id);
        if (!folder || folder.children.length > 0) throw new Error('folder not empty');
        folders.get(folder.parentId).children = folders.get(folder.parentId).children.filter((childId) => childId !== id);
        folders.delete(id);
      },
      removeTree: async () => {},
    },
    storage: {
      local: {
        get: async (key) => key === null ? structuredClone(storage) : { [key]: structuredClone(storage[key]) },
        set: async (values) => Object.assign(storage, structuredClone(values)),
        remove: async (keys) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
        },
      },
    },
  };

  const { applyToBookmarks } = await importTypeScript('src/core/bookmarks.ts');
  let applied;
  await applyToBookmarks(
    [{ name: 'Category', bookmarkIds: ['bookmark-1'] }],
    undefined,
    (result) => { applied = result; },
  );

  assert.deepEqual(events.filter((event) => event.startsWith('remove:')), ['remove:old-child', 'remove:old-parent']);
  assert.deepEqual(applied, { moveCount: 1, cleanedFolderCount: 2 });
  assert.ok(folders.has('bar'), 'browser bookmark roots must not be removed');
  assert.ok(folders.has('preempty'), 'folders that were already empty must not be removed');
  assert.deepEqual(
    storage.applyRecord.removedSourceFolders.map((folder) => folder.sourceFolderId),
    ['old-child', 'old-parent'],
  );
}

async function testApplyDoesNotOverwriteUndo() {
  let created = false;
  globalThis.chrome = {
    bookmarks: {
      getTree: async () => {
        created = true;
        return [];
      },
    },
    storage: {
      local: {
        get: async () => ({
          applyRecord: { createdAt: Date.now(), rootFolderId: 'existing', moves: [] },
        }),
      },
    },
  };

  const { applyToBookmarks } = await importTypeScript('src/core/bookmarks.ts');
  await assert.rejects(
    () => applyToBookmarks([{ name: '开发', bookmarkIds: [] }]),
    /撤销|undo/i,
  );
  assert.equal(created, false, '存在撤销记录时不得开始新的应用');
}

async function testUndoKeepsUnrestoredBookmarks() {
  const record = {
    createdAt: Date.now(),
    rootFolderId: 'ai-root',
    moves: [
      { id: 'bookmark-1', oldParentId: 'old-folder', oldIndex: 0 },
      { id: 'bookmark-2', oldParentId: 'missing-folder', oldIndex: 1 },
    ],
  };
  let removedTree = false;
  let removedRecord = false;
  let savedRecord = null;

  globalThis.chrome = {
    bookmarks: {
      move: async (id) => {
        if (id === 'bookmark-2') throw new Error('parent missing');
        return { id };
      },
      getSubTree: async () => [{
        id: 'ai-root',
        children: [{ id: 'bookmark-2', url: 'https://example.com' }],
      }],
      removeTree: async () => {
        removedTree = true;
      },
    },
    storage: {
      local: {
        get: async () => ({ applyRecord: record }),
        set: async (value) => {
          if (value.applyRecord) savedRecord = structuredClone(value.applyRecord);
        },
        remove: async () => {
          removedRecord = true;
        },
      },
    },
  };

  const { undoApply } = await importTypeScript('src/core/bookmarks.ts');
  const restored = await undoApply();

  assert.equal(restored, 1);
  assert.equal(removedTree, false, '存在未恢复书签时不得递归删除 AI 目录');
  assert.equal(removedRecord, false, '部分恢复失败时应保留撤销记录');
  assert.deepEqual(savedRecord?.moves, [record.moves[1]]);
}

async function testUndoRecreatesRemovedSourceFoldersBeforeBookmarks() {
  const events = [];
  const storage = {
    applyRecord: {
      createdAt: 1,
      rootFolderId: 'ai-root',
      moves: [{ id: 'bookmark-1', oldParentId: 'old-child', oldIndex: 0 }],
      removedSourceFolders: [
        { sourceFolderId: 'old-parent', title: 'Old Parent', oldParentId: 'bar', oldIndex: 0, depth: 1, removalStatus: 'removed' },
        { sourceFolderId: 'old-child', title: 'Old Child', oldParentId: 'old-parent', oldIndex: 0, depth: 2, removalStatus: 'removed' },
      ],
    },
  };

  globalThis.chrome = {
    bookmarks: {
      get: async (id) => {
        if (id === 'old-parent' || id === 'old-child') throw new Error('missing folder');
        if (id === 'restored-parent') return [{ id, parentId: 'bar' }];
        if (id === 'restored-child') return [{ id, parentId: 'restored-parent' }];
        throw new Error('missing');
      },
      create: async (options) => {
        events.push(`create:${options.parentId}:${options.title}`);
        if (options.parentId === 'bar') return { id: 'restored-parent', ...options };
        if (options.parentId === 'restored-parent') return { id: 'restored-child', ...options };
        throw new Error('wrong restore parent');
      },
      move: async (id, destination) => {
        events.push(`move:${id}:${destination.parentId}`);
        if (destination.parentId !== 'restored-child') throw new Error('old folder id was used');
        return { id, ...destination };
      },
      getSubTree: async () => [{ id: 'ai-root', children: [] }],
      getChildren: async (id) => {
        assert.equal(id, 'ai-root');
        return [];
      },
      remove: async (id) => events.push(`remove:${id}`),
      removeTree: async () => {
        throw new Error('full undo must never recursively delete the AI root');
      },
    },
    storage: {
      local: {
        get: async (key) => key === null ? structuredClone(storage) : { [key]: structuredClone(storage[key]) },
        set: async (values) => Object.assign(storage, structuredClone(values)),
        remove: async (keys) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
        },
      },
    },
  };

  const { undoApply } = await importTypeScript('src/core/bookmarks.ts');
  assert.equal(await undoApply(), 1);
  assert.deepEqual(events, [
    'create:bar:Old Parent',
    'create:restored-parent:Old Child',
    'move:bookmark-1:restored-child',
    'remove:ai-root',
  ]);
  assert.equal(storage.applyRecord, undefined);
}

async function testPartialUndoRecreatesRemovedSourceFoldersBeforeBookmarks() {
  const events = [];
  const storage = {
    partialApplyRecords: [{
      createdAt: 1,
      rootFolderId: 'work',
      targetDirectoryId: 'work',
      createdFolderIds: [],
      status: 'complete',
      moves: [{ id: 'bookmark-1', oldParentId: 'old-child', oldIndex: 0 }],
      removedSourceFolders: [
        { sourceFolderId: 'old-parent', title: 'Old Parent', oldParentId: 'work', oldIndex: 0, depth: 1, removalStatus: 'removed' },
        { sourceFolderId: 'old-child', title: 'Old Child', oldParentId: 'old-parent', oldIndex: 0, depth: 2, removalStatus: 'removed' },
      ],
    }],
  };

  globalThis.chrome = {
    bookmarks: {
      get: async (id) => {
        if (id === 'old-parent' || id === 'old-child') throw new Error('missing folder');
        if (id === 'restored-parent') return [{ id, parentId: 'work' }];
        if (id === 'restored-child') return [{ id, parentId: 'restored-parent' }];
        throw new Error('missing');
      },
      create: async (options) => {
        events.push(`create:${options.parentId}:${options.title}`);
        if (options.parentId === 'work') return { id: 'restored-parent', ...options };
        if (options.parentId === 'restored-parent') return { id: 'restored-child', ...options };
        throw new Error('wrong restore parent');
      },
      move: async (id, destination) => {
        events.push(`move:${id}:${destination.parentId}`);
        if (destination.parentId !== 'restored-child') throw new Error('old folder id was used');
        return { id, ...destination };
      },
    },
    storage: {
      local: {
        get: async (key) => key === null ? structuredClone(storage) : { [key]: structuredClone(storage[key]) },
        set: async (values) => Object.assign(storage, structuredClone(values)),
        remove: async (keys) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
        },
      },
    },
  };

  const { undoLatestApply } = await importTypeScript('src/core/bookmarks.ts');
  assert.equal(await undoLatestApply(), 1);
  assert.deepEqual(events, [
    'create:work:Old Parent',
    'create:restored-parent:Old Child',
    'move:bookmark-1:restored-child',
  ]);
  assert.equal(storage.partialApplyRecords, undefined);
}

async function testPartialScopeAndApplyBoundary() {
  const events = [];
  let folderNumber = 0;
  globalThis.chrome = {
    bookmarks: {
      getSubTree: async (id) => {
        if (id !== 'work') throw new Error('missing');
        return [{
          id: 'work', title: '工作资料', children: [
            { id: 'inside-1', title: '文档', url: 'https://inside.example/1', parentId: 'work', index: 0 },
            { id: 'child', title: '项目', parentId: 'work', index: 1, children: [
              { id: 'inside-2', title: '仓库', url: 'https://inside.example/2', parentId: 'child', index: 0 },
            ] },
          ],
        }];
      },
      getTree: async () => {
        throw new Error('partial scope must not read the full bookmark tree');
      },
      create: async (options) => {
        folderNumber += 1;
        events.push(`create:${options.parentId}:${options.title}`);
        return { id: `new-${folderNumber}`, ...options };
      },
      get: async (id) => {
        events.push(`get:${id}`);
        return [{
          id,
          url: `https://inside.example/${id}`,
          parentId: id.startsWith('inside') ? 'work' : 'outside',
          index: 0,
        }];
      },
      move: async (id, destination) => {
        events.push(`move:${id}:${destination.parentId}`);
        return { id, ...destination };
      },
      removeTree: async () => {},
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async (value) => events.push(value.applyRecord ? 'save:applyRecord' : 'save'),
        remove: async () => {},
      },
    },
  };

  const { getFolderClassificationScope, applyPartialToBookmarks } = await importTypeScript('src/core/bookmarks.ts');
  const scope = await getFolderClassificationScope('work');
  assert.equal(scope.title, '工作资料');
  assert.deepEqual(scope.bookmarks.map((bookmark) => bookmark.id), ['inside-1', 'inside-2']);

  await applyPartialToBookmarks([{ name: 'AI 分类', bookmarkIds: ['inside-1'] }], 'work');
  assert.ok(events.includes('create:work:AI 分类'), '局部分类目录必须创建在目标目录内');
  assert.ok(events.some((event) => event.startsWith('move:inside-1:new-1')));
  assert.ok(!events.some((event) => event.startsWith('move:inside-2:')), '未纳入局部方案的范围内书签必须保留在原位置');
}

async function testPartialApplyRemovesOnlyNewlyEmptyFoldersInsideScope() {
  const events = [];
  const storage = {};
  const folders = new Map([
    ['bar', { title: 'Bookmarks Bar', parentId: '0', index: 0, children: ['work', 'outside-empty'] }],
    ['work', { title: 'Work', parentId: 'bar', index: 0, children: ['old-parent', 'preempty'] }],
    ['old-parent', { title: 'Old Parent', parentId: 'work', index: 0, children: ['old-child'] }],
    ['old-child', { title: 'Old Child', parentId: 'old-parent', index: 0, children: ['inside-1'] }],
    ['preempty', { title: 'Keep Empty', parentId: 'work', index: 1, children: [] }],
    ['outside-empty', { title: 'Outside Empty', parentId: 'bar', index: 1, children: [] }],
  ]);
  const bookmark = { id: 'inside-1', title: 'Inside', url: 'https://inside.example/1', parentId: 'old-child', index: 0 };
  const folderNode = (id) => ({ id, ...folders.get(id) });

  globalThis.chrome = {
    bookmarks: {
      getTree: async () => {
        throw new Error('partial apply must not read the full bookmark tree');
      },
      getSubTree: async (id) => {
        if (id !== 'work') throw new Error('outside scope');
        return [{
          id: 'work',
          title: 'Work',
          children: [{
            id: 'old-parent',
            title: 'Old Parent',
            parentId: 'work',
            children: [{
              id: 'old-child',
              title: 'Old Child',
              parentId: 'old-parent',
              children: [{ ...bookmark }],
            }],
          }, { id: 'preempty', title: 'Keep Empty', parentId: 'work', children: [] }],
        }];
      },
      getChildren: async (id) => (folders.get(id)?.children ?? []).map((childId) => (
        childId === bookmark.id ? { ...bookmark } : folderNode(childId)
      )),
      get: async (id) => {
        events.push(`get:${id}`);
        if (id === bookmark.id) return [{ ...bookmark }];
        if (!folders.has(id)) throw new Error('missing folder');
        return [folderNode(id)];
      },
      create: async (options) => {
        const id = 'new-category';
        folders.set(id, { title: options.title, parentId: options.parentId, index: folders.get(options.parentId).children.length, children: [] });
        folders.get(options.parentId).children.push(id);
        return folderNode(id);
      },
      move: async (id, destination) => {
        events.push(`move:${id}:${destination.parentId}`);
        folders.get(bookmark.parentId).children = folders.get(bookmark.parentId).children.filter((childId) => childId !== id);
        bookmark.parentId = destination.parentId;
        folders.get(destination.parentId).children.push(id);
        return { ...bookmark };
      },
      remove: async (id) => {
        events.push(`remove:${id}`);
        const folder = folders.get(id);
        if (!folder || folder.children.length > 0) throw new Error('folder not empty');
        folders.get(folder.parentId).children = folders.get(folder.parentId).children.filter((childId) => childId !== id);
        folders.delete(id);
      },
    },
    storage: {
      local: {
        get: async (key) => key === null ? structuredClone(storage) : { [key]: structuredClone(storage[key]) },
        set: async (values) => Object.assign(storage, structuredClone(values)),
        remove: async (keys) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
        },
      },
    },
  };

  const { applyPartialToBookmarks } = await importTypeScript('src/core/bookmarks.ts');
  await applyPartialToBookmarks([{ name: 'New Category', bookmarkIds: ['inside-1'] }], 'work');

  assert.deepEqual(events.filter((event) => event.startsWith('remove:')), ['remove:old-child', 'remove:old-parent']);
  assert.ok(folders.has('work'), 'the selected root must not be removed');
  assert.ok(folders.has('preempty'), 'folders that were already empty must not be removed');
  assert.ok(folders.has('outside-empty'), 'folders outside the selected scope must not be removed');
  assert.ok(!events.includes('get:outside-empty'), 'outside folders must not be read');
}

async function testPartialCleanupKeepsFolderMovedOutsideScope() {
  const events = [];
  const storage = {};
  const folders = new Map([
    ['bar', { title: 'Bookmarks Bar', parentId: '0', index: 0, children: ['work', 'outside'] }],
    ['work', { title: 'Work', parentId: 'bar', index: 0, children: ['old-child'] }],
    ['old-child', { title: 'Old Child', parentId: 'work', index: 0, children: ['inside-1'] }],
    ['outside', { title: 'Outside', parentId: 'bar', index: 1, children: [] }],
  ]);
  const bookmark = { id: 'inside-1', title: 'Inside', url: 'https://inside.example/1', parentId: 'old-child', index: 0 };
  const folderNode = (id) => ({ id, ...folders.get(id) });

  globalThis.chrome = {
    bookmarks: {
      getTree: async () => {
        throw new Error('partial apply must not read the full bookmark tree');
      },
      getSubTree: async (id) => {
        if (id !== 'work') throw new Error('outside scope');
        return [{ id: 'work', title: 'Work', children: [{
          id: 'old-child',
          title: 'Old Child',
          parentId: 'work',
          children: [{ ...bookmark }],
        }] }];
      },
      getChildren: async (id) => (folders.get(id)?.children ?? []).map((childId) => (
        childId === bookmark.id ? { ...bookmark } : folderNode(childId)
      )),
      get: async (id) => {
        if (id === bookmark.id) return [{ ...bookmark }];
        if (!folders.has(id)) throw new Error('missing folder');
        return [folderNode(id)];
      },
      create: async (options) => {
        const id = 'new-category';
        folders.set(id, { title: options.title, parentId: options.parentId, index: folders.get(options.parentId).children.length, children: [] });
        folders.get(options.parentId).children.push(id);
        return folderNode(id);
      },
      move: async (id, destination) => {
        folders.get(bookmark.parentId).children = folders.get(bookmark.parentId).children.filter((childId) => childId !== id);
        bookmark.parentId = destination.parentId;
        folders.get(destination.parentId).children.push(id);
        folders.get('work').children = folders.get('work').children.filter((childId) => childId !== 'old-child');
        folders.get('outside').children.push('old-child');
        folders.get('old-child').parentId = 'outside';
        return { ...bookmark };
      },
      remove: async (id) => events.push(`remove:${id}`),
    },
    storage: {
      local: {
        get: async (key) => key === null ? structuredClone(storage) : { [key]: structuredClone(storage[key]) },
        set: async (values) => Object.assign(storage, structuredClone(values)),
        remove: async (keys) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
        },
      },
    },
  };

  const { applyPartialToBookmarks } = await importTypeScript('src/core/bookmarks.ts');
  await applyPartialToBookmarks([{ name: 'New Category', bookmarkIds: ['inside-1'] }], 'work');

  assert.ok(!events.includes('remove:old-child'), 'a source folder moved outside the selected scope must not be removed');
}

async function testPartialCleanupKeepsFullApplyRoot() {
  const events = [];
  const fullApplyRecord = {
    createdAt: 1,
    rootFolderId: 'full-root',
    moves: [{ id: 'inside-1', oldParentId: 'bar', oldIndex: 0 }],
  };
  const storage = { applyRecord: structuredClone(fullApplyRecord) };
  const folders = new Map([
    ['bar', { title: 'Bookmarks Bar', parentId: '0', index: 0, children: ['full-root'] }],
    ['full-root', { title: 'AI Organize', parentId: 'bar', index: 0, children: ['inside-1'] }],
  ]);
  const bookmark = { id: 'inside-1', title: 'Inside', url: 'https://inside.example/1', parentId: 'full-root', index: 0 };
  const folderNode = (id) => ({ id, ...folders.get(id) });

  globalThis.chrome = {
    bookmarks: {
      getTree: async () => {
        throw new Error('partial apply must not read the full bookmark tree');
      },
      getSubTree: async (id) => {
        if (id !== 'bar') throw new Error('outside scope');
        return [{ id: 'bar', title: 'Bookmarks Bar', children: [{
          id: 'full-root',
          title: 'AI Organize',
          parentId: 'bar',
          children: [{ ...bookmark }],
        }] }];
      },
      getChildren: async (id) => (folders.get(id)?.children ?? []).map((childId) => (
        childId === bookmark.id ? { ...bookmark } : folderNode(childId)
      )),
      get: async (id) => {
        if (id === bookmark.id) return [{ ...bookmark }];
        if (!folders.has(id)) throw new Error('missing folder');
        return [folderNode(id)];
      },
      create: async (options) => {
        const id = 'new-category';
        folders.set(id, { title: options.title, parentId: options.parentId, index: folders.get(options.parentId).children.length, children: [] });
        folders.get(options.parentId).children.push(id);
        return folderNode(id);
      },
      move: async (id, destination) => {
        folders.get(bookmark.parentId).children = folders.get(bookmark.parentId).children.filter((childId) => childId !== id);
        bookmark.parentId = destination.parentId;
        folders.get(destination.parentId).children.push(id);
        return { ...bookmark };
      },
      remove: async (id) => events.push(`remove:${id}`),
    },
    storage: {
      local: {
        get: async (key) => key === null ? structuredClone(storage) : { [key]: structuredClone(storage[key]) },
        set: async (values) => Object.assign(storage, structuredClone(values)),
        remove: async (keys) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
        },
      },
    },
  };

  const { applyPartialToBookmarks } = await importTypeScript('src/core/bookmarks.ts');
  await applyPartialToBookmarks([{ name: 'New Category', bookmarkIds: ['inside-1'] }], 'bar');

  assert.ok(!events.includes('remove:full-root'), 'the active full-apply root must stay available for full undo');
  assert.deepEqual(storage.applyRecord, fullApplyRecord);
}

async function testPartialApplyCanOverlayFullApply() {
  const events = [];
  const fullApplyRecord = {
    createdAt: 1,
    rootFolderId: 'full-root',
    moves: [{ id: 'full-bookmark', oldParentId: 'bar', oldIndex: 0 }],
  };
  const storage = { applyRecord: structuredClone(fullApplyRecord) };

  globalThis.chrome = {
    bookmarks: {
      getSubTree: async (id) => [{
        id,
        title: 'Work',
        children: [{
          id: 'inside-1',
          title: 'Inside',
          url: 'https://inside.example/1',
          parentId: id,
          index: 0,
        }],
      }],
      get: async (id) => [{
        id,
        url: 'https://inside.example/1',
        parentId: 'work',
        index: 0,
      }],
      create: async (options) => {
        events.push(`create:${options.parentId}:${options.title}`);
        return { id: 'partial-category', ...options };
      },
      move: async (id, destination) => {
        events.push(`move:${id}:${destination.parentId}`);
        return { id, ...destination };
      },
    },
    storage: {
      local: {
        get: async (key) => key === null
          ? structuredClone(storage)
          : { [key]: structuredClone(storage[key]) },
        set: async (values) => Object.assign(storage, structuredClone(values)),
        remove: async (keys) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
        },
      },
    },
  };

  const { applyPartialToBookmarks } = await importTypeScript('src/core/bookmarks.ts');
  const applied = await applyPartialToBookmarks([
    { name: 'Local Category', bookmarkIds: ['inside-1'] },
  ], 'work');

  assert.deepEqual(applied, { title: 'Work', moveCount: 1, cleanedFolderCount: 0 });
  assert.ok(events.includes('create:work:Local Category'));
  assert.ok(events.includes('move:inside-1:partial-category'));
  assert.deepEqual(
    storage.applyRecord,
    fullApplyRecord,
    '局部应用不得覆盖已有的全量撤销记录',
  );
}

async function testPartialUndoPreservesFullApplyRecord() {
  const events = [];
  const fullApplyRecord = {
    createdAt: 1,
    rootFolderId: 'full-root',
    moves: [{ id: 'full-bookmark', oldParentId: 'bar', oldIndex: 0 }],
  };
  const storage = { applyRecord: structuredClone(fullApplyRecord) };
  const parents = {
    'inside-1': 'full-category',
    'full-category': 'work',
    work: 'bar',
    'partial-category': 'work',
  };

  globalThis.chrome = {
    bookmarks: {
      getSubTree: async (id) => {
        if (id === 'partial-category') {
          return [{ id, title: 'Local Category', parentId: 'work', children: [] }];
        }
        return [{
          id,
          title: 'Work',
          children: [{
            id: 'inside-1',
            title: 'Inside',
            url: 'https://inside.example/1',
            parentId: parents['inside-1'],
            index: 0,
          }],
        }];
      },
      get: async (id) => [{
        id,
        ...(id === 'inside-1' ? { url: 'https://inside.example/1', index: 0 } : {}),
        parentId: parents[id],
      }],
      create: async (options) => ({ id: 'partial-category', ...options }),
      move: async (id, destination) => {
        parents[id] = destination.parentId;
        events.push(`move:${id}:${destination.parentId}`);
        return { id, ...destination };
      },
      remove: async (id) => events.push(`remove:${id}`),
    },
    storage: {
      local: {
        get: async (key) => key === null
          ? structuredClone(storage)
          : { [key]: structuredClone(storage[key]) },
        set: async (values) => Object.assign(storage, structuredClone(values)),
        remove: async (keys) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
        },
      },
    },
  };

  const {
    applyPartialToBookmarks,
    getApplyRecord,
    getLatestApplyRecord,
    undoLatestApply,
  } = await importTypeScript('src/core/bookmarks.ts');
  await applyPartialToBookmarks([{ name: 'Local Category', bookmarkIds: ['inside-1'] }], 'work');

  assert.deepEqual(await getApplyRecord(), fullApplyRecord);
  assert.equal((await getLatestApplyRecord())?.targetDirectoryId, 'work');

  await undoLatestApply();

  assert.ok(events.includes('move:inside-1:full-category'));
  assert.ok(events.includes('remove:partial-category'));
  assert.deepEqual(await getApplyRecord(), fullApplyRecord);
  assert.deepEqual(await getLatestApplyRecord(), fullApplyRecord);
}

async function testPartialUndoFailureKeepsRetryRecord() {
  const storage = {
    partialApplyRecords: [{
      createdAt: 1,
      rootFolderId: 'work',
      targetDirectoryId: 'work',
      createdFolderIds: [],
      status: 'complete',
      moves: [
        { id: 'inside-1', oldParentId: 'work', oldIndex: 0 },
        { id: 'inside-2', oldParentId: 'work', oldIndex: 1 },
      ],
    }],
  };

  globalThis.chrome = {
    bookmarks: {
      move: async (id) => {
        if (id === 'inside-2') throw new Error('parent missing');
        return { id };
      },
    },
    storage: {
      local: {
        get: async (key) => key === null
          ? structuredClone(storage)
          : { [key]: structuredClone(storage[key]) },
        set: async (values) => Object.assign(storage, structuredClone(values)),
        remove: async (keys) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
        },
      },
    },
  };

  const { undoLatestApply } = await importTypeScript('src/core/bookmarks.ts');
  await assert.rejects(
    () => undoLatestApply(),
    /未能恢复|failed to restore/i,
  );
  assert.equal(storage.partialApplyRecords.length, 1);
  assert.equal(storage.partialApplyRecords[0].status, 'rollback-pending');
  assert.deepEqual(storage.partialApplyRecords[0].moves, [
    { id: 'inside-2', oldParentId: 'work', oldIndex: 1 },
  ]);
}

async function testPartialUndoRetainsPendingSourceFolderSnapshot() {
  const storage = {
    partialApplyRecords: [{
      createdAt: 1,
      rootFolderId: 'work',
      targetDirectoryId: 'work',
      createdFolderIds: [],
      status: 'complete',
      moves: [{ id: 'inside-1', oldParentId: 'old-folder', oldIndex: 0 }],
      removedSourceFolders: [{
        sourceFolderId: 'old-folder',
        title: 'Old Folder',
        oldParentId: 'work',
        oldIndex: 0,
        depth: 1,
        removalStatus: 'pending',
      }],
    }],
  };

  globalThis.chrome = {
    bookmarks: {
      get: async (id) => id === 'old-folder' ? [{ id, parentId: 'work' }] : [],
      move: async () => {
        throw new Error('parent changed');
      },
    },
    storage: {
      local: {
        get: async (key) => key === null ? structuredClone(storage) : { [key]: structuredClone(storage[key]) },
        set: async (values) => Object.assign(storage, structuredClone(values)),
        remove: async (keys) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
        },
      },
    },
  };

  const { undoLatestApply } = await importTypeScript('src/core/bookmarks.ts');
  await assert.rejects(() => undoLatestApply(), /未能恢复|failed to restore/i);
  assert.equal(storage.partialApplyRecords[0].removedSourceFolders.length, 1);
  assert.equal(storage.partialApplyRecords[0].removedSourceFolders[0].sourceFolderId, 'old-folder');
}

async function testPartialUndoRemapsEarlierOperationFolderReferences() {
  const storage = {
    partialApplyRecords: [
      {
        createdAt: 1,
        rootFolderId: 'old-root',
        targetDirectoryId: 'old-root',
        createdFolderIds: ['old-root'],
        status: 'complete',
        moves: [{ id: 'older-bookmark', oldParentId: 'old-root', oldIndex: 0 }],
        removedSourceFolders: [{
          sourceFolderId: 'older-source',
          title: 'Older Source',
          oldParentId: 'old-root',
          oldIndex: 0,
          depth: 1,
          removalStatus: 'removed',
          restoredFolderId: 'old-root',
        }],
      },
      {
        createdAt: 2,
        rootFolderId: 'parent',
        targetDirectoryId: 'parent',
        createdFolderIds: [],
        status: 'complete',
        moves: [{ id: 'newer-bookmark', oldParentId: 'old-root', oldIndex: 0 }],
        removedSourceFolders: [{
          sourceFolderId: 'old-root',
          title: 'Old Root',
          oldParentId: 'parent',
          oldIndex: 0,
          depth: 1,
          removalStatus: 'removed',
        }],
      },
    ],
  };

  globalThis.chrome = {
    bookmarks: {
      get: async (id) => id === 'new-root' ? [{ id, parentId: 'parent' }] : [],
      create: async (options) => {
        if (options.parentId !== 'parent') throw new Error('wrong restore parent');
        return { id: 'new-root', ...options };
      },
      move: async (id, destination) => {
        if (id !== 'newer-bookmark' || destination.parentId !== 'new-root') {
          throw new Error('missing restored parent mapping');
        }
        return { id, ...destination };
      },
    },
    storage: {
      local: {
        get: async (key) => key === null ? structuredClone(storage) : { [key]: structuredClone(storage[key]) },
        set: async (values) => Object.assign(storage, structuredClone(values)),
        remove: async (keys) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
        },
      },
    },
  };

  const { undoLatestApply } = await importTypeScript('src/core/bookmarks.ts');
  assert.equal(await undoLatestApply(), 1);
  assert.equal(storage.partialApplyRecords.length, 1);
  const [earlier] = storage.partialApplyRecords;
  assert.equal(earlier.rootFolderId, 'new-root');
  assert.equal(earlier.targetDirectoryId, 'new-root');
  assert.deepEqual(earlier.createdFolderIds, ['new-root']);
  assert.equal(earlier.moves[0].oldParentId, 'new-root');
  assert.equal(earlier.removedSourceFolders[0].oldParentId, 'new-root');
  assert.equal(earlier.removedSourceFolders[0].restoredFolderId, 'new-root');
}

async function testPartialScopeErrors() {
  const { getFolderClassificationScope } = await importTypeScript('src/core/bookmarks.ts');

  globalThis.chrome = {
    bookmarks: {
      getSubTree: async () => [{ id: 'empty', title: '空目录', children: [] }],
    },
  };
  await assert.rejects(() => getFolderClassificationScope('empty'), /空目录|书签/i);

  globalThis.chrome = {
    bookmarks: {
      getSubTree: async () => [{
        id: 'folders-only',
        title: '仅目录',
        children: [{ id: 'child', title: '子目录', children: [] }],
      }],
    },
  };
  await assert.rejects(() => getFolderClassificationScope('folders-only'), /空目录|书签/i);

  globalThis.chrome = {
    bookmarks: {
      getSubTree: async () => [],
    },
  };
  await assert.rejects(() => getFolderClassificationScope('missing'), /目录|不存在|not found/i);

  globalThis.chrome = {
    bookmarks: {
      getSubTree: async () => {
        throw new Error('permission denied');
      },
    },
  };
  await assert.rejects(() => getFolderClassificationScope('forbidden'), /权限|permission|denied/i);
}

async function testFolderPickerIncludesBookmarkRoots() {
  globalThis.chrome = {
    bookmarks: {
      getTree: async () => [{
        id: '0',
        title: '',
        children: [
          {
            id: 'bar',
            title: 'Bookmarks Bar',
            children: [{ id: 'work', title: 'Work', children: [] }],
          },
          { id: 'other', title: 'Other Bookmarks', children: [] },
        ],
      }],
    },
  };

  const { getBookmarkFolders } = await importTypeScript('src/core/bookmarks.ts');
  const folders = await getBookmarkFolders();
  assert.deepEqual(folders.map((folder) => folder.id), ['bar', 'work', 'other']);
  assert.equal(folders[1].path, 'Bookmarks Bar / Work');

  globalThis.chrome = {
    bookmarks: {
      getTree: async () => {
        throw new Error('permission denied');
      },
    },
  };
  await assert.rejects(() => getBookmarkFolders(), /权限|permission|denied/i);
}

async function testPartialApplyRollsBackOnFailure() {
  const events = [];
  globalThis.chrome = {
    bookmarks: {
      getSubTree: async (id) => id === 'new-1'
        ? [{ id, title: 'Category', parentId: 'work', children: [] }]
        : [{
            id,
            title: 'Work',
            children: [
              { id: 'inside-1', title: 'One', url: 'https://inside.example/1', parentId: id, index: 0 },
              { id: 'inside-2', title: 'Two', url: 'https://inside.example/2', parentId: id, index: 1 },
            ],
          }],
      get: async (id) => [{
        id,
        url: `https://inside.example/${id}`,
        parentId: 'work',
        index: id === 'inside-1' ? 0 : 1,
      }],
      create: async (options) => ({ id: 'new-1', ...options }),
      move: async (id, destination) => {
        events.push(`move:${id}:${destination.parentId}`);
        if (id === 'inside-2' && destination.parentId === 'new-1') throw new Error('move denied');
        return { id, ...destination };
      },
      remove: async (id) => events.push(`remove:${id}`),
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => events.push('save:record'),
        remove: async () => events.push('remove:record'),
      },
    },
  };

  const { applyPartialToBookmarks } = await importTypeScript('src/core/bookmarks.ts');
  await assert.rejects(
    () => applyPartialToBookmarks([{ name: 'Category', bookmarkIds: ['inside-1', 'inside-2'] }], 'work'),
    /局部分类应用失败|rolled back/i,
  );
  assert.ok(events.includes('move:inside-1:new-1'));
  assert.ok(events.includes('move:inside-1:work'), 'a moved bookmark must be restored after failure');
  assert.ok(events.includes('remove:new-1'), 'created folders must be removed after failure');
  assert.ok(events.includes('remove:record'), 'the failed partial apply record must be cleared');
}

async function testPartialUndoNeverRemovesTargetDirectory() {
  const events = [];
  const record = {
    createdAt: Date.now(),
    rootFolderId: 'work',
    targetDirectoryId: 'work',
    createdFolderIds: [],
    moves: [],
  };
  globalThis.chrome = {
    bookmarks: {
      remove: async (id) => events.push(`remove:${id}`),
      removeTree: async (id) => events.push(`removeTree:${id}`),
    },
    storage: {
      local: {
        get: async () => ({ applyRecord: record }),
        remove: async () => events.push('remove:record'),
      },
    },
  };

  const { undoApply } = await importTypeScript('src/core/bookmarks.ts');
  await undoApply();

  assert.ok(!events.includes('remove:work'), '局部撤销不得删除用户选择的目标目录');
  assert.ok(!events.includes('removeTree:work'), '局部撤销不得递归删除用户选择的目标目录');
  assert.ok(events.includes('remove:record'));
}

async function testPartialUndoKeepsUserCreatedDirectories() {
  const events = [];
  const record = {
    createdAt: Date.now(),
    rootFolderId: 'work',
    targetDirectoryId: 'work',
    createdFolderIds: ['ai-category'],
    moves: [],
  };
  globalThis.chrome = {
    bookmarks: {
      getSubTree: async () => [{
        id: 'ai-category',
        title: 'AI 分类',
        parentId: 'work',
        children: [{ id: 'user-empty', title: '用户目录', parentId: 'ai-category', children: [] }],
      }],
      remove: async (id) => events.push(`remove:${id}`),
    },
    storage: {
      local: {
        get: async () => ({ applyRecord: record }),
        remove: async () => events.push('remove:record'),
      },
    },
  };

  const { undoApply } = await importTypeScript('src/core/bookmarks.ts');
  await undoApply();

  assert.ok(!events.includes('remove:ai-category'), '不得删除用户后来加入空子目录的分类目录');
  assert.ok(events.includes('remove:record'));
}

async function testPartialUndoKeepsDirectoriesMovedOutsideScope() {
  const events = [];
  const record = {
    createdAt: Date.now(),
    rootFolderId: 'work',
    targetDirectoryId: 'work',
    createdFolderIds: ['ai-category'],
    moves: [],
  };
  globalThis.chrome = {
    bookmarks: {
      getSubTree: async () => [{
        id: 'ai-category',
        title: 'AI 分类',
        parentId: 'outside',
        children: [],
      }],
      get: async (id) => [{ id, parentId: id === 'outside' ? '0' : undefined }],
      remove: async (id) => events.push(`remove:${id}`),
    },
    storage: {
      local: {
        get: async () => ({ applyRecord: record }),
        remove: async () => events.push('remove:record'),
      },
    },
  };

  const { undoApply } = await importTypeScript('src/core/bookmarks.ts');
  await undoApply();

  assert.ok(!events.includes('remove:ai-category'), '移出目标范围的目录不得被局部撤销删除');
  assert.ok(events.includes('remove:record'));
}

async function testScopedResultStorage() {
  const storage = {};
  globalThis.chrome = {
    storage: {
      local: {
        get: async (key) => key === null ? structuredClone(storage) : ({ [key]: storage[key] }),
        set: async (values) => Object.assign(storage, values),
        remove: async (keys) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
        },
      },
    },
  };

  const { classify, loadSavedResult, saveClassifyResult } = await importTypeScript('src/core/classifier.ts');
  const fullResult = { tree: [], labels: {}, createdAt: 1 };
  const partialScope = {
    mode: 'partial',
    targetDirectoryId: 'work',
    targetDirectoryTitle: 'Work',
    bookmarkCount: 1,
  };
  const partialResult = { tree: [], labels: {}, createdAt: 100, scope: partialScope };

  await saveClassifyResult(fullResult);
  await saveClassifyResult(partialResult);
  assert.deepEqual(await loadSavedResult(), fullResult, 'partial results must not overwrite full results');
  assert.deepEqual(await loadSavedResult(partialScope), partialResult);

  for (let i = 0; i < 5; i++) {
    await saveClassifyResult({
      tree: [],
      labels: {},
      createdAt: i + 2,
      scope: {
        mode: 'partial',
        targetDirectoryId: `folder-${i}`,
        targetDirectoryTitle: `Folder ${i}`,
        bookmarkCount: 1,
      },
    });
  }
  const partialKeys = Object.keys(storage).filter((key) => key.startsWith('partialClassifyResult:'));
  assert.equal(partialKeys.length, 5, '局部结果缓存必须保持有界');
  assert.ok(!('partialClassifyResult:folder-0' in storage), '最旧局部结果应被清理');
  assert.deepEqual(await loadSavedResult(), fullResult, '清理局部结果不得影响全量结果');
  assert.deepEqual(await loadSavedResult(partialScope), partialResult, '最近的局部结果应保留');

  const invalidPartialScope = {
    mode: 'partial',
    targetDirectoryId: ' ',
    targetDirectoryTitle: 'Invalid',
    bookmarkCount: 0,
  };
  await assert.rejects(
    () => saveClassifyResult({ tree: [], labels: {}, createdAt: 3, scope: invalidPartialScope }),
    /目标目录|target directory/i,
  );
  await assert.rejects(
    () => loadSavedResult(invalidPartialScope),
    /目标目录|target directory/i,
  );
  assert.equal(storage['partialClassifyResult:'], undefined, '不得写入空目录缓存键');
  await assert.rejects(
    () => classify({}, [], () => {}, new AbortController().signal, {
      mode: 'partial',
      targetDirectoryId: '',
      targetDirectoryTitle: 'Work',
      bookmarkCount: 0,
    }),
    /目标目录|target directory/i,
  );
}

function testUiContracts() {
  const rootOptions = read('options.html');
  const popup = read('src/timeline/pages/popup/popup.js');
  const standalone = read('src/timeline/pages/standalone/standalone.js');
  const settings = read('src/timeline/pages/settings/settings.html');
  const settingsScript = read('src/timeline/pages/settings/settings.js');
  const background = read('src/timeline/background/background.js');
  const sidepanel = read('src/sidepanel/App.tsx');

  assert.match(sidepanel, /getBookmarkFolders\(\)/, 'partial classification must offer a folder picker');
  assert.match(sidepanel, /getFolderClassificationScope\(selectedDirectoryId\)/, 'the selected folder must define the partial scope');
  assert.match(sidepanel, /runClassify\(estimate\.scope\)/, 'the confirmation must run the selected scope');
  assert.match(sidepanel, /expandDuplicateBookmarks\(r, sourceBookmarks\)/, 'duplicate expansion must stay inside the source scope');
  assert.match(
    sidepanel,
    /applyPartialToBookmarks\(plan\.tree, scope\.targetDirectoryId\)/,
    'partial results must use the scoped bookmark writer',
  );
  assert.match(
    sidepanel,
    /partialText\.applied\(scopeLabel, applied\.moveCount, applied\.cleanedFolderCount\)/,
    'partial apply completion must report both processed bookmarks and cleaned folders',
  );
  assert.match(
    sidepanel,
    /applyToBookmarks\(plan\.tree, undefined, \(nextApplied\)/,
    'full apply completion must report both processed bookmarks and cleaned folders',
  );
  assert.match(sidepanel, /saveClassifyResult\(expanded\)/, 'partial results must use scope-aware storage');

  assert.match(rootOptions, /<script\s+src=["']options\.js["']><\/script>/, '开发态设置重定向必须使用外部脚本');
  assert.doesNotMatch(rootOptions, /<script>\s*location\.replace/, 'Manifest V3 页面不得使用内联重定向脚本');

  assert.match(
    popup,
    /timelineEmpty\.style\.display\s*=\s*allBookmarks\.length\s*===\s*0\s*&&\s*!hasActiveFilter\s*\?\s*['"]flex['"]\s*:\s*['"]none['"]/,
    '弹窗无书签时应显示首次使用空态',
  );
  assert.match(
    standalone,
    /if\s*\(\s*!bookmarks\s*\|\|\s*bookmarks\.length\s*===\s*0\s*\)[\s\S]{0,500}saTimelineView\.style\.display\s*=\s*['"]none['"]/,
    '工作台空数据时应隐藏占位视图，避免把空态推到首屏之外',
  );
  assert.match(settings, /<kbd[^>]*>\s*bk\s*<\/kbd>/, '设置页必须显示 manifest 的 bk 关键词');
  assert.match(
    standalone,
    /const\s+res\s*=\s*await chrome\.runtime\.sendMessage\(\{\s*action:\s*['"]togglePin['"][\s\S]{0,180}res\s*&&\s*res\.success/,
    '置顶操作必须检查后台业务结果',
  );
  assert.match(
    standalone,
    /const\s+updated\s*=\s*await updateBookmark\([\s\S]{0,180}if\s*\(\s*!updated\s*\)\s*return/,
    '编辑失败后不得继续移动书签或显示成功',
  );
  assert.match(
    background,
    /bookmarks\.onRemoved\.addListener[\s\S]{0,900}action:\s*['"]bookmarksDeleted['"]/,
    '原生书签删除后必须广播刷新事件',
  );
  assert.match(
    background,
    /bookmarks\.onMoved\.addListener[\s\S]{0,1800}stored\.parentId\s*=\s*moveInfo\.parentId/,
    '原生书签移动后必须更新本地镜像的 parentId',
  );
  assert.match(
    background,
    /bookmarks\.onMoved\.addListener[\s\S]{0,2200}stored\.folderPath\s*=\s*folderPath/,
    '原生书签移动后必须更新本地镜像的 folderPath',
  );
  assert.match(
    background,
    /bookmarks\.onMoved\.addListener[\s\S]{0,2600}action:\s*['"]bookmarksUpdated['"]/,
    '原生书签移动后必须广播页面刷新',
  );
  assert.match(popup, /message\.action\s*===\s*['"]bookmarksDeleted['"]/, '弹窗必须响应删除广播');
  assert.match(standalone, /msg\.action\s*===\s*['"]bookmarksDeleted['"]/, '工作台必须响应删除广播');

  const standaloneEdit = readFunctionBody(standalone, 'startApp').includes('saEditSave')
    ? standalone.slice(standalone.indexOf("saEditSave.addEventListener('click'"))
    : standalone;
  assert.match(
    standaloneEdit,
    /const\s+bookmarkId\s*=\s*editingBookmarkId/,
    '工作台保存编辑时必须在关闭弹窗前捕获书签 ID',
  );
  assert.match(
    standaloneEdit,
    /const\s+targetFolderId\s*=\s*editingFolderId/,
    '工作台保存编辑时必须在关闭弹窗前捕获目标文件夹',
  );
  assert.match(
    standaloneEdit,
    /await\s+updateBookmark\(\s*bookmarkId\s*,/,
    '工作台保存编辑必须使用稳定捕获的书签 ID',
  );

  const popupEdit = readFunctionBody(popup, 'handleEditSave');
  assert.ok(
    popupEdit.indexOf("action: 'updateBookmark'") < popupEdit.indexOf('chrome.bookmarks.move'),
    '弹窗编辑必须先确认内容更新成功，再移动书签文件夹',
  );

  const popupPin = readFunctionBody(popup, 'togglePin');
  assert.match(
    popupPin,
    /else\s*\{[\s\S]*showToast\(\s*i18n\(['"]saveFailed['"]\)/,
    '弹窗置顶业务失败时必须向用户显示错误反馈',
  );

  assert.match(
    background,
    /const\s+filtered\s*=\s*bookmarks\.filter\(\(b\)\s*=>\s*b\.id\s*!==\s*message\.id\);/,
    '单条删除只能从本地镜像移除目标书签 ID',
  );
  const popupDelete = readFunctionBody(popup, 'deleteBookmark');
  assert.match(
    popupDelete,
    /allBookmarks\s*=\s*allBookmarks\.filter\(\(b\)\s*=>\s*b\.id\s*!==\s*id\);/,
    '弹窗单条删除不得隐藏同 URL 的其他书签',
  );

  const saveAIConfig = readFunctionBody(settingsScript, 'saveAIConfig');
  assert.match(
    saveAIConfig,
    /const\s+res\s*=\s*await\s+chrome\.runtime\.sendMessage/,
    'AI 设置保存必须读取后台业务结果',
  );
  assert.match(
    saveAIConfig,
    /if\s*\(\s*!res\s*\|\|\s*!res\.success\s*\)\s*throw/,
    'AI 设置后台保存失败时不得显示成功',
  );
}

await testTreeEditing();
await testApplyRecoveryPoint();
await testFullApplyRemovesNewlyEmptySourceFolders();
await testApplyDoesNotOverwriteUndo();
await testUndoKeepsUnrestoredBookmarks();
await testUndoRecreatesRemovedSourceFoldersBeforeBookmarks();
await testPartialUndoRecreatesRemovedSourceFoldersBeforeBookmarks();
await testPartialScopeAndApplyBoundary();
await testPartialApplyRemovesOnlyNewlyEmptyFoldersInsideScope();
await testPartialCleanupKeepsFolderMovedOutsideScope();
await testPartialCleanupKeepsFullApplyRoot();
await testPartialApplyCanOverlayFullApply();
await testPartialUndoPreservesFullApplyRecord();
await testPartialUndoFailureKeepsRetryRecord();
await testPartialUndoRetainsPendingSourceFolderSnapshot();
await testPartialUndoRemapsEarlierOperationFolderReferences();
await testPartialScopeErrors();
await testFolderPickerIncludesBookmarkRoots();
await testPartialApplyRollsBackOnFailure();
await testPartialUndoNeverRemovesTargetDirectory();
await testPartialUndoKeepsUserCreatedDirectories();
await testPartialUndoKeepsDirectoriesMovedOutsideScope();
await testScopedResultStorage();
testUiContracts();

console.log('regression checks passed');
