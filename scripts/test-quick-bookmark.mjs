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
  setTimeout: (callback, delay, ...args) => setTimeout(callback, delay >= 1000 && delay < 3000 ? 1 : delay, ...args),
};
vm.createContext(aiContext);
vm.runInContext(`${aiTaggerSource}; this.aiHelpers = {
  _doFetch,
  _requestAIWithRetry,
  buildBookmarkSuggestionPrompt,
  getAIAssistRetryCount,
  mergeAITags,
  parseAIClassification,
  parseBookmarkSuggestion,
  prioritizeBookmarkFolderOptions,
  suggestBookmarkWithAI
};`, aiContext);

const {
  _doFetch,
  _requestAIWithRetry,
  buildBookmarkSuggestionPrompt,
  getAIAssistRetryCount,
  mergeAITags,
  parseAIClassification,
  parseBookmarkSuggestion,
  prioritizeBookmarkFolderOptions,
  suggestBookmarkWithAI,
} = aiContext.aiHelpers;

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
  retryCount: 0,
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
await assert.rejects(
  () => suggestBookmarkWithAI(
    { title: 'React guide', url: 'https://example.test/react', domain: 'example.test' },
    [{ tag: '开发', score: 30 }],
    { folderOptions: [] },
  ),
  /simulated network failure/,
);

fetchImpl = async (_url, options) => ({
  ok: true,
  status: 200,
  text: () => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('body aborted', 'AbortError')), { once: true });
  }),
});
await assert.rejects(
  () => _doFetch('https://api.test', {}, {}, 10),
  /AI 请求超时/,
  '收藏 AI 在响应头到达后读取正文时仍必须受超时限制',
);
assert.equal(getAIAssistRetryCount({ retryCount: 2.6 }), 3);
assert.equal(getAIAssistRetryCount({ retryCount: 99 }), 5);

let assistRetryCalls = 0;
fetchImpl = async () => {
  assistRetryCalls += 1;
  if (assistRetryCalls === 1) return { ok: false, status: 500, text: async () => 'temporary' };
  return { ok: true, status: 200, text: async () => 'ok' };
};
const assistRetryResult = await _requestAIWithRetry('https://api.test', {}, {}, 3000, 1);
assert.equal(assistRetryResult.status, 200);
assert.equal(assistRetryCalls, 2, '收藏 AI 配置 1 次重连时应执行首次请求加 1 次重连');

const manyFolders = Array.from({ length: 121 }, (_, index) => ({ path: `Folder/${index}` }));
const preferredFolders = prioritizeBookmarkFolderOptions(manyFolders, ['Folder/120']);
assert.equal(preferredFolders[0].path, 'Folder/120');
const prioritizedPrompt = buildBookmarkSuggestionPrompt(
  { title: 'Example', url: 'https://example.test' },
  [],
  {},
  '',
  manyFolders,
  false,
  ['Folder/120'],
);
assert.match(prioritizedPrompt, /Folder\/120/);
assert.doesNotMatch(prioritizedPrompt, /Folder\/119(?:\r?\n|$)/, '超过上限时应保留本地优先目录，而不是固定截取原列表前 120 个');

const start = source.indexOf('const BROWSER_BOOKMARK_ROOT_TITLES = new Set([');
const end = source.indexOf('async function prepareBookmarkSuggestion(');

assert.ok(start >= 0 && end > start, 'bookmark suggestion helpers should be present');

const context = {
  Set,
  String,
  Array,
  Object,
  Date,
  extractDomain: url => {
    try { return new URL(url).hostname; } catch { return ''; }
  },
  mergeAITags,
  normalizeExtractedText: value => String(value || '').replace(/\s+/g, ' ').trim(),
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
  collectBookmarkTokenWeights,
  recommendationEvidenceFromTagResult,
  buildLocalPageSummary,
  buildLocalClassificationReason,
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
  collectBookmarkTokenWeights,
  recommendationEvidenceFromTagResult,
  buildLocalPageSummary,
  buildLocalClassificationReason,
  buildLocalBookmarkSuggestion,
} = context.helpers;

