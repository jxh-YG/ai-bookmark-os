import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const storage = {};
globalThis.chrome = {
  runtime: {
    async sendMessage(message) {
      if (message.action === 'labelCacheGet') return { success: true, cache: {} };
      if (message.action === 'labelCacheMerge') return { success: true, cache: {} };
      return { success: true };
    },
  },
  storage: {
    local: {
      async get(keys) {
        if (keys === null) return structuredClone(storage);
        const names = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(names.filter((name) => name in storage).map((name) => [name, structuredClone(storage[name])]));
      },
      async set(values) {
        Object.assign(storage, structuredClone(values));
      },
      async remove(keys) {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
      },
    },
  },
};

const settings = {
  provider: 'custom',
  customApiStyle: 'openai',
  customFullUrl: true,
  baseUrl: 'https://api.test/chat',
  apiKey: 'invalid-token',
  model: 'test-model',
  useClassificationCache: false,
  usePageMetadata: false,
  allowPageContentForAi: false,
  respectExistingFolders: false,
  useBuiltInClassificationRules: false,
  labelBatchSize: 10,
  labelConcurrency: 2,
  assignBatchSize: 10,
  aiRetryCount: 0,
  aiRequestTimeoutSeconds: 5,
};
const bookmarks = Array.from({ length: 30 }, (_, index) => ({
  id: `bookmark-${index}`,
  title: `Bookmark ${index}`,
  url: `https://example.test/${index}`,
  folderPath: 'Inbox',
}));

let requests = 0;
let siblingAborts = 0;
globalThis.fetch = async (_url, options) => {
  requests += 1;
  if (requests === 1) {
    return {
      ok: false,
      status: 401,
      text: async () => JSON.stringify({
        error: {
          message: 'Your authentication token has been invalidated. secret-provider-payload',
        },
      }),
    };
  }
  return new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      siblingAborts += 1;
      reject(new DOMException('aborted', 'AbortError'));
    }, { once: true });
  });
};

const { classify, classifyIncremental } = await importTypeScript('src/core/classifier.ts');
const progress = [];
const controller = new AbortController();
await assert.rejects(
  () => classify(settings, bookmarks, (next) => progress.push(next), controller.signal, { mode: 'full' }, { persist: false }),
  (error) => {
    assert.match(error.message, /身份验证失败 \(401\)/);
    assert.doesNotMatch(error.message, /secret-provider-payload/);
    return true;
  },
);
await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(requests, 2, '并发批次中首个致命错误后不得启动后续批次');
assert.equal(siblingAborts, 1, '同一分类任务中仍在等待的并发请求必须被联动中止');
assert.equal(controller.signal.aborted, false, '内部失败不得伪装成用户主动取消');
assert.deepEqual(progress, [{ phase: 'labeling', done: 0, total: bookmarks.length }], '分类失败后不得再发布晚到进度');
assert.equal(storage.classifyResult, undefined, '失败任务不得写入分类草稿');

const existing = {
  tree: [{ name: 'Existing', bookmarkIds: ['bookmark-0'] }],
  labels: {},
  createdAt: 1,
};
const incrementalProgress = [];
const requestsBeforeIdempotentRun = requests;
const incrementalResult = await classifyIncremental(
  settings,
  [bookmarks[0]],
  existing,
  (next) => incrementalProgress.push(next),
  new AbortController().signal,
  { persist: false },
);
assert.strictEqual(incrementalResult, existing, '已存在于方案树的队列项应直接视为已提交');
assert.equal(requests, requestsBeforeIdempotentRun, '幂等增量归类不得再次调用 AI');

const app = readFileSync('src/sidepanel/App.tsx', 'utf8');
assert.match(app, /const running = classificationPending && runningPhase;/, '运行态必须同时受任务锁和阶段进度约束');
assert.match(app, /classificationRunRef\.current === runId/, '进度回调必须校验当前任务归属');
assert.match(app, /useEffect\(\(\) => \(\) => \{[\s\S]{0,180}abortRef\.current\?\.abort\(\)/, '侧栏卸载时必须中止仍在执行的分类任务');
assert.match(app, /running && abortRef\.current[\s\S]{0,180}cancelClassify/, '运行时取消入口必须优先于工作区分支');
assert.match(app, /lease\.fail\(ids,[\s\S]{0,900}finishClassificationProgress/, '增量分类失败必须写入明确终态');
assert.match(
  app,
  /if \(committed\) \{[\s\S]{0,700}phase: 'done'[\s\S]{0,700}return;[\s\S]{0,100}\} else if/,
  '增量方案提交后即使界面刷新失败，也不得落入队列失败标记或覆盖成功终态',
);
assert.match(
  app,
  /currentResult\?\.scope\?\.mode === 'partial'[\s\S]{0,120}\? \[\][\s\S]{0,120}: collectPlannedBookmarkIds/,
  '局部分类方案不得用于确认全量增量队列',
);
assert.match(
  app,
  /await lease\.complete\(settledIds\);[\s\S]{0,180}lease\.release\(settledIds\)[\s\S]{0,220}scheduleTickRetry/,
  '已删除或已提交条目的队列确认失败后必须释放并安排重试',
);
assert.match(
  app,
  /await saveClassifyResult\(expanded\);[\s\S]{0,100}committed = true;[\s\S]{0,1300}catch \(e\)[\s\S]{0,100}if \(committed\)[\s\S]{0,250}phase: 'done'/,
  '全量或局部分类方案保存成功后，界面刷新失败不得覆盖为分类失败',
);
assert.match(
  app,
  /await retryIncrementalQueue\(ids\);[\s\S]{0,220}setError\(''\)/,
  '失败增量任务重新排队后必须清除旧错误提示',
);
assert.match(
  app,
  /await abandonIncrementalQueue\(ids\);[\s\S]{0,180}setError\(''\)/,
  '放弃失败增量任务后必须清除旧错误提示',
);

console.log('classification lifecycle regression checks passed');
