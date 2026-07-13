// ===== 云端 AI 分类增强层 =====
// 规则引擎主路 + AI 增强支路的双轨融合架构
// AI 仅对规则引擎置信度不足的样本触发，返回结果作为独立信号参与排序

const AI_CONFIG_KEY = 'ai_classifier_config';
const AI_STATS_KEY = 'ai_classifier_stats';
const AI_CACHE_KEY = 'ai_tag_cache';
const AI_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 天
const AI_MAX_CACHE = 500;

const DEFAULT_AI_ASSIST_PROMPT = `你是 AI 书签辅助分类助手。请根据单个书签的标题、URL、域名、页面摘要、原文件夹和规则引擎候选标签，判断它最适合的用途与分类标签。

处理原则：
1. 优先根据标题判断用途；标题不足时结合域名、URL 路径、页面摘要和原文件夹。
2. 标签应为 1-3 个中文通用领域词，简洁稳定，避免过细、过长或重复。
3. 可参考但不限于：前端开发、后端开发、设计资源、新闻资讯、学习教程、效率工具、开发工具、数据分析、云服务、产品运营、娱乐、购物、社交媒体、文档资料。
4. 与办公、企业内部系统、客户、供应商、项目协作、管理后台、文档平台、工单、CRM、ERP、邮箱、会议、招聘、财务、人事、合同、报销相关的书签，应优先识别公司或组织名称，让同一公司相关书签稳定聚合。
5. 如果信息不足，请给出最可能的保守分类，不要使用“未知”“其他”等空泛标签。
6. 输出必须严格遵守调用方要求的 JSON 格式，不要输出 Markdown、代码块、解释说明或任何额外文字。`;

const AI_WEIGHT = 45; // Layer 4.9 权重，低于 folder/domain，高于统计模型

// ===== 日志辅助 =====
function _logIfReady(event) {
  if (typeof logAIEvent === 'function') {
    logAIEvent(event).catch(() => {});
  }
}

// ===== API 格式模板 =====
// 定义常见 API 协议的请求构建和响应解析方式
const API_FORMATS = {
  // OpenAI Chat Completions 格式（兼容：智谱、DeepSeek、通义、Groq 等）
  openai: {
    name: 'OpenAI Chat Completions',
    buildHeaders: (apiKey) => ({ 'Authorization': `Bearer ${apiKey}` }),
    buildBody: (prompt, model) => ({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2
    }),
    parseResponse: (json) => json.choices?.[0]?.message?.content,
    // 对 custom provider，拼接 /chat/completions
    normalizeEndpoint: (baseUrl) => {
      let url = baseUrl.replace(/\/+$/, '');
      if (!url.endsWith('/chat/completions')) url += '/chat/completions';
      return url;
    }
  },

  // Anthropic Messages 格式
  anthropic: {
    name: 'Anthropic Messages',
    buildHeaders: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'messages-2023-12-15'
    }),
    buildBody: (prompt, model) => ({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    }),
    parseResponse: (json) => json.content?.[0]?.text,
    normalizeEndpoint: (baseUrl) => {
      let url = baseUrl.replace(/\/+$/, '');
      if (!url.endsWith('/v1/messages')) url += '/v1/messages';
      return url;
    }
  },

  // Google Gemini 格式（URL 中含 {model} 占位符）
  google: {
    name: 'Google Gemini',
    buildHeaders: (apiKey) => ({ 'x-goog-api-key': apiKey }),
    buildBody: (prompt, model) => ({
      contents: [{ parts: [{ text: prompt }] }]
    }),
    parseResponse: (json) => json.candidates?.[0]?.content?.parts?.[0]?.text,
    normalizeEndpoint: (baseUrl, model) => baseUrl.replace('{model}', encodeURIComponent(model))
  }
};