assert.deepEqual([...normalizeTagList([' docs ', { tag: 'docs' }, { tag: 'AI' }])], ['docs', 'AI']);
assert.deepEqual([...normalizeTagList(['24', '40', '企业协同', '1.2.3'])], ['企业协同']);
const leadTagEvidence = recommendationEvidenceFromTagResult({
  signals: ['content-lead-keyword:API', 'prototype-bm25:API:0.5'],
});
assert.ok(leadTagEvidence.some(item => item.family === 'page_content'), '首屏正文关键词必须保留为独立页面内容证据');
assert.ok(leadTagEvidence.some(item => item.family === 'content_semantic'), '语义原型仍应作为独立弱证据参与校验');
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
assert.equal(acceptedAiFolder.score, 46);
assert.deepEqual([...acceptedAiFolder.reasons], ['local-tag:插件', 'content:notion']);
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

const relayProfileFolders = [
  { id: 'relay', title: 'API中转', path: 'AI/API中转' },
  { id: 'community', title: '开发社区', path: '开发/开发社区' },
  { id: 'collaboration', title: '企业协同', path: '工作/企业协同' },
  { id: 'generic', title: '通用资料', path: '资料/通用资料' },
];
const relayProfileBookmarks = [
  {
    id: 'relay-1', title: 'LLM API gateway', url: 'https://relay-one.test/docs', domain: 'relay-one.test',
    contentText: 'API 中转网关提供 OpenAI Claude Gemini 模型接口代理、密钥管理、额度查询和统一计费。',
    contentMetaDesc: '大模型 API 中转与接口代理服务', folderName: 'API中转', folderPath: 'AI/API中转',
  },
  {
    id: 'relay-2', title: 'Model relay service', url: 'https://relay-two.test/guide', domain: 'relay-two.test',
    contentText: '统一 API 中转服务兼容 GPT Claude 模型，支持接口转发、令牌鉴权和请求网关。',
    contentMetaDesc: 'AI 模型接口中转', folderName: 'API中转', folderPath: 'AI/API中转',
  },
  {
    id: 'community-1', title: 'Frontend community', url: 'https://dev-one.test', domain: 'dev-one.test',
    contentText: '开发者社区讨论 JavaScript React 开源项目、代码评审和技术问答。',
    folderName: '开发社区', folderPath: '开发/开发社区',
  },
  {
    id: 'community-2', title: 'Open source forum', url: 'https://dev-two.test', domain: 'dev-two.test',
    contentText: '程序员论坛提供开源仓库、前端教程、代码示例和开发讨论。',
    folderName: '开发社区', folderPath: '开发/开发社区',
  },
  {
    id: 'collab-1', title: 'Team workspace', url: 'https://work-one.test', domain: 'work-one.test',
    contentText: '企业协同工作台包含在线文档、审批流程、团队日历和项目任务。',
    folderName: '企业协同', folderPath: '工作/企业协同',
  },
  {
    id: 'collab-2', title: 'Office suite', url: 'https://work-two.test', domain: 'work-two.test',
    contentText: '组织成员通过企业文档、会议、审批和任务看板完成协同办公。',
    folderName: '企业协同', folderPath: '工作/企业协同',
  },
  {
    id: 'generic-1', title: 'Template', url: 'https://generic-one.test', domain: 'generic-one.test',
    contentText: 'AI 工具平台 页面 内容 AI 工具平台 页面 内容 AI 工具平台 页面 内容',
    folderName: '通用资料', folderPath: '资料/通用资料',
  },
];
const ggGrokBookmark = {
  title: 'GGgrok',
  url: 'https://gggrok.test/home',
  domain: 'gggrok.test',
  contentTitle: 'Unified model access',
  metaDesc: '模型服务控制台',
  contentText: 'GGgrok 提供 API 中转网关，通过统一接口代理 OpenAI、Claude、GPT 和 Gemini 模型请求，并管理密钥与额度。',
  headings: ['API 中转服务', '模型接口与令牌管理'],
};
const ggGrokCandidates = scoreFolderProfileCandidates(
  relayProfileBookmarks,
  relayProfileFolders,
  ggGrokBookmark,
  ['AI', 'API'],
  null,
);
assert.equal(ggGrokCandidates[0]?.folderPath, 'AI/API中转', '标题较泛时正文应让 API 中转优先于开发社区和企业协同');
assert.equal(ggGrokCandidates[0]?.localEvidence.pageContentUsed, true);
assert.equal(ggGrokCandidates[0]?.localEvidence.sampledCount, 2);
assert.ok(ggGrokCandidates[0]?.localEvidence.matchedSampleCount >= 2);
assert.ok(ggGrokCandidates[0]?.localEvidence.matchedTerms.length > 0);
assert.equal(ggGrokCandidates[0]?.localEvidence.folderNameMatched, true);
assert.notEqual(scoreFolderProfileCandidates(
  relayProfileBookmarks,
  relayProfileFolders,
  { ...ggGrokBookmark, contentText: '', headings: [], contentTitle: '', metaDesc: '' },
  [],
  null,
)[0]?.folderPath, 'AI/API中转', '没有正文时不得凭泛化标题伪造 API 中转样本证据');

