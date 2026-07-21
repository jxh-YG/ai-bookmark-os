import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/timeline/background/background.js', 'utf8');
const aiTaggerSource = readFileSync('src/timeline/shared/ai-tagger.js', 'utf8');
const smartTaggerSource = readFileSync('src/timeline/shared/smart-tagger.js', 'utf8');

const storage = new Map();
let fetchImpl = async () => { throw new Error('network should not be used by unit tests'); };
const chromeStub = {
  storage: {
    local: {
      async get(keys) {
        const names = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(names.filter(name => storage.has(name)).map(name => [name, storage.get(name)]));
      },
      async set(values) {
        for (const [key, value] of Object.entries(values)) storage.set(key, value);
      },
      async remove(key) {
        storage.delete(key);
      },
    },
  },
  runtime: { sendMessage: async () => ({}) },
};

const aiContext = {
  AbortController,
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
  chrome: chromeStub,
  clearTimeout,
  console,
  fetch: (...args) => fetchImpl(...args),
  setTimeout,
};
vm.createContext(aiContext);
vm.runInContext(`${aiTaggerSource}; this.aiHelpers = {
  mergeAITags,
  parseAIClassification,
  parseBookmarkSuggestion,
  suggestBookmarkWithAI
};`, aiContext);

const { mergeAITags, parseAIClassification, parseBookmarkSuggestion, suggestBookmarkWithAI } = aiContext.aiHelpers;

const parsedClassification = parseAIClassification(
  '[{"tag":"AI","confidence":0.9},{"tag":"AI","confidence":0.7}]',
  ['AI', '开发'],
);
assert.deepEqual([...parsedClassification].map(item => item.tag), ['AI']);
assert.equal(parseAIClassification('[{"tag":"其他","confidence":0.99}]', ['AI']), null);

const parsedSuggestion = parseBookmarkSuggestion(JSON.stringify({
  tags: [
    { tag: ' AI ', confidence: 0.92 },
    { tag: 'ai', confidence: 0.8 },
    { tag: '其他', confidence: 0.99 },
    { tag: '前端开发', confidence: 0.72 },
    { tag: '低置信标签', confidence: 0.2 },
    { tag: 123, confidence: 0.95 },
    { tag: '---', confidence: 0.94 },
  ],
  folderPath: 'Bookmarks bar / 开发 // 前端',
  summary: 'React component guide',
  reason: '页面内容与前端开发相关',
}), ['AI', '开发']);
assert.deepEqual([...parsedSuggestion.tags].map(item => item.tag), ['AI', '前端开发']);
assert.equal(parsedSuggestion.folderPath, '开发/前端');
assert.equal(parseBookmarkSuggestion('{}', ['AI']), null);

storage.set('ai_classifier_config', {
  enabled: true,
  assistClassificationEnabled: true,
  provider: 'openai',
  apiKey: 'test-key',
  timeout: 3,
});
let capturedPrompt = '';
fetchImpl = async (_url, options) => {
  capturedPrompt = JSON.parse(options.body).messages[0].content;
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            tags: [{ tag: '开发', confidence: 0.91 }],
            folderPath: '开发/前端',
            summary: 'React hooks guide',
            reason: '技术教程',
          }),
        },
      }],
    }),
  };
};
const aiSuccess = await suggestBookmarkWithAI({
  title: 'React useEffect guide',
  url: 'https://example.test/react',
  domain: 'example.test',
  contentText: 'A practical React hooks guide with useEffect examples and cleanup patterns.'.repeat(3),
  headings: ['React Hooks', 'useEffect cleanup'],
  metaKeywords: ['React', 'hooks'],
  structuredTypes: ['TechArticle'],
}, [{ tag: '开发', score: 30 }], { folderOptions: [{ path: '开发/前端' }] });
assert.deepEqual([...aiSuccess.tags].map(item => item.tag), ['开发']);
assert.equal(aiSuccess.folderPath, '开发/前端');
assert.match(capturedPrompt, /React useEffect guide/);
assert.match(capturedPrompt, /https:\/\/example\.test\/react/);
assert.match(capturedPrompt, /useEffect cleanup/);
assert.match(capturedPrompt, /practical React hooks guide/);

