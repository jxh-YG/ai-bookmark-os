import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const backgroundSource = readFileSync('src/timeline/background/background.js', 'utf8');
const coreSource = readFileSync('src/timeline/shared/recommendation-core.js', 'utf8');
const start = backgroundSource.indexOf('function stableRecommendationId(');
const end = backgroundSource.indexOf('function normalizeLegacyDynamicRules(', start);
assert.ok(start >= 0 && end > start, 'recommendation learning helpers should be present');

const storage = new Map();
const mutationQueues = new Map();
const chrome = {
  storage: {
    local: {
      async get(keys) {
        const names = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(names.filter(key => storage.has(key)).map(key => [key, storage.get(key)]));
      },
      async set(values) {
        for (const [key, value] of Object.entries(values)) storage.set(key, value);
      },
      async remove(key) {
        storage.delete(key);
      },
    },
  },
};

function mutateStorageResource(key, mutation) {
  const previous = mutationQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const current = storage.get(key);
    const value = await mutation(current);
    if (value === undefined) storage.delete(key);
    else storage.set(key, value);
    return value;
  });
  mutationQueues.set(key, next);
  return next.finally(() => {
    if (mutationQueues.get(key) === next) mutationQueues.delete(key);
  });
}

const context = {
  Array,
  Date,
  JSON,
  Map,
  Math,
  Number,
  Object,
  Promise,
  Set,
  String,
  URL,
  chrome,
  crypto: globalThis.crypto,
  extractDomain: url => {
    try { return new URL(url).hostname; } catch { return ''; }
  },
  mutateStorageResource,
  normalizeBookmarkFolderPath: value => String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .map(part => part.trim())
    .filter(Boolean)
    .join('/'),
  normalizeTagList: values => [...new Set((Array.isArray(values) ? values : [])
    .map(value => typeof value === 'string' ? value.trim() : String(value?.tag || '').trim())
    .filter(Boolean))],
  RECOMMENDATION_STORE_KEY: 'bookmark_recommendation_store_v2',
  RECOMMENDATION_STORE_VERSION: 2,
  RECOMMENDATION_SNAPSHOT_TTL_MS: 7 * 24 * 60 * 60 * 1000,
  RECOMMENDATION_FEEDBACK_TTL_MS: 180 * 24 * 60 * 60 * 1000,
  RECOMMENDATION_MAX_SNAPSHOTS: 200,
  RECOMMENDATION_MAX_FEEDBACK: 5000,
  RECOMMENDATION_MAX_REVIEWS: 200,
  programmaticBookmarkMoves: new Map(),
  runIdempotentOperation: (_type, _id, operation) => operation(),
};
context.self = context;
vm.createContext(context);
vm.runInContext(coreSource, context);
vm.runInContext(`${backgroundSource.slice(start, end)}; this.learning = {
  emptyRecommendationStore,
  migrateLegacyRecommendationStore,
  normalizeRecommendationStore,
  recomputeLearnedRuleStates,
  submitRecommendationFeedback,
  getRecommendationLearningState,
  mutateRecommendationRule,
  rebuildRecommendationLearning
};`, context);

const learning = context.learning;
const STORE_KEY = context.RECOMMENDATION_STORE_KEY;

const migrated = learning.migrateLegacyRecommendationStore({
  domainRules: [
    { domains: ['example.com'], tag: '开发' },
    { domains: ['linkedin.com/learning'], tag: '学习' },
  ],
  urlPathRules: [{ patterns: ['/docs/'], tag: '文档' }],
  keywordRules: { AI: ['transformer'] },
  stopWords: ['广告'],
  learnedDomainTag: { 'legacy.example': { tag: '旧目录', count: 8 } },
}, [{ id: 'legacy-review' }], { totalReviewed: 4, totalAccepted: 2 });
assert.ok(migrated.rules.some(rule => rule.kind === 'domain_tag' && rule.pattern === 'example.com' && rule.state === 'active'));
assert.ok(migrated.rules.some(rule => rule.kind === 'domain_path_tag' && rule.pattern === 'linkedin.com/learning' && rule.state === 'active'));
assert.ok(migrated.rules.some(rule => rule.kind === 'path_tag' && rule.pattern === '/docs/' && rule.state === 'active'));
assert.ok(migrated.rules.some(rule => rule.kind === 'keyword_tag' && rule.pattern === 'transformer' && rule.state === 'active'));
assert.ok(migrated.rules.some(rule => rule.source === 'legacy' && rule.state === 'candidate' && rule.legacyCount === 8));
assert.equal(migrated.reviewQueue[0].legacy, true);

function snapshot(id, fingerprint, domain, folderPath = '工作/开发', tags = ['开发']) {
  return {
    recommendationId: id,
    ruleVersion: 'bookmark-recommendation-v2',
    urlFingerprint: fingerprint,
    domain,
    pathSegments: [],
    tags: tags.map(tag => ({ tag, support: 0.9, confidence: 'high' })),
    folders: [{ id: `folder-${id}`, folderPath, existing: true, support: 0.9, confidence: 'high' }],
    createdAt: Date.now(),
  };
}