const publicStationFolders = [
  { id: 'public-benefit', title: '公益导航', path: 'AI/人工智能/公益导航' },
  { id: 'developer-community', title: '开发社区', path: 'AI/软件开发/开发社区' },
  { id: 'model-api', title: '模型接口', path: 'AI/人工智能/模型接口' },
];
const publicStationSamples = [
  {
    id: 'public-1', title: '公益 AI 服务', url: 'https://public-one.test', domain: 'public-one.test',
    contentText: '非营利公益 AI 服务，免费开放大模型并提供公益额度，让所有人都能平等使用。',
    contentExcerpt: '免费开放的大模型公益服务', folderName: '公益导航', folderPath: 'AI/人工智能/公益导航',
  },
  {
    id: 'public-2', title: '免费模型公益站', url: 'https://public-two.test', domain: 'public-two.test',
    contentText: '不盈利的公益站免费提供模型能力，费用由公益方承担。',
    contentExcerpt: '不盈利的免费模型公益站', folderName: '公益导航', folderPath: 'AI/人工智能/公益导航',
  },
  {
    id: 'dev-1', title: '开发者社区', url: 'https://dev-community.test', domain: 'dev-community.test',
    contentText: '开发者社区讨论编程、开源项目、代码评审和技术问答。',
    folderName: '开发社区', folderPath: 'AI/软件开发/开发社区',
  },
  {
    id: 'dev-2', title: '程序员论坛', url: 'https://dev-forum.test', domain: 'dev-forum.test',
    contentText: '软件开发社区提供代码教程、框架实践与工程经验。',
    folderName: '开发社区', folderPath: 'AI/软件开发/开发社区',
  },
  {
    id: 'api-1', title: '模型 API 网关', url: 'https://model-api.test', domain: 'model-api.test',
    contentText: '统一 OpenAI 接口接入多个模型，提供 API 密钥和调用管理。',
    folderName: '模型接口', folderPath: 'AI/人工智能/模型接口',
  },
];
const publicStationBookmark = {
  title: 'GGgrok',
  url: 'https://xiaoxiaobai.me/',
  domain: 'xiaoxiaobai.me',
  contentTitle: 'GGgrok',
  excerpt: '一个不盈利的公益站，免费开放 Grok 全系模型，统一 OpenAI 接口，让每个人都能平等地用上 Grok。',
  headings: [
    'GGgrok 公益站 畅用所有 Grok 模型',
    '一个接口，接入所有模型',
    '最新动态',
    '三分钟把 GGgrok 接进你的应用',
  ],
  contentText: [
    'GGgrok 公益站 畅用所有 Grok 模型',
    '一个不盈利的公益站，免费开放 Grok 全系模型，统一 OpenAI 接口，让每个人都能平等地用上 Grok。',
    '它把 Grok 全系模型放在一个免费、统一的接口背后，让任何人都能零成本地使用，成本由公益方承担。',
    '面向开发者。一个接口接入所有模型，兼容 OpenAI。',
    '遇到问题或想参与共建，可以来社区找我们。',
  ].join('\n\n'),
};
const publicStationCandidates = scoreFolderProfileCandidates(
  publicStationSamples,
  publicStationFolders,
  publicStationBookmark,
  ['AI', 'API'],
);
assert.equal(publicStationCandidates[0]?.folderPath, 'AI/人工智能/公益导航', '首屏公益与免费说明应优先于正文后部零散的开发、社区词');
assert.ok(publicStationCandidates[0]?.localEvidence.matchedSampleCount >= 2);
assert.ok(publicStationCandidates[0]?.localEvidence.matchedTerms.some(term => term.includes('公益') || term.includes('免费')));
assert.equal(
  publicStationCandidates.find(item => item.folderPath === 'AI/软件开发/开发社区')?.localEvidence.folderNameMatched || false,
  false,
  '复合目录叶子的多个子词分散在不同正文片段时不得拼成目录名称命中',
);
assert.equal(buildLocalPageSummary(publicStationBookmark), publicStationBookmark.excerpt, '摘要应优先展示正文中真实存在的首屏导语');
const publicStationDraft = buildLocalBookmarkSuggestion(
  publicStationBookmark,
  [{ tag: 'AI', score: 70 }],
  { ...publicStationCandidates[0], positiveFamilies: ['folder_sample', 'page_content'] },
  null,
  '',
);
assert.match(publicStationDraft.reason, /一个不盈利的公益站/);
assert.match(publicStationDraft.reason, /公益|免费/);