fetchImpl = async () => { throw new Error('simulated network failure'); };
assert.equal(await suggestBookmarkWithAI(
  { title: 'React guide', url: 'https://example.test/react', domain: 'example.test' },
  [{ tag: '开发', score: 30 }],
  { folderOptions: [] },
), null);

const start = source.indexOf('const BROWSER_BOOKMARK_ROOT_TITLES = new Set([');
const end = source.indexOf('async function prepareBookmarkSuggestion(');

assert.ok(start >= 0 && end > start, 'bookmark suggestion helpers should be present');

const context = {
  Set,
  String,
  Array,
  Object,
  Date,
  extractDomain: url => new URL(url).hostname,
  mergeAITags,
};
vm.createContext(context);
vm.runInContext(`${source.slice(start, end)}; this.helpers = {
  normalizeTagList,
  normalizeBookmarkFolderPath,
  sampleFolderBookmarks,
  matchBookmarkFolderOption,
  chooseAISuggestedFolder,
  scoreExistingFolderCandidates,
  scoreFolderProfileCandidates,
  chooseBestBookmarkFolderCandidate,
  scoreHistoricalFolderCandidates,
  buildLocalBookmarkSuggestion
};`, context);

const {
  normalizeTagList,
  normalizeBookmarkFolderPath,
  sampleFolderBookmarks,
  matchBookmarkFolderOption,
  chooseAISuggestedFolder,
  scoreExistingFolderCandidates,
  scoreFolderProfileCandidates,
  chooseBestBookmarkFolderCandidate,
  scoreHistoricalFolderCandidates,
  buildLocalBookmarkSuggestion,
} = context.helpers;

