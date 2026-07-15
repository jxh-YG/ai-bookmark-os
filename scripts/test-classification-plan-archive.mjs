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

function clone(value) {
  return structuredClone(value);
}

function createStorage(initial = {}, { failSet = false } = {}) {
  const values = clone(initial);
  return {
    values,
    local: {
      get: async (key) => {
        if (key === null) return clone(values);
        if (Array.isArray(key)) return Object.fromEntries(key.map((item) => [item, clone(values[item])]));
        return { [key]: clone(values[key]) };
      },
      set: async (next) => {
        if (failSet) throw new Error('storage write failed');
        Object.assign(values, clone(next));
      },
    },
  };
}

function fullScope() {
  return { mode: 'full' };
}

function partialScope(id = 'work') {
  return {
    mode: 'partial',
    targetDirectoryId: id,
    targetDirectoryTitle: `Folder ${id}`,
    bookmarkCount: 2,
  };
}

function draft({
  draftId,
  createdAt = 10,
  updatedAt,
  scope = fullScope(),
  excludedBookmarkIds = ['keep-here'],
  source = {
    version: 1,
    fingerprint: 'source-fingerprint',
    capturedAt: 8,
    bookmarkCount: 2,
    nodeCount: 3,
  },
  application,
} = {}) {
  return {
    tree: [{
      name: 'Engineering',
      bookmarkIds: ['bookmark-a'],
      children: [{ name: 'Docs', bookmarkIds: ['bookmark-b'] }],
    }],
    labels: {
      'bookmark-a': { id: 'bookmark-a', summary: 'should not persist', tags: ['private'] },
    },
    aiResponses: { labels: ['raw label'], tree: 'raw tree', assignments: ['raw assignment'] },
    excludedBookmarkIds,
    createdAt,
    ...(draftId ? { draftId } : {}),
    ...(updatedAt === undefined ? {} : { updatedAt }),
    ...(scope.mode === 'full' ? {} : { scope }),
    ...(source ? { source } : {}),
    ...(application ? { application } : {}),
  };
}

async function testMissingAndMalformedStorageAreSafeEmpty() {
  globalThis.chrome = { storage: createStorage({
    classificationPlanArchive: { version: 'legacy', versions: [{ broken: true }] },
  }) };
  const { loadClassificationPlanArchive } = await importTypeScript('src/core/classificationPlanArchive.ts');

  const archive = await loadClassificationPlanArchive();
  assert.deepEqual(archive, { version: 1, versions: [] });
}

async function testArchiveKeepsOnlyCompactPlanData() {
  const storage = createStorage();
  globalThis.chrome = { storage };
  const {
    CLASSIFICATION_PLAN_ARCHIVE_STORAGE_KEY,
    archiveClassificationPlan,
    findClassificationPlanVersion,
    listClassificationPlanVersions,
  } = await importTypeScript('src/core/classificationPlanArchive.ts');
  const current = draft({
    draftId: 'draft-1',
    updatedAt: 20,
    scope: partialScope(),
    application: { appliedAt: 19, fingerprint: 'after-fingerprint', rootFolderId: 'root', changeSetId: 'change-1' },
  });

  const version = await archiveClassificationPlan(current);
  assert.equal(version.versionId, 'draft-1');
  assert.equal(version.draftId, 'draft-1');
  assert.equal(version.origin, 'replaced');
  assert.deepEqual(version.scope, partialScope());
  assert.deepEqual(version.excludedBookmarkIds, ['keep-here']);
  assert.equal(version.application?.changeSetId, 'change-1');
  assert.ok(Number.isFinite(version.archivedAt));

  const persisted = storage.values[CLASSIFICATION_PLAN_ARCHIVE_STORAGE_KEY];
  assert.equal(persisted.versions.length, 1);
  assert.equal('labels' in persisted.versions[0], false, '历史版本不得保存分类标签');
  assert.equal('aiResponses' in persisted.versions[0], false, '历史版本不得保存 AI 原始响应');
  assert.deepEqual(await listClassificationPlanVersions(), [version]);
  assert.deepEqual(await findClassificationPlanVersion('draft-1'), version);
  assert.equal(await findClassificationPlanVersion('missing'), null);

  current.tree[0].name = 'Mutated after archive';
  assert.equal((await findClassificationPlanVersion('draft-1'))?.tree[0].name, 'Engineering');
}