// ===== 内置 Provider 定义 =====
// 每个 provider 只需指定名称、格式、模型和端点即可，请求构建和解析由格式模板接管
const AI_PROVIDERS = {
  // Aligned with AI pyramid classification providers
  agnes: {
    name: 'Agnes AI',
    format: 'openai',
    model: 'agnes-2.0-flash',
    endpoint: 'https://apihub.agnes-ai.com/v1/chat/completions',
    isFree: false
  },
  openrouter: {
    name: 'OpenRouter',
    format: 'openai',
    model: 'openai/gpt-4o-mini',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    isFree: false
  },
  openai: {
    name: 'OpenAI (Codex)',
    format: 'openai',
    model: 'gpt-4o-mini',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    isFree: false
  },
  claude: {
    name: 'Claude (Anthropic)',
    format: 'anthropic',
    model: 'claude-3-5-haiku-latest',
    endpoint: 'https://api.anthropic.com/v1/messages',
    isFree: false
  },
  gemini: {
    name: 'Gemini (Google)',
    format: 'google',
    model: 'gemini-2.0-flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    isFree: false
  },
  deepseek: {
    name: 'DeepSeek',
    format: 'openai',
    model: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    isFree: false
  },
  // Legacy providers kept for existing user configs
  zhipu: {
    name: '智谱 AI',
    format: 'openai',
    model: 'glm-4-flash',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    isFree: true
  },
  google: {
    name: 'Gemini (Google)',
    format: 'google',
    model: 'gemini-2.0-flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    isFree: false
  },
  tongyi: {
    name: '阿里通义',
    format: 'openai',
    model: 'qwen-turbo',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    isFree: false
  },
  custom: {
    name: '自定义',
    format: null,
    model: '',
    endpoint: '',
    isFree: false,
    isCustom: true
  }
};

// ===== 解析 provider 和 format，返回统一的调用描述对象 =====
function resolveProvider(config) {
  const providerDef = AI_PROVIDERS[config.provider];
  if (!providerDef) return null;

  if (providerDef.isCustom) {
    // 自定义 provider：格式来自 config.customFormat
    const formatType = (config.customFormat === 'gemini' || config.customFormat === 'google') ? 'google' : (config.customFormat || 'openai');
    const format = API_FORMATS[formatType];
    if (!format) return null;
    const rawUrl = (config.customEndpoint || '').replace(/\/+$/, '');
    if (!rawUrl) return null;

    // 用户勾选了“使用完整 URL”则直接使用，否则按格式拼接路径
    const endpoint = config.customFullUrl ? rawUrl : format.normalizeEndpoint(rawUrl);
    return {
      name: '自定义',
      model: config.model || 'gpt-4o-mini',
      endpoint,
      buildHeaders: format.buildHeaders,
      buildBody: format.buildBody,
      parseResponse: format.parseResponse
    };
  }

  // 内置 provider
  const format = API_FORMATS[providerDef.format];
  if (!format) return null;

  let endpoint = providerDef.endpoint;
  // Google 端点含 {model} 占位符
  if (providerDef.format === 'google') {
    const model = config.model || providerDef.model;
    endpoint = format.normalizeEndpoint(endpoint, model);
  }

  return {
    name: providerDef.name,
    model: config.model || providerDef.model,
    endpoint,
    buildHeaders: format.buildHeaders,
    buildBody: format.buildBody,
    parseResponse: format.parseResponse
  };
}

// ===== 并发控制（避免触发免费/低价 API 的速率限制）=====
const AI_MAX_CONCURRENCY = 2;
let _aiRunning = 0;
const _aiQueue = [];

function _acquireAISlot() {
  return new Promise((resolve) => {
    if (_aiRunning < AI_MAX_CONCURRENCY) {
      _aiRunning++;
      resolve(() => _releaseAISlot());
    } else {
      _aiQueue.push(() => {
        _aiRunning++;
        resolve(() => _releaseAISlot());
      });
    }
  });
}