assert.deepEqual([...normalizeTagList([' docs ', { tag: 'docs' }, { tag: 'AI' }])], ['docs', 'AI']);
assert.deepEqual([...normalizeTagList(['24', '40', '企业协同', '1.2.3'])], ['企业协同']);
assert.equal(normalizeBookmarkFolderPath('Bookmarks bar/Work / Project'), 'Work/Project');
assert.equal(normalizeBookmarkFolderPath('Other bookmarks/Work/Project'), 'Work/Project');
const sampleSource = [
  ...Array.from({ length: 12 }, (_, index) => ({ id: `a-${index}`, folderPath: 'Work/A' })),
  ...Array.from({ length: 4 }, (_, index) => ({ id: `b-${index}`, folderPath: 'Work/B' })),
  { id: 'root', folderPath: '' },
];
const sampledFolders = sampleFolderBookmarks(sampleSource, () => 0);
assert.equal(sampledFolders.filter(item => item.folderPath === 'Work/A').length, 10);
assert.equal(sampledFolders.filter(item => item.folderPath === 'Work/B').length, 4);
assert.equal(sampledFolders.some(item => item.id === 'root'), false);
assert.notDeepEqual(
  [...sampleFolderBookmarks(sampleSource, () => 0)].map(item => item.id),
  [...sampleFolderBookmarks(sampleSource, () => 0.999999)].map(item => item.id),
  '超过 10 条时应使用随机样本而不是固定前 10 条',
);
assert.deepEqual(
  { ...matchBookmarkFolderOption([{ id: '42', path: 'Work/Project' }], 'Bookmarks bar/Work/Project') },
  { id: '42', path: 'Work/Project' },
);
const folderOptions = [
  { id: 'plugin-folder', title: '插件', path: '工具/插件' },
  { id: 'mysql-folder', title: 'mysql', path: '数据库/mysql' },
  { id: 'redis-folder', title: 'Redis', path: '数据库/Redis' },
  { id: 'design-folder', title: '设计系统', path: '产品/设计系统' },
  { id: 'notion-folder', title: 'Notion', path: '工具/插件/Notion' },
];
const pluginBookmark = {
  title: 'Notion Forms browser plugin',
  url: 'https://notionforms.io/plugin/contact',
  domain: 'notionforms.io',
  metaDesc: 'Install a Notion forms plugin for browser workflows'
};
assert.equal(chooseAISuggestedFolder(
  'AI/Research',
  folderOptions,
  pluginBookmark,
  [{ tag: '插件', score: 30 }],
  { tags: [{ tag: '插件', confidence: 0.7 }], folderPath: 'AI/Research' },
), null);
const acceptedAiFolder = chooseAISuggestedFolder(
  '工具/插件/Notion',
  folderOptions,
  pluginBookmark,
  [{ tag: '插件', score: 30 }],
  { tags: [{ tag: '插件', confidence: 0.7 }], folderPath: '工具/插件/Notion' },
);
assert.equal(acceptedAiFolder.path, '工具/插件/Notion');
assert.equal(acceptedAiFolder.id, 'notion-folder');
assert.equal(acceptedAiFolder.exists, true);
assert.equal(acceptedAiFolder.score, 49);
assert.deepEqual([...acceptedAiFolder.reasons], ['local-tag:插件', 'ai-tag:插件', 'content:notion']);
assert.deepEqual(scoreExistingFolderCandidates(
  folderOptions,
  [],
  { title: 'Design System tokens', url: 'https://example.test/design-system', metaDesc: '组件库与设计系统规范' },
  null,
).map(item => item.folderPath).join('|'), '产品/设计系统');
assert.deepEqual(scoreExistingFolderCandidates(
  folderOptions,
  ['缓存'],
  { title: 'Redis cache invalidation guide', url: 'https://example.test/redis-cache', metaDesc: 'Redis cache patterns' },
  null,
).map(item => item.folderPath).join('|'), '数据库/Redis');
assert.deepEqual(scoreHistoricalFolderCandidates(
  [
    { tags: ['插件'], folderName: 'mysql', folderPath: '数据库/mysql' },
    { tags: ['插件'], folderName: 'mysql', folderPath: '数据库/mysql' },
    { tags: ['插件'], folderName: '插件', folderPath: '工具/插件' },
  ],
  ['插件'],
  pluginBookmark,
  null,
  folderOptions,
).map(item => item.folderPath).join('|'), '工具/插件');
assert.deepEqual(scoreHistoricalFolderCandidates(
  [{ tags: ['插件'], folderName: '已删除', folderPath: '已删除/插件' }],
  ['插件'],
  pluginBookmark,
  null,
  folderOptions,
).length, 0);
assert.equal(chooseBestBookmarkFolderCandidate([
  ...scoreHistoricalFolderCandidates(
    [{ tags: ['插件'], folderName: '插件', folderPath: '工具/插件' }],
    ['插件'],
    pluginBookmark,
    null,
    folderOptions,
  ),
  ...scoreExistingFolderCandidates(folderOptions, ['插件'], pluginBookmark, null),
])?.folderPath, '工具/插件/Notion');
const profileFolders = [
  ...folderOptions,
  { id: 'lab-folder', title: '灵感库', path: '灵感库' },
  { id: 'ux-folder', title: '体验参考', path: '体验参考' },
];
const profileBookmarks = [
  { title: 'Notion Forms plugin setup', url: 'https://notionforms.io/plugin/setup', domain: 'notionforms.io', metaDesc: 'Browser plugin for Notion forms', tags: ['插件'], folderName: 'Notion', folderPath: '工具/插件/Notion' },
  { title: 'Interactive onboarding flow examples', url: 'https://example.test/onboarding-flow', domain: 'example.test', metaDesc: 'Product onboarding patterns and activation ideas', tags: ['产品'], folderName: '灵感库', folderPath: '灵感库' },
  { title: 'Activation checklist patterns', url: 'https://example.test/activation-checklist', domain: 'example.test', metaDesc: 'User onboarding checklist for SaaS products', tags: ['产品'], folderName: '灵感库', folderPath: '灵感库' },
  { title: 'Button hover motion reference', url: 'https://ux.example.test/motion', domain: 'ux.example.test', metaDesc: 'Micro interaction and hover motion design', tags: ['设计'], folderName: '体验参考', folderPath: '体验参考' },
];
assert.equal(scoreFolderProfileCandidates(
  profileBookmarks,
  profileFolders,
  { title: 'Notion Forms embed plugin', url: 'https://notionforms.io/embed/plugin', domain: 'notionforms.io', metaDesc: 'Install plugin for Notion forms' },
  ['插件'],
  null,
)[0]?.folderPath, '工具/插件/Notion');
assert.equal(scoreFolderProfileCandidates(
  profileBookmarks,
  profileFolders,
  { title: 'SaaS onboarding checklist examples', url: 'https://another.test/onboarding-checklist', domain: 'another.test', metaDesc: 'Product activation and onboarding flow patterns' },
  ['产品'],
  null,
)[0]?.folderPath, '灵感库');
assert.equal(scoreFolderProfileCandidates(
  profileBookmarks,
  profileFolders,
  { title: 'Release notes', url: 'https://unrelated.test/releases', domain: 'unrelated.test', metaDesc: 'Version changelog and downloads' },
  ['产品'],
  null,
).length, 0);
assert.equal(scoreFolderProfileCandidates(
  [{
    title: 'Reference',
    url: 'https://old.test/reference',
    domain: 'old.test',
    contentExcerpt: 'quantum lattice methods',
    folderName: 'Research',
    folderPath: 'Research',
  }],
  [{ id: 'research-folder', title: 'Research', path: 'Research' }],
  {
    title: 'Paper',
    url: 'https://new.test/paper',
    domain: 'new.test',
    contentMetaDesc: 'quantum lattice overview',
  },
  [],
  null,
)[0]?.folderPath, 'Research', '本地画像应使用已保存的页面摘要字段');
assert.equal(scoreFolderProfileCandidates(
  [{
    title: 'Archive item',
    url: 'https://old.test/archive',
    domain: 'old.test',
    contentText: 'quantum lattice tensor simulation methods and benchmark results',
    contentHeadings: ['Quantum lattice experiments'],
    folderName: 'Research',
    folderPath: 'Research',
  }],
  [{ id: 'research-folder', title: 'Research', path: 'Research' }],
  {
    title: 'Reference',
    url: 'https://new.test/reference',
    domain: 'new.test',
    contentText: 'quantum lattice tensor simulation methods with reproducible benchmark results',
    contentHeadings: ['Quantum lattice methods'],
  },
  [],
  null,
)[0]?.folderPath, 'Research', '当前正文必须与目录内历史正文共同参与本地画像匹配');
const aiRelayFolders = [
  { id: 'ai-public-folder', title: '公益导航', path: 'AI 整理/人工智能/公益导航' },
  { id: 'ai-relay-folder', title: 'API中转', path: 'AI 整理/人工智能/API中转' },
];
const aiRelayBookmark = {
  title: '1024Token Subscription to API',
  url: 'https://token.club',
  domain: 'token.club',
  metaDesc: '统一 AI API 接入与中转服务，支持 Claude、GPT、Gemini 模型',
};
const aiRelaySuggestion = {
  tags: [{ tag: 'AI', confidence: 0.8 }],
  summary: '1024Token 是一个将订阅转换为统一 AI API 的平台',
  reason: '页面核心用途是提供 AI 模型统一 API 接入与中转服务，最匹配人工智能下的 API 中转分类。',
};
const broadHistory = Array.from({ length: 8 }, (_, idx) => ({
  title: `AI public directory ${idx}`,
  url: `https://public-ai-${idx}.test`,
  domain: `public-ai-${idx}.test`,
  metaDesc: 'AI tools and public navigation',
  tags: ['AI', '开发', '工具'],
  folderName: '公益导航',
  folderPath: 'AI 整理/人工智能/公益导航',
}));
assert.equal(chooseBestBookmarkFolderCandidate([
  ...scoreHistoricalFolderCandidates(broadHistory, ['AI', '开发', '工具'], aiRelayBookmark, aiRelaySuggestion, aiRelayFolders),
  ...scoreExistingFolderCandidates(aiRelayFolders, ['AI', '开发', '工具'], aiRelayBookmark, aiRelaySuggestion),
])?.folderPath, 'AI 整理/人工智能/API中转');

