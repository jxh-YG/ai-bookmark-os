import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const backgroundSource = readFileSync('src/timeline/background/background.js', 'utf8');
const start = backgroundSource.indexOf('function recommendationEvidenceFromTagResult(');
const end = backgroundSource.indexOf('async function reevaluateBookmarkRecommendations(', start);
assert.ok(start >= 0 && end > start, 'recommendation orchestration helpers should be present');

let store = { rules: [] };
let localTags = [];
let aiConfig = { enabled: true, apiKey: 'test-key', assistClassificationEnabled: true };
let aiResult = null;
let aiCalls = 0;
let nextRecommendationId = 0;
let existingFolderCandidates = [];
let profileFolderCandidates = [];

const context = {
  Array,
  Date,
  Map,
  Math,
  Number,
  Object,
  Promise,
  Set,
  String,
  URL,
  autoTagBookmark: async () => localTags,
  canonicalizeTagName: value => String(value || '').trim(),
  ensureRecommendationStore: async () => store,
  extractDomain: url => {
    try { return new URL(url).hostname; } catch { return ''; }
  },
  escapeFolderEvidenceRegExp: value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  getCanonicalCategoryTerms: value => value === 'API' ? ['API', '接口'] : [value],
  getAIConfig: async () => aiConfig,
  getStoredBookmarks: async () => [],
  keywordMatchesWhole: (keyword, text) => text.split(/\s+/).includes(keyword),
  loadBookmarkFolderOptions: async () => [],
  isCanonicalCategoryTag: value => ['AI', 'API', '开发', '设计'].includes(value),
  makeRecommendationId: () => `rec-${++nextRecommendationId}`,
  matchBookmarkFolderOption: (folders, path) => folders.find(folder => folder.path === path) || null,
  normalizeBookmarkFolderPath: path => String(path || '').split('/').map(part => part.trim()).filter(Boolean).join('/'),
  persistRecommendationSnapshot: async () => null,
  preloadSmartTaggerCaches: async () => undefined,
  scoreExistingFolderCandidates: () => existingFolderCandidates,
  scoreFolderPathEvidence: () => ({ score: 60, reasons: ['local-tag:ai'] }),
  scoreFolderProfileCandidates: () => profileFolderCandidates,
  scoreHistoricalFolderCandidates: () => [],
  sampleFolderBookmarks: bookmarks => bookmarks,
  suggestBookmarkWithAI: async () => {
    aiCalls += 1;
    return aiResult;
  },
};
context.self = context;
vm.createContext(context);
vm.runInContext(readFileSync('src/timeline/shared/recommendation-core.js', 'utf8'), context);
vm.runInContext(`${backgroundSource.slice(start, end)}; this.buildBookmarkRecommendation = buildBookmarkRecommendation;`, context);

const bookmark = {
  title: 'AI model reference',
  url: 'https://example.test/models/1',
  domain: 'example.test',
  metaDesc: 'artificial intelligence model',
};

store = {
  rules: [{
    id: 'user-folder',
    kind: 'domain_folder',
    pattern: 'example.test',
    target: '工作/AI',
    source: 'user',
    state: 'active',
  }],
};
aiCalls = 0;
let recommendation = await context.buildBookmarkRecommendation(bookmark, {
  folderOptions: [{ id: 'folder-ai', title: 'AI', path: '工作/AI' }],
  storedBookmarks: [],
  persist: false,
});
assert.equal(recommendation.folders[0].confidence, 'high');
assert.equal(recommendation.ai.triggered, false);
assert.equal(recommendation.ai.reason, 'local_high_confidence');
assert.equal(aiCalls, 0, '高置信已有目录不得调用 AI');

