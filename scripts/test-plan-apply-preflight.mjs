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

function createBookmarkApi({ insideUrl = 'https://inside.example' } = {}) {
  const events = [];
  const nodes = new Map([
    ['0', { id: '0', title: '', children: ['bar', 'outside-root'] }],
    ['bar', { id: 'bar', title: 'Bookmarks bar', parentId: '0', index: 0, children: ['target'] }],
    ['target', {
      id: 'target',
      title: 'Target',
      parentId: 'bar',
      index: 0,
      children: ['inside-1', 'inside-2', 'folder-id'],
    }],
    ['inside-1', {
      id: 'inside-1',
      title: 'Inside',
      url: insideUrl,
      parentId: 'target',
      index: 0,
    }],
    ['inside-2', {
      id: 'inside-2',
      title: 'Excluded',
      url: 'https://excluded.example',
      parentId: 'target',
      index: 1,
    }],
    ['outside-root', { id: 'outside-root', title: 'Outside', parentId: '0', index: 1, children: ['outside-1'] }],
    ['outside-1', {
      id: 'outside-1',
      title: 'Outside bookmark',
      url: 'https://outside.example',
      parentId: 'outside-root',
      index: 0,
    }],
    ['folder-id', { id: 'folder-id', title: 'Folder, not bookmark', parentId: 'target', index: 2, children: [] }],
  ]);
  let created = 0;

  const cloneNode = (id) => {
    const node = nodes.get(id);
    if (!node) return undefined;
    return {
      ...node,
      ...(node.children ? { children: node.children.map(cloneNode) } : {}),
    };
  };

  return {
    events,
    getTree: async () => [cloneNode('0')],
    getSubTree: async (id) => {
      const node = cloneNode(id);
      if (!node) throw new Error(`missing node: ${id}`);
      return [node];
    },
    getChildren: async (id) => {
      const node = nodes.get(id);
      if (!node?.children) throw new Error(`missing folder: ${id}`);
      return node.children.map(cloneNode);
    },
    get: async (id) => {
      const node = cloneNode(id);
      if (!node) throw new Error(`missing node: ${id}`);
      return [node];
    },
    create: async (options) => {
      events.push(`create:${options.parentId}:${options.title}`);
      return { id: `created-${++created}`, ...options };
    },
    move: async (id, destination) => {
      events.push(`move:${id}:${destination.parentId}`);
      return { id, ...destination };
    },
    update: async (id, change) => {
      events.push(`update:${id}:${change.title ?? ''}`);
      return { id, ...change };
    },
    remove: async (id) => {
      events.push(`remove:${id}`);
    },
  };
}

function installChrome(api, storage) {
  globalThis.chrome = {
    bookmarks: api,
    storage: { local: storage.local },
  };
}

function assertNoBookmarkWrites(api) {
  assert.deepEqual(api.events, [], '计划校验失败前不得创建、移动、更新或删除任何 Chrome 书签');
}

async function testCollectsUniquePlannedBookmarkIds() {
  const { collectPlannedBookmarkIds } = await importTypeScript('src/core/bookmarks.ts');
  assert.deepEqual(
    collectPlannedBookmarkIds([
      { name: 'A', bookmarkIds: ['one', 'two'], children: [{ name: 'B', bookmarkIds: ['two', 'three'] }] },
      { name: 'C', bookmarkIds: ['one', 'four'] },
    ]),
    ['one', 'two', 'three', 'four'],
  );
}

async function testCompatibilityDistinguishesOutsideAndUnplannedBookmarks() {
  const api = createBookmarkApi();
  installChrome(api, createStorage());
  const { inspectClassificationPlanCompatibility } = await importTypeScript('src/core/bookmarks.ts');

  const report = await inspectClassificationPlanCompatibility(
    [{ name: 'Category', bookmarkIds: ['inside-1', 'outside-1'] }],
    {
      mode: 'partial',
      targetDirectoryId: 'target',
      targetDirectoryTitle: 'Target',
      bookmarkCount: 2,
    },
    ['inside-2'],
  );

  assert.deepEqual(report.plannedBookmarkIds, ['inside-1', 'outside-1']);
  assert.deepEqual(report.missingBookmarkIds, []);
  assert.deepEqual(report.outsideScopeBookmarkIds, ['outside-1']);
  assert.deepEqual(report.unplannedBookmarkIds, []);
  assert.equal(report.canApply, false);
  assert.equal(report.scope.mode, 'partial');
  assert.equal(typeof report.fingerprint, 'string');
  assertNoBookmarkWrites(api);
}

