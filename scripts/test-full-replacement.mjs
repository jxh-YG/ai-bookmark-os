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

function createStorage(initial = {}) {
  const values = structuredClone(initial);
  return {
    values,
    local: {
      async get(key) {
        if (key === null) return structuredClone(values);
        return { [key]: structuredClone(values[key]) };
      },
      async set(next) {
        Object.assign(values, structuredClone(next));
      },
      async remove(keys) {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
      },
    },
  };
}

function createBookmarkApi({ failOnMove, failOnUpdate } = {}) {
  const events = [];
  const folders = new Map([
    ['bar', { title: 'Bookmarks bar', parentId: '0', index: 0, children: ['old-root'] }],
    ['old-root', { title: '✨ AI 整理', parentId: 'bar', index: 0, children: ['old-category'] }],
    ['old-category', { title: 'Old category', parentId: 'old-root', index: 0, children: ['bookmark-1', 'bookmark-2'] }],
  ]);
  const bookmarks = new Map([
    ['bookmark-1', { id: 'bookmark-1', title: 'One', url: 'https://one.example', parentId: 'old-category', index: 0 }],
    ['bookmark-2', { id: 'bookmark-2', title: 'Two', url: 'https://two.example', parentId: 'old-category', index: 1 }],
  ]);
  let created = 0;

  const node = (id) => {
    const bookmark = bookmarks.get(id);
    if (bookmark) return { ...bookmark };
    const folder = folders.get(id);
    if (!folder) return undefined;
    return {
      id,
      title: folder.title,
      parentId: folder.parentId,
      index: folder.index,
      children: folder.children.map(node),
    };
  };
  const refreshIndexes = (parentId) => {
    const parent = folders.get(parentId);
    if (!parent) return;
    parent.children.forEach((id, index) => {
      const folder = folders.get(id);
      if (folder) folder.index = index;
      const bookmark = bookmarks.get(id);
      if (bookmark) bookmark.index = index;
    });
  };
  const detach = (id, parentId) => {
    const parent = folders.get(parentId);
    if (!parent) throw new Error(`missing parent: ${parentId}`);
    parent.children = parent.children.filter((childId) => childId !== id);
    refreshIndexes(parentId);
  };
  const attach = (id, parentId, index) => {
    const parent = folders.get(parentId);
    if (!parent) throw new Error(`missing parent: ${parentId}`);
    parent.children.splice(index ?? parent.children.length, 0, id);
    refreshIndexes(parentId);
  };
  const api = {
    events,
    folders,
    bookmarks,
    getTree: async () => [{ id: '0', children: [node('bar')] }],
    getChildren: async (id) => {
      const folder = folders.get(id);
      if (!folder) throw new Error(`missing folder: ${id}`);
      return folder.children.map(node);
    },
    get: async (id) => {
      const result = node(id);
      if (!result) throw new Error(`missing node: ${id}`);
      return [result];
    },
    getSubTree: async (id) => {
      const result = node(id);
      if (!result) throw new Error(`missing node: ${id}`);
      return [result];
    },
    create: async ({ parentId, title, index }) => {
      const id = `created-${++created}`;
      folders.set(id, { title, parentId, index: 0, children: [] });
      attach(id, parentId, index);
      events.push(`create:${id}:${title}:${parentId}`);
      return node(id);
    },
    move: async (id, { parentId, index }) => {
      events.push(`move:${id}:${parentId}`);
      if (failOnMove?.(id, parentId)) throw new Error('simulated move failure');
      const bookmark = bookmarks.get(id);
      const folder = folders.get(id);
      const entry = bookmark ?? folder;
      if (!entry) throw new Error(`missing node: ${id}`);
      detach(id, entry.parentId);
      entry.parentId = parentId;
      attach(id, parentId, index);
      return node(id);
    },
    update: async (id, change) => {
      if (failOnUpdate?.(id, change)) throw new Error('simulated update failure');
      const folder = folders.get(id);
      if (!folder) throw new Error(`missing folder: ${id}`);
      if (change.title !== undefined) folder.title = change.title;
      events.push(`update:${id}:${change.title ?? ''}`);
      return node(id);
    },
    remove: async (id) => {
      events.push(`remove:${id}`);
      const folder = folders.get(id);
      if (!folder || folder.children.length > 0) throw new Error(`folder not empty: ${id}`);
      detach(id, folder.parentId);
      folders.delete(id);
    },
    removeTree: async (id) => {
      events.push(`removeTree:${id}`);
      throw new Error('removeTree must never be called by full replacement');
    },
  };
  return api;
}