const apiRelayEvidenceFolders = [
  { id: 'ai-coding-folder', title: 'AI coding', path: 'AI/\u4eba\u5de5\u667a\u80fd/AI\u7f16\u7a0b' },
  { id: 'api-relay-folder', title: 'API relay', path: 'AI/\u4eba\u5de5\u667a\u80fd/\u63a5\u53e3\u4e2d\u8f6c' },
];
const apiRelayEvidenceCandidates = scoreExistingFolderCandidates(
  apiRelayEvidenceFolders,
  ['API', 'AI'],
  {
    title: 'Free LLM API relay',
    url: 'https://example.test/api-relay',
    domain: 'example.test',
    metaDesc: 'A unified API interface relay for LLM models, compatible with AI coding tools.',
  },
  {
    tags: [{ tag: 'AI', confidence: 0.8 }],
    reason: '\u8fd9\u662f\u4e00\u9879\u5927\u6a21\u578b\u63a5\u53e3\u4e2d\u8f6c\u670d\u52a1\uff0c\u540c\u65f6\u53ef\u7528\u4e8e AI \u7f16\u7a0b\u5de5\u5177\u3002',
    evidence: ['\u63a5\u53e3\u4e2d\u8f6c'],
  },
);
assert.equal(apiRelayEvidenceCandidates[0]?.folderPath, 'AI/\u4eba\u5de5\u667a\u80fd/\u63a5\u53e3\u4e2d\u8f6c');
assert.equal(apiRelayEvidenceCandidates[0]?.leafExactContentMatches, 1);