async function testCompatibilityReportsMissingFullPlanBookmarks() {
  const api = createBookmarkApi();
  installChrome(api, createStorage());
  const { inspectClassificationPlanCompatibility } = await importTypeScript('src/core/bookmarks.ts');

  const report = await inspectClassificationPlanCompatibility(
    [{ name: 'Category', bookmarkIds: ['inside-1', 'missing-bookmark'] }],
    { mode: 'full' },
  );

  assert.deepEqual(report.missingBookmarkIds, ['missing-bookmark']);
  assert.deepEqual(report.outsideScopeBookmarkIds, []);
  assert.deepEqual(report.unplannedBookmarkIds.sort(), ['inside-2', 'outside-1']);
  assert.equal(report.canApply, false);
  assert.equal(report.scope.mode, 'full');
  assertNoBookmarkWrites(api);
}

async function testCompatibilityRejectsDuplicatePlanIdsWithoutWrites() {
  const api = createBookmarkApi();
  installChrome(api, createStorage());
  const { inspectClassificationPlanCompatibility } = await importTypeScript('src/core/bookmarks.ts');

  const report = await inspectClassificationPlanCompatibility([
    { name: 'Category A', bookmarkIds: ['inside-1'] },
    { name: 'Category B', bookmarkIds: ['inside-1'] },
  ], { mode: 'full' });

  assert.deepEqual(report.duplicateBookmarkIds, ['inside-1']);
  assert.equal(report.canApply, false);
  assertNoBookmarkWrites(api);
}

async function testPartialCompatibilityAndApplyAllowChangedNonHttpUrls() {
  const { inspectClassificationPlanCompatibility, applyPartialToBookmarks } =
    await importTypeScript('src/core/bookmarks.ts');

  for (const url of ['javascript:alert(1)', 'chrome://settings/']) {
    const api = createBookmarkApi({ insideUrl: url });
    installChrome(api, createStorage());

    const tree = [{ name: 'Category', bookmarkIds: ['inside-1'] }];
    const report = await inspectClassificationPlanCompatibility(
      tree,
      {
        mode: 'partial',
        targetDirectoryId: 'target',
        targetDirectoryTitle: 'Target',
        bookmarkCount: 2,
      },
      ['inside-2'],
    );

    assert.equal(report.canApply, true, `${url} 仍应视为目标目录内的可用书签`);
    assert.deepEqual(report.missingBookmarkIds, []);
    assert.deepEqual(report.outsideScopeBookmarkIds, []);
    assertNoBookmarkWrites(api);

    await applyPartialToBookmarks(tree, 'target');
    assert.ok(api.events.some((event) => event.startsWith('move:inside-1:created-')));
  }
}

async function testCompatibilityRejectsDeletedPartialTargetWithoutWrites() {
  const api = createBookmarkApi();
  api.getSubTree = async () => {
    throw new Error('missing node: target');
  };
  installChrome(api, createStorage());
  const { inspectClassificationPlanCompatibility } = await importTypeScript('src/core/bookmarks.ts');

  await assert.rejects(
    () => inspectClassificationPlanCompatibility(
      [{ name: 'Category', bookmarkIds: ['inside-1'] }],
      {
        mode: 'partial',
        targetDirectoryId: 'target',
        targetDirectoryTitle: 'Target',
        bookmarkCount: 2,
      },
    ),
    /目录.*不存在|已被删除|无法访问/i,
  );
  assertNoBookmarkWrites(api);
}

async function testCompatibilityRejectsBookmarkReadPermissionFailureWithoutWrites() {
  const api = createBookmarkApi();
  api.getSubTree = async () => {
    throw new Error('Permission denied');
  };
  installChrome(api, createStorage());
  const { inspectClassificationPlanCompatibility } = await importTypeScript('src/core/bookmarks.ts');

  await assert.rejects(
    () => inspectClassificationPlanCompatibility(
      [{ name: 'Category', bookmarkIds: ['inside-1'] }],
      {
        mode: 'partial',
        targetDirectoryId: 'target',
        targetDirectoryTitle: 'Target',
        bookmarkCount: 2,
      },
    ),
    /无法读取.*目录|权限不足/i,
  );
  assertNoBookmarkWrites(api);
}

async function testFullApplyRejectsMissingPlanIdBeforeWrites() {
  const api = createBookmarkApi();
  installChrome(api, createStorage());
  const { applyToBookmarks } = await importTypeScript('src/core/bookmarks.ts');

  await assert.rejects(
    () => applyToBookmarks([{ name: 'Category', bookmarkIds: ['missing-bookmark'] }]),
    /书签.*变化|不存在|重新生成/i,
  );
  assertNoBookmarkWrites(api);
}