function _releaseAISlot() {
  _aiRunning = Math.max(0, _aiRunning - 1);
  if (_aiQueue.length > 0 && _aiRunning < AI_MAX_CONCURRENCY) {
    const next = _aiQueue.shift();
    next();
  }
}

// ===== 配置读写 =====
async function getAIConfig() {
  const result = await chrome.storage.local.get(AI_CONFIG_KEY);
  const defaults = {
    enabled: false,
    assistClassificationEnabled: true,
    provider: 'agnes',
    apiKey: '',
    model: '',
    timeout: 8,
    customFormat: 'openai',
    customEndpoint: '',
    customFullUrl: false,
    assistPrompt: DEFAULT_AI_ASSIST_PROMPT
  };
  const merged = { ...defaults, ...(result[AI_CONFIG_KEY] || {}) };
  if (merged.provider === 'google') merged.provider = 'gemini';
  if (merged.customFormat === 'google') merged.customFormat = 'gemini';
  return merged;
}

function normalizeAIAssistPrompt(prompt) {
  return String(prompt || '').trim() || DEFAULT_AI_ASSIST_PROMPT;
}

async function setAIConfig(config) {
  await chrome.storage.local.set({ [AI_CONFIG_KEY]: config });
  return config;
}

async function getAIStats() {
  const result = await chrome.storage.local.get(AI_STATS_KEY);
  return result[AI_STATS_KEY] || {
    totalTriggered: 0,
    totalClassified: 0,
    successCount: 0,
    failCount: 0,
    avgLatencyMs: 0,
    lastUsed: null
  };
}

async function updateAIStats(delta) {
  const stats = await getAIStats();
  stats.totalTriggered += delta.totalTriggered || 0;
  stats.totalClassified += delta.totalClassified || 0;
  stats.successCount += delta.successCount || 0;
  stats.failCount += delta.failCount || 0;
  if (delta.latencyMs) {
    const n = stats.successCount || 1;
    stats.avgLatencyMs = Math.round((stats.avgLatencyMs * (n - 1) + delta.latencyMs) / n);
  }
  if (delta.successCount) stats.lastUsed = Date.now();
  await chrome.storage.local.set({ [AI_STATS_KEY]: stats });
}