function installChrome(api, storage) {
  globalThis.chrome = {
    bookmarks: api,
    storage: { local: storage.local },
  };
}

function oldApplyRecord() {
  return {
    createdAt: 1,
    rootFolderId: 'old-root',
    createdFolderIds: ['old-root', 'old-category'],
    status: 'complete',
    moves: [
      { id: 'bookmark-1', oldParentId: 'before-ai', oldIndex: 0 },
      { id: 'bookmark-2', oldParentId: 'before-ai', oldIndex: 1 },
    ],
    removedSourceFolders: [],
  };
}

async function testReplacementUsesStagingAndCommitsAtOriginalPosition() {
  const api = createBookmarkApi();
  const storage = createStorage({ applyRecord: oldApplyRecord() });
  installChrome(api, storage);
  const { applyToBookmarks } = await importTypeScript('src/core/bookmarks.ts');

  await applyToBookmarks([{ name: 'New category', bookmarkIds: ['bookmark-1', 'bookmark-2'] }]);

  const next = storage.values.applyRecord;
  assert.equal(next.rootFolderId, 'created-1');
  assert.equal(api.folders.get(next.rootFolderId).title, '✨ AI 整理');
  assert.equal(api.folders.get(next.rootFolderId).parentId, 'bar');
  assert.equal(api.folders.get(next.rootFolderId).index, 0);
  assert.deepEqual(next.createdFolderIds, ['created-1', 'created-2']);
  assert.equal(storage.values.fullReplacementTransaction, undefined);
  assert.ok(!api.folders.has('old-root'));
  assert.ok(!api.events.some((event) => event.startsWith('removeTree:')));
}

async function testReplacementFailureRestoresStagingAndKeepsOldRecord() {
  const api = createBookmarkApi({ failOnMove: (id, parentId) => id === 'bookmark-2' && parentId.startsWith('created-') });
  const previous = oldApplyRecord();
  const storage = createStorage({ applyRecord: previous });
  installChrome(api, storage);
  const { applyToBookmarks } = await importTypeScript('src/core/bookmarks.ts');

  await assert.rejects(
    () => applyToBookmarks([{ name: 'New category', bookmarkIds: ['bookmark-1', 'bookmark-2'] }]),
    /failed|失败|rollback|恢复/i,
  );

  assert.deepEqual(storage.values.applyRecord, previous);
  assert.equal(storage.values.fullReplacementTransaction, undefined);
  assert.equal(api.bookmarks.get('bookmark-1').parentId, 'old-category');
  assert.ok(!api.folders.has('created-1'));
  assert.ok(!api.events.some((event) => event.startsWith('removeTree:')));
}

async function testFirstFullApplyFailureRollsBackCreatedFoldersAndMoves() {
  const api = createBookmarkApi({ failOnMove: (id, parentId) => id === 'bookmark-2' && parentId.startsWith('created-') });
  const storage = createStorage();
  installChrome(api, storage);
  const { applyToBookmarks } = await importTypeScript('src/core/bookmarks.ts');

  await assert.rejects(
    () => applyToBookmarks([{ name: 'New category', bookmarkIds: ['bookmark-1', 'bookmark-2'] }]),
    /failed|失败|rollback|恢复/i,
  );

  assert.equal(api.bookmarks.get('bookmark-1').parentId, 'old-category');
  assert.equal(api.bookmarks.get('bookmark-2').parentId, 'old-category');
  assert.ok(!api.folders.has('created-1'));
  assert.equal(storage.values.applyRecord, undefined);
  assert.ok(!api.events.some((event) => event.startsWith('removeTree:')));
}

async function testReplacementRollbackRemapsTheRestoredOldRootRecord() {
  const api = createBookmarkApi({ failOnUpdate: (id) => id === 'created-1' });
  const previous = oldApplyRecord();
  const storage = createStorage({ applyRecord: previous });
  installChrome(api, storage);
  const { applyToBookmarks } = await importTypeScript('src/core/bookmarks.ts');

  await assert.rejects(
    () => applyToBookmarks([{ name: 'New category', bookmarkIds: ['bookmark-1', 'bookmark-2'] }]),
    /failed|失败|rollback|恢复/i,
  );

  const restoredRecord = storage.values.applyRecord;
  assert.notEqual(restoredRecord.rootFolderId, previous.rootFolderId, 'deleted old roots are recreated with a new Chrome id');
  assert.ok(api.folders.has(restoredRecord.rootFolderId), 'the surviving undo record must point to the recreated old root');
  assert.ok(restoredRecord.createdFolderIds.includes(restoredRecord.rootFolderId));
  assert.equal(storage.values.fullReplacementTransaction, undefined);
}