async function testFullApplyRejectsFolderPlanIdBeforeWrites() {
  const api = createBookmarkApi();
  installChrome(api, createStorage());
  const { applyToBookmarks } = await importTypeScript('src/core/bookmarks.ts');

  await assert.rejects(
    () => applyToBookmarks([{ name: 'Category', bookmarkIds: ['folder-id'] }]),
    /书签.*变化|不是书签|重新生成/i,
  );
  assertNoBookmarkWrites(api);
}

async function testFullApplyRejectsDuplicatePlanIdBeforeWrites() {
  const api = createBookmarkApi();
  installChrome(api, createStorage());
  const { applyToBookmarks } = await importTypeScript('src/core/bookmarks.ts');

  await assert.rejects(
    () => applyToBookmarks([
      { name: 'Category A', bookmarkIds: ['inside-1'] },
      { name: 'Category B', bookmarkIds: ['inside-1'] },
    ]),
    /重复.*书签|书签.*重复|duplicate/i,
  );
  assertNoBookmarkWrites(api);
}

async function testPartialApplyRejectsOutsidePlanIdBeforeWrites() {
  const api = createBookmarkApi();
  installChrome(api, createStorage());
  const { applyPartialToBookmarks } = await importTypeScript('src/core/bookmarks.ts');

  await assert.rejects(
    () => applyPartialToBookmarks([
      { name: 'Category', bookmarkIds: ['inside-1', 'outside-1'] },
    ], 'target'),
    /书签.*变化|范围|目录|重新执行/i,
  );
  assertNoBookmarkWrites(api);
}

async function testPartialApplyRejectsMissingPlanIdBeforeWrites() {
  const api = createBookmarkApi();
  installChrome(api, createStorage());
  const { applyPartialToBookmarks } = await importTypeScript('src/core/bookmarks.ts');

  await assert.rejects(
    () => applyPartialToBookmarks([
      { name: 'Category', bookmarkIds: ['inside-1', 'missing-bookmark'] },
    ], 'target'),
    /书签.*变化|范围|目录|重新执行/i,
  );
  assertNoBookmarkWrites(api);
}

async function testPartialApplyRejectsFolderPlanIdBeforeWrites() {
  const api = createBookmarkApi();
  installChrome(api, createStorage());
  const { applyPartialToBookmarks } = await importTypeScript('src/core/bookmarks.ts');

  await assert.rejects(
    () => applyPartialToBookmarks([
      { name: 'Category', bookmarkIds: ['inside-1', 'folder-id'] },
    ], 'target'),
    /书签.*变化|范围|目录|重新执行/i,
  );
  assertNoBookmarkWrites(api);
}

async function testPartialApplyRejectsDuplicatePlanIdBeforeWrites() {
  const api = createBookmarkApi();
  installChrome(api, createStorage());
  const { applyPartialToBookmarks } = await importTypeScript('src/core/bookmarks.ts');

  await assert.rejects(
    () => applyPartialToBookmarks([
      { name: 'Category A', bookmarkIds: ['inside-1'] },
      { name: 'Category B', bookmarkIds: ['inside-1'] },
    ], 'target'),
    /重复.*书签|书签.*重复|duplicate/i,
  );
  assertNoBookmarkWrites(api);
}

async function testPartialApplyStillWritesAWhollyValidPlan() {
  const api = createBookmarkApi();
  installChrome(api, createStorage());
  const { applyPartialToBookmarks } = await importTypeScript('src/core/bookmarks.ts');

  await applyPartialToBookmarks([
    { name: 'Category', bookmarkIds: ['inside-1'] },
  ], 'target');

  assert.ok(api.events.some((event) => event.startsWith('create:target:Category')));
  assert.ok(api.events.some((event) => event.startsWith('move:inside-1:created-')));
}

await testCollectsUniquePlannedBookmarkIds();
await testCompatibilityDistinguishesOutsideAndUnplannedBookmarks();
await testCompatibilityReportsMissingFullPlanBookmarks();
await testCompatibilityRejectsDuplicatePlanIdsWithoutWrites();
await testPartialCompatibilityAndApplyAllowChangedNonHttpUrls();
await testCompatibilityRejectsDeletedPartialTargetWithoutWrites();
await testCompatibilityRejectsBookmarkReadPermissionFailureWithoutWrites();
await testFullApplyRejectsMissingPlanIdBeforeWrites();
await testFullApplyRejectsFolderPlanIdBeforeWrites();
await testFullApplyRejectsDuplicatePlanIdBeforeWrites();
await testPartialApplyRejectsOutsidePlanIdBeforeWrites();
await testPartialApplyRejectsMissingPlanIdBeforeWrites();
await testPartialApplyRejectsFolderPlanIdBeforeWrites();
await testPartialApplyRejectsDuplicatePlanIdBeforeWrites();
await testPartialApplyStillWritesAWhollyValidPlan();

console.log('plan apply preflight tests passed');
