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
  normalizeImportedClassifyResult,
  normalizeImportedLabelCache,
  validateExportBundle,
} = await importTypeScript('src/core/validators.ts');

// ── classifyResult 规范化 ──
const validPlan = normalizeImportedClassifyResult({
  tree: [{ name: 'A', bookmarkIds: ['1'], children: [{ name: 'B', bookmarkIds: ['2'] }] }],
  labels: { '1': { id: '1', summary: 's', tags: ['t'] } },
  createdAt: 5,
});
assert.ok(validPlan && validPlan.tree.length === 1, '合法 classifyResult 必须通过');
assert.equal(validPlan.tree[0].children[0].name, 'B', '嵌套子树必须保留');
assert.equal(validPlan.createdAt, 5, 'createdAt 必须保留');

assert.equal(
  normalizeImportedClassifyResult({ tree: [{ bookmarkIds: ['1'] }] }),
  null,
  '缺少 name 的分类节点必须整体拒绝',
);
assert.equal(normalizeImportedClassifyResult({ tree: 'x' }), null, 'tree 非数组必须拒绝');
assert.equal(normalizeImportedClassifyResult('evil'), null, '字符串 payload 必须拒绝');
assert.equal(normalizeImportedClassifyResult(null), null, 'null 必须拒绝');
assert.equal(
  normalizeImportedClassifyResult({ tree: [{ name: 'A', bookmarkIds: [1, 2] }] }),
  null,
  '非字符串 bookmarkIds 必须拒绝',
);

// createdAt 非法时回退为当前时间而非拒绝
const noCreatedAt = normalizeImportedClassifyResult({ tree: [{ name: 'A' }] });
assert.ok(noCreatedAt && Number.isFinite(noCreatedAt.createdAt), 'createdAt 缺失时应回退为有限时间戳');

// ── labelCache 规范化：跳过非法条目，只并入合法项 ──
const cache = normalizeImportedLabelCache({
  good: { summary: 's', tags: ['t'] },
  badSummary: { summary: 5, tags: [] },
  badTags: { summary: 's', tags: [1] },
  junk: 'x',
});
assert.deepEqual(Object.keys(cache), ['good'], '仅保留结构合法的标签缓存条目');
assert.equal(normalizeImportedLabelCache('x'), null, '字符串 labelCache 必须整体拒绝');
assert.deepEqual(normalizeImportedLabelCache(undefined), {}, 'undefined labelCache 归一为空对象');

// ── 导出包头部版本边界 ──
assert.throws(
  () => validateExportBundle({ app: 'ai-bookmark-os', version: 999, exportedAt: 1 }),
  /INCOMPATIBLE_VERSION/,
  '高于最高兼容版本必须拒绝',
);
assert.throws(
  () => validateExportBundle({ app: 'ai-bookmark-os', version: 0, exportedAt: 1 }),
  /INCOMPATIBLE_VERSION/,
  '低于最低兼容版本必须拒绝',
);
assert.throws(
  () => validateExportBundle({ app: 'ai-bookmark-os', version: 1, exportedAt: NaN }),
  /INVALID_BUNDLE/,
  'NaN exportedAt 必须拒绝',
);
assert.throws(
  () => validateExportBundle({ app: 'unknown-app', version: 1, exportedAt: 1 }),
  /INVALID_BUNDLE/,
  '未知 app 标识必须拒绝',
);
assert.ok(
  validateExportBundle({ app: 'ai-bookmark-os', version: 1, exportedAt: 123 }),
  '合法头部必须通过',
);

// ── importBundle 端到端：确认规范化真正接入写入路径（防止 validator 只定义未调用）──
function createStorageEnv(initial = {}) {
  const values = structuredClone(initial);
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          if (keys === null) return structuredClone(values);
          const names = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(names.filter((n) => n in values).map((n) => [n, structuredClone(values[n])]));
        },
        async set(patch) { Object.assign(values, structuredClone(patch)); },
        async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) delete values[k]; },
      },
    },
  };
  return values;
}

const { importBundle } = await importTypeScript('src/core/transfer.ts');

// 损坏的 classifyResult 不得落盘；损坏的 labelCache 条目被剔除
{
  const store = createStorageEnv({ labelCache: { existing: { summary: 'old', tags: ['x'] } } });
  const result = await importBundle(JSON.stringify({
    app: 'ai-bookmark-os',
    version: 1,
    exportedAt: 1,
    classifyResult: { tree: [{ bookmarkIds: ['1'] }] }, // 缺 name → 非法
    labelCache: { good: { summary: 's', tags: ['t'] }, junk: 'x' },
  }));
  assert.equal(store.classifyResult, undefined, '损坏的 classifyResult 不得写入 storage');
  assert.equal(result.hasResult, false, '损坏的 classifyResult 必须报告未导入');
  assert.deepEqual(
    Object.keys(store.labelCache).sort(),
    ['existing', 'good'],
    '仅合法标签缓存条目并入，本地已有条目保留',
  );
}

// 合法 classifyResult 正常落盘并保留嵌套结构
{
  const store = createStorageEnv();
  await importBundle(JSON.stringify({
    app: 'ai-bookmark-os',
    version: 1,
    exportedAt: 1,
    classifyResult: {
      tree: [{ name: 'A', bookmarkIds: ['1'], children: [{ name: 'B', bookmarkIds: ['2'] }] }],
      labels: {},
      createdAt: 9,
    },
  }));
  assert.ok(store.classifyResult && store.classifyResult.tree[0].children[0].name === 'B', '合法分类结果必须完整写入');
}

// 非对象 settings（字符串）不得注入索引字符键
{
  const store = createStorageEnv({ settings: { language: 'zh', apiKey: 'local-key' } });
  await importBundle(JSON.stringify({
    app: 'ai-bookmark-os',
    version: 1,
    exportedAt: 1,
    settings: 'evil-string',
  }));
  assert.equal(store.settings.apiKey, 'local-key', '非对象 settings 不得覆盖本机 apiKey');
  assert.equal(store.settings['0'], undefined, '非对象 settings 不得注入索引字符键');
}

console.log('transfer import validation checks passed');