const store = learning.emptyRecommendationStore();
store.snapshots = [
  snapshot('rec-1', 'url-1', 'activate.example'),
  snapshot('rec-2', 'url-2', 'activate.example'),
  snapshot('rec-3', 'url-3', 'activate.example', '工作/设计', ['设计']),
  snapshot('reverse-1', 'reverse-url-1', 'reverse.example'),
  snapshot('reverse-2', 'reverse-url-2', 'reverse.example'),
  snapshot('reverse-3', 'reverse-url-3', 'reverse.example'),
  snapshot('reverse-4', 'reverse-url-4', 'reverse.example'),
  snapshot('reverse-5', 'reverse-url-5', 'reverse.example'),
  snapshot('cancel-1', 'cancel-url-1', 'cancel.example'),
];
storage.set(STORE_KEY, store);

async function submit(operationId, recommendationId, outcome = 'accepted', selection = { folderPath: '工作/开发', tags: ['开发'] }, changedFields = []) {
  return learning.submitRecommendationFeedback({ operationId, recommendationId, outcome, selection, changedFields });
}

await Promise.all([
  submit('accept-1', 'rec-1'),
  submit('accept-2', 'rec-2'),
]);
let state = await learning.getRecommendationLearningState();
let learnedFolder = state.rules.find(rule => rule.kind === 'domain_folder' && rule.pattern === 'activate.example' && rule.target === '工作/开发');
let learnedTag = state.rules.find(rule => rule.kind === 'domain_tag' && rule.pattern === 'activate.example' && rule.target === '开发');
assert.equal(learnedFolder.state, 'active', '两个不同 URL 的一致确认应激活目录规则');
assert.equal(learnedTag.state, 'active', '两个不同 URL 的一致确认应激活标签规则');

await submit('accept-1', 'rec-1');
state = await learning.getRecommendationLearningState();
assert.equal(state.recentFeedback.filter(item => item.operationId === 'accept-1').length, 1, '重复 operationId 不得重复学习');
assert.equal(state.stats.total, 2);

await submit('conflict-1', 'rec-3', 'accepted', { folderPath: '工作/设计', tags: ['设计'] });
state = await learning.getRecommendationLearningState();
assert.ok(state.rules.filter(rule => rule.pattern === 'activate.example' && rule.kind === 'domain_folder').every(rule => rule.state === 'conflicted'));

await submit('reverse-accept-1', 'reverse-1');
await submit('reverse-accept-2', 'reverse-2');
state = await learning.getRecommendationLearningState();
assert.equal(state.rules.find(rule => rule.pattern === 'reverse.example' && rule.kind === 'domain_folder').state, 'active');

await submit('reverse-reject', 'reverse-3', 'rejected', {}, []);
state = await learning.getRecommendationLearningState();
learnedFolder = state.rules.find(rule => rule.pattern === 'reverse.example' && rule.kind === 'domain_folder');
assert.equal(learnedFolder.state, 'candidate');
assert.equal(learnedFolder.positiveFingerprints.length, 0, '反向反馈后应开启新的确认轮次');
assert.equal(learnedFolder.negativeFingerprints.length, 1);

await submit('reverse-accept-3', 'reverse-4');
state = await learning.getRecommendationLearningState();
assert.equal(state.rules.find(rule => rule.pattern === 'reverse.example' && rule.kind === 'domain_folder').state, 'candidate');
await submit('reverse-accept-4', 'reverse-5');
state = await learning.getRecommendationLearningState();
assert.equal(state.rules.find(rule => rule.pattern === 'reverse.example' && rule.kind === 'domain_folder').state, 'active');

await submit('cancel-flow', 'cancel-1', 'cancelled', {}, []);
state = await learning.getRecommendationLearningState();
assert.equal(state.stats.cancelled, 1);
assert.equal(state.rules.some(rule => rule.pattern === 'cancel.example'), false, '取消只记录流程统计，不产生负样本');

const feedbackCountBeforeUndo = state.recentFeedback.filter(item => item.outcome !== 'cancelled' && !item.undone).length;
const statsTotalBeforeUndo = state.stats.total;
await learning.mutateRecommendationRule({ operationId: 'undo-1', mutation: 'undo_last' });
state = await learning.getRecommendationLearningState();
assert.equal(state.recentFeedback.find(item => item.operationId === 'cancel-flow').undone, undefined, '撤销最近学习应跳过取消记录');
assert.equal(state.recentFeedback.filter(item => item.outcome !== 'cancelled' && !item.undone).length, feedbackCountBeforeUndo - 1);
assert.equal(state.stats.total, statsTotalBeforeUndo - 1);

const feedbackCount = state.recentFeedback.length;
await learning.rebuildRecommendationLearning('rebuild-1');
await learning.rebuildRecommendationLearning('rebuild-1');
state = await learning.getRecommendationLearningState();
assert.equal(state.recentFeedback.length, feedbackCount, '重复重建不得复制反馈');

const missing = await submit('missing-rec', 'does-not-exist');
assert.deepEqual({ ...missing }, { success: false, error: 'recommendation_not_found' });

console.log('recommendation learning tests passed');