const repeatedBodyFeatures = collectBookmarkTokenWeights({ contentText: 'relay relay relay relay relay' });
assert.equal(repeatedBodyFeatures.tokens.get('relay'), 0.8, '同一字段内重复词不得累加权重');
assert.equal(repeatedBodyFeatures.bodyTokens.get('relay'), 0.8);

const sharedDomainCandidates = scoreFolderProfileCandidates(
  [
    { id: 'same-a', title: 'Alpha', url: 'https://shared.test/a', domain: 'shared.test', contentText: 'alpha finance report', folderName: 'Alpha', folderPath: 'Alpha' },
    { id: 'same-b', title: 'Beta', url: 'https://shared.test/b', domain: 'shared.test', contentText: 'beta cooking recipe', folderName: 'Beta', folderPath: 'Beta' },
  ],
  [{ id: 'same-a-folder', title: 'Alpha', path: 'Alpha' }, { id: 'same-b-folder', title: 'Beta', path: 'Beta' }],
  { title: 'Shared home', url: 'https://shared.test/home', domain: 'shared.test', contentText: 'unrelated travel itinerary and hotel booking details' },
  [],
  null,
);
assert.ok(sharedDomainCandidates.every(candidate => candidate.localEvidence.matchedSampleCount === 0), '跨目录同域名不得伪造正文样本匹配');
assert.ok(sharedDomainCandidates.every(candidate => candidate.score <= 20), '同域名分散在多个目录时必须降权');

const titleOnlyFolderMatch = scoreExistingFolderCandidates(
  [{ id: 'title-only', title: 'API中转', path: 'AI/API中转' }],
  ['API'],
  { title: 'API中转控制台', url: 'https://unrelated.test', contentText: 'travel itinerary hotel booking destination guide' },
  null,
)[0];
assert.equal(titleOnlyFolderMatch?.localEvidence.pageContentUsed, true);
assert.equal(titleOnlyFolderMatch?.localEvidence.folderNameMatched, false, '标题或标签命中目录名不得伪装成正文命中');
assert.equal(titleOnlyFolderMatch?.localEvidence.matchedSampleCount, 0);