// ===== AI 结果缓存（同一 URL 不重复调用）=====
async function getAICache(url) {
  if (!url) return null;
  try {
    const result = await chrome.storage.local.get(AI_CACHE_KEY);
    const cache = result[AI_CACHE_KEY] || {};
    const entry = cache[url];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > AI_CACHE_TTL) {
      delete cache[url];
      await chrome.storage.local.set({ [AI_CACHE_KEY]: cache });
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

async function setAICache(url, tags, provider) {
  if (!url) return;
  try {
    const result = await chrome.storage.local.get(AI_CACHE_KEY);
    const cache = result[AI_CACHE_KEY] || {};
    cache[url] = { tags, provider, timestamp: Date.now() };
    const keys = Object.keys(cache);
    if (keys.length > AI_MAX_CACHE) {
      const oldest = keys.sort((a, b) => cache[a].timestamp - cache[b].timestamp)[0];
      delete cache[oldest];
    }
    await chrome.storage.local.set({ [AI_CACHE_KEY]: cache });
  } catch {
    // 缓存失败不影响主流程
  }
}

async function clearAICache() {
  await chrome.storage.local.remove(AI_CACHE_KEY);
}

function readableBookmarkContent(bookmark, limit = 4000) {
  const text = String(bookmark.contentText || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length >= 80) return text.slice(0, limit);
  return String(bookmark.excerpt || bookmark.metaDesc || '').trim().slice(0, Math.min(limit, 800));
}

function readablePageSignals(bookmark) {
  const headings = Array.isArray(bookmark.headings) ? bookmark.headings : [];
  const keywords = Array.isArray(bookmark.metaKeywords) ? bookmark.metaKeywords : [];
  const types = Array.isArray(bookmark.structuredTypes) ? bookmark.structuredTypes : [];
  return {
    headings: headings.slice(0, 12).join(' | '),
    keywords: keywords.slice(0, 20).join(', '),
    types: types.slice(0, 12).join(', ')
  };
}

const GENERIC_AI_TAGS = new Set([
  '其他', '其它', '未知', '未分类', '无', '无标签',
  'other', 'others', 'unknown', 'uncategorized', 'misc', 'none', 'n/a'
]);

const BROWSER_ROOT_FOLDER_NAMES = new Set([
  '书签栏', '收藏夹栏', '书签菜单', '其他书签', '其他收藏夹', '移动设备书签',
  'bookmarks bar', 'bookmarks menu', 'other bookmarks', 'mobile bookmarks'
]);

function normalizeSuggestedTagName(value, validTags) {
  if (typeof value !== 'string') return '';
  const text = value
    .replace(/^#+/, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || text.length > 24 || !/[A-Za-z0-9\u4e00-\u9fff]/.test(text) || GENERIC_AI_TAGS.has(text.toLowerCase())) return '';
  const canonical = (validTags || []).find(tag => String(tag).toLowerCase() === text.toLowerCase());
  return canonical || text;
}

function normalizeSuggestedAITags(items, validTags, allowNewTags) {
  const knownTags = Array.isArray(validTags) ? validTags : [];
  const knownKeys = new Set(knownTags.map(tag => String(tag).toLowerCase()));
  const normalized = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== 'object') continue;
    const tag = normalizeSuggestedTagName(item.tag, knownTags);
    if (!tag || (!allowNewTags && !knownKeys.has(tag.toLowerCase()))) continue;
    const rawConfidence = Number(item.confidence);
    const confidence = Math.max(0, Math.min(1, Number.isFinite(rawConfidence) ? rawConfidence : 0.6));
    if (confidence < 0.35) continue;
    const key = tag.toLowerCase();
    const current = normalized.get(key);
    if (!current || confidence > current.confidence) {
      normalized.set(key, { tag, confidence, source: 'ai' });
    }
  }
  return [...normalized.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
}

function normalizeSuggestedFolderPath(value) {
  return String(value || '')
    .split(/[\\/]+/)
    .map(part => part.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim())
    .filter(part => part && part !== '.' && part !== '..')
    .filter(part => !BROWSER_ROOT_FOLDER_NAMES.has(part.toLowerCase()))
    .slice(0, 4)
    .map(part => part.slice(0, 32))
    .join('/');
}

// ===== Prompt 构建 =====
function buildClassificationPrompt(bookmark, candidateTags, tagDescriptions, assistPrompt) {
  const tagList = Object.entries(tagDescriptions)
    .map(([tag, desc]) => `  ${tag}: ${desc}`)
    .join('\n');

  const ruleTopTags = candidateTags
    .slice(0, 5)
    .map(t => `  - ${t.tag} (规则引擎得分: ${(t.score || 0).toFixed(1)})`)
    .join('\n') || '  （无）';

  const basePrompt = normalizeAIAssistPrompt(assistPrompt);
  const pageSignals = readablePageSignals(bookmark);

  return `${basePrompt}

Page structure: ${pageSignals.headings || '(not extracted)'}
Page keywords: ${pageSignals.keywords || '(not extracted)'}
Structured content types: ${pageSignals.types || '(not extracted)'}

你是一个书签分类助手。请根据书签的标题、URL、域名、页面正文和描述，从下面的候选标签中选出最匹配的 1-3 个标签。

候选标签（仅允许返回列表中的标签）：
${tagList}

书签信息：
  标题: ${bookmark.title || ''}
  URL: ${bookmark.url || ''}
  域名: ${bookmark.domain || ''}
  描述: ${bookmark.metaDesc || bookmark.excerpt || ''}
  页面正文摘录: ${readableBookmarkContent(bookmark)}

规则引擎的初步判断（仅供参考，可能不准确）：
${ruleTopTags}

输出要求：
1. 仅返回 JSON 数组，不要返回任何其他文字或解释。
2. 每个元素包含 tag（标签名）和 confidence（0-1 之间的置信度）。
3. 最多返回 3 个标签，按置信度降序排列。

示例: [{"tag": "AI", "confidence": 0.85}, {"tag": "学术", "confidence": 0.6}]`;
}

// ===== 结果解析与安全防护 =====
function parseAIClassification(raw, validTags) {
  if (!raw) return null;
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return null;

    const results = normalizeSuggestedAITags(parsed, validTags, false);

    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}

// ===== 收藏前 AI 建议 =====
function buildBookmarkSuggestionPrompt(bookmark, candidateTags, tagDescriptions, assistPrompt, folderOptions = []) {
  const tagList = Object.entries(tagDescriptions)
    .map(([tag, desc]) => `  ${tag}: ${desc}`)
    .join('\n');

  const ruleTopTags = candidateTags
    .slice(0, 6)
    .map(t => `  - ${t.tag} (rule score: ${(t.score || 0).toFixed(1)})`)
    .join('\n') || '  (none)';

  const basePrompt = normalizeAIAssistPrompt(assistPrompt);
  const pageSignals = readablePageSignals(bookmark);

  const existingFolders = (Array.isArray(folderOptions) ? folderOptions : [])
    .map(folder => String(folder?.path || '').trim())
    .filter(Boolean)
    .slice(0, 120)
    .map(path => `  - ${path}`)
    .join('\n') || '  （无）';

  return `${basePrompt}

Page structure: ${pageSignals.headings || '(not extracted)'}
Page keywords: ${pageSignals.keywords || '(not extracted)'}
Structured content types: ${pageSignals.types || '(not extracted)'}

你是一个书签收藏前的 AI 分类建议助手。请根据标题、URL、域名、页面正文、页面摘要与规则引擎候选标签，给出用户确认前可编辑的收藏建议。

候选标签（优先从这里选择，最多 3 个）：
${tagList || ruleTopTags}

规则引擎初步判断：
${ruleTopTags}

现有书签文件夹（如果语义匹配，应优先复用完整路径；只有不匹配时才推荐新建路径）：
${existingFolders}

收藏对象：
  标题: ${bookmark.title || ''}
  URL: ${bookmark.url || ''}
  域名: ${bookmark.domain || ''}
  页面摘要: ${bookmark.metaDesc || bookmark.excerpt || bookmark.contentText || ''}
  页面正文摘录: ${readableBookmarkContent(bookmark)}

输出要求：
1. 只返回 JSON 对象，不要 markdown，不要解释性前后缀。
2. JSON 格式为 {"tags":[{"tag":"标签名","confidence":0.8}],"folderPath":"推荐分类路径","summary":"一句话摘要","reason":"一句话归类理由"}。
3. tags 最多 3 个，confidence 为 0-1。
4. folderPath 应是适合收藏该页面的书签分类路径；如果现有书签文件夹中已有合适路径，必须原样返回该完整路径。
5. 只有现有书签文件夹不适合时，才推荐新建路径，可使用一级或多级路径，例如“开发/前端文档”“办公/某公司”“学习/课程资料”。
6. 如果候选标签不足，可以根据内容给出短标签，但要简洁、适合作为书签标签。`;
}

function parseBookmarkSuggestion(raw, validTags) {
  if (!raw) return null;
  try {
    const objectMatch = raw.match(/\{[\s\S]*\}/);
    if (!objectMatch) return null;
    const parsed = JSON.parse(objectMatch[0]);
    if (!parsed || typeof parsed !== 'object') return null;
    const tags = normalizeSuggestedAITags(parsed.tags, validTags, true);
    const folderPath = normalizeSuggestedFolderPath(parsed.folderPath || parsed.folder || parsed.category);
    if (tags.length === 0 && !folderPath) return null;
    return {
      tags,
      folderPath,
      summary: String(parsed.summary || '').trim().slice(0, 120),
      reason: String(parsed.reason || '').trim().slice(0, 160),
      evidence: (Array.isArray(parsed.evidence) ? parsed.evidence : [])
        .map(item => String(item || '').trim().slice(0, 100))
        .filter(Boolean)
        .slice(0, 3)
    };
  } catch {
    return null;
  }
}

async function suggestBookmarkWithAI(bookmark, candidateTags, signals) {
  const config = await getAIConfig();
  if (!config.enabled || !config.apiKey) return null;
  if (config.assistClassificationEnabled === false) return null;

  const resolved = resolveProvider(config);
  if (!resolved) return null;

  const tagDescriptions = typeof TAG_PROTOTYPES !== 'undefined' ? TAG_PROTOTYPES : {};
  const folderOptions = Array.isArray(signals?.folderOptions) ? signals.folderOptions : [];
  const prompt = buildBookmarkSuggestionPrompt(bookmark, candidateTags || [], tagDescriptions, config.assistPrompt, folderOptions);
  const body = resolved.buildBody(prompt, resolved.model);
  const timeoutMs = Math.max(3000, (config.timeout || 8) * 1000);
  const release = await _acquireAISlot();
  const startTime = Date.now();

  try {
    await updateAIStats({ totalTriggered: 1 });
    const { ok, status, text } = await _doFetch(resolved.endpoint, resolved.buildHeaders(config.apiKey), body, timeoutMs);
    if (!ok) {
      await updateAIStats({ failCount: 1 });
      _logIfReady({
        type: 'classify_fail',
        provider: config.provider,
        url: bookmark.url,
        duration: Date.now() - startTime,
        success: false,
        error: `HTTP ${status}: ${text.slice(0, 160)}`
      });
      return null;
    }

    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    const raw = json ? resolved.parseResponse(json) : text;
    const parsed = parseBookmarkSuggestion(raw, Object.keys(tagDescriptions));
    if (!parsed) {
      await updateAIStats({ failCount: 1 });
      _logIfReady({
        type: 'classify_fail',
        provider: config.provider,
        url: bookmark.url,
        duration: Date.now() - startTime,
        success: false,
        error: 'Could not parse pre-save suggestion'
      });
      return null;
    }

    await updateAIStats({
      totalClassified: parsed.tags.length,
      successCount: 1,
      latencyMs: Date.now() - startTime
    });
    _logIfReady({
      type: 'classify_success',
      provider: config.provider,
      model: json?.model || resolved.model,
      url: bookmark.url,
      duration: Date.now() - startTime,
      success: true,
      details: { mode: 'pre_save_suggestion', tags: parsed.tags.map(t => t.tag) }
    });
    return parsed;
  } catch (err) {
    await updateAIStats({ failCount: 1 });
    _logIfReady({
      type: 'classify_fail',
      provider: config.provider,
      url: bookmark.url,
      duration: Date.now() - startTime,
      success: false,
      error: err?.name === 'AbortError' ? 'Request timeout' : (err?.message || 'Unknown error')
    });
    return null;
  } finally {
    release();
  }
}

// ===== 触发判断 =====
function shouldTriggerAI(candidateTags, signals) {
  if (candidateTags.length === 0) return true;

  const top1 = candidateTags[0];
  const top2 = candidateTags[1];

  const top1HasStrong = (signals[top1.tag] || []).some(s =>
    s === 'folder' || s === 'domain' || s.startsWith('user-override')
  );
  if (top1HasStrong && top1.score >= 40) {
    _logIfReady({
      type: 'trigger_skip',
      details: {
        reason: 'top1_strong',
        top1Tag: top1.tag,
        top1Score: top1.score
      }
    });
    return false;
  }

  let triggerReason = '';
  if (top1.score < 35) triggerReason = 'low_confidence';
  else if (top2 && top2.score >= top1.score * 0.80) triggerReason = 'ambiguous_top2';
  else if (top2) {
    const top2HasStrong = (signals[top2.tag] || []).some(s =>
      s === 'folder' || s === 'domain' || s.startsWith('user-override')
    );
    if (top1HasStrong && top2HasStrong && top2.score >= top1.score * 0.65) triggerReason = 'strong_conflict';
  }

  if (triggerReason) {
    _logIfReady({
      type: 'trigger',
      details: {
        reason: triggerReason,
        top1Tag: top1.tag,
        top1Score: top1.score,
        top2Tag: top2?.tag,
        top2Score: top2?.score
      }
    });
    return true;
  }

  _logIfReady({
    type: 'trigger_skip',
    details: {
      reason: 'confidence_ok',
      top1Tag: top1.tag,
      top1Score: top1.score,
      top2Tag: top2?.tag,
      top2Score: top2?.score
    }
  });
  return false;
}

// ===== 统一 API 调用 =====
async function _doFetch(endpoint, headers, body, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return { ok: resp.ok, status: resp.status, text: await resp.text().catch(() => '') };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function callAI(bookmark, candidateTags, tagDescriptions) {
  const config = await getAIConfig();
  if (!config.enabled || !config.apiKey) return null;
  if (config.assistClassificationEnabled === false) return null;

  const resolved = resolveProvider(config);
  if (!resolved) return null;

  const prompt = buildClassificationPrompt(bookmark, candidateTags, tagDescriptions, config.assistPrompt);
  const body = resolved.buildBody(prompt, resolved.model);
  const timeoutMs = Math.max(3000, (config.timeout || 8) * 1000);

  const release = await _acquireAISlot();
  const startTime = Date.now();

  try {
    const { ok, status, text } = await _doFetch(resolved.endpoint, resolved.buildHeaders(config.apiKey), body, timeoutMs);

    if (!ok) {
      console.warn(`AI provider ${config.provider} error: HTTP ${status}`, text);
      await updateAIStats({ failCount: 1 });
      return null;
    }

    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    if (!json) {
      await updateAIStats({ failCount: 1 });
      _logIfReady({
        type: 'classify_fail',
        provider: config.provider,
        url: bookmark.url,
        duration: Date.now() - startTime,
        success: false,
        error: 'Response is not valid JSON'
      });
      return null;
    }

    const raw = resolved.parseResponse(json);
    const validTags = Object.keys(tagDescriptions);
    const parsed = parseAIClassification(raw, validTags);

    if (parsed) {
      await updateAIStats({
        totalClassified: parsed.length,
        successCount: 1,
        latencyMs: Date.now() - startTime
      });
      _logIfReady({
        type: 'classify_success',
        provider: config.provider,
        model: json.model || resolved.model,
        url: bookmark.url,
        duration: Date.now() - startTime,
        success: true,
        details: {
          tagCount: parsed.length,
          tags: parsed.map(p => p.tag)
        }
      });
    } else {
      await updateAIStats({ failCount: 1 });
      _logIfReady({
        type: 'classify_fail',
        provider: config.provider,
        url: bookmark.url,
        duration: Date.now() - startTime,
        success: false,
        error: 'Could not parse classification from response'
      });
    }

    return parsed;
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    if (isTimeout) {
      console.warn('AI request timeout');
    } else {
      console.warn('AI request failed:', err);
    }
    await updateAIStats({ failCount: 1 });
    _logIfReady({
      type: 'classify_fail',
      provider: config.provider,
      url: bookmark.url,
      duration: Date.now() - startTime,
      success: false,
      error: isTimeout ? 'Request timeout' : (err.message || 'Unknown error')
    });
    return null;
  } finally {
    release();
  }
}

// ===== 对外入口：单书签 AI 分类 =====
async function classifyWithAI(bookmark, candidateTags, signals, scores) {
  if (!shouldTriggerAI(candidateTags, signals)) return null;

  const config = await getAIConfig();
  if (!config.enabled || !config.apiKey) return null;
  if (config.assistClassificationEnabled === false) return null;

  const cached = await getAICache(bookmark.url);
  if (cached && cached.tags) {
    _logIfReady({
      type: 'cache_hit',
      provider: config.provider,
      url: bookmark.url,
      success: true,
      details: { tags: cached.tags.map(t => t.tag) }
    });
    return cached.tags;
  }

  await updateAIStats({ totalTriggered: 1 });

  const tagDescriptions = typeof TAG_PROTOTYPES !== 'undefined' ? TAG_PROTOTYPES : {};
  const results = await callAI(bookmark, candidateTags, tagDescriptions);

  if (results) {
    await setAICache(bookmark.url, results, config.provider);
  }

  return results;
}

// ===== 测试连接 =====
async function testAIConnection(config) {
  if (!config.apiKey) return { ok: false, error: 'API Key is empty' };

  const resolved = resolveProvider(config);
  if (!resolved) return { ok: false, error: 'Provider configuration is invalid — check endpoint and format' };

  const testBookmark = {
    title: 'React 官方文档',
    url: 'https://react.dev',
    domain: 'react.dev',
    metaDesc: 'React 用于构建用户界面的 JavaScript 库'
  };
  const tagDescriptions = typeof TAG_PROTOTYPES !== 'undefined' ? TAG_PROTOTYPES : {};
  const prompt = buildClassificationPrompt(testBookmark, [], tagDescriptions, config.assistPrompt);
  const body = resolved.buildBody(prompt, resolved.model);
  const timeoutMs = Math.max(3000, (config.timeout || 8) * 1000);

  try {
    const { ok, status, text } = await _doFetch(resolved.endpoint, resolved.buildHeaders(config.apiKey), body, timeoutMs);

    if (!ok) {
      const snippet = text.slice(0, 300);
      return { ok: false, error: `HTTP ${status}: ${snippet}` };
    }

    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    if (!json) return { ok: false, error: 'Response is not valid JSON' };

    const raw = resolved.parseResponse(json);
    if (!raw) return { ok: false, error: 'Could not extract content from API response' };

    // 从 API 响应中提取实际使用的模型名称（OpenAI/Anthropic 格式均在 json.model 中）
    const actualModel = json.model || resolved.model;

    const validTags = Object.keys(tagDescriptions);
    const parsed = parseAIClassification(raw, validTags);

    if (parsed && parsed.length > 0) {
      return { ok: true, model: actualModel, sampleTag: parsed[0].tag };
    }
    return { ok: true, model: actualModel, sampleTag: null, warning: 'Response received but no valid tags returned' };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'Request timeout' : err.message };
  }
}

// ===== 合并 AI 结果到已有规则标签 =====
function mergeAITags(ruleTags, aiTags, maxTags = 3) {
  if (!aiTags || aiTags.length === 0) return ruleTags;

  const merged = new Map();
  for (const t of ruleTags || []) {
    const tag = normalizeSuggestedTagName(t?.tag, []);
    if (!tag) continue;
    merged.set(tag.toLowerCase(), { ...t, tag });
  }

  for (const ai of normalizeSuggestedAITags(aiTags, [], true)) {
    const key = ai.tag.toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      existing.score = (existing.score || 0) + ai.confidence * AI_WEIGHT;
      existing.signals = [...(existing.signals || []), `ai:${ai.confidence.toFixed(2)}`];
      existing.confidence = Math.min(1, (existing.confidence || 0) + ai.confidence * 0.2);
    } else {
      merged.set(key, {
        tag: ai.tag,
        score: ai.confidence * AI_WEIGHT,
        confidence: ai.confidence,
        signals: [`ai:${ai.confidence.toFixed(2)}`],
        source: 'ai'
      });
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxTags);
}