store = { rules: [] };
localTags = [{ tag: 'AI', score: 30, confidence: 0.4, signals: ['domain'] }];
aiResult = null;
aiCalls = 0;
recommendation = await context.buildBookmarkRecommendation(bookmark, {
  folderOptions: [],
  storedBookmarks: [],
  persist: false,
});
assert.equal(aiCalls, 1);
assert.equal(recommendation.ai.triggered, true);
assert.equal(recommendation.ai.reason, 'new_folder_needed');
assert.equal(recommendation.ai.status, 'unavailable');
assert.equal(recommendation.tags[0].tag, 'AI', 'AI 无结果时应保留本地候选');

aiConfig = { enabled: false, apiKey: '', assistClassificationEnabled: true };
aiCalls = 0;
recommendation = await context.buildBookmarkRecommendation(bookmark, {
  folderOptions: [],
  storedBookmarks: [],
  persist: false,
});
assert.equal(aiCalls, 0);
assert.equal(recommendation.ai.triggered, false);
assert.equal(recommendation.ai.status, 'disabled');

aiConfig = { enabled: true, apiKey: 'test-key', assistClassificationEnabled: true };
aiResult = {
  tags: [{ tag: 'AI', confidence: 0.95 }],
  folderPath: '工作/AI',
  summary: 'AI model reference',
  reason: 'AI and local evidence agree',
};
localTags = [{ tag: 'AI', score: 40, confidence: 0.6, signals: ['domain', 'keyword:ai', 'content-fingerprint:AI'] }];
aiCalls = 0;
recommendation = await context.buildBookmarkRecommendation(bookmark, {
  folderOptions: [],
  storedBookmarks: [],
  persist: false,
});
assert.equal(aiCalls, 1);
assert.equal(recommendation.ai.status, 'succeeded');
assert.equal(recommendation.folders[0].folderPath, '工作/AI');
assert.equal(recommendation.folders[0].exists, false);
assert.equal(recommendation.folders[0].confidence, 'high');
assert.ok(recommendation.folders[0].positiveFamilies.includes('ai'));
assert.ok(recommendation.folders[0].positiveFamilies.some(family => family !== 'ai'));

aiConfig = { enabled: false, apiKey: '', assistClassificationEnabled: true };
localTags = [{ tag: 'API', score: 30, confidence: 0.4, signals: ['domain'] }];
existingFolderCandidates = [];
profileFolderCandidates = [{
  id: 'api-relay',
  title: 'API中转',
  folderName: 'API中转',
  path: 'AI 整理/人工智能/API中转',
  folderPath: 'AI 整理/人工智能/API中转',
  exists: true,
  score: 100,
  count: 2,
  reasons: ['domain-history:newapi.bizdecipher.com', 'profile-content:2'],
}];
recommendation = await context.buildBookmarkRecommendation({
  title: 'API 密钥 - BizDecipher',
  url: 'https://newapi.bizdecipher.com/keys',
  domain: 'newapi.bizdecipher.com',
}, {
  folderOptions: [{ id: 'api-relay', title: 'API中转', path: 'AI 整理/人工智能/API中转' }],
  storedBookmarks: [],
  allowAI: false,
  persist: false,
});
assert.equal(recommendation.tags[0].tag, 'API');
assert.equal(recommendation.tags[0].confidence, 'high', '可靠目录画像与路径标签一致时应补强本地标签');
assert.ok(recommendation.tags[0].positiveFamilies.includes('history_profile'));

profileFolderCandidates = [];
existingFolderCandidates = [{
  id: 'api-name-only',
  title: 'API中转',
  folderName: 'API中转',
  path: 'AI 整理/人工智能/API中转',
  folderPath: 'AI 整理/人工智能/API中转',
  exists: true,
  score: 100,
  reasons: ['local-tag:api'],
}];
recommendation = await context.buildBookmarkRecommendation(bookmark, {
  folderOptions: [{ id: 'api-name-only', title: 'API中转', path: 'AI 整理/人工智能/API中转' }],
  storedBookmarks: [],
  allowAI: false,
  persist: false,
});
assert.notEqual(recommendation.tags[0].confidence, 'high', '只有目录名称匹配时不得循环抬高标签置信度');

console.log('recommendation orchestration tests passed');