const ggGrokDraft = buildLocalBookmarkSuggestion(
  ggGrokBookmark,
  [{ tag: 'API', score: 80 }],
  { ...ggGrokCandidates[0], positiveFamilies: ['folder_sample', 'page_content', 'folder_name'] },
  null,
  '',
);
assert.match(ggGrokDraft.summary, /GGgrok 提供 API 中转网关/);
assert.notEqual(ggGrokDraft.summary, '模型服务控制台', '抓取到正文时本地摘要不得优先回退到 Meta 描述');
assert.match(ggGrokDraft.reason, /正文概要/);
assert.match(ggGrokDraft.reason, /GGgrok 提供 API 中转网关/);
assert.match(ggGrokDraft.reason, /页面正文命中/);
assert.match(ggGrokDraft.reason, /随机抽取的 2 条书签中/);
assert.match(ggGrokDraft.reason, /目录叶子名称命中 API中转/);
assert.doesNotMatch(ggGrokDraft.reason, /profile-content|folder-profile|page-content:/);
assert.match(ggGrokDraft.reasonEn, /Page content matched/);
assert.equal(buildLocalPageSummary({ contentText: '  first\n usable   body paragraph  ' }), 'first usable body paragraph');
assert.equal(buildLocalPageSummary({ contentText: '', metaDesc: 'Meta fallback summary' }), 'Meta fallback summary');
assert.doesNotMatch(buildLocalClassificationReason(ggGrokCandidates[0], 'zh'), /profile-content|folder-profile/);

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
const apiRelayEvidenceBookmark = {
  title: 'Free LLM API relay',
  url: 'https://example.test/api-relay',
  domain: 'example.test',
  metaDesc: 'A unified API interface relay for LLM models, compatible with AI coding tools.',
};
const apiRelayEvidenceCandidates = scoreExistingFolderCandidates(
  apiRelayEvidenceFolders,
  ['API', 'AI'],
  apiRelayEvidenceBookmark,
  {
    tags: [{ tag: 'AI', confidence: 0.8 }],
    reason: '\u8fd9\u662f\u4e00\u9879\u5927\u6a21\u578b\u63a5\u53e3\u4e2d\u8f6c\u670d\u52a1\uff0c\u540c\u65f6\u53ef\u7528\u4e8e AI \u7f16\u7a0b\u5de5\u5177\u3002',
    evidence: ['\u63a5\u53e3\u4e2d\u8f6c'],
  },
);
const apiRelayWithoutAiEvidence = scoreExistingFolderCandidates(apiRelayEvidenceFolders, ['API', 'AI'], apiRelayEvidenceBookmark);
assert.deepEqual(
  apiRelayEvidenceCandidates.map(item => [item.folderPath, item.score, item.leafExactContentMatches]),
  apiRelayWithoutAiEvidence.map(item => [item.folderPath, item.score, item.leafExactContentMatches]),
  'AI 的理由与 evidence 不得重新作为独立本地内容证据参与目录评分',
);
assert.equal(
  apiRelayEvidenceCandidates.find(item => item.folderPath === 'AI/\u4eba\u5de5\u667a\u80fd/\u63a5\u53e3\u4e2d\u8f6c')?.leafExactContentMatches || 0,
  0,
  '只有原始页面字段可以形成目录叶子正文命中',
);

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
assert.doesNotMatch(fallbackDraft.reason, /profile-content|folder-profile/);

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
  'const reasons = candidateEvidenceText(candidate)',
  'const selectedCandidate = folderCandidates[Number(candidateButton.dataset.candidateIndex)]',
  'reasonInput.value = candidateClassificationReason(selectedCandidate)',
  "(isChinese ? panelState.reason : panelState.reasonEn)",
  'class="ab-content-status"',
]) {
  assert.ok(source.includes(needle), `quick bookmark duplicate flow missing: ${needle}`);
}

const folderLoaderStart = source.indexOf('async function loadBookmarkFolderOptions()');
const folderLoaderEnd = source.indexOf('async function findExistingFolderByExactPath(', folderLoaderStart);
assert.ok(folderLoaderStart >= 0 && folderLoaderEnd > folderLoaderStart, 'folder picker loader must exist');
assert.ok(!source.slice(folderLoaderStart, folderLoaderEnd).includes('.slice('), 'folder picker must include the complete browser folder list');

const activeContentStart = source.indexOf('async function extractActiveTabContent(');
const activeContentEnd = source.indexOf('async function fetchBookmarkContent(', activeContentStart);
const activeContentSource = source.slice(activeContentStart, activeContentEnd);
assert.ok(activeContentSource.indexOf('extractRenderedTabContent(tabId, url)') < activeContentSource.indexOf('getCachedContent(url)'), '收藏当前页面时必须先读取活动标签页正文');
assert.ok(activeContentSource.indexOf('getCachedContent(url)') < activeContentSource.indexOf('fetchStaticPageContent(url)'), '活动页读取失败后才可回退缓存与静态请求');
assert.match(source, /fetchBookmarkContent\(item\.url, \{ forceRefresh: false, renderFallback: false \}\)/, '后台自动补抓不得创建隐藏标签页');

console.log('quick bookmark suggestion regression checks passed');
