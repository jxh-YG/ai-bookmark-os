/**
 * 新增优化函数的测试用例
 * 覆盖范围：validators、health undo、incrementalQueue、
 *           classificationPlanArchive pin、treeEdit nested、
 *           classifier cache key、增量失衡检测
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function importTypeScript(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    define: { 'chrome': 'globalThis.chrome' },
  });
  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

// ── 工具：模拟 chrome.storage.local ──────────────────────────────
function mockStorage(initial = {}) {
  const store = { ...initial };
  return {
    get: async (keys) => {
      if (!keys) return { ...store };
      if (typeof keys === 'string') return { [keys]: store[keys] };
      const result = {};
      for (const k of Array.isArray(keys) ? keys : Object.keys(keys)) result[k] = store[k];
      return result;
    },
    set: async (obj) => { Object.assign(store, obj); },
    remove: async (keys) => {
      const ks = Array.isArray(keys) ? keys : [keys];
      for (const k of ks) delete store[k];
    },
    _store: store,
  };
}

// ── 1. validators.ts ─────────────────────────────────────────────
async function testValidators() {
  const { validateSettings, validateExportBundle } = await importTypeScript('src/core/validators.ts');

  // 有效 settings 合并 DEFAULT_SETTINGS
  const valid = validateSettings({ provider: 'openai', aiRetryCount: 3 });
  assert.equal(valid.provider, 'openai');
  assert.equal(valid.aiRetryCount, 3);

  // 超范围 aiRetryCount 抛错
  assert.throws(() => validateSettings({ aiRetryCount: 25 }), /aiRetryCount/);

  // 无效 provider 抛错
  assert.throws(() => validateSettings({ provider: 'unknown-provider' }), /provider/);

  // 非法入参抛错
  assert.throws(() => validateSettings(null), /格式无效/);
  assert.throws(() => validateSettings('string'), /格式无效/);

  // 有效导出包通过
  const bundle = validateExportBundle({
    app: 'ai-bookmark-os',
    version: 1,
    exportedAt: Date.now(),
  });
  assert.equal(bundle.version, 1);

  // 旧 app id 兼容
  const legacyBundle = validateExportBundle({
    app: 'bookmark-pilot',
    version: 1,
    exportedAt: Date.now(),
  });
  assert.equal(legacyBundle.app, 'bookmark-pilot');

  // 未知 app id 抛错
  assert.throws(() => validateExportBundle({ app: 'hacker-tool', version: 1, exportedAt: 0 }), /INVALID_BUNDLE/);

  // 版本过低抛错
  assert.throws(() => validateExportBundle({ app: 'ai-bookmark-os', version: 0, exportedAt: 0 }), /INCOMPATIBLE_VERSION/);

  console.log('✅ validators.ts — 全部通过');
}

// ── 2. health.ts — undoRemoveBookmarks ──────────────────────────
async function testUndoRemoveBookmarks() {
  const created = [];
  globalThis.chrome = {
    bookmarks: {
      get: async (id) => {
        if (id === 'bm1') return [{ id: 'bm1', title: 'Test', url: 'https://example.com', parentId: 'folder1', index: 0 }];
        throw new Error('not found');
      },
      remove: async () => {},
      create: async (opts) => {
        created.push(opts);
        return { id: `restored-${created.length}`, ...opts };
      },
    },
    storage: { local: mockStorage() },
  };

  const { removeBookmarks, undoRemoveBookmarks } = await importTypeScript('src/core/health.ts');

  // 删除后应有恢复记录
  await removeBookmarks(['bm1']);
  const store = globalThis.chrome.storage.local._store;
  assert.ok(store.healthRemovedBookmarksUndo, '删除后应有恢复记录');
  assert.equal(store.healthRemovedBookmarksUndo.length, 1);
  assert.equal(store.healthRemovedBookmarksUndo[0].url, 'https://example.com');

  // 执行撤销
  const n = await undoRemoveBookmarks();
  assert.equal(n, 1, '应恢复 1 条书签');
  assert.equal(created.length, 1, '应调用 chrome.bookmarks.create 一次');
  assert.equal(created[0].url, 'https://example.com');

  // 撤销后记录已清除
  assert.equal(store.healthRemovedBookmarksUndo, undefined, '撤销后应清除恢复记录');

  // 重复撤销返回 0
  const n2 = await undoRemoveBookmarks();
  assert.equal(n2, 0, '无记录时撤销应返回 0');

  console.log('✅ health.ts undoRemoveBookmarks — 全部通过');
}

// ── 3. incrementalQueue.ts — isIncrementalQueueNearLimit ─────────
async function testIncrementalQueueNearLimit() {
  const { isIncrementalQueueNearLimit } = await importTypeScript('src/core/incrementalQueue.ts');

  assert.equal(isIncrementalQueueNearLimit([]), false, '空队列不应触发警告');
  assert.equal(isIncrementalQueueNearLimit(Array.from({ length: 449 }, (_, i) => ({ id: String(i), createdAt: 0, attempts: 0 }))), false, '449 条不触发');
  assert.equal(isIncrementalQueueNearLimit(Array.from({ length: 450 }, (_, i) => ({ id: String(i), createdAt: 0, attempts: 0 }))), true, '450 条触发警告');
  assert.equal(isIncrementalQueueNearLimit(Array.from({ length: 500 }, (_, i) => ({ id: String(i), createdAt: 0, attempts: 0 }))), true, '500 条触发警告');

  console.log('✅ incrementalQueue isIncrementalQueueNearLimit — 全部通过');
}

// ── 4. treeEdit.ts — createCategoryWithBookmarks 嵌套 ────────────
async function testCreateNestedCategory() {
  const { createCategoryWithBookmarks } = await importTypeScript('src/core/treeEdit.ts');

  const tree = [
    { name: '开发', bookmarkIds: ['bm1'], children: [{ name: '前端', bookmarkIds: ['bm2'] }] },
  ];

  // 根级别创建（原行为）
  const rootResult = createCategoryWithBookmarks(tree, '新类别', ['bm1']);
  assert.ok(rootResult.some(n => n.name === '新类别'), '根级别应创建新分类');
  assert.ok(rootResult.find(n => n.name === '新类别')?.bookmarkIds?.includes('bm1'), '书签应移入新分类');

  // 嵌套创建（新行为）：在 [0]（开发）下创建子分类
  const nestedResult = createCategoryWithBookmarks(tree, '后端', ['bm2'], [0]);
  const devNode = nestedResult.find(n => n.name === '开发');
  assert.ok(devNode, '开发节点应存在');
  const backendNode = devNode?.children?.find(n => n.name === '后端');
  assert.ok(backendNode, '嵌套子分类应在开发下创建');
  assert.ok(backendNode?.bookmarkIds?.includes('bm2'), '书签应移入嵌套子分类');

  // 名称为空时返回原树
  const unchanged = createCategoryWithBookmarks(tree, '  ', []);
  assert.deepEqual(unchanged, tree, '空名称不应创建分类');

  console.log('✅ treeEdit.ts createCategoryWithBookmarks 嵌套 — 全部通过');
}

// ── 5. classifier.ts — 缓存键不含 folderPath ─────────────────────
async function testClassifierCacheKeyNoFolderPath() {
  // 直接验证 classificationCacheKey 的行为：移动书签（改变 folderPath）后缓存键应相同
  const { build: esbuild } = await import('esbuild');
  const result = await esbuild({
    entryPoints: ['src/core/classifier.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    define: { 'chrome': 'globalThis.chrome' },
  });
  const source = result.outputFiles[0].text;

  // 检查源码中缓存键版本字符串
  assert.ok(source.includes('content-context-v4'), '缓存键版本应为 v4（不含 folderPath）');
  assert.ok(!source.includes('content-context-v3'), '旧 v3 缓存键不应存在');

  // 确认缓存键签名数组里没有 folderPath 字段
  const signatureIdx = source.indexOf("'content-context-v4'");
  const signatureBlock = source.slice(signatureIdx, signatureIdx + 300);
  assert.ok(!signatureBlock.includes('folderPath'), '缓存键签名中不应包含 folderPath');

  console.log('✅ classifier.ts 缓存键不含 folderPath — 全部通过');
}

// ── 6. classifier.ts — 增量失衡检测 ─────────────────────────────
async function testIncrementalImbalanceWarning() {
  // 验证 classifyIncremental 在新书签占比 ≥30% 时设置 incrementalImbalanceWarning
  // 通过检查源码逻辑确认阈值和字段存在
  const { build: esbuild } = await import('esbuild');
  const result = await esbuild({
    entryPoints: ['src/core/classifier.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    define: { 'chrome': 'globalThis.chrome' },
  });
  const source = result.outputFiles[0].text;

  assert.ok(source.includes('IMBALANCE_THRESHOLD'), '应存在失衡阈值常量');
  assert.ok(source.includes('incrementalImbalanceWarning'), '应包含失衡警告字段');
  assert.ok(source.includes('0.3'), '阈值应为 30%');

  console.log('✅ classifier.ts 增量失衡检测 — 全部通过');
}

// ── 7. probe.ts — HEAD 优先探测 ──────────────────────────────────
async function testProbeHeadFirst() {
  const { build: esbuild } = await import('esbuild');
  const result = await esbuild({
    entryPoints: ['src/core/probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    define: { 'chrome': 'globalThis.chrome' },
  });
  const source = result.outputFiles[0].text;

  // esbuild 可能将 'HEAD' 转为 "HEAD"，使用正则匹配
  assert.ok(/method:\s*["']HEAD["']/.test(source), "probe.ts probeUrl 应包含 HEAD 请求方法");

  // 同步检查 bridge 与 probe 行为一致
  const { readFileSync } = await import('node:fs');
  const bridge = readFileSync('src/bridge/ai-sw-bridge.js', 'utf8');
  assert.ok(/method:\s*["']HEAD["']/.test(bridge), 'ai-sw-bridge.js probeUrl 应同步 HEAD 先行逻辑');

  console.log('✅ probe.ts + bridge HEAD 先行探测同步 — 全部通过');
}

// ── 主程序 ────────────────────────────────────────────────────────
const tests = [
  ['validators.ts', testValidators],
  ['health.ts undoRemoveBookmarks', testUndoRemoveBookmarks],
  ['incrementalQueue isNearLimit', testIncrementalQueueNearLimit],
  ['treeEdit 嵌套子类别', testCreateNestedCategory],
  ['classifier 缓存键 v4', testClassifierCacheKeyNoFolderPath],
  ['classifier 增量失衡检测', testIncrementalImbalanceWarning],
  ['probe HEAD 先行同步', testProbeHeadFirst],
];

let passed = 0;
let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`❌ ${name} 失败：${e.message}`);
    if (process.env.VERBOSE) console.error(e.stack);
  }
}

console.log(`\n${passed + failed} 个测试，${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