const draft = buildLocalBookmarkSuggestion(
  { title: 'Example', url: 'https://example.test', domain: 'example.test' },
  [{ tag: '开发', score: 50, signals: ['folder'] }],
  { id: 'folder-1', title: 'Local', path: 'Local' },
  { tags: [{ tag: 'AI', confidence: 0.6 }], folderPath: 'AI/Research', summary: 'AI summary', reason: 'AI reason' },
  '',
);
assert.deepEqual([...draft.tags], ['开发', 'AI']);
assert.equal(draft.folderPath, 'Local');
assert.equal(draft.summary, 'AI summary');

const rejectedNarrowDraft = buildLocalBookmarkSuggestion(
  { title: 'Notion Forms', url: 'https://notionforms.io/forms/contact', domain: 'notionforms.io' },
  [{ tag: 'mysql', score: 50, signals: ['domain'] }],
  null,
  null,
  '',
);
assert.equal(rejectedNarrowDraft.folderPath, '');
assert.equal(rejectedNarrowDraft.folderName, '');

const fallbackDraft = buildLocalBookmarkSuggestion(
  { title: 'Fallback', url: 'https://example.test/fallback', domain: 'example.test' },
  [{ tag: '开发', score: 30, signals: ['domain'] }],
  { id: 'folder-2', title: '开发', path: '开发' },
  null,
  'Request timeout',
);
assert.deepEqual([...fallbackDraft.tags], ['开发']);
assert.equal(fallbackDraft.aiAvailable, false);
assert.match(fallbackDraft.reason, /AI 建议生成失败/);

const smartContext = {
  Array,
  Date,
  Intl,
  JSON,
  Map,
  Math,
  Number,
  Object,
  Promise,
  Set,
  String,
  URL,
  chrome: chromeStub,
  console,
};
vm.createContext(smartContext);
vm.runInContext(`${smartTaggerSource}; this.smartHelpers = {
  autoTagBookmarkSync,
  getCanonicalCategoryTerms,
  matchDomainTag,
  matchUrlPathTag
};`, smartContext);

const { autoTagBookmarkSync, getCanonicalCategoryTerms } = smartContext.smartHelpers;
const tagNamesFor = bookmark => [...autoTagBookmarkSync(bookmark)].map(item => item.tag);

assert.ok([...getCanonicalCategoryTerms('API')].includes('接口'));

assert.deepEqual(tagNamesFor({
  title: 'YouTube product review',
  url: 'https://www.youtube.com/watch?v=abc',
  domain: 'www.youtube.com',
}), ['视频']);
assert.deepEqual(tagNamesFor({
  title: '商品详情',
  url: 'https://item.jd.com/123.html',
  domain: 'item.jd.com',
}), ['购物']);
assert.deepEqual(tagNamesFor({
  title: 'Source repository',
  url: 'https://github.com/example/project/tree/main',
  domain: 'github.com',
}), ['开发', '项目']);
assert.deepEqual(tagNamesFor({ title: '', url: 'not a url', domain: '' }), ['其他']);
assert.deepEqual(tagNamesFor({
  title: '',
  url: 'https://notgithub.com/',
  domain: 'notgithub.com',
}), ['其他']);
assert.deepEqual(tagNamesFor({
  title: '',
  url: 'https://example.com/?next=/watch',
  domain: 'example.com',
}), ['其他']);
assert.deepEqual(tagNamesFor({
  title: '',
  url: 'https://example.com/watch/123',
  domain: 'example.com',
}), ['视频']);