async function testLegacyVersionIdIsStableAndDeduplicated() {
  const storage = createStorage();
  globalThis.chrome = { storage };
  const {
    archiveClassificationPlan,
    getClassificationPlanVersionId,
    listClassificationPlanVersions,
  } = await importTypeScript('src/core/classificationPlanArchive.ts');
  const legacy = draft({ draftId: undefined, createdAt: 42, source: undefined });

  const stableId = getClassificationPlanVersionId(legacy);
  assert.match(stableId, /^legacy-/);
  const first = await archiveClassificationPlan(legacy);
  const second = await archiveClassificationPlan({ ...legacy, labels: { changed: { id: 'changed', summary: 'ignored', tags: [] } } });
  assert.equal(first.versionId, stableId);
  assert.equal(second.versionId, stableId);
  assert.equal(first.origin, 'legacy');
  assert.equal((await listClassificationPlanVersions()).length, 1, '同一 legacy 方案只能保留一个版本');
}

async function testArchiveDeduplicatesAndKeepsTheTenNewestVersions() {
  const storage = createStorage();
  globalThis.chrome = { storage };
  const { archiveClassificationPlan, listClassificationPlanVersions } = await importTypeScript('src/core/classificationPlanArchive.ts');
  const originalNow = Date.now;
  try {
    for (let index = 0; index < 11; index += 1) {
      Date.now = () => 1_000 + index;
      await archiveClassificationPlan(draft({ draftId: `draft-${index}`, createdAt: index }));
    }
    Date.now = () => 2_000;
    await archiveClassificationPlan(draft({ draftId: 'draft-5', createdAt: 5, updatedAt: 99 }));
  } finally {
    Date.now = originalNow;
  }

  const versions = await listClassificationPlanVersions();
  assert.equal(versions.length, 10);
  assert.equal(versions[0].versionId, 'draft-5', '重复归档应更新为最新归档版本');
  for (let index = 1; index < versions.length; index += 1) {
    assert.ok(
      versions[index - 1].archivedAt >= versions[index].archivedAt,
      '历史版本必须按归档时间倒序排列',
    );
  }
  assert.equal(versions.some((version) => version.versionId === 'draft-0'), false, '最旧版本应被淘汰');
  assert.equal(versions.some((version) => version.versionId === 'draft-1'), true);
  assert.equal(versions.find((version) => version.versionId === 'draft-5')?.updatedAt, 99);
}

async function testInvalidStoredVersionIsIgnoredWithoutDiscardingValidVersion() {
  const storage = createStorage({
    classificationPlanArchive: {
      version: 1,
      versions: [
        { version: 1, versionId: 'broken', tree: {}, scope: fullScope(), excludedBookmarkIds: [], createdAt: 1, archivedAt: 1 },
        {
          version: 1,
          versionId: 'valid',
          tree: [{ name: 'Valid', bookmarkIds: ['bookmark'] }],
          scope: fullScope(),
          excludedBookmarkIds: [],
          createdAt: 2,
          archivedAt: 3,
          labels: { must: 'be stripped on read too' },
        },
      ],
    },
  });
  globalThis.chrome = { storage };
  const { loadClassificationPlanArchive } = await importTypeScript('src/core/classificationPlanArchive.ts');

  const archive = await loadClassificationPlanArchive();
  assert.deepEqual(archive.versions.map((version) => version.versionId), ['valid']);
  assert.equal('labels' in archive.versions[0], false);
}

async function testArchiveWriteFailureIsSurfacedAndDoesNotPretendToSucceed() {
  globalThis.chrome = { storage: createStorage({}, { failSet: true }) };
  const { archiveClassificationPlan } = await importTypeScript('src/core/classificationPlanArchive.ts');

  await assert.rejects(() => archiveClassificationPlan(draft({ draftId: 'cannot-write' })), /storage write failed/);
}

async function run() {
  await testMissingAndMalformedStorageAreSafeEmpty();
  await testArchiveKeepsOnlyCompactPlanData();
  await testLegacyVersionIdIsStableAndDeduplicated();
  await testArchiveDeduplicatesAndKeepsTheTenNewestVersions();
  await testInvalidStoredVersionIsIgnoredWithoutDiscardingValidVersion();
  await testArchiveWriteFailureIsSurfacedAndDoesNotPretendToSucceed();
  console.log('classification plan archive tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
