import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { build } from 'esbuild';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

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

function clone(value) {
  return structuredClone(value);
}

function createStorage(initial = {}) {
  const values = clone(initial);
  return {
    values,
    local: {
      get: async (key) => {
        if (key === null) return clone(values);
        if (Array.isArray(key)) return Object.fromEntries(key.map((item) => [item, clone(values[item])]));
        return { [key]: clone(values[key]) };
      },
      set: async (next) => Object.assign(values, clone(next)),
      remove: async (keys) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
      },
    },
  };
}

function fullTree() {
  return [{
    id: '0',
    title: '',
    children: [{
      id: 'bar',
      title: '书签栏',
      children: [{
        id: 'work',
        title: '工作',
        children: [{
          id: 'bookmark-1',
          title: '文档',
          url: 'https://example.com/docs',
        }],
      }],
    }],
  }];
}

async function testCapturesFullAndPartialScopes() {
  let getTreeCalls = 0;
  let getSubTreeCalls = 0;
  globalThis.chrome = {
    bookmarks: {
      getTree: async () => {
        getTreeCalls += 1;
        return clone(fullTree());
      },
      getSubTree: async (id) => {
        getSubTreeCalls += 1;
        assert.equal(id, 'work');
        return clone([fullTree()[0].children[0].children[0]]);
      },
    },
  };

  const {
    captureBookmarkSnapshot,
    getBookmarkSnapshotPath,
  } = await importTypeScript('src/core/bookmarkSnapshot.ts');

  const full = await captureBookmarkSnapshot({ mode: 'full' });
  assert.equal(getTreeCalls, 1);
  assert.equal(getSubTreeCalls, 0);
  assert.equal(full.rootId, '0');
  assert.equal(full.scope.mode, 'full');
  assert.equal(full.nodes['bookmark-1'].parentId, 'work');
  assert.match(full.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(getBookmarkSnapshotPath(full, 'bookmark-1'), '书签栏 / 工作 / 文档');

  const partial = await captureBookmarkSnapshot({
    mode: 'partial',
    targetDirectoryId: 'work',
    targetDirectoryTitle: '旧标题',
    bookmarkCount: 99,
  });
  assert.equal(getTreeCalls, 1, '局部快照不得读取完整书签树');
  assert.equal(getSubTreeCalls, 1);
  assert.deepEqual(partial.scope, {
    mode: 'partial',
    targetDirectoryId: 'work',
    targetDirectoryTitle: '工作',
    bookmarkCount: 1,
  });
  assert.equal(partial.rootId, 'work');
  assert.equal(getBookmarkSnapshotPath(partial, 'bookmark-1'), '工作 / 文档');
}

async function testFingerprintsAndChangeSet() {
  const {
    createBookmarkSnapshotFromTree,
    diffBookmarkSnapshots,
  } = await importTypeScript('src/core/bookmarkSnapshot.ts');

  const before = await createBookmarkSnapshotFromTree([{
    id: 'root', title: '根目录', children: [
      { id: 'folder-a', title: '分类 A', children: [
        { id: 'bookmark-change', title: '旧名称', url: 'https://old.example' },
        { id: 'bookmark-order-a', title: '排序 A', url: 'https://order-a.example' },
        { id: 'bookmark-order-b', title: '排序 B', url: 'https://order-b.example' },
      ] },
      { id: 'folder-b', title: '分类 B', children: [
        { id: 'bookmark-move', title: '移动项', url: 'https://move.example' },
      ] },
      { id: 'bookmark-remove', title: '删除项', url: 'https://remove.example' },
    ],
  }], { mode: 'full' }, { capturedAt: 1 });

  const after = await createBookmarkSnapshotFromTree([{
    id: 'root', title: '根目录', children: [
      { id: 'folder-a', title: '分类 A（已改名）', children: [
        { id: 'bookmark-order-a', title: '排序 A', url: 'https://order-a.example' },
        { id: 'bookmark-order-b', title: '排序 B', url: 'https://order-b.example' },
        { id: 'bookmark-change', title: '新名称', url: 'https://new.example' },
        { id: 'bookmark-move', title: '移动项', url: 'https://move.example' },
        { id: 'bookmark-add', title: '新增项', url: 'https://add.example' },
      ] },
      { id: 'folder-b', title: '分类 B', children: [] },
    ],
  }], { mode: 'full' }, { capturedAt: 2 });

  assert.notEqual(before.fingerprint, after.fingerprint);
  const result = diffBookmarkSnapshots(before, after, { id: 'change-set', createdAt: 3 });
  assert.equal(result.id, 'change-set');
  assert.equal(result.createdAt, 3);
  assert.ok(result.changes.some((change) => change.kind === 'added' && change.id === 'bookmark-add'));
  assert.ok(result.changes.some((change) => change.kind === 'removed' && change.id === 'bookmark-remove'));
  assert.ok(result.changes.some((change) => change.kind === 'moved' && change.id === 'bookmark-move'));
  assert.ok(result.changes.some((change) => change.kind === 'renamed' && change.id === 'bookmark-change'));
  assert.ok(result.changes.some((change) => change.kind === 'reordered' && change.id === 'bookmark-order-a'));
  assert.ok(result.changes.some((change) => change.kind === 'urlChanged' && change.id === 'bookmark-change'));
  assert.equal(result.summary.added, 1);
  assert.equal(result.summary.removed, 1);
  assert.equal(result.summary.moved, 1);
  assert.equal(result.summary.urlChanged, 1);
  const moved = result.changes.find((change) => change.kind === 'moved' && change.id === 'bookmark-move');
  assert.equal(moved?.beforePath, '根目录 / 分类 B / 移动项');
  assert.equal(moved?.afterPath, '根目录 / 分类 A（已改名） / 移动项');
}

async function testFreshnessUsesTheSameScope() {
  let current = fullTree();
  globalThis.chrome = {
    bookmarks: {
      getTree: async () => clone(current),
      getSubTree: async () => {
        throw new Error('不应读取局部树');
      },
    },
  };
  const {
    captureBookmarkSnapshot,
    isBookmarkSnapshotCurrent,
  } = await importTypeScript('src/core/bookmarkSnapshot.ts');

  const snapshot = await captureBookmarkSnapshot({ mode: 'full' });
  assert.equal(await isBookmarkSnapshotCurrent(snapshot), true);
  current = fullTree();
  current[0].children[0].children[0].title = '工作（已手动修改）';
  assert.equal(await isBookmarkSnapshotCurrent(snapshot), false);
}

async function testPartialFreshnessIgnoresChangesOutsideTheSelectedFolder() {
  let current = fullTree();
  current[0].children[0].children.push({
    id: 'outside',
    title: '范围外',
    children: [{ id: 'outside-bookmark', title: '范围外书签', url: 'https://outside.example' }],
  });
  globalThis.chrome = {
    bookmarks: {
      getTree: async () => clone(current),
      getSubTree: async (id) => {
        assert.equal(id, 'work');
        return clone([current[0].children[0].children.find((node) => node.id === 'work')]);
      },
    },
  };
  const {
    captureBookmarkSnapshot,
    isBookmarkSnapshotCurrent,
  } = await importTypeScript('src/core/bookmarkSnapshot.ts');

  const snapshot = await captureBookmarkSnapshot({
    mode: 'partial',
    targetDirectoryId: 'work',
    targetDirectoryTitle: '工作',
    bookmarkCount: 1,
  });
  current[0].children[0].children.find((node) => node.id === 'outside').title = '范围外已改名';
  assert.equal(await isBookmarkSnapshotCurrent(snapshot), true, '范围外变化不得使局部草稿过期');
  current[0].children[0].children.find((node) => node.id === 'work').children[0].title = '范围内已改名';
  assert.equal(await isBookmarkSnapshotCurrent(snapshot), false, '范围内变化必须使局部草稿过期');
}

function changeSet(id, createdAt) {
  return {
    id,
    scope: { mode: 'full' },
    createdAt,
    planVersionId: `plan-${id}`,
    beforeFingerprint: `before-${id}`,
    afterFingerprint: `after-${id}`,
    summary: { added: 0, removed: 0, moved: 0, renamed: 0, reordered: 0, urlChanged: 0 },
    changes: [],
  };
}

async function testWorkspaceStateNormalizesLegacyStorageAndKeepsLatestTen() {
  const storage = createStorage({
    classificationWorkspace: {
      version: 'legacy',
      activeFull: { rootFolderId: 'root-1', draftId: 'draft-1', appliedAt: 1, fingerprint: 'fp-1' },
      comparisons: [{ broken: true }, changeSet('old', 1)],
    },
  });
  globalThis.chrome = { storage };
  const {
    CLASSIFICATION_WORKSPACE_STORAGE_KEY,
    addClassificationChangeSet,
    clearActiveFullClassification,
    loadClassificationWorkspace,
    setActiveFullClassification,
  } = await importTypeScript('src/core/classificationWorkspace.ts');

  const loaded = await loadClassificationWorkspace();
  assert.equal(loaded.version, 1);
  assert.equal(loaded.activeFull?.rootFolderId, 'root-1');
  assert.deepEqual(loaded.comparisons.map((item) => item.id), ['old']);
  assert.equal(loaded.comparisons[0].planVersionId, 'plan-old');

  await setActiveFullClassification({
    rootFolderId: 'root-2', draftId: 'draft-2', appliedAt: 2, fingerprint: 'fp-2',
  });
  for (let index = 0; index < 11; index += 1) {
    await addClassificationChangeSet(changeSet(`new-${index}`, 10 + index));
  }
  const afterAdds = await loadClassificationWorkspace();
  assert.equal(afterAdds.activeFull?.rootFolderId, 'root-2');
  assert.equal(afterAdds.comparisons.length, 10);
  assert.equal(afterAdds.comparisons[0].id, 'new-10');
  assert.equal(afterAdds.comparisons[0].planVersionId, 'plan-new-10');
  assert.equal(afterAdds.comparisons.at(-1)?.id, 'new-1');
  assert.ok(storage.values[CLASSIFICATION_WORKSPACE_STORAGE_KEY]);

  await clearActiveFullClassification();
  assert.equal((await loadClassificationWorkspace()).activeFull, undefined);
}

async function run() {
  await testCapturesFullAndPartialScopes();
  await testFingerprintsAndChangeSet();
  await testFreshnessUsesTheSameScope();
  await testPartialFreshnessIgnoresChangesOutsideTheSelectedFolder();
  await testWorkspaceStateNormalizesLegacyStorageAndKeepsLatestTen();
  console.log('bookmark snapshot tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