const urlNormalizerStart = source.indexOf('function normalizeRecommendationUrl(url)');
const urlNormalizerEnd = source.indexOf('function recommendationUrlFingerprint(url)', urlNormalizerStart);
const duplicateFinderStart = source.indexOf('async function findExistingBookmarkByUrl(url)');
const duplicateFinderEnd = source.indexOf('function markProgrammaticBookmarkMove(', duplicateFinderStart);
assert.ok(urlNormalizerStart >= 0 && urlNormalizerEnd > urlNormalizerStart, 'bookmark URL normalizer should be present');
assert.ok(duplicateFinderStart >= 0 && duplicateFinderEnd > duplicateFinderStart, 'bookmark duplicate finder should be present');

let treeCalls = 0;
const duplicateFinderContext = {
  Array,
  String,
  URL,
  chrome: {
    bookmarks: {
      async search({ url }) {
        return url === 'https://example.test/exact'
          ? [{ id: 'exact-bookmark', url }]
          : [];
      },
      async getTree() {
        treeCalls++;
        return [{
          id: '0',
          children: [{
            id: 'folder-1',
            children: [
              { id: 'normalized-bookmark', url: 'https://example.test/guide/?article=1' },
              { id: 'different-query', url: 'https://example.test/guide/?article=2' },
            ],
          }],
        }];
      },
    },
  },
};
vm.createContext(duplicateFinderContext);
vm.runInContext(`${source.slice(urlNormalizerStart, urlNormalizerEnd)}${source.slice(duplicateFinderStart, duplicateFinderEnd)}; this.findExistingBookmarkByUrl = findExistingBookmarkByUrl;`, duplicateFinderContext);

assert.equal((await duplicateFinderContext.findExistingBookmarkByUrl('https://example.test/exact'))?.id, 'exact-bookmark');
assert.equal(treeCalls, 0, 'an exact duplicate should not traverse the bookmark tree');
assert.equal((await duplicateFinderContext.findExistingBookmarkByUrl('https://www.example.test/guide?utm_source=newsletter&article=1#overview'))?.id, 'normalized-bookmark');
assert.equal(await duplicateFinderContext.findExistingBookmarkByUrl('https://example.test/guide?article=3'), null, 'business query parameters must not be treated as tracking data');

for (const needle of [
  'findExistingBookmarkByUrl(tab.url)',
  'findExistingBookmarkByUrl(draft.url)',
  'draft.duplicate = true;',
  "existingFolderPath: existingFolder.path || ''",
  "['move', 'copy'].includes(draft.duplicateAction)",
  'data-act="copy"',
  'data-act="move"',
  "const exactExistingOption = getExistingFolderOptions().find(opt =>",
  "folderMode = selectedExisting ? 'existing' : 'new'",
  "root.querySelector('#abFolderSearch')",
  "root.querySelector('#abTitleInput')",
  "root.querySelector('#abTagsInput')",
  'id="abFolderToggle"',
  'class="ab-folder-results"',
  "setFolderDropdownOpen(true, !folderSearch.dataset.userSearching)",
  'setFolderDropdownOpen(nextOpen, true)',
  "folderSearch.addEventListener('keydown'",
  "event.key === 'ArrowDown'",
  "event.key === 'Escape'",
  "folderResults.addEventListener('click'",
  "contentReady: '已读取页面正文（$1 字）并用于本地分类。'",
  'const contentLength = String(panelState.contentText',
  'class="ab-content-status"',
]) {
  assert.ok(source.includes(needle), `quick bookmark duplicate flow missing: ${needle}`);
}

const folderLoaderStart = source.indexOf('async function loadBookmarkFolderOptions()');
const folderLoaderEnd = source.indexOf('async function findExistingFolderByExactPath(', folderLoaderStart);
assert.ok(folderLoaderStart >= 0 && folderLoaderEnd > folderLoaderStart, 'folder picker loader must exist');
assert.ok(!source.slice(folderLoaderStart, folderLoaderEnd).includes('.slice('), 'folder picker must include the complete browser folder list');

console.log('quick bookmark suggestion regression checks passed');