async function testFullReplacementIsRejectedWhilePartialUndoRecordExists() {
  const api = createBookmarkApi();
  const previous = oldApplyRecord();
  const storage = createStorage({
    applyRecord: previous,
    partialApplyRecords: [{
      createdAt: 2,
      rootFolderId: 'old-category',
      targetDirectoryId: 'old-category',
      moves: [],
      createdFolderIds: [],
      status: 'complete',
      removedSourceFolders: [],
    }],
  });
  installChrome(api, storage);
  const { applyToBookmarks } = await importTypeScript('src/core/bookmarks.ts');

  await assert.rejects(
    () => applyToBookmarks([{ name: 'New category', bookmarkIds: ['bookmark-1', 'bookmark-2'] }]),
    /小范围分类/,
  );

  assert.deepEqual(storage.values.applyRecord, previous);
  assert.equal(storage.values.fullReplacementTransaction, undefined);
  assert.ok(!api.events.some((event) => event.startsWith('create:')));
  assert.ok(api.folders.has('old-root'));
}

async function testReplacementPreservesUnplannedContentFromTheOldRoot() {
  const api = createBookmarkApi();
  api.bookmarks.set('bookmark-unplanned', {
    id: 'bookmark-unplanned',
    title: 'Keep me',
    url: 'https://keep.example',
    parentId: 'old-category',
    index: 2,
  });
  api.folders.get('old-category').children.push('bookmark-unplanned');

  const previous = oldApplyRecord();
  const storage = createStorage({ applyRecord: previous });
  installChrome(api, storage);
  const { applyToBookmarks } = await importTypeScript('src/core/bookmarks.ts');

  await applyToBookmarks([{ name: 'New category', bookmarkIds: ['bookmark-1', 'bookmark-2'] }]);

  const next = storage.values.applyRecord;
  assert.notDeepEqual(next, previous);
  assert.equal(storage.values.fullReplacementTransaction, undefined);
  assert.ok(api.folders.has('old-root'));
  assert.ok(api.folders.has('old-category'));
  assert.deepEqual(api.folders.get('old-category').children, ['bookmark-unplanned']);
  assert.equal(api.bookmarks.get('bookmark-unplanned').parentId, 'old-category');
  assert.ok(api.folders.has(next.rootFolderId));
  assert.equal(api.folders.get(next.rootFolderId).parentId, 'bar');
  assert.equal(api.folders.get(next.rootFolderId).index, 1);
  assert.match(api.folders.get(next.rootFolderId).title, /重新分类/);
  assert.ok(!api.events.some((event) => event.startsWith('removeTree:')));
}

async function testUndoNeverRecursivelyDeletesNewRootWithUserContent() {
  const api = createBookmarkApi();
  const record = {
    createdAt: 2,
    rootFolderId: 'old-root',
    createdFolderIds: ['old-root', 'old-category'],
    status: 'complete',
    moves: [],
    removedSourceFolders: [],
  };
  api.folders.set('user-folder', { title: 'User folder', parentId: 'old-root', index: 1, children: [] });
  api.folders.get('old-root').children.push('user-folder');
  const storage = createStorage({ applyRecord: record });
  installChrome(api, storage);
  const { undoApply } = await importTypeScript('src/core/bookmarks.ts');

  await undoApply();

  assert.ok(!api.events.some((event) => event.startsWith('removeTree:')));
  assert.ok(api.folders.has('old-root'));
  assert.deepEqual(storage.values.applyRecord, { ...record, moves: [] });
}

async function testPendingUnrecordedStagingFolderIsSafelyRecovered() {
  const api = createBookmarkApi();
  const previous = oldApplyRecord();
  const temporaryTitle = '\u2063AI-staging-crash-window';
  api.folders.set('staging-root', {
    title: '✨ AI 整理（更新中）',
    parentId: 'bar',
    index: 1,
    children: ['orphan-folder'],
  });
  api.folders.set('orphan-folder', {
    title: temporaryTitle,
    parentId: 'staging-root',
    index: 0,
    children: [],
  });
  api.folders.get('bar').children.push('staging-root');
  const storage = createStorage({
    applyRecord: previous,
    fullReplacementTransaction: {
      version: 1,
      phase: 'staging',
      previousRootFolderId: 'old-root',
      previousRecordCreatedAt: previous.createdAt,
      stagingRootFolderId: 'staging-root',
      finalParentId: 'bar',
      finalIndex: 0,
      finalTitle: '✨ AI 整理',
      pendingFolder: {
        parentId: 'staging-root',
        finalTitle: 'New category',
        temporaryTitle,
      },
      nextRecord: {
        createdAt: 2,
        rootFolderId: 'staging-root',
        moves: [],
        createdFolderIds: ['staging-root'],
        status: 'applying',
        removedSourceFolders: [],
      },
    },
  });
  installChrome(api, storage);
  const { applyToBookmarks } = await importTypeScript('src/core/bookmarks.ts');

  await assert.rejects(
    () => applyToBookmarks([{ name: 'New category', bookmarkIds: ['missing-bookmark'] }]),
    /书签已变化|bookmark/i,
  );

  assert.ok(!api.folders.has('orphan-folder'));
  assert.ok(!api.folders.has('staging-root'));
  assert.equal(storage.values.fullReplacementTransaction, undefined);
  assert.deepEqual(storage.values.applyRecord, previous);
}

async function testPendingStagingIsRecoveredBeforeTheNextApply() {
  const api = createBookmarkApi();
  const previous = oldApplyRecord();
  api.folders.set('staging-root', {
    title: '✨ AI 整理（更新中）',
    parentId: 'bar',
    index: 1,
    children: ['staging-category'],
  });
  api.folders.set('staging-category', {
    title: 'New category',
    parentId: 'staging-root',
    index: 0,
    children: ['bookmark-1'],
  });
  api.folders.get('bar').children.push('staging-root');
  api.folders.get('old-category').children = ['bookmark-2'];
  api.bookmarks.get('bookmark-1').parentId = 'staging-category';
  api.bookmarks.get('bookmark-1').index = 0;
  const storage = createStorage({
    applyRecord: previous,
    fullReplacementTransaction: {
      version: 1,
      phase: 'staging',
      previousRootFolderId: 'old-root',
      previousRecordCreatedAt: previous.createdAt,
      stagingRootFolderId: 'staging-root',
      finalParentId: 'bar',
      finalIndex: 0,
      finalTitle: '✨ AI 整理',
      nextRecord: {
        createdAt: 2,
        rootFolderId: 'staging-root',
        moves: [{ id: 'bookmark-1', oldParentId: 'old-category', oldIndex: 0 }],
        createdFolderIds: ['staging-root', 'staging-category'],
        status: 'applying',
        removedSourceFolders: [],
      },
    },
  });
  installChrome(api, storage);
  const { applyToBookmarks } = await importTypeScript('src/core/bookmarks.ts');

  await assert.rejects(
    () => applyToBookmarks([{ name: 'New category', bookmarkIds: ['missing-bookmark'] }]),
    /书签已变化|bookmark/i,
  );

  assert.equal(storage.values.fullReplacementTransaction, undefined);
  assert.deepEqual(storage.values.applyRecord, previous);
  assert.equal(api.bookmarks.get('bookmark-1').parentId, 'old-category');
  assert.ok(!api.folders.has('staging-root'));
  assert.ok(!api.events.some((event) => event.startsWith('removeTree:')));
}

await testReplacementUsesStagingAndCommitsAtOriginalPosition();
await testReplacementFailureRestoresStagingAndKeepsOldRecord();
await testFirstFullApplyFailureRollsBackCreatedFoldersAndMoves();
await testReplacementRollbackRemapsTheRestoredOldRootRecord();
await testFullReplacementIsRejectedWhilePartialUndoRecordExists();
await testReplacementPreservesUnplannedContentFromTheOldRoot();
await testUndoNeverRecursivelyDeletesNewRootWithUserContent();
await testPendingUnrecordedStagingFolderIsSafelyRecovered();
await testPendingStagingIsRecoveredBeforeTheNextApply();
console.log('full replacement tests passed');
