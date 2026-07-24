// ===== DOM 引用 =====
const backBtn = document.getElementById('backBtn');
const workspaceBtn = document.getElementById('workspaceBtn');
const aiClassifyBtn = document.getElementById('aiClassifyBtn');
const bookmarkNavBtn = document.getElementById('bookmarkNavBtn');
const checkerBtn = document.getElementById('checkerBtn');
const graphBtn = document.getElementById('graphBtn');
const settingsBtn = document.getElementById('settingsBtn');
const themeSelect = document.getElementById('themeSelect');
const languageSelect = document.getElementById('languageSelect');
const checkerFrequencySelect = document.getElementById('checkerFrequencySelect');
const checkerDayOfWeekRow = document.getElementById('checkerDayOfWeekRow');
const checkerDayOfWeekSelect = document.getElementById('checkerDayOfWeekSelect');
const checkerDayOfMonthRow = document.getElementById('checkerDayOfMonthRow');
const checkerDayOfMonthSelect = document.getElementById('checkerDayOfMonthSelect');
const checkerTimeRow = document.getElementById('checkerTimeRow');
const checkerTimeInput = document.getElementById('checkerTimeInput');
const checkerAutoDeleteRow = document.getElementById('checkerAutoDeleteRow');
const checkerAutoDeleteToggle = document.getElementById('checkerAutoDeleteToggle');
checkerAutoDeleteToggle.disabled = true;
const checkerTimeoutSelect = document.getElementById('checkerTimeoutSelect');
const checkerConcurrencySelect = document.getElementById('checkerConcurrencySelect');
const checkerRetriesSelect = document.getElementById('checkerRetriesSelect');
const checkerBackoffBaseSelect = document.getElementById('checkerBackoffBaseSelect');
const checkerBackoffMaxSelect = document.getElementById('checkerBackoffMaxSelect');
const openCheckerBtn = document.getElementById('openCheckerBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const exportHtmlBtn = document.getElementById('exportHtmlBtn');
const importFileBtn = document.getElementById('importFileBtn');
const importFileInput = document.getElementById('importFileInput');
const importOperationsList = document.getElementById('importOperationsList');
const refreshImportOperationsBtn = document.getElementById('refreshImportOperationsBtn');
const retentionDaysSelect = document.getElementById('retentionDaysSelect');
const previewEnabledToggle = document.getElementById('previewEnabledToggle');
const previewCacheTTLSelect = document.getElementById('previewCacheTTLSelect');
const previewMaxEntriesSelect = document.getElementById('previewMaxEntriesSelect');
const previewCacheStatsDesc = document.getElementById('previewCacheStatsDesc');
const clearPreviewCacheBtn = document.getElementById('clearPreviewCacheBtn');
const mdiWindowEnabledToggle = document.getElementById('mdiWindowEnabledToggle');
const toastContainer = document.getElementById('toastContainer');
const shortcutQuickBookmark = document.getElementById('shortcutQuickBookmark');
const shortcutOpenPalette = document.getElementById('shortcutOpenPalette');
const shortcutOpenPopup = document.getElementById('shortcutOpenPopup');
const shortcutConflicts = document.getElementById('shortcutConflicts');
const conflictDetails = document.getElementById('conflictDetails');
const openShortcutsPageLink = document.getElementById('openShortcutsPageLink');

// ===== RSS 订阅设置 DOM 引用 =====
const rssPollIntervalSelect = document.getElementById('rssPollIntervalSelect');
const rssMaxItemsSelect = document.getElementById('rssMaxItemsSelect');
const rssDefaultFolderSelect = document.getElementById('rssDefaultFolderSelect');
const rssAutoDiscoverToggle = document.getElementById('rssAutoDiscoverToggle');
const rssNotifyNewToggle = document.getElementById('rssNotifyNewToggle');
const rssProxyFallbackToggle = document.getElementById('rssProxyFallbackToggle');
const rssProxyUrlRow = document.getElementById('rssProxyUrlRow');
const rssProxyUrlInput = document.getElementById('rssProxyUrlInput');
const rssProxyTestBtn = document.getElementById('rssProxyTestBtn');
const rssProxySaveBtn = document.getElementById('rssProxySaveBtn');
const rssProxyTestResult = document.getElementById('rssProxyTestResult');
const rssRefreshAllBtn = document.getElementById('rssRefreshAllBtn');
const rssLastUpdatedDesc = document.getElementById('rssLastUpdatedDesc');
const rssUnreadBadge = document.getElementById('rssUnreadBadge');

// ===== 智能标签规则 DOM 引用 =====
const domainRuleDomains = document.getElementById('domainRuleDomains');
const domainRuleTag = document.getElementById('domainRuleTag');
const addDomainRuleBtn = document.getElementById('addDomainRuleBtn');
const domainRulesList = document.getElementById('domainRulesList');
const keywordRuleTag = document.getElementById('keywordRuleTag');
const keywordRuleKeyword = document.getElementById('keywordRuleKeyword');
const addKeywordRuleBtn = document.getElementById('addKeywordRuleBtn');
const keywordRulesList = document.getElementById('keywordRulesList');
const stopWordInput = document.getElementById('stopWordInput');
const addStopWordBtn = document.getElementById('addStopWordBtn');
const stopWordsList = document.getElementById('stopWordsList');
const clearLearnedTagsBtn = document.getElementById('clearLearnedTagsBtn');
const learnedTagsList = document.getElementById('learnedTagsList');

// ===== 主动学习 DOM 引用 =====
const activeLearningBadge = document.getElementById('activeLearningBadge');
const learningStatsDesc = document.getElementById('learningStatsDesc');
const viewLearningRecordsBtn = document.getElementById('viewLearningRecordsBtn');
const clearLearningRecordsBtn = document.getElementById('clearLearningRecordsBtn');
const learningFeedbackList = document.getElementById('learningFeedbackList');
const clearReviewQueueBtn = document.getElementById('clearReviewQueueBtn');
const pendingReviewsList = document.getElementById('pendingReviewsList');
const recommendationRuleTabs = document.getElementById('recommendationRuleTabs');
const recommendationRulesList = document.getElementById('recommendationRulesList');
const undoRecommendationLearningBtn = document.getElementById('undoRecommendationLearningBtn');
const rebuildRecommendationLearningBtn = document.getElementById('rebuildRecommendationLearningBtn');
const reevaluateBookmarksBtn = document.getElementById('reevaluateBookmarksBtn');
const reevaluationResults = document.getElementById('reevaluationResults');

// ===== 通知设置 DOM 引用 =====
const notificationEnabledToggle = document.getElementById('notificationEnabledToggle');

// ===== AI 辅助分类 DOM 引用 =====
const aiEnabledToggle = document.getElementById('aiEnabledToggle');
const aiProviderSelect = document.getElementById('aiProviderSelect');
const aiApiKeyInput = document.getElementById('aiApiKeyInput');
const aiModelInput = document.getElementById('aiModelInput');
const aiTimeoutInput = document.getElementById('aiTimeoutInput');
const aiRetryCountInput = document.getElementById('aiRetryCountInput');
const aiTestBtn = document.getElementById('aiTestBtn');
const aiClearCacheBtn = document.getElementById('aiClearCacheBtn');
const aiStatusDesc = document.getElementById('aiStatusDesc');
const aiCustomFields = document.getElementById('aiCustomFields');
const aiCustomFormatSelect = document.getElementById('aiCustomFormatSelect');
const aiCustomEndpointInput = document.getElementById('aiCustomEndpointInput');
const aiFullUrlToggle = document.getElementById('aiFullUrlToggle');
const aiEndpointHintText = document.getElementById('aiEndpointHintText');
const aiEndpointHintFullUrl = document.getElementById('aiEndpointHintFullUrl');
const aiLogsHeader = document.getElementById('aiLogsHeader');
const aiLogsBody = document.getElementById('aiLogsBody');
const aiLogsToggleIcon = document.getElementById('aiLogsToggleIcon');
const aiLogsStats = document.getElementById('aiLogsStats');
const aiLogsList = document.getElementById('aiLogsList');
const aiRefreshLogsBtn = document.getElementById('aiRefreshLogsBtn');
const aiClearLogsBtn = document.getElementById('aiClearLogsBtn');
const aiAssistLogicToggle = document.getElementById('aiAssistLogicToggle');
const aiPageContentToggle = document.getElementById('aiPageContentToggle');
const aiAssistPromptInput = document.getElementById('aiAssistPromptInput');
const aiResetAssistPromptBtn = document.getElementById('aiResetAssistPromptBtn');

const DEFAULT_AI_ASSIST_PROMPT = `你是 AI 书签辅助分类助手。请根据单个书签的标题、URL、域名、页面摘要、原文件夹和规则引擎候选标签，判断它最适合的用途与分类标签。

处理原则：
1. 优先根据标题判断用途；标题不足时结合域名、URL 路径、页面摘要和原文件夹。
2. 标签应为 1-3 个中文通用领域词，简洁稳定，避免过细、过长或重复。
3. 可参考但不限于：前端开发、后端开发、设计资源、新闻资讯、学习教程、效率工具、开发工具、数据分析、云服务、产品运营、娱乐、购物、社交媒体、文档资料。
4. 与办公、企业内部系统、客户、供应商、项目协作、管理后台、文档平台、工单、CRM、ERP、邮箱、会议、招聘、财务、人事、合同、报销相关的书签，应优先识别公司或组织名称，让同一公司相关书签稳定聚合。
5. 如果信息不足，请给出最可能的保守分类，不要使用“未知”“其他”等空泛标签。
6. 输出必须严格遵守调用方要求的 JSON 格式，不要输出 Markdown、代码块、解释说明或任何额外文字。`;

// ===== 统计 DOM 引用 =====
const statsStartDate = document.getElementById('statsStartDate');
const statsEndDate = document.getElementById('statsEndDate');
const statsApplyRangeBtn = document.getElementById('statsApplyRangeBtn');
const statsResetRangeBtn = document.getElementById('statsResetRangeBtn');
const statTotal = document.getElementById('statTotal');
const statTags = document.getElementById('statTags');
const statDomains = document.getElementById('statDomains');
const statFolders = document.getElementById('statFolders');
const healthScoreValue = document.getElementById('healthScoreValue');
const healthScoreDetails = document.getElementById('healthScoreDetails');
const healthScoreDesc = document.getElementById('healthScoreDesc');
const favoriteHealthScoreBtn = document.getElementById('favoriteHealthScoreBtn');
const trendTabs = document.getElementById('trendTabs');
const trendChart = document.getElementById('trendChart');
const tagsChart = document.getElementById('tagsChart');
const domainsChart = document.getElementById('domainsChart');
const hoursChart = document.getElementById('hoursChart');
const foldersChart = document.getElementById('foldersChart');
const accuracyTrendChart = document.getElementById('accuracyTrendChart');
const accuracyTrendEmpty = document.getElementById('accuracyTrendEmpty');
const exportStatsCsvBtn = document.getElementById('exportStatsCsvBtn');
const exportStatsPdfBtn = document.getElementById('exportStatsPdfBtn');
const healthFavoritesSection = document.getElementById('healthFavoritesSection');
const healthFavoritesList = document.getElementById('healthFavoritesList');

// ===== 导航切换 =====
const navItems = document.querySelectorAll('.nav-item');
const panelSections = document.querySelectorAll('.panel-section');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const panelId = item.dataset.panel;

    // 更新导航高亮
    navItems.forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');

    // 切换面板
    panelSections.forEach(panel => {
      panel.classList.remove('active');
      if (panel.id === `panel-${panelId}`) {
        panel.classList.add('active');
      }
    });

    // 首次打开统计面板时加载数据
    if (panelId === 'stats') {
      loadStatsPanel();
    }
  });
});

function openSettingsPanelFromLocation() {
  const params = new URLSearchParams(window.location.search || '');
  const targetPanel = params.get('panel') || window.location.hash.replace('#', '') || 'shortcuts';
  const targetNav = document.querySelector(`.nav-item[data-panel="${targetPanel}"]`);
  if (targetNav) targetNav.click();
}

window.addEventListener('hashchange', openSettingsPanelFromLocation);

// ===== Toast 提示 =====
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 2500);
}

// ===== 主题管理 =====
function applyTheme(theme) {
  document.body.classList.remove('theme-light', 'theme-dark');
  
  if (theme === 'light') {
    document.body.classList.add('theme-light');
  } else if (theme === 'dark') {
    document.body.classList.add('theme-dark');
  }
}

async function loadTheme() {
  const result = await chrome.storage.local.get('theme');
  const theme = result.theme || 'system';
  themeSelect.value = theme;
  applyTheme(theme);
}

async function saveTheme(theme) {
  await chrome.storage.local.set({ theme });
  applyTheme(theme);
}

// ===== 语言管理 =====
async function loadLanguage() {
  try {
    const result = await chrome.storage.local.get('language');
    const language = result.language || 'system';
    languageSelect.value = language;
    setCurrentLang(language);
    applyI18n();
    const resolved = language === 'system' ? (navigator.language || 'en') : language;
    document.documentElement.lang = String(resolved).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
  } catch {
    setCurrentLang('system');
    applyI18n();
  } finally {
    document.documentElement.classList.remove('i18n-pending');
  }
}

async function saveLanguage(language) {
  await chrome.storage.local.set({ language });
  setCurrentLang(language);
  applyI18n();
  if (recommendationLearningState) {
    renderLearningStats(null, recommendationLearningState.stats);
    renderLearningFeedback(recommendationLearningState.recentFeedback || []);
  }
}

// ===== 失效检测设置管理 =====
const CHECKER_NUMBER_DEFAULTS = {
  checkerTimeout: 10000,
  checkerConcurrency: 5,
  checkerRetries: 2,
  checkerBackoffBase: 800,
  checkerBackoffMax: 3000
};
const CHECKER_NUMBER_LIMITS = {
  checkerTimeout: [1, 120000],
  checkerConcurrency: [1, 5],
  checkerRetries: [0, 10],
  checkerBackoffBase: [0, 30000],
  checkerBackoffMax: [0, 60000],
};

function normalizeCheckerNumber(value, key) {
  const number = Number(value);
  const fallback = CHECKER_NUMBER_DEFAULTS[key];
  if (!Number.isFinite(number)) return fallback;
  const [min, max] = CHECKER_NUMBER_LIMITS[key];
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function applyCheckerNumberChange(key, change, select) {
  const value = normalizeCheckerNumber(change.newValue, key);
  select.value = String(value);
  if (change.newValue !== undefined && change.newValue !== value) {
    chrome.storage.local.set({ [key]: value }).catch(() => {});
  }
}

function requestCheckerSchedulePermission() {
  try {
    return chrome.permissions.request({ origins: ['<all_urls>'] }).catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

async function loadCheckerSettings() {
  const result = await chrome.storage.local.get([
    'checkerFrequency', 'checkerTime', 'checkerDayOfWeek', 'checkerDayOfMonth',
    'checkerAutoDelete', 'checkerTimeout', 'checkerConcurrency',
    'checkerRetries', 'checkerBackoffBase', 'checkerBackoffMax'
  ]);
  checkerFrequencySelect.value = result.checkerFrequency || 'never';
  checkerDayOfWeekSelect.value = String(result.checkerDayOfWeek ?? 1);
  populateCheckerDayOfMonthOptions(result.checkerDayOfMonth ?? 1);
  checkerTimeInput.value = result.checkerTime || '03:00';
  checkerAutoDeleteToggle.checked = false;
  const normalizedNumbers = {};
  const numericMigrations = {};
  for (const key of Object.keys(CHECKER_NUMBER_DEFAULTS)) {
    const value = normalizeCheckerNumber(result[key], key);
    normalizedNumbers[key] = value;
    if (result[key] !== undefined && result[key] !== value) numericMigrations[key] = value;
  }
  checkerTimeoutSelect.value = String(normalizedNumbers.checkerTimeout);
  checkerConcurrencySelect.value = String(normalizedNumbers.checkerConcurrency);
  checkerRetriesSelect.value = String(normalizedNumbers.checkerRetries);
  checkerBackoffBaseSelect.value = String(normalizedNumbers.checkerBackoffBase);
  checkerBackoffMaxSelect.value = String(normalizedNumbers.checkerBackoffMax);
  if (Object.keys(numericMigrations).length > 0) {
    await chrome.storage.local.set(numericMigrations);
  }
  // 根据频率显示/隐藏时间设置和自动删除
  toggleCheckerScheduleRows(result.checkerFrequency || 'never');
}

function populateCheckerDayOfMonthOptions(selectedDay = 1) {
  if (!checkerDayOfMonthSelect) return;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(Math.max(1, selectedDay), daysInMonth);
  checkerDayOfMonthSelect.innerHTML = '';
  for (let d = 1; d <= daysInMonth; d++) {
    const option = document.createElement('option');
    option.value = String(d);
    option.textContent = `${d} 日`;
    if (d === safeDay) option.selected = true;
    checkerDayOfMonthSelect.appendChild(option);
  }
}

function toggleCheckerScheduleRows(frequency) {
  const show = frequency !== 'never';
  const showWeekly = frequency === 'weekly';
  const showMonthly = frequency === 'monthly';
  if (checkerDayOfWeekRow) {
    checkerDayOfWeekRow.classList.toggle('hidden-row', !showWeekly);
  }
  if (checkerDayOfMonthRow) {
    checkerDayOfMonthRow.classList.toggle('hidden-row', !showMonthly);
  }
  if (checkerTimeRow) {
    checkerTimeRow.classList.toggle('hidden-row', !show);
  }
  if (checkerAutoDeleteRow) {
    checkerAutoDeleteRow.classList.add('hidden-row');
  }
}

async function saveCheckerSetting(key, value) {
  await chrome.storage.local.set({ [key]: value });
  // 如果修改了检测频率或日期/时间，需要重新调度闹钟
  if (['checkerFrequency', 'checkerTime', 'checkerDayOfWeek', 'checkerDayOfMonth'].includes(key)) {
    try {
      await chrome.runtime.sendMessage({ action: 'scheduleChecker' });
    } catch (e) {
      // background 可能未就绪
    }
  }
}

// ===== 最近删除设置 =====
async function loadRetentionDays() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getAppSettings' });
    const days = (res && res.settings && res.settings.tombstoneRetentionDays) || 7;
    retentionDaysSelect.value = String(days);
  } catch (e) {
    retentionDaysSelect.value = '7';
  }
}

async function saveRetentionDays(days) {
  await chrome.runtime.sendMessage({
    action: 'updateAppSettings',
    patch: { tombstoneRetentionDays: Number(days) }
  });
}

// ===== 网页预览设置 (Mozilla Readability) =====
async function loadPreviewSettings() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getPreviewSettings' });
    const s = (res && res.settings) || {};
    previewEnabledToggle.checked = s.previewEnabled !== false;
    previewCacheTTLSelect.value = String(s.previewCacheTTL ?? 30);
    previewMaxEntriesSelect.value = String(s.previewMaxCacheEntries ?? 500);
    mdiWindowEnabledToggle.checked = s.mdiWindowEnabled === true;
  } catch (e) {
    previewEnabledToggle.checked = true;
    previewCacheTTLSelect.value = '30';
    previewMaxEntriesSelect.value = '500';
    mdiWindowEnabledToggle.checked = false;
  }
  await refreshPreviewCacheStats();
}

async function refreshPreviewCacheStats() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getPreviewCacheStats' });
    const stats = (res && res.stats) || { count: 0, totalChars: 0 };
    if (stats.count === 0) {
      previewCacheStatsDesc.textContent = i18n('previewCacheEmpty') || '空';
    } else {
      const text = (i18n('previewCacheStatsText') || '$1 条 · $2 字符')
        .replace('$1', stats.count)
        .replace('$2', stats.totalChars);
      previewCacheStatsDesc.textContent = text;
    }
  } catch (e) {
    previewCacheStatsDesc.textContent = '—';
  }
}

async function savePreviewSetting(patch) {
  await chrome.runtime.sendMessage({ action: 'updatePreviewSettings', patch });
}

// ===== RSS 订阅设置 =====
// 扁平化书签文件夹树，返回 [{ id, title, depth }]（仅文件夹节点）
function flattenBookmarkFolders(nodes, depth = 0, out = []) {
  for (const n of nodes || []) {
    if (n.children !== undefined) {
      out.push({ id: n.id, title: n.title || '', depth });
      if (n.children && n.children.length) {
        flattenBookmarkFolders(n.children, depth + 1, out);
      }
    }
  }
  return out;
}

// 填充默认书签文件夹下拉
async function populateRssFolderSelect(selectedId = null) {
  if (!rssDefaultFolderSelect) return;
  try {
    const tree = await chrome.bookmarks.getTree();
    const folders = flattenBookmarkFolders(tree);
    // 保留首项 "— None —"
    rssDefaultFolderSelect.innerHTML = '';
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.setAttribute('data-i18n', 'rssDefaultFolderNone');
    noneOpt.textContent = i18n('rssDefaultFolderNone') || '— None —';
    rssDefaultFolderSelect.appendChild(noneOpt);
    for (const f of folders) {
      // 跳过根节点（id 为 '0'），其本身无意义
      if (f.id === '0') continue;
      const opt = document.createElement('option');
      opt.value = f.id;
      const indent = '\u00A0\u00A0'.repeat(f.depth);
      opt.textContent = indent + (f.title || '(unnamed)');
      rssDefaultFolderSelect.appendChild(opt);
    }
    rssDefaultFolderSelect.value = selectedId || '';
  } catch (e) {
    console.warn('populateRssFolderSelect failed:', e);
  }
}

async function loadRssSettings() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'rssGetSettings' });
    const s = (res && res.settings) || {};
    rssPollIntervalSelect.value = String(s.pollIntervalMin ?? 30);
    rssMaxItemsSelect.value = String(s.maxItemsPerFeed ?? 100);
    rssAutoDiscoverToggle.checked = s.autoDiscover !== false;
    rssNotifyNewToggle.checked = s.notifyNew !== false;
    rssProxyFallbackToggle.checked = s.proxyFallback === true;
    rssProxyUrlInput.value = s.proxyUrl || '';
    updateProxyRowState();
    await populateRssFolderSelect(s.defaultFolderId || null);
    await refreshRssLastUpdated();
    await refreshRssUnreadBadge();
  } catch (e) {
    rssPollIntervalSelect.value = '30';
    rssMaxItemsSelect.value = '100';
    rssAutoDiscoverToggle.checked = true;
    rssNotifyNewToggle.checked = true;
    rssProxyFallbackToggle.checked = false;
    rssProxyUrlInput.value = '';
    updateProxyRowState();
    await populateRssFolderSelect(null);
  }
}

// 根据代理回退开关启用/禁用代理 URL 配置行
function updateProxyRowState() {
  rssProxyUrlRow.classList.toggle('is-disabled', !rssProxyFallbackToggle.checked);
}

async function saveRssSetting(patch) {
  await chrome.runtime.sendMessage({ action: 'rssSetSettings', patch });
}

// 刷新"最后更新"文本
async function refreshRssLastUpdated() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'rssGetFeeds' });
    const feeds = (res && res.feeds) || [];
    if (feeds.length === 0) {
      rssLastUpdatedDesc.textContent = i18n('rssNoFeeds') || '暂无订阅';
      return;
    }
    let latest = 0;
    for (const f of feeds) {
      if (f.lastFetched && f.lastFetched > latest) latest = f.lastFetched;
    }
    if (latest === 0) {
      rssLastUpdatedDesc.textContent = i18n('rssNever') || '从未更新';
    } else {
      const d = new Date(latest);
      const ts = d.toLocaleString();
      rssLastUpdatedDesc.textContent = (i18n('rssLastUpdated') || '上次更新：$1').replace('$1', ts);
    }
  } catch {
    rssLastUpdatedDesc.textContent = '—';
  }
}

// 刷新导航未读徽标
async function refreshRssUnreadBadge() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'rssGetFeeds' });
    const feeds = (res && res.feeds) || [];
    if (feeds.length === 0) {
      rssUnreadBadge.style.display = 'none';
      return;
    }
    const itemsRes = await chrome.runtime.sendMessage({ action: 'rssGetItems', all: true });
    const items = (itemsRes && itemsRes.items) || [];
    const unread = items.filter(i => !i.read).length;
    if (unread > 0) {
      rssUnreadBadge.textContent = unread > 99 ? '99+' : String(unread);
      rssUnreadBadge.style.display = '';
    } else {
      rssUnreadBadge.style.display = 'none';
    }
  } catch {
    rssUnreadBadge.style.display = 'none';
  }
}

// 用于在自定义和内置 provider 之间切换时临时保留字段值
let _aiProviderInputCache = {};

// ===== AI 辅助分类设置 =====
// Keep in sync with TREE_PROVIDERS / AI pyramid classification
const ASSIST_PROVIDERS = {
  agnes: { id: 'agnes', label: 'Agnes AI', defaultModel: 'agnes-2.0-flash', baseUrl: 'https://apihub.agnes-ai.com/v1' },
  openrouter: { id: 'openrouter', label: 'OpenRouter', defaultModel: 'openai/gpt-4o-mini', baseUrl: 'https://openrouter.ai/api/v1' },
  openai: { id: 'openai', label: 'OpenAI (Codex)', defaultModel: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
  claude: { id: 'claude', label: 'Claude (Anthropic)', defaultModel: 'claude-3-5-haiku-latest', baseUrl: 'https://api.anthropic.com/v1' },
  gemini: { id: 'gemini', label: 'Gemini (Google)', defaultModel: 'gemini-2.0-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  deepseek: { id: 'deepseek', label: 'DeepSeek', defaultModel: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' },
  custom: { id: 'custom', label: '自定义', defaultModel: 'gpt-4o-mini', baseUrl: '' },
};
const ASSIST_LEGACY_ENDPOINTS = {
  zhipu: { endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', format: 'openai', model: 'glm-4-flash' },
  tongyi: { endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', format: 'openai', model: 'qwen-turbo' },
  google: { endpoint: 'https://generativelanguage.googleapis.com/v1beta', format: 'gemini', model: 'gemini-2.0-flash' },
};
function normalizeAssistProvider(provider, config = {}) {
  let p = provider || 'agnes';
  if (p === 'google') p = 'gemini';
  if (Object.prototype.hasOwnProperty.call(ASSIST_PROVIDERS, p)) return { provider: p, config };
  const legacy = ASSIST_LEGACY_ENDPOINTS[p];
  if (legacy) {
    return {
      provider: 'custom',
      config: {
        ...config,
        customEndpoint: config.customEndpoint || legacy.endpoint,
        customFormat: config.customFormat || legacy.format,
        model: config.model || legacy.model,
      }
    };
  }
  return { provider: 'custom', config };
}

async function loadAISettings() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getAIConfig' });
    const c = (res && res.config) || {};
    aiEnabledToggle.checked = !!c.enabled;
    const normalized = normalizeAssistProvider(c.provider, c);
    const cfg = normalized.config;
    let provider = normalized.provider;
    if (aiProviderSelect && ![...aiProviderSelect.options].some((o) => o.value === provider)) {
      provider = 'custom';
    }
    if (aiProviderSelect) aiProviderSelect.value = provider;
    aiApiKeyInput.value = cfg.apiKey || '';
    aiModelInput.value = cfg.model || '';
    if (aiModelInput) {
      aiModelInput.placeholder = (ASSIST_PROVIDERS[provider] && ASSIST_PROVIDERS[provider].defaultModel) || 'agnes-2.0-flash';
    }
    aiTimeoutInput.value = String(cfg.timeout ?? 8);
    if (aiRetryCountInput) aiRetryCountInput.value = String(Math.max(0, Math.min(5, Math.round(Number(cfg.retryCount ?? 2)))));
    if (aiAssistLogicToggle) aiAssistLogicToggle.checked = cfg.assistClassificationEnabled !== false;
    if (aiPageContentToggle) aiPageContentToggle.checked = cfg.allowPageContentForAi !== false;
    if (aiAssistPromptInput) aiAssistPromptInput.value = cfg.assistPrompt || DEFAULT_AI_ASSIST_PROMPT;
    if (aiCustomFormatSelect) {
      const fmt = cfg.customFormat === 'google' ? 'gemini' : (cfg.customFormat || 'openai');
      aiCustomFormatSelect.value = fmt;
    }
    if (aiCustomEndpointInput) aiCustomEndpointInput.value = cfg.customEndpoint || '';
    if (aiFullUrlToggle) aiFullUrlToggle.checked = !!cfg.customFullUrl;
    _aiProviderInputCache = {
      [provider]: {
        apiKey: cfg.apiKey || '',
        model: cfg.model || '',
        endpoint: cfg.customEndpoint || ''
      }
    };
    if (aiProviderSelect) aiProviderSelect.dataset.previousProvider = provider;
  } catch (e) {
    aiEnabledToggle.checked = false;
  }
  toggleCustomFields();
  updateAIEndpointHint();
  clearAIValidationErrors();
  await refreshAIStatus();
}

function switchAIProvider(newProvider) {
  const previousProvider = aiProviderSelect.dataset.previousProvider || aiProviderSelect.value;

  _aiProviderInputCache[previousProvider] = {
    apiKey: aiApiKeyInput.value,
    model: aiModelInput.value,
    endpoint: aiCustomEndpointInput ? aiCustomEndpointInput.value : ''
  };

  const cached = _aiProviderInputCache[newProvider] || {};
  aiApiKeyInput.value = cached.apiKey || '';
  aiModelInput.value = cached.model || '';
  if (aiCustomEndpointInput) aiCustomEndpointInput.value = cached.endpoint || '';
  if (aiModelInput) {
    aiModelInput.placeholder = (ASSIST_PROVIDERS[newProvider] && ASSIST_PROVIDERS[newProvider].defaultModel) || 'model-name';
  }

  aiProviderSelect.dataset.previousProvider = newProvider;
  toggleCustomFields();
  updateAIEndpointHint();
}

function toggleCustomFields() {
  const isCustom = aiProviderSelect.value === 'custom';
  if (aiCustomFields) {
    aiCustomFields.style.display = isCustom ? '' : 'none';
  }
}

function updateAIEndpointHint() {
  if (!aiEndpointHintText || !aiEndpointHintFullUrl) return;
  const isFullUrl = aiFullUrlToggle && aiFullUrlToggle.checked;
  aiEndpointHintText.style.display = isFullUrl ? 'none' : '';
  aiEndpointHintFullUrl.style.display = isFullUrl ? '' : 'none';

  if (!isFullUrl) {
    const format = aiCustomFormatSelect ? aiCustomFormatSelect.value : 'openai';
    if (format === 'anthropic') {
      aiEndpointHintText.textContent = i18n('aiEndpointHintAnthropic') || '请填写兼容 Anthropic Messages 的服务端点地址，不要以斜杠结尾。/v1/messages 将会被补充到地址末尾。';
    } else if (format === 'gemini' || format === 'google') {
      aiEndpointHintText.textContent = '请填写 Gemini API Base（例如 https://generativelanguage.googleapis.com/v1beta）。模型名会拼接到请求路径中。';
    } else {
      aiEndpointHintText.textContent = i18n('aiEndpointHintOpenAI') || '请填写兼容 OpenAI API 的服务端点地址，不要以斜杠结尾。/chat/completions 将会被补充到你填写的地址末尾。';
    }
  }
}

function buildAIConfigFromUI() {
  return {
    enabled: aiEnabledToggle.checked,
    provider: aiProviderSelect.value,
    apiKey: aiApiKeyInput.value.trim(),
    model: aiModelInput.value.trim(),
    timeout: Math.max(3, Math.min(30, parseInt(aiTimeoutInput.value, 10) || 8)),
    retryCount: Math.max(0, Math.min(5, parseInt(aiRetryCountInput?.value, 10) || 0)),
    customFormat: aiCustomFormatSelect ? aiCustomFormatSelect.value : 'openai',
    customEndpoint: aiCustomEndpointInput ? aiCustomEndpointInput.value.trim() : '',
    customFullUrl: !!(aiFullUrlToggle && aiFullUrlToggle.checked),
    assistClassificationEnabled: aiAssistLogicToggle ? aiAssistLogicToggle.checked : true,
    allowPageContentForAi: aiPageContentToggle ? aiPageContentToggle.checked : true,
    assistPrompt: aiAssistPromptInput ? (aiAssistPromptInput.value.trim() || DEFAULT_AI_ASSIST_PROMPT) : DEFAULT_AI_ASSIST_PROMPT
  };
}

function validateAIConfig(config) {
  const errors = [];
  if (!config.enabled) return { valid: true, errors };

  const isCustom = config.provider === 'custom';

  if (!config.apiKey) {
    errors.push({ field: 'apiKey', message: i18n('aiApiKeyRequired') || '请填写 API Key' });
  }
  if (!config.model) {
    errors.push({ field: 'model', message: i18n('aiModelRequired') || '请填写模型名' });
  }
  if (isCustom && !config.customEndpoint) {
    errors.push({ field: 'customEndpoint', message: i18n('aiCustomEndpointRequired') || '请填写 API 地址' });
  }

  return { valid: errors.length === 0, errors };
}

function markAIFieldError(field, hasError) {
  const map = {
    apiKey: aiApiKeyInput,
    model: aiModelInput,
    customEndpoint: aiCustomEndpointInput
  };
  const el = map[field];
  if (!el) return;
  if (hasError) {
    el.classList.add('tagrule-input--error');
  } else {
    el.classList.remove('tagrule-input--error');
  }
}

function clearAIValidationErrors() {
  ['apiKey', 'model', 'customEndpoint'].forEach(field => markAIFieldError(field, false));
}

function applyAIValidationErrors(errors) {
  clearAIValidationErrors();
  errors.forEach(err => markAIFieldError(err.field, true));
}

async function saveAIConfig() {
  const config = buildAIConfigFromUI();
  const validation = validateAIConfig(config);
  if (!validation.valid) {
    applyAIValidationErrors(validation.errors);
    showToast(validation.errors[0].message, 'error');
    return;
  }
  clearAIValidationErrors();
  try {
    const res = await chrome.runtime.sendMessage({ action: 'setAIConfig', config });
    if (!res || !res.success) throw new Error(res?.error || 'save_failed');
    await refreshAIStatus();
    showToast(i18n('settingsSaved'), 'success');
  } catch (e) {
    showToast(i18n('saveFailed') || '保存失败', 'error');
  }
}

async function onAIEnabledToggle(e) {
  const config = buildAIConfigFromUI();
  config.enabled = e.target.checked;
  const validation = validateAIConfig(config);
  if (!validation.valid) {
    e.target.checked = false;
    applyAIValidationErrors(validation.errors);
    showToast(validation.errors[0].message, 'error');
    return;
  }
  clearAIValidationErrors();
  await saveAIConfig();
}

async function refreshAIStatus() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getAIStats' });
    const stats = (res && res.stats) || {};
    const enabled = aiEnabledToggle.checked;
    const hasKey = !!(aiApiKeyInput.value || '').trim();

    if (!enabled) {
      aiStatusDesc.textContent = i18n('aiStatusDisabled') || 'AI 已关闭';
      return;
    }
    if (!hasKey) {
      aiStatusDesc.textContent = i18n('aiStatusNoKey') || '未填写 API Key';
      return;
    }

    const triggered = stats.totalTriggered || 0;
    const success = stats.successCount || 0;
    const fail = stats.failCount || 0;
    const avg = stats.avgLatencyMs || 0;
    const template = i18n('aiStatusFormat') || '触发 $1 次 · 成功 $2 次 · 失败 $3 次 · 平均 $4ms';
    aiStatusDesc.textContent = template
      .replace('$1', triggered)
      .replace('$2', success)
      .replace('$3', fail)
      .replace('$4', avg);
  } catch (e) {
    aiStatusDesc.textContent = '—';
  }
}

function getApiPermissionDetails(endpoint) {
  try {
    const url = new URL(String(endpoint || '').trim());
    if (!/^https?:$/.test(url.protocol) || !url.hostname) return null;
    return {
      origin: `${url.protocol}//${url.hostname}/*`,
      host: url.host,
    };
  } catch (_) {
    return null;
  }
}

const AI_PROVIDER_PERMISSION_ENDPOINTS = {
  agnes: 'https://apihub.agnes-ai.com/',
  openrouter: 'https://openrouter.ai/',
  openai: 'https://api.openai.com/',
  claude: 'https://api.anthropic.com/',
  gemini: 'https://generativelanguage.googleapis.com/',
  deepseek: 'https://api.deepseek.com/',
  zhipu: 'https://open.bigmodel.cn/',
  google: 'https://generativelanguage.googleapis.com/',
  tongyi: 'https://dashscope.aliyuncs.com/',
};

function getAIConnectionPermissionEndpoint(config) {
  return config.provider === 'custom'
    ? config.customEndpoint
    : AI_PROVIDER_PERMISSION_ENDPOINTS[config.provider] || '';
}

async function ensureApiHostPermission(endpoint) {
  const details = getApiPermissionDetails(endpoint);
  if (!details) return { granted: false, error: 'API 请求地址无效' };
  if (typeof chrome === 'undefined' || !chrome.permissions) {
    return { granted: false, error: '浏览器不支持站点访问授权' };
  }
  try {
    const granted = await chrome.permissions.request({ origins: [details.origin] });
    return granted
      ? { granted: true }
      : { granted: false, error: `未授予 ${details.host} 的访问权限` };
  } catch (_) {
    return { granted: false, error: `无法申请 ${details.host} 的访问权限` };
  }
}

async function testAIConnection() {
  const config = buildAIConfigFromUI();
  if (!config.apiKey) {
    showToast(i18n('aiStatusNoKey') || '请填写 API Key', 'error');
    return;
  }

  try {
    const permissionEndpoint = getAIConnectionPermissionEndpoint(config);
    if (permissionEndpoint) {
      const permission = await ensureApiHostPermission(permissionEndpoint);
      if (!permission.granted) {
        showToast(permission.error, 'error');
        return;
      }
    }
    const endpointResult = await chrome.runtime.sendMessage({ action: 'getAIConnectionEndpoint', config });
    if (!endpointResult?.success || !endpointResult.endpoint) {
      showToast('API 服务商配置无效，请检查地址和协议', 'error');
      return;
    }
    if (!permissionEndpoint) {
      const permission = await ensureApiHostPermission(endpointResult.endpoint);
      if (!permission.granted) {
        showToast(permission.error, 'error');
        return;
      }
    }
  } catch (_) {
    showToast(i18n('aiTestFailed') || '连接失败', 'error');
    return;
  }

  aiTestBtn.disabled = true;
  aiTestBtn.textContent = i18n('aiTesting') || '测试中...';
  try {
    const res = await chrome.runtime.sendMessage({ action: 'testAIConnection', config });
    if (res && res.ok) {
      // 回显服务端返回的实际模型名称
      if (res.model && aiModelInput) {
        aiModelInput.value = res.model;
        // 自动保存，使模型名称持久化
        saveAIConfig();
      }
      showToast((i18n('aiTestSuccess') || '连接成功，示例标签：$1').replace('$1', res.sampleTag || '—'), 'success');
    } else {
      showToast((i18n('aiTestFailed') || '连接失败：$1').replace('$1', res?.error || '未知'), 'error');
    }
  } catch (e) {
    showToast(i18n('aiTestFailed') || '连接失败', 'error');
  } finally {
    aiTestBtn.disabled = false;
    aiTestBtn.textContent = i18n('aiTest') || '测试连接';
  }
}

async function clearAICache() {
  try {
    await chrome.runtime.sendMessage({ action: 'clearAICache' });
    showToast(i18n('aiCacheCleared') || 'AI 缓存已清除', 'success');
    await refreshAIStatus();
  } catch (e) {
    showToast(i18n('clearFailed') || '清除失败', 'error');
  }
}

function formatAILogType(type) {
  const map = {
    trigger: i18n('aiLogTrigger') || '触发分类',
    trigger_skip: i18n('aiLogTriggerSkip') || '跳过触发',
    cache_hit: i18n('aiLogCacheHit') || '缓存命中',
    classify_success: i18n('aiLogClassifySuccess') || '分类成功',
    classify_fail: i18n('aiLogClassifyFail') || '分类失败',
    backfill_success: i18n('aiLogBackfillSuccess') || '回填成功',
    backfill_fail: i18n('aiLogBackfillFail') || '回填失败',
    backfill_skip: i18n('aiLogBackfillSkip') || '回填跳过'
  };
  return map[type] || type;
}

function formatDuration(ms) {
  if (typeof ms !== 'number') return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(ts) {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatFullTime(ts) {
  return new Date(ts).toLocaleString();
}

function formatAIReason(reason) {
  const map = {
    low_confidence: i18n('reasonLowConfidence') || '置信度低',
    ambiguous_top2: i18n('reasonAmbiguous') || '标签相近',
    strong_conflict: i18n('reasonSignalConflict') || '信号冲突',
    top1_strong: '置信度高',
    confidence_ok: '置信度正常',
    no_ai_result: 'AI 无结果',
    no_change: '标签无变化'
  };
  return map[reason] || reason;
}

function buildAILogDetailLines(log) {
  const lines = [];

  lines.push({
    label: i18n('aiLogTime') || '时间',
    value: formatFullTime(log.timestamp)
  });

  if (log.provider) {
    lines.push({ label: i18n('aiProvider') || '服务商', value: log.provider });
  }
  if (log.model) {
    lines.push({ label: i18n('aiModel') || '模型', value: log.model });
  }
  if (log.domain) {
    lines.push({ label: i18n('aiLogDomain') || '域名', value: log.domain });
  }
  if (typeof log.duration === 'number') {
    lines.push({ label: i18n('aiLogDuration') || '耗时', value: formatDuration(log.duration) });
  }
  if (log.details?.reason) {
    lines.push({ label: i18n('aiLogReason') || '原因', value: formatAIReason(log.details.reason) });
  }

  const tags = log.details?.tags || log.details?.afterTags || log.details?.aiTags;
  if (tags && tags.length > 0) {
    lines.push({ label: i18n('aiLogTags') || '标签', value: tags.join(', ') });
  }

  if (log.error) {
    lines.push({ label: i18n('aiLogError') || '错误', value: log.error, isError: true });
  }

  return lines;
}

function getAILogBadgeClass(type) {
  switch (type) {
    case 'backfill_success':
    case 'classify_success':
      return 'ai-log-badge--success';
    case 'backfill_fail':
    case 'classify_fail':
      return 'ai-log-badge--fail';
    case 'trigger':
    case 'cache_hit':
      return 'ai-log-badge--info';
    default:
      return 'ai-log-badge--neutral';
  }
}

function shouldShowAILog(log) {
  // 隐藏内部调试日志
  return log && !['backfill_start', 'trigger_skip'].includes(log.type);
}

async function renderAILogs() {
  if (!aiLogsList || !aiLogsStats) return;
  try {
    let logs, stats;
    try {
      const res = await chrome.runtime.sendMessage({ action: 'getAILogs', limit: 50 });
      if (res && res.success) {
        logs = res.logs || [];
        stats = res.stats || {};
      } else {
        throw new Error(res?.error || 'getAILogs failed');
      }
    } catch (e) {
      // fallback to direct function if message fails (e.g. settings page has ai-logger.js loaded)
      logs = await getAILogs(50);
      stats = await getAILogStats();
    }

    const statsTemplate = i18n('aiLogsStatsFormat') || '总计 $TOTAL$ 条 · 成功 $SUCCESS$ 次 · 失败 $FAIL$ 次 · 缓存命中 $CACHE$ 次（命中率 $RATE$）· 平均 $AVG$';
    const cacheHitRate = typeof stats.cacheHitRate === 'number' && !isNaN(stats.cacheHitRate)
      ? stats.cacheHitRate
      : 0;
    const cacheHitRateText = cacheHitRate > 0
      ? (cacheHitRate * 100).toFixed(1) + '%'
      : '0.0%';
    aiLogsStats.textContent = statsTemplate
      .replace('$TOTAL$', stats.total)
      .replace('$SUCCESS$', stats.success)
      .replace('$FAIL$', stats.fail)
      .replace('$CACHE$', stats.cacheHit)
      .replace('$AVG$', formatDuration(stats.avgDuration))
      .replace('$RATE$', cacheHitRateText);

    const visibleLogs = logs.filter(shouldShowAILog);

    if (visibleLogs.length === 0) {
      aiLogsList.innerHTML = `<div class="ai-log-empty">${i18n('aiLogsEmpty') || '暂无日志'}</div>`;
      return;
    }

    aiLogsList.innerHTML = visibleLogs.map(log => {
      const badgeClass = getAILogBadgeClass(log.type);
      const detailLines = buildAILogDetailLines(log);
      const detailsHtml = detailLines.length > 0
        ? `<div class="ai-log-details">${detailLines.map(line => `
            <div class="ai-log-detail-line ${line.isError ? 'ai-log-detail-line--error' : ''}">
              <span class="ai-log-detail-label">${escapeHtml(line.label)}</span>
              <span class="ai-log-detail-value">${escapeHtml(line.value)}</span>
            </div>
          `).join('')}</div>`
        : '';

      return `
        <div class="ai-log-item">
          <div class="ai-log-main">
            <span class="ai-log-badge ${badgeClass}">${escapeHtml(formatAILogType(log.type))}</span>
            ${detailsHtml}
          </div>
          <div class="ai-log-time" title="${escapeHtml(formatFullTime(log.timestamp))}">${formatTime(log.timestamp)}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    aiLogsStats.textContent = '—';
    aiLogsList.innerHTML = `<div class="ai-log-empty" style="color: var(--danger);">${i18n('aiLogsLoadFailed') || '加载日志失败'}</div>`;
  }
}

function toggleAILogs() {
  if (!aiLogsBody || !aiLogsToggleIcon) return;
  const isHidden = aiLogsBody.style.display === 'none';
  aiLogsBody.style.display = isHidden ? 'block' : 'none';
  aiLogsToggleIcon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  if (isHidden) renderAILogs();
}

async function clearAILogsUI() {
  if (!confirm(i18n('aiClearLogsConfirm') || '确定清空所有 AI 辅助分类日志？')) return;
  try {
    const res = await chrome.runtime.sendMessage({ action: 'clearAILogs' });
    const ok = res && res.success;
    if (ok) {
      showToast(i18n('aiLogsCleared') || '日志已清空', 'success');
      await renderAILogs();
    } else {
      showToast(i18n('clearFailed') || '清除失败', 'error');
    }
  } catch (e) {
    try {
      const ok = await clearAILogs();
      if (ok) {
        showToast(i18n('aiLogsCleared') || '日志已清空', 'success');
        await renderAILogs();
      } else {
        showToast(i18n('clearFailed') || '清除失败', 'error');
      }
    } catch (e2) {
      showToast(i18n('clearFailed') || '清除失败', 'error');
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

function openExtensionPage(path) {
  return window.AIBookmarkPageRouter?.openOrFocusExtensionPage(path)
    ?? chrome.tabs.create({ url: chrome.runtime.getURL(path) });
}

// ===== 事件绑定 =====
backBtn.addEventListener('click', () => {
  window.close();
});

workspaceBtn?.addEventListener('click', () => openExtensionPage('pages/standalone/standalone.html'));
aiClassifyBtn?.addEventListener('click', () => openAiTreeClassifyPanel());
bookmarkNavBtn?.addEventListener('click', () => openExtensionPage('ai/bookmark-nav.html'));
checkerBtn?.addEventListener('click', () => openExtensionPage('pages/checker/checker.html'));
graphBtn?.addEventListener('click', () => openExtensionPage('pages/graph/graph.html'));
settingsBtn?.addEventListener('click', () => {});

retentionDaysSelect.addEventListener('change', async (e) => {
  await saveRetentionDays(e.target.value);
  showToast(i18n('settingsSaved'), 'success');
});

themeSelect.addEventListener('change', async (e) => {
  const theme = e.target.value;
  await saveTheme(theme);
  showToast(i18n('settingsSaved'), 'success');
});

languageSelect.addEventListener('change', async (e) => {
  const language = e.target.value;
  await saveLanguage(language);
  showToast(i18n('settingsSaved'), 'success');
});

checkerFrequencySelect.addEventListener('change', async (e) => {
  const value = e.target.value;
  if (value !== 'never') await requestCheckerSchedulePermission();
  toggleCheckerScheduleRows(value);
  await saveCheckerSetting('checkerFrequency', value);
  showToast(i18n('settingsSaved'), 'success');
});

checkerTimeInput.addEventListener('change', async (e) => {
  await saveCheckerSetting('checkerTime', e.target.value);
  showToast(i18n('settingsSaved'), 'success');
});

checkerDayOfWeekSelect.addEventListener('change', async (e) => {
  await saveCheckerSetting('checkerDayOfWeek', parseInt(e.target.value, 10));
  showToast(i18n('settingsSaved'), 'success');
});

checkerDayOfMonthSelect.addEventListener('change', async (e) => {
  const v = parseInt(e.target.value, 10);
  await saveCheckerSetting('checkerDayOfMonth', v);
  showToast(i18n('settingsSaved'), 'success');
});

checkerAutoDeleteToggle.addEventListener('change', async (e) => {
  e.target.checked = false;
  await saveCheckerSetting('checkerAutoDelete', false);
  showToast(i18n('settingsSaved'), 'success');
});

checkerTimeoutSelect.addEventListener('change', async (e) => {
  await saveCheckerSetting(
    'checkerTimeout',
    normalizeCheckerNumber(e.target.value, 'checkerTimeout')
  );
  showToast(i18n('settingsSaved'), 'success');
});

checkerConcurrencySelect.addEventListener('change', async (e) => {
  await saveCheckerSetting(
    'checkerConcurrency',
    normalizeCheckerNumber(e.target.value, 'checkerConcurrency')
  );
  showToast(i18n('settingsSaved'), 'success');
});

checkerRetriesSelect.addEventListener('change', async (e) => {
  await saveCheckerSetting(
    'checkerRetries',
    normalizeCheckerNumber(e.target.value, 'checkerRetries')
  );
  showToast(i18n('settingsSaved'), 'success');
});

checkerBackoffBaseSelect.addEventListener('change', async (e) => {
  await saveCheckerSetting(
    'checkerBackoffBase',
    normalizeCheckerNumber(e.target.value, 'checkerBackoffBase')
  );
  showToast(i18n('settingsSaved'), 'success');
});

checkerBackoffMaxSelect.addEventListener('change', async (e) => {
  await saveCheckerSetting(
    'checkerBackoffMax',
    normalizeCheckerNumber(e.target.value, 'checkerBackoffMax')
  );
  showToast(i18n('settingsSaved'), 'success');
});

openCheckerBtn.addEventListener('click', () => {
  openExtensionPage('pages/checker/checker.html');
});

previewEnabledToggle.addEventListener('change', async (e) => {
  await savePreviewSetting({ previewEnabled: e.target.checked });
  showToast(i18n('settingsSaved'), 'success');
});

previewCacheTTLSelect.addEventListener('change', async (e) => {
  const v = parseInt(e.target.value, 10);
  await savePreviewSetting({ previewCacheTTL: v });
  showToast(i18n('settingsSaved'), 'success');
});

previewMaxEntriesSelect.addEventListener('change', async (e) => {
  const v = parseInt(e.target.value, 10);
  await savePreviewSetting({ previewMaxCacheEntries: v });
  await refreshPreviewCacheStats();
  showToast(i18n('settingsSaved'), 'success');
});

clearPreviewCacheBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'clearPreviewCache' });
  await refreshPreviewCacheStats();
  showToast(i18n('previewCacheCleared') || '已清除', 'success');
});

mdiWindowEnabledToggle.addEventListener('change', async (e) => {
  await savePreviewSetting({ mdiWindowEnabled: e.target.checked });
  showToast(i18n('settingsSaved'), 'success');
});

// ===== RSS 订阅设置事件绑定 =====
rssPollIntervalSelect.addEventListener('change', async (e) => {
  const v = parseInt(e.target.value, 10);
  await saveRssSetting({ pollIntervalMin: v });
  showToast(i18n('settingsSaved'), 'success');
});

rssMaxItemsSelect.addEventListener('change', async (e) => {
  const v = parseInt(e.target.value, 10);
  await saveRssSetting({ maxItemsPerFeed: v });
  showToast(i18n('settingsSaved'), 'success');
});

rssDefaultFolderSelect.addEventListener('change', async (e) => {
  const v = e.target.value || null;
  await saveRssSetting({ defaultFolderId: v });
  showToast(i18n('settingsSaved'), 'success');
});

rssAutoDiscoverToggle.addEventListener('change', async (e) => {
  await saveRssSetting({ autoDiscover: e.target.checked });
  showToast(i18n('settingsSaved'), 'success');
});

rssNotifyNewToggle.addEventListener('change', async (e) => {
  await saveRssSetting({ notifyNew: e.target.checked });
  showToast(i18n('settingsSaved'), 'success');
});

rssProxyFallbackToggle.addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  if (enabled && !confirm(i18n('rssProxyConsent') || '启用后，订阅 URL 和代理抓取到的订阅内容会发送到你配置的代理服务。是否继续？')) {
    e.target.checked = false;
    updateProxyRowState();
    return;
  }
  try {
    await saveRssSetting({ proxyFallback: enabled });
    updateProxyRowState();
    showToast(i18n('settingsSaved'), 'success');
  } catch (error) {
    e.target.checked = !enabled;
    updateProxyRowState();
    showToast(error?.message || i18n('saveFailed'), 'error');
  }
});

// 保存代理 URL
rssProxySaveBtn.addEventListener('click', async () => {
  const v = (rssProxyUrlInput.value || '').trim();
  if (!v) {
    showToast(i18n('rssProxyUrlRequired') || '请填写代理 URL', 'error');
    return;
  }
  if (!v.includes('{url}')) {
    showToast(i18n('rssProxyUrlPlaceholderMissing') || '代理 URL 必须包含 {url} 占位符', 'error');
    return;
  }
  await saveRssSetting({ proxyUrl: v });
  showToast(i18n('settingsSaved'), 'success');
});

// 测试代理连通性（用阮一峰博客作测试源）
rssProxyTestBtn.addEventListener('click', async () => {
  const v = (rssProxyUrlInput.value || '').trim();
  if (!v || !v.includes('{url}')) {
    rssProxyTestResult.textContent = i18n('rssProxyUrlPlaceholderMissing') || '代理 URL 必须包含 {url} 占位符';
    rssProxyTestResult.className = 'proxy-test-result proxy-test-result--fail';
    return;
  }
  const original = rssProxyTestBtn.innerHTML;
  rssProxyTestBtn.innerHTML = '<span>' + (i18n('rssProxyTesting') || '测试中...') + '</span>';
  rssProxyTestBtn.disabled = true;
  rssProxyTestResult.textContent = '';
  rssProxyTestResult.className = 'proxy-test-result';
  try {
    const res = await chrome.runtime.sendMessage({
      action: 'rssTestProxy',
      proxyUrl: v
    });
    if (res && res.success) {
      const okText = (i18n('rssProxyTestOk') || '成功：$1 篇文章').replace('$1', res.itemCount || 0);
      rssProxyTestResult.textContent = okText + ' — ' + (res.feedTitle || '');
      rssProxyTestResult.className = 'proxy-test-result proxy-test-result--ok';
    } else {
      rssProxyTestResult.textContent = (i18n('rssProxyTestFail') || '失败：') + (res?.error || '未知');
      rssProxyTestResult.className = 'proxy-test-result proxy-test-result--fail';
    }
  } catch (e) {
    rssProxyTestResult.textContent = (i18n('rssProxyTestFail') || '失败：') + e.message;
    rssProxyTestResult.className = 'proxy-test-result proxy-test-result--fail';
  } finally {
    rssProxyTestBtn.disabled = false;
    rssProxyTestBtn.innerHTML = original;
  }
});

rssRefreshAllBtn.addEventListener('click', async () => {
  rssRefreshAllBtn.disabled = true;
  const original = rssRefreshAllBtn.innerHTML;
  try {
    rssRefreshAllBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spinning"><polyline points="23 4 23 10 17 10"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/></svg><span>' + (i18n('rssRefreshing') || '刷新中...') + '</span>';
    const response = await chrome.runtime.sendMessage({ action: 'rssRefreshAll' });
    if (!response?.success) throw new Error(response?.error || 'rss_refresh_failed');
    const summary = response.result?.summary || {};
    const summaryText = (i18n('rssRefreshSummary') || '成功 $1，失败 $2，跳过 $3，新增文章 $4')
      .replace('$1', String(summary.succeeded || 0))
      .replace('$2', String(summary.failed || 0))
      .replace('$3', String(summary.skipped || 0))
      .replace('$4', String(summary.added || 0));
    showToast(summaryText, summary.failed > 0 ? 'error' : 'success');
    await refreshRssLastUpdated();
    await refreshRssUnreadBadge();
  } catch (e) {
    showToast(i18n('rssRefreshFailed') || '刷新失败', 'error');
  } finally {
    rssRefreshAllBtn.disabled = false;
    rssRefreshAllBtn.innerHTML = original;
  }
});

// 监听 RSS 数据变化（跨窗口同步）
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'rssDataChanged' || message.action === 'rssUnreadChanged') {
    refreshRssLastUpdated();
    refreshRssUnreadBadge();
  }
});

// ===== AI 辅助分类事件绑定 =====
if (aiEnabledToggle) {
  aiEnabledToggle.addEventListener('change', onAIEnabledToggle);
}
if (aiProviderSelect) {
  aiProviderSelect.addEventListener('change', () => {
    switchAIProvider(aiProviderSelect.value);
    toggleCustomFields();
    updateAIEndpointHint();
    saveAIConfig();
  });
}
if (aiApiKeyInput) {
  aiApiKeyInput.addEventListener('change', saveAIConfig);
}
if (aiModelInput) {
  aiModelInput.addEventListener('change', saveAIConfig);
}
if (aiTimeoutInput) {
  aiTimeoutInput.addEventListener('change', saveAIConfig);
}
if (aiRetryCountInput) {
  aiRetryCountInput.addEventListener('change', saveAIConfig);
}
if (aiAssistLogicToggle) {
  aiAssistLogicToggle.addEventListener('change', saveAIConfig);
}
if (aiPageContentToggle) {
  aiPageContentToggle.addEventListener('change', saveAIConfig);
}
if (aiAssistPromptInput) {
  aiAssistPromptInput.addEventListener('change', saveAIConfig);
}
if (aiResetAssistPromptBtn) {
  aiResetAssistPromptBtn.addEventListener('click', () => {
    if (aiAssistPromptInput) aiAssistPromptInput.value = DEFAULT_AI_ASSIST_PROMPT;
    saveAIConfig();
  });
}

// ===== 通知设置事件绑定 =====
if (notificationEnabledToggle) {
  notificationEnabledToggle.addEventListener('change', () => {
    saveNotificationSetting('notificationEnabled', notificationEnabledToggle.checked);
  });
}
if (aiCustomFormatSelect) {
  aiCustomFormatSelect.addEventListener('change', () => {
    updateAIEndpointHint();
    saveAIConfig();
  });
}
if (aiCustomEndpointInput) {
  aiCustomEndpointInput.addEventListener('change', saveAIConfig);
}
if (aiFullUrlToggle) {
  aiFullUrlToggle.addEventListener('change', () => {
    updateAIEndpointHint();
    saveAIConfig();
  });
}
if (aiTestBtn) {
  aiTestBtn.addEventListener('click', testAIConnection);
}
if (aiClearCacheBtn) {
  aiClearCacheBtn.addEventListener('click', clearAICache);
}
if (aiLogsHeader) {
  aiLogsHeader.addEventListener('click', toggleAILogs);
}
if (aiRefreshLogsBtn) {
  aiRefreshLogsBtn.addEventListener('click', renderAILogs);
}
if (aiClearLogsBtn) {
  aiClearLogsBtn.addEventListener('click', clearAILogsUI);
}

// ===== 导入 / 导出 =====
function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

async function handleExportJson() {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'exportData' });
    if (!result?.success) { showToast(i18n('importFailed'), 'error'); return; }
    const data = JSON.stringify({
      app: 'ai-bookmark-os',
      version: 2,
      exportedAt: result.exportedAt || Date.now(),
      roots: Array.isArray(result.tree) ? result.tree : [],
    }, null, 2);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`ai-bookmark-os-bookmarks-${stamp}.json`, data, 'application/json');
    showToast(i18n('settingsSaved'), 'success');
  } catch (e) {
    console.error(e);
    showToast(i18n('importFailed'), 'error');
  }
}

// ===== Netscape Bookmark File Format export =====
function escapeHtmlForExport(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function netscapeTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? Math.floor(timestamp / 1000) : Math.floor(Date.now() / 1000);
}

function buildNetscapeNodes(nodes, depth = 1) {
  const indent = '    '.repeat(depth);
  return (Array.isArray(nodes) ? nodes : []).map((node) => {
    if (!node || typeof node !== 'object') return '';
    if (node.type === 'bookmark' && node.url) {
      const tags = Array.isArray(node.metadata?.tags) ? node.metadata.tags.join(',') : '';
      const tagsAttribute = tags ? ` TAGS="${escapeHtmlForExport(tags)}"` : '';
      return `${indent}<DT><A HREF="${escapeHtmlForExport(node.url)}" ADD_DATE="${netscapeTimestamp(node.dateAdded)}"${tagsAttribute}>${escapeHtmlForExport(node.title || node.url)}</A>`;
    }
    if (node.type !== 'folder') return '';
    const children = buildNetscapeNodes(node.children || [], depth + 1);
    return `${indent}<DT><H3 ADD_DATE="${netscapeTimestamp(node.dateAdded)}">${escapeHtmlForExport(node.title || '')}</H3>\n${indent}<DL><p>\n${children}\n${indent}</DL><p>`;
  }).filter(Boolean).join('\n');
}

function buildNetscapeBookmarksPage(tree) {
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. It will be read and overwritten. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>AI Bookmark OS Bookmarks</TITLE>
<H1>AI Bookmark OS Bookmarks</H1>
<DL><p>
${buildNetscapeNodes(tree)}
</DL><p>`;
}

async function handleExportHtml() {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'exportData' });
    if (!result?.success) { showToast(i18n('importFailed'), 'error'); return; }
    const page = buildNetscapeBookmarksPage(result.tree || []);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`ai-bookmark-os-bookmarks-${stamp}.html`, page, 'text/html;charset=utf-8');
    showToast(i18n('settingsSaved'), 'success');
  } catch (e) {
    console.error(e);
    showToast(i18n('importFailed'), 'error');
  }
}

function parseImportedJSON(text) {
  try {
    const data = JSON.parse(text);
    if (Number(data?.version) === 2 && Array.isArray(data.roots)) {
      const items = [];
      const folderPaths = [];
      const rootNames = new Set(['书签栏', '收藏夹栏', '书签菜单', '其他书签', '其他收藏夹', '移动设备书签', 'bookmarks bar', 'bookmarks menu', 'other bookmarks', 'mobile bookmarks']);
      const walk = (nodes, path = '') => {
        for (const node of nodes || []) {
          if (!node || typeof node !== 'object') continue;
          if (node.type === 'folder') {
            const title = String(node.title || '').trim();
            const nextPath = !path && rootNames.has(title.toLowerCase()) ? '' : [path, title].filter(Boolean).join('/');
            if (nextPath) folderPaths.push(nextPath);
            walk(node.children, nextPath);
          } else if (node.type === 'bookmark' && node.url) {
            const metadata = node.metadata && typeof node.metadata === 'object' ? node.metadata : {};
            items.push({
              ...metadata,
              title: node.title || node.url,
              url: node.url,
              dateAdded: node.dateAdded || Date.now(),
              folderPath: node.folderPath || path,
              tags: Array.isArray(metadata.tags) ? metadata.tags : [],
              pinned: !!metadata.pinned,
            });
          }
        }
      };
      walk(data.roots);
      return { items, folderPaths: [...new Set(folderPaths)] };
    }
    const list = Array.isArray(data) ? data : (data.bookmarks || []);
    const items = list.filter(b => b && b.url).map(b => ({
      title: b.title || b.url,
      url: b.url,
      dateAdded: b.dateAdded || Date.now(),
      folderPath: b.folderPath || '',
      tags: Array.isArray(b.tags) ? b.tags : [],
      pinned: !!b.pinned,
    }));
    return { items, folderPaths: [...new Set(items.map((item) => item.folderPath).filter(Boolean))] };
  } catch (e) { return null; }
}

function parseImportedHTML(text) {
  const documentNode = new DOMParser().parseFromString(text, 'text/html');
  const items = [];
  const folderPaths = [];
  const rootNames = new Set(['书签栏', '收藏夹栏', '书签菜单', '其他书签', '其他收藏夹', '移动设备书签', 'bookmarks bar', 'bookmarks menu', 'other bookmarks', 'mobile bookmarks']);
  const timestamp = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return Date.now();
    return parsed > 1e12 ? parsed : parsed * 1000;
  };
  const safeUrl = (value) => {
    try {
      const url = new URL(value);
      return /^(https?|ftp):$/.test(url.protocol) ? url.toString() : '';
    } catch { return ''; }
  };
  const directChild = (element, tagName) => [...element.children].find((child) => child.tagName === tagName) || null;
  const walkList = (list, path = '') => {
    const children = [...list.children];
    for (let index = 0; index < children.length; index++) {
      const child = children[index];
      if (child.tagName === 'DL') {
        walkList(child, path);
        continue;
      }
      if (child.tagName !== 'DT') continue;
      const heading = directChild(child, 'H3');
      const anchor = directChild(child, 'A');
      if (heading) {
        const title = heading.textContent.trim();
        const nextPath = !path && rootNames.has(title.toLowerCase()) ? '' : [path, title].filter(Boolean).join('/');
        if (nextPath) folderPaths.push(nextPath);
        let nested = directChild(child, 'DL');
        if (!nested && children[index + 1]?.tagName === 'DL') nested = children[++index];
        if (nested) walkList(nested, nextPath);
        continue;
      }
      if (anchor) {
        const url = safeUrl(anchor.getAttribute('href') || '');
        if (!url) continue;
        items.push({
          title: anchor.textContent.trim() || url,
          url,
          dateAdded: timestamp(anchor.getAttribute('add_date')),
          folderPath: path,
          tags: String(anchor.getAttribute('tags') || '').split(',').map((tag) => tag.trim()).filter(Boolean),
          pinned: false,
        });
      }
    }
  };
  const rootList = documentNode.querySelector('dl');
  if (rootList) walkList(rootList);
  if (!items.length) {
    for (const anchor of documentNode.querySelectorAll('a[href]')) {
      const url = safeUrl(anchor.getAttribute('href') || '');
      if (url) items.push({ title: anchor.textContent.trim() || url, url, dateAdded: timestamp(anchor.getAttribute('add_date')), folderPath: '', tags: [], pinned: false });
    }
  }
  return { items, folderPaths: [...new Set(folderPaths)] };
}

async function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target.result;
    let parsed = null;
    if (file.name.toLowerCase().endsWith('.json')) parsed = parseImportedJSON(text);
    else parsed = parseImportedHTML(text);
    if (!parsed || (parsed.items.length === 0 && parsed.folderPaths.length === 0)) { showToast(i18n('importEmpty'), 'error'); return; }
    try {
      const operationId = `import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const result = await chrome.runtime.sendMessage({
        action: 'importBookmarksV2',
        operationId,
        bookmarks: parsed.items,
        folderPaths: parsed.folderPaths,
        duplicateStrategy: 'merge',
      });
      if (result?.success || result?.status === 'partial') {
        const created = result.created?.length || 0;
        const merged = result.merged?.length || 0;
        const skipped = result.skipped?.length || 0;
        const failed = Number(result.failed || 0);
        const conflicts = Number(result.conflicts || 0);
        const isZh = typeof _currentLang !== 'undefined' && _currentLang === 'zh_CN';
        const summary = isZh
          ? `创建 ${created}，合并 ${merged}，跳过 ${skipped}，失败 ${failed}，冲突 ${conflicts}`
          : `Created ${created}, merged ${merged}, skipped ${skipped}, failed ${failed}, conflicts ${conflicts}`;
        showToast(summary, result?.status === 'partial' ? 'warning' : 'success');
        await renderImportOperations();
      } else {
        showToast(i18n('importFailed'), 'error');
        await renderImportOperations();
      }
    } catch (err) {
      console.error(err);
      showToast(i18n('importFailed'), 'error');
    }
  };
  reader.readAsText(file);
}

if (exportJsonBtn) exportJsonBtn.addEventListener('click', handleExportJson);
if (exportHtmlBtn) exportHtmlBtn.addEventListener('click', handleExportHtml);
if (importFileBtn) importFileBtn.addEventListener('click', () => importFileInput.click());
if (importFileInput) {
  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleImportFile(file);
    importFileInput.value = '';
  });
}

function importStatusLabel(status) {
  const zh = typeof _currentLang !== 'undefined' && _currentLang === 'zh_CN';
  const labels = zh
    ? { running: '进行中', completed: '已完成', partial: '部分完成', failed: '失败', undoing: '正在撤销', undone: '已撤销', undo_partial: '部分撤销' }
    : { running: 'Running', completed: 'Completed', partial: 'Partial', failed: 'Failed', undoing: 'Undoing', undone: 'Undone', undo_partial: 'Undo partial' };
  return labels[status] || status || '-';
}

async function renderImportOperations() {
  if (!importOperationsList) return;
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getImportOperations' });
    const operations = Array.isArray(response?.operations) ? response.operations : [];
    if (!operations.length) {
      importOperationsList.innerHTML = `<div class="tagrule-empty">${escapeHtml(i18n('noData') || '暂无记录')}</div>`;
      return;
    }
    importOperationsList.innerHTML = operations.map((operation) => {
      const isZh = typeof _currentLang !== 'undefined' && _currentLang === 'zh_CN';
      const created = operation.created?.length || 0;
      const merged = operation.merged?.length || 0;
      const skipped = operation.skipped?.length || 0;
      const invalid = operation.invalid?.length || 0;
      const failed = operation.failed?.length || 0;
      const rollbackConflicts = operation.rollback?.conflicts || 0;
      const issueItems = [
        ...(operation.failed || []).map((item) => ({ id: item.id || item.url || item.folderKey || item.title || '-', reason: item.error || 'failed' })),
        ...((operation.rollback?.items || []).filter((item) => item.status !== 'succeeded').map((item) => ({ id: item.id || '-', reason: item.reason || item.status }))),
      ];
      const issueDetail = issueItems.length
        ? `<details class="import-operation-issues"><summary>${escapeHtml(isZh ? `查看 ${issueItems.length} 项明细` : `View ${issueItems.length} item details`)}</summary>${issueItems.slice(0, 50).map((item) => `<div>${escapeHtml(`${item.id}: ${item.reason}`)}</div>`).join('')}</details>`
        : '';
      const timestamp = new Date(operation.completedAt || operation.startedAt || Date.now()).toLocaleString();
      const canRetry = ['running', 'partial', 'failed'].includes(operation.status);
      const canUndo = ['completed', 'partial', 'undo_partial'].includes(operation.status)
        || (operation.status === 'running' && created > 0);
      return `<div class="tagrule-item import-operation-item">
        <div class="import-operation-main">
          <div class="import-operation-title"><strong>${escapeHtml(importStatusLabel(operation.status))}</strong> · ${escapeHtml(timestamp)}</div>
          <div class="import-operation-detail">${escapeHtml(isZh
            ? `创建 ${created} · 合并 ${merged} · 跳过 ${skipped} · 无效 ${invalid} · 失败 ${failed} · 冲突 ${rollbackConflicts}`
            : `Created ${created} · Merged ${merged} · Skipped ${skipped} · Invalid ${invalid} · Failed ${failed} · Conflicts ${rollbackConflicts}`)}</div>
          ${issueDetail}
        </div>
        <div class="import-operation-actions">
          ${canRetry ? `<button class="btn btn-secondary btn-sm" type="button" data-import-action="retry" data-operation-id="${escapeHtml(operation.id)}">${escapeHtml(i18n('retry') || '重试')}</button>` : ''}
          ${canUndo ? `<button class="btn btn-danger btn-sm" type="button" data-import-action="undo" data-operation-id="${escapeHtml(operation.id)}">${escapeHtml(i18n('undo') || '撤销')}</button>` : ''}
        </div>
      </div>`;
    }).join('');
  } catch {
    importOperationsList.innerHTML = `<div class="tagrule-empty">${escapeHtml(i18n('loadFailedRetry') || '加载失败，请重试')}</div>`;
  }
}

if (refreshImportOperationsBtn) refreshImportOperationsBtn.addEventListener('click', renderImportOperations);
if (importOperationsList) {
  importOperationsList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-import-action]');
    if (!button) return;
    const operationId = button.dataset.operationId;
    button.disabled = true;
    try {
      if (button.dataset.importAction === 'undo') {
        if (!confirm(i18n('confirmUndoImport') || '撤销将保留导入后被修改的书签，并报告冲突。继续？')) return;
        const requestId = `import-undo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const result = await chrome.runtime.sendMessage({ action: 'rollbackImportOperation', operationId, requestId });
        showToast(result?.success ? (i18n('settingsSaved') || '已撤销') : `${i18n('importFailed') || '部分项目未能撤销'} (${result?.succeeded || 0}/${result?.total || 0})`, result?.success ? 'success' : 'warning');
      } else {
        const requestId = `import-retry-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const result = await chrome.runtime.sendMessage({ action: 'retryImportOperation', operationId, requestId });
        showToast(result?.success ? i18n('settingsSaved') : i18n('importFailed'), result?.success ? 'success' : 'warning');
      }
    } finally {
      button.disabled = false;
      await renderImportOperations();
    }
  });
}
void renderImportOperations();

// ===== 监听存储变化 =====
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.theme) {
      const newTheme = changes.theme.newValue || 'system';
      themeSelect.value = newTheme;
      applyTheme(newTheme);
    }
    if (changes.language) {
      const newLanguage = changes.language.newValue || 'system';
      languageSelect.value = newLanguage;
      setCurrentLang(newLanguage);
      applyI18n();
    }
    if (changes.checkerFrequency) {
      checkerFrequencySelect.value = changes.checkerFrequency.newValue || 'never';
      toggleCheckerScheduleRows(changes.checkerFrequency.newValue || 'never');
    }
    if (changes.checkerTime) {
      checkerTimeInput.value = changes.checkerTime.newValue || '03:00';
    }
    if (changes.checkerAutoDelete) {
      checkerAutoDeleteToggle.checked = !!changes.checkerAutoDelete.newValue;
    }
    if (changes.checkerTimeout) {
      applyCheckerNumberChange('checkerTimeout', changes.checkerTimeout, checkerTimeoutSelect);
    }
    if (changes.checkerConcurrency) {
      applyCheckerNumberChange('checkerConcurrency', changes.checkerConcurrency, checkerConcurrencySelect);
    }
    if (changes.checkerRetries) {
      applyCheckerNumberChange('checkerRetries', changes.checkerRetries, checkerRetriesSelect);
    }
    if (changes.checkerBackoffBase) {
      applyCheckerNumberChange('checkerBackoffBase', changes.checkerBackoffBase, checkerBackoffBaseSelect);
    }
    if (changes.checkerBackoffMax) {
      applyCheckerNumberChange('checkerBackoffMax', changes.checkerBackoffMax, checkerBackoffMaxSelect);
    }
    if (changes.ai_classifier_logs) {
      renderAILogs();
    }
    // RSS 订阅数据变化：刷新最后更新时间与未读徽标
    if (changes.rss_feeds || changes.rss_settings) {
      refreshRssLastUpdated();
      refreshRssUnreadBadge();
    }
    if (changes.rss_settings) {
      // 设置可能在其他窗口被改动，重新加载本地 UI 状态
      loadRssSettings();
    }
    // items 分片键变化（rss_items_<feedId>）触发未读刷新
    for (const key of Object.keys(changes)) {
      if (key.startsWith('rss_items_')) {
        refreshRssUnreadBadge();
        break;
      }
    }
  }
});

// ===== 初始化 =====

// ===== AI 金字塔分类设置（交互对齐 AI 辅助标签） =====
const TREE_PROVIDERS = {
  agnes: {
    id: 'agnes', label: 'Agnes AI', apiStyle: 'openai',
    baseUrl: 'https://apihub.agnes-ai.com/v1',
    defaultModel: 'agnes-2.0-flash',
    models: ['agnes-2.0-flash', 'agnes-1.5-flash'],
  },
  openrouter: {
    id: 'openrouter', label: 'OpenRouter', apiStyle: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku', 'google/gemini-2.0-flash-001', 'deepseek/deepseek-chat'],
  },
  openai: {
    id: 'openai', label: 'OpenAI (Codex)', apiStyle: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  },
  claude: {
    id: 'claude', label: 'Claude (Anthropic)', apiStyle: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-haiku-latest',
    models: ['claude-3-5-haiku-latest', 'claude-sonnet-4-20250514'],
  },
  gemini: {
    id: 'gemini', label: 'Gemini (Google)', apiStyle: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  },
  deepseek: {
    id: 'deepseek', label: 'DeepSeek', apiStyle: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  custom: {
    id: 'custom', label: '自定义', apiStyle: 'openai',
    baseUrl: '',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'deepseek-chat'],
  },
};

const DEFAULT_TREE_PROMPTS = {
  label: `你是书签分析助手。请根据每条书签提供的“标题”“域名”“原文件夹”三类信息，推断该网页最可能的用途，并为每条书签生成结构化结果。

处理要求：
1. 逐条分析书签，不漏项、不合并、不新增书签。
2. 优先根据标题判断用途；标题信息不足时，结合域名和原文件夹推断。
3. summary 必须用中文概括网页用途，控制在 15 个汉字以内，表达具体、清楚，例如“查看前端文档”“管理项目任务”“下载设计素材”。
4. tags 必须为 1-3 个中文通用领域词，避免过细、过长或重复。
5. tags 可参考但不限于：前端开发、后端开发、设计资源、新闻资讯、学习教程、效率工具、开发工具、数据分析、云服务、产品运营、娱乐、购物、社交媒体、文档资料。
6. 如果无法准确判断用途，请根据最可能的领域给出保守推断，不要使用“未知”“其他”等空泛标签。
7. 输出必须是合法 JSON 数组，不要包含 Markdown、代码块、解释说明或任何额外文字。

输出格式必须严格如下：
[
  {
    "id": "原id",
    "summary": "一句话用途",
    "tags": ["标签1", "标签2"]
  }
]`,
  buildTree: `你是“书签信息架构与分类体系设计专家”。请根据输入的书签数据，为这些书签设计一个清晰、稳定、可扩展、便于查找的金字塔式分类树。

输入数据可能包含以下信息：
- 书签标题
- URL 链接
- 原有书签路径/分类
- 页面内容摘要
- 页面正文片段
- 站点名称、产品名、公司名、项目名或工具名等可识别信息

你的任务不是给每条书签分配分类，而是仅输出适用于整批书签的分类树结构。

分类树设计要求：
1. 分类树最多包含 3 层：一级大类 → 二级子类 → 三级子类。
2. 一级大类数量不超过 10 个。
3. 任意一级分类或二级分类下的直接子类数量不超过 10 个。
4. 分类名称必须简洁、明确、可复用，通常控制在 2-8 个中文字符或简短中文短语内。
5. 分类名称应体现内容主题、使用场景、业务领域或主要用途，不要仅机械按照网站类型划分。
6. 不要使用含义过宽、边界模糊或重复交叉的名称，例如“常用网站”“资料”“工具”“内容”“平台”等，除非上下文确实需要。
7. 对主题相近、数量较少或使用场景一致的书签，应合并到同一分类中。
8. 不要为了单个零散书签创建过细分类；只有当其属于明确的公司、项目、产品、工具、业务系统或高频主题时，才可以单独成类。
9. 无法明确归入主要类别、数量较少且缺乏共同主题的内容，可归入“其他”。
10. 若多个书签属于同一公司、团队、办公系统或业务协作场景，应优先按公司、团队或办公场景合并，而不是按页面类型拆分。
11. 同一平台的不同页面，应根据实际用途判断是否合并；如果用途差异明显，可以拆分到不同主题分类中。
12. 分类层级应尽量均衡，避免某个一级大类包含过多内容，也避免大量分类只有极少内容。
13. 一级大类应覆盖整批书签的主要主题；二级和三级分类用于细化高频或内容较多的主题。
14. 如果某个分类已经足够清晰，不需要强行补全到三级。
15. 不要输出书签明细、分类依据、推理过程、统计信息或任何解释。

输出格式要求：
1. 只输出合法 JSON 数组。
2. JSON 根节点必须是数组。
3. 数组元素必须是分类对象。
4. 每个分类对象必须包含 "name" 字段。
5. 有子分类时才添加 "children" 字段；没有子分类时省略 "children" 字段。
6. "children" 字段的值必须是分类对象数组。
7. 分类层级最多 3 层，三级分类对象不得再包含 "children" 字段。
8. 不要输出 JSON 以外的任何文字、注释、解释、Markdown 代码块或多余标点。
9. 输出必须严格符合以下结构示例：

[
  {
    "name": "一级大类名",
    "children": [
      {
        "name": "二级子类名",
        "children": [
          {
            "name": "三级子类名"
          }
        ]
      }
    ]
  }
]`,

  assign: '根据我提供的书签列表和分类编号说明，将每个书签分配到语义最匹配的一个分类编号。判断依据按优先级依次为：书签标题、URL 域名与路径、描述/摘要、标签或备注；若信息不足，则根据可识别的关键词、网站类型或内容主题进行合理归类。每个书签必须且只能分配一个分类编号，不要漏项、重复或新增书签 id；分类编号必须来自我提供的分类列表，不得自创编号。最终只输出合法 JSON 数组，格式严格为：[{"id":"书签id","cat":分类编号}]。不要输出任何解释、Markdown、代码块或其他文字。',
};

const LEGACY_TREE_PROMPTS = {
  label: '你是书签分析助手。根据书签的标题、域名和原文件夹，推断每个网页的用途。只输出 JSON 数组，不要任何其他文字。每项格式：{"id":"原id","summary":"一句话用途(15字内)","tags":["标签1","标签2"]}。tags 用 1-3 个中文通用领域词（如：前端开发、设计资源、新闻资讯、学习教程、工具、娱乐）。',
  buildTree: '你是信息架构专家。根据标签及其出现次数，设计一个金字塔式书签分类树。要求：顶层大类不超过 8 个；最多 2 层（大类→子类）；子类每层不超过 10 个；数量少的标签合并进相近大类或"其他"。只输出 JSON 数组，格式：[{"name":"大类名","children":[{"name":"子类名"}]}]，没有子类的大类可省略 children。不要其他文字。',
  assign: '把每个书签分配到最合适的分类编号。只输出 JSON 数组：[{"id":"书签id","cat":分类编号}]。不要其他文字。',
};

function normalizeTreePrompt(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function migrateTreeDefaultPrompts(prompts) {
  const savedPrompts = prompts && typeof prompts === 'object' && !Array.isArray(prompts)
    ? prompts
    : {};
  const merged = {
    label: normalizeTreePrompt(savedPrompts.label, DEFAULT_TREE_PROMPTS.label),
    buildTree: normalizeTreePrompt(savedPrompts.buildTree, DEFAULT_TREE_PROMPTS.buildTree),
    assign: normalizeTreePrompt(savedPrompts.assign, DEFAULT_TREE_PROMPTS.assign),
  };
  return {
    label: merged.label === LEGACY_TREE_PROMPTS.label ? DEFAULT_TREE_PROMPTS.label : merged.label,
    buildTree: merged.buildTree === LEGACY_TREE_PROMPTS.buildTree ? DEFAULT_TREE_PROMPTS.buildTree : merged.buildTree,
    assign: merged.assign === LEGACY_TREE_PROMPTS.assign ? DEFAULT_TREE_PROMPTS.assign : merged.assign,
  };
}

const DEFAULT_TREE_SETTINGS = {
  provider: 'agnes',
  apiKey: '',
  baseUrl: TREE_PROVIDERS.agnes.baseUrl,
  model: TREE_PROVIDERS.agnes.defaultModel,
  fontFamily: 'system',
  fontSize: 14,
  themeColor: '#0A84FF',
  language: 'auto',
  colorMode: 'system',
  customApiStyle: 'openai',
  customFullUrl: false,
  classifyPrompts: { ...DEFAULT_TREE_PROMPTS },
  respectExistingFolders: true,
  preservedFolderPaths: [],
  reusePreviousAiTree: false,
  useClassificationCache: true,
  usePageMetadata: true,
  incrementalClassificationEnabled: false,
  useBuiltInClassificationRules: true,
  aiRetryCount: 5,
  aiRequestTimeoutSeconds: 90,
};

const treeProviderSelect = document.getElementById('treeProviderSelect');
const treeApiStyleSelect = document.getElementById('treeApiStyleSelect');
const treeCustomFields = document.getElementById('treeCustomFields');
const treeBaseUrlInput = document.getElementById('treeBaseUrlInput');
const treeFullUrlToggle = document.getElementById('treeFullUrlToggle');
const treeEndpointHintText = document.getElementById('treeEndpointHintText');
const treeEndpointHintFullUrl = document.getElementById('treeEndpointHintFullUrl');
const treeApiKeyInput = document.getElementById('treeApiKeyInput');
const treeModelInput = document.getElementById('treeModelInput');
const treeModelSelect = document.getElementById('treeModelSelect');
const treeModelCustomInput = document.getElementById('treeModelCustomInput');
const treePromptLabel = document.getElementById('treePromptLabel');
const treePromptBuild = document.getElementById('treePromptBuild');
const treePromptAssign = document.getElementById('treePromptAssign');
const treeStatusDesc = document.getElementById('treeStatusDesc');
const treeSaveBtn = document.getElementById('treeSaveBtn');
const treeTestBtn = document.getElementById('treeTestBtn');
const treeResetPromptsBtn = document.getElementById('treeResetPromptsBtn');
const treeOpenSidepanelBtn = document.getElementById('aiTreeOpenSidepanelBtn');
const treeRespectFoldersToggle = document.getElementById('treeRespectFoldersToggle');
const treePreserveFoldersRow = document.getElementById('treePreserveFoldersRow');
const treePreserveFoldersList = document.getElementById('treePreserveFoldersList');
const treeClearPreservedFoldersBtn = document.getElementById('treeClearPreservedFoldersBtn');
const treeReusePreviousToggle = document.getElementById('treeReusePreviousToggle');
const treeBuiltInRulesToggle = document.getElementById('treeBuiltInRulesToggle');
const treeCacheToggle = document.getElementById('treeCacheToggle');
const treeMetadataToggle = document.getElementById('treeMetadataToggle');
const treeIncrementalToggle = document.getElementById('treeIncrementalToggle');
const treeRetryCountInput = document.getElementById('treeRetryCountInput');
const treeRequestTimeoutInput = document.getElementById('treeRequestTimeoutInput');
const treeLabelBatchSizeInput = document.getElementById('treeLabelBatchSizeInput');
const treeLabelConcurrencyInput = document.getElementById('treeLabelConcurrencyInput');
const treeAssignBatchSizeInput = document.getElementById('treeAssignBatchSizeInput');

let treeFolderOptions = [];
let treeFolderOptionsLoadFailed = false;
let _treeProviderInputCache = {};

function getTreeProvider(id) {
  return TREE_PROVIDERS[id] || TREE_PROVIDERS.custom;
}

function clampTreeNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function setTreeStatus(text, kind) {
  if (!treeStatusDesc) return;
  treeStatusDesc.textContent = text;
  treeStatusDesc.classList.remove('tree-status-ok', 'tree-status-err');
  if (kind === 'ok') treeStatusDesc.classList.add('tree-status-ok');
  if (kind === 'err') treeStatusDesc.classList.add('tree-status-err');
}

function normalizeTreeEndpointBase(url, preserveFullUrl = false) {
  let value = String(url || '').trim();
  if (!value) return '';
  if (preserveFullUrl) return value;
  value = value.replace(/\/+$/, '');
  value = value
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/v1\/messages$/i, '/v1')
    .replace(/\/messages$/i, '');
  return value.replace(/\/+$/, '');
}

function resolveGeminiRequestUrl(baseUrl, model) {
  const raw = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  if (raw.includes('{model}')) return raw.replace('{model}', encodeURIComponent(model));
  if (/\/models\/[^/]+:generateContent$/i.test(raw)) return raw;
  return `${raw}/models/${encodeURIComponent(model)}:generateContent`;
}

function resolveTreeRequestUrl(settings) {
  const provider = settings.provider || 'agnes';
  const p = getTreeProvider(provider);
  const style = provider === 'custom'
    ? (settings.customApiStyle || 'openai')
    : (p.apiStyle || 'openai');
  const rawValue = String(settings.baseUrl || p.baseUrl || '').trim();
  if (!rawValue) return '';
  if (provider === 'custom' && settings.customFullUrl) return rawValue;
  const raw = rawValue.replace(/\/+$/, '');
  const model = settings.model || p.defaultModel;

  if (provider !== 'custom') {
    if (style === 'openai') return /\/chat\/completions$/i.test(raw) ? raw : `${raw}/chat/completions`;
    if (style === 'anthropic') return /\/messages$/i.test(raw) ? raw : `${raw}/messages`;
    if (style === 'gemini') return resolveGeminiRequestUrl(raw, model);
    return raw;
  }

  if (style === 'openai') return /\/chat\/completions$/i.test(raw) ? raw : `${raw}/chat/completions`;
  if (style === 'anthropic') {
    if (/\/messages$/i.test(raw)) return raw;
    if (/\/v1$/i.test(raw)) return `${raw}/messages`;
    return `${raw}/v1/messages`;
  }
  if (style === 'gemini') return resolveGeminiRequestUrl(raw, model);
  return raw;
}

function toggleTreeCustomFields() {
  const isCustom = !!(treeProviderSelect && treeProviderSelect.value === 'custom');
  if (treeCustomFields) treeCustomFields.style.display = isCustom ? '' : 'none';
}

async function openAiTreeClassifyPanel() {
  const panelPath = 'ai/sidepanel.html';
  try {
    const router = window.AIBookmarkPageRouter;
    const opened = router?.openAiClassificationPanel
      ? await router.openAiClassificationPanel()
      : (await openExtensionPage(panelPath), 'tab');
    if (opened === 'side-panel') {
      showToast('已打开 AI 分类侧栏', 'success');
    } else {
      showToast('已在新标签页打开 AI 分类', 'success');
    }
  } catch (err) {
    console.warn('AI classify page open failed', err);
    showToast('打开 AI 分类页面失败', 'error');
  }
}

function updateTreeEndpointHint() {
  if (!treeEndpointHintText || !treeEndpointHintFullUrl) return;
  const isFullUrl = !!(treeFullUrlToggle && treeFullUrlToggle.checked);
  treeEndpointHintText.style.display = isFullUrl ? 'none' : '';
  treeEndpointHintFullUrl.style.display = isFullUrl ? '' : 'none';
  if (isFullUrl) return;

  const style = (treeApiStyleSelect && treeApiStyleSelect.value) || 'openai';
  if (style === 'anthropic') {
    treeEndpointHintText.textContent = '请填写兼容 Anthropic API 的服务端点地址，不要以斜杠结尾。/v1/messages 将会被补充到你填写的地址末尾。';
  } else if (style === 'gemini') {
    treeEndpointHintText.textContent = '请填写 Gemini API 根地址（通常到 /v1beta）。模型路径会在请求时自动拼接。';
  } else {
    treeEndpointHintText.textContent = '请填写兼容 OpenAI API 的服务端点地址，不要以斜杠结尾。/chat/completions 将会被补充到你填写的地址末尾。';
  }
}

function switchTreeProvider(newProvider) {
  if (!treeProviderSelect) return;
  const previousProvider = treeProviderSelect.dataset.previousProvider || treeProviderSelect.value || 'agnes';

  _treeProviderInputCache[previousProvider] = {
    apiKey: treeApiKeyInput ? treeApiKeyInput.value : '',
    model: treeModelInput ? treeModelInput.value : '',
    endpoint: treeBaseUrlInput ? treeBaseUrlInput.value : '',
    apiStyle: treeApiStyleSelect ? treeApiStyleSelect.value : 'openai',
    fullUrl: !!(treeFullUrlToggle && treeFullUrlToggle.checked),
  };

  const cached = _treeProviderInputCache[newProvider] || {};
  const p = getTreeProvider(newProvider);

  if (treeApiKeyInput) treeApiKeyInput.value = cached.apiKey || '';
  if (treeModelInput) {
    treeModelInput.value = cached.model || '';
    treeModelInput.placeholder = p.defaultModel || 'model-name';
  }
  if (treeApiStyleSelect) treeApiStyleSelect.value = cached.apiStyle || p.apiStyle || 'openai';
  if (treeFullUrlToggle) treeFullUrlToggle.checked = !!cached.fullUrl;
  if (treeBaseUrlInput) {
    treeBaseUrlInput.value = newProvider === 'custom' ? (cached.endpoint || '') : '';
  }

  // 同步隐藏兼容字段
  if (treeModelSelect) {
    treeModelSelect.innerHTML = '';
    const opt = document.createElement('option');
    const model = (treeModelInput && treeModelInput.value.trim()) || p.defaultModel || '';
    opt.value = model;
    opt.textContent = model;
    treeModelSelect.appendChild(opt);
    treeModelSelect.value = model;
  }
  if (treeModelCustomInput) {
    treeModelCustomInput.value = (treeModelInput && treeModelInput.value) || '';
    treeModelCustomInput.style.display = 'none';
  }

  treeProviderSelect.dataset.previousProvider = newProvider;
  toggleTreeCustomFields();
  updateTreeEndpointHint();
}

async function loadTreeFolderOptions() {
  try {
    const tree = await chrome.bookmarks.getTree();
    const options = [];
    const walk = (nodes, pathParts) => {
      for (const n of nodes || []) {
        if (n.url) continue;
        const next = pathParts.concat(n.title || '');
        const path = next.filter(Boolean).join(' / ');
        if (path) options.push({ id: n.id, path });
        if (n.children && n.children.length) walk(n.children, next);
      }
    };
    walk(tree, []);
    treeFolderOptions = options.sort((a, b) => a.path.localeCompare(b.path, 'zh'));
    treeFolderOptionsLoadFailed = false;
    return true;
  } catch (error) {
    console.warn('loadTreeFolderOptions failed', error);
    treeFolderOptions = [];
    treeFolderOptionsLoadFailed = true;
    return false;
  }
}

function getSelectedPreservedFolders() {
  if (!treePreserveFoldersList) return [];
  return Array.from(treePreserveFoldersList.querySelectorAll('input[type="checkbox"]:checked'))
    .map((el) => el.value)
    .filter(Boolean);
}

function renderTreePreserveFolders(selectedPaths) {
  if (!treePreserveFoldersList) return;
  const selected = new Set(Array.isArray(selectedPaths) ? selectedPaths : []);
  treePreserveFoldersList.innerHTML = '';
  if (!treeFolderOptions.length) {
    const empty = document.createElement('div');
    empty.className = 'tree-preserve-empty';
    empty.textContent = treeFolderOptionsLoadFailed ? '无法读取浏览器书签文件夹' : '暂无可选文件夹';
    treePreserveFoldersList.appendChild(empty);
    return;
  }
  for (const folder of treeFolderOptions) {
    const label = document.createElement('label');
    label.className = 'tree-preserve-item';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = folder.path;
    input.checked = selected.has(folder.path);
    const span = document.createElement('span');
    span.textContent = folder.path;
    label.appendChild(input);
    label.appendChild(span);
    treePreserveFoldersList.appendChild(label);
  }
}

function updateTreePreserveVisibility() {
  if (!treePreserveFoldersRow || !treeRespectFoldersToggle) return;
  treePreserveFoldersRow.style.display = treeRespectFoldersToggle.checked ? '' : 'none';
}

function readTreeSettingsFromUI(prev) {
  const provider = (treeProviderSelect && treeProviderSelect.value) || 'agnes';
  const p = getTreeProvider(provider);
  const model = ((treeModelInput && treeModelInput.value.trim()) || p.defaultModel || '').trim();
  const prompts = migrateTreeDefaultPrompts({
    label: treePromptLabel && treePromptLabel.value,
    buildTree: treePromptBuild && treePromptBuild.value,
    assign: treePromptAssign && treePromptAssign.value,
  });
  const customFullUrl = provider === 'custom' ? !!(treeFullUrlToggle && treeFullUrlToggle.checked) : false;
  const baseUrl = provider === 'custom'
    ? normalizeTreeEndpointBase((treeBaseUrlInput && treeBaseUrlInput.value) || '', customFullUrl)
    : p.baseUrl;

  return {
    ...DEFAULT_TREE_SETTINGS,
    ...(prev || {}),
    provider,
    apiKey: (treeApiKeyInput && treeApiKeyInput.value.trim()) || '',
    baseUrl,
    model,
    customApiStyle: provider === 'custom'
      ? ((treeApiStyleSelect && treeApiStyleSelect.value) || 'openai')
      : (p.apiStyle || 'openai'),
    customFullUrl,
    classifyPrompts: prompts,
    respectExistingFolders: treeRespectFoldersToggle ? !!treeRespectFoldersToggle.checked : true,
    preservedFolderPaths: getSelectedPreservedFolders(),
    reusePreviousAiTree: treeReusePreviousToggle ? !!treeReusePreviousToggle.checked : false,
    useBuiltInClassificationRules: treeBuiltInRulesToggle ? !!treeBuiltInRulesToggle.checked : true,
    useClassificationCache: treeCacheToggle ? !!treeCacheToggle.checked : true,
    usePageMetadata: treeMetadataToggle ? !!treeMetadataToggle.checked : true,
    incrementalClassificationEnabled: treeIncrementalToggle ? !!treeIncrementalToggle.checked : false,
    aiRetryCount: clampTreeNumber(treeRetryCountInput && treeRetryCountInput.value, DEFAULT_TREE_SETTINGS.aiRetryCount, 0, 20),
    aiRequestTimeoutSeconds: clampTreeNumber(treeRequestTimeoutInput && treeRequestTimeoutInput.value, DEFAULT_TREE_SETTINGS.aiRequestTimeoutSeconds, 5, 600),
    labelBatchSize: clampTreeNumber(treeLabelBatchSizeInput && treeLabelBatchSizeInput.value, 40, 10, 80),
    labelConcurrency: clampTreeNumber(treeLabelConcurrencyInput && treeLabelConcurrencyInput.value, 2, 1, 5),
    assignBatchSize: clampTreeNumber(treeAssignBatchSizeInput && treeAssignBatchSizeInput.value, 60, 10, 100),
  };
}

async function loadTreeSettings() {
  if (!treeProviderSelect) return;
  // Paint usable defaults before asynchronous storage/bookmark reads. A malformed
  // legacy setting must not leave the prompt editors or folder selector blank.
  if (treePromptLabel) treePromptLabel.value = DEFAULT_TREE_PROMPTS.label;
  if (treePromptBuild) treePromptBuild.value = DEFAULT_TREE_PROMPTS.buildTree;
  if (treePromptAssign) treePromptAssign.value = DEFAULT_TREE_PROMPTS.assign;
  if (treeRespectFoldersToggle) treeRespectFoldersToggle.checked = true;
  updateTreePreserveVisibility();
  try {
    const data = await chrome.storage.local.get('settings');
    const s = { ...DEFAULT_TREE_SETTINGS, ...(data.settings || {}) };
    s.classifyPrompts = migrateTreeDefaultPrompts(s.classifyPrompts || {});

    const provider = typeof s.provider === 'string' && Object.prototype.hasOwnProperty.call(TREE_PROVIDERS, s.provider)
      ? s.provider
      : 'custom';
    const p = getTreeProvider(provider);
    treeProviderSelect.value = provider;
    treeProviderSelect.dataset.previousProvider = provider;

    if (treeApiStyleSelect) treeApiStyleSelect.value = s.customApiStyle || p.apiStyle || 'openai';
    if (treeFullUrlToggle) treeFullUrlToggle.checked = !!s.customFullUrl;
    if (treeApiKeyInput) treeApiKeyInput.value = s.apiKey || '';
    if (treeModelInput) {
      treeModelInput.value = s.model || p.defaultModel || '';
      treeModelInput.placeholder = p.defaultModel || 'model-name';
    }
    if (treeBaseUrlInput) {
      treeBaseUrlInput.value = provider === 'custom' ? normalizeTreeEndpointBase(s.baseUrl || '', !!s.customFullUrl) : '';
    }

    _treeProviderInputCache = {
      [provider]: {
        apiKey: s.apiKey || '',
        model: s.model || '',
        endpoint: provider === 'custom' ? normalizeTreeEndpointBase(s.baseUrl || '', !!s.customFullUrl) : '',
        apiStyle: s.customApiStyle || p.apiStyle || 'openai',
        fullUrl: !!s.customFullUrl,
      }
    };

    if (treePromptLabel) treePromptLabel.value = s.classifyPrompts.label || DEFAULT_TREE_PROMPTS.label;
    if (treePromptBuild) treePromptBuild.value = s.classifyPrompts.buildTree || DEFAULT_TREE_PROMPTS.buildTree;
    if (treePromptAssign) treePromptAssign.value = s.classifyPrompts.assign || DEFAULT_TREE_PROMPTS.assign;
    if (treeRespectFoldersToggle) treeRespectFoldersToggle.checked = s.respectExistingFolders !== false;
    await loadTreeFolderOptions();
    renderTreePreserveFolders(s.preservedFolderPaths);
    updateTreePreserveVisibility();
    if (treeReusePreviousToggle) treeReusePreviousToggle.checked = s.reusePreviousAiTree === true;
    if (treeBuiltInRulesToggle) treeBuiltInRulesToggle.checked = s.useBuiltInClassificationRules !== false;
    if (treeCacheToggle) treeCacheToggle.checked = s.useClassificationCache !== false;
    if (treeMetadataToggle) treeMetadataToggle.checked = s.usePageMetadata !== false;
    if (treeIncrementalToggle) treeIncrementalToggle.checked = s.incrementalClassificationEnabled === true;
    if (treeRetryCountInput) treeRetryCountInput.value = String(clampTreeNumber(s.aiRetryCount, DEFAULT_TREE_SETTINGS.aiRetryCount, 0, 20));
    if (treeRequestTimeoutInput) treeRequestTimeoutInput.value = String(clampTreeNumber(s.aiRequestTimeoutSeconds, DEFAULT_TREE_SETTINGS.aiRequestTimeoutSeconds, 5, 600));
    if (treeLabelBatchSizeInput) treeLabelBatchSizeInput.value = String(clampTreeNumber(s.labelBatchSize, 40, 10, 80));
    if (treeLabelConcurrencyInput) treeLabelConcurrencyInput.value = String(clampTreeNumber(s.labelConcurrency, 2, 1, 5));
    if (treeAssignBatchSizeInput) treeAssignBatchSizeInput.value = String(clampTreeNumber(s.assignBatchSize, 60, 10, 100));

    toggleTreeCustomFields();
    updateTreeEndpointHint();

    const configured = !!(s.apiKey && (provider !== 'custom' || s.baseUrl));
    setTreeStatus(
      configured
        ? `已配置 · ${p.label} · ${s.model || p.defaultModel || ''}`
        : '未配置 API Key',
      configured ? 'ok' : null
    );
  } catch (e) {
    console.warn('loadTreeSettings failed', e);
    setTreeStatus('加载失败', 'err');
  }
}

function treeSyncSettingsProjection(settings) {
  const {
    apiKey: _apiKey,
    baseUrl: _baseUrl,
    classifyPrompts: _classifyPrompts,
    preservedFolderIds: _preservedFolderIds,
    preservedFolderPaths: _preservedFolderPaths,
    ...safe
  } = settings || {};
  return safe;
}

async function saveTreeSyncSettings(settings) {
  try {
    await chrome.storage.sync.set({ settings: treeSyncSettingsProjection(settings) });
  } catch (error) {
    await chrome.storage.local.set({
      settingsMigrationDiagnostic: {
        code: 'sync_cleanup_failed',
        message: error?.message || String(error),
        timestamp: Date.now(),
      },
    }).catch(() => undefined);
  }
}

async function saveTreeSettings(options = {}) {
  const quiet = !!options.quiet;
  const isAuto = options.mode === 'auto';
  const data = await chrome.storage.local.get('settings');
  const next = readTreeSettingsFromUI(data.settings || {});
  const missing = [];
  if (!next.apiKey) missing.push('API Key');
  if (next.provider === 'custom' && !next.baseUrl) missing.push('API Base URL');
  if (!next.model) missing.push('模型名');

  await chrome.storage.local.set({ settings: next });
  await saveTreeSyncSettings(next);

  if (missing.length) {
    if (isAuto) {
      setTreeStatus(`已自动保存 · 待配置：${missing.join('、')}`);
      if (!quiet && typeof showToast === 'function') {
        showToast(typeof i18n === 'function' ? (i18n('settingsSaved') || '已保存') : '已保存', 'success');
      }
      return true;
    }
    setTreeStatus(`已保存 · 仍需填写：${missing.join('、')}`, 'err');
    if (!quiet && typeof showToast === 'function') showToast(`请填写：${missing.join('、')}`, 'error');
    return false;
  }

  setTreeStatus(`${isAuto ? '已自动保存' : '已保存'} · ${getTreeProvider(next.provider).label} · ${next.model}`, 'ok');
  if (!quiet && typeof showToast === 'function') {
    showToast(typeof i18n === 'function' ? (i18n('settingsSaved') || '已保存') : '已保存', 'success');
  }
  return true;
}

function autoSaveTreeSettings(options = {}) {
  return saveTreeSettings({ ...options, mode: 'auto' });
}

function buildTreeChatRequest(settings, userText) {
  const style = settings.provider === 'custom'
    ? (settings.customApiStyle || 'openai')
    : (getTreeProvider(settings.provider).apiStyle || 'openai');
  const requestUrl = resolveTreeRequestUrl(settings);
  const model = settings.model || getTreeProvider(settings.provider).defaultModel;

  if (style === 'anthropic') {
    return {
      url: requestUrl,
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: {
        model,
        max_tokens: 32,
        messages: [{ role: 'user', content: userText }],
      },
    };
  }

  if (style === 'gemini') {
    return {
      url: requestUrl,
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': settings.apiKey,
      },
      body: {
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: { maxOutputTokens: 32 },
      },
    };
  }

  return {
    url: requestUrl,
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: {
      model,
      max_tokens: 32,
      messages: [{ role: 'user', content: userText }],
    },
  };
}

function parseTreeTestResponse(style, payloadText) {
  try {
    const data = JSON.parse(payloadText);
    const providerError = data?.error;
    if (providerError) {
      const detail = typeof providerError === 'string' ? providerError : providerError.message || JSON.stringify(providerError);
      return { ok: false, error: `API 返回错误：${String(detail).slice(0, 160)}` };
    }
    let sample = '';
    if (style === 'anthropic') {
      const parts = data?.content;
      if (Array.isArray(parts)) {
        sample = parts.map((p) => p?.text || '').join('').trim();
      } else {
        sample = String(data?.content || '').trim();
      }
    } else if (style === 'gemini') {
      const parts = data?.candidates?.[0]?.content?.parts;
      if (Array.isArray(parts)) {
        sample = parts.map((p) => p?.text || '').join('').trim();
      }
    } else {
      sample = String(data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '').trim();
    }
    if (!sample) return { ok: false, error: `响应不符合 ${style} 协议或未包含回复内容` };
    return { ok: true, sample };
  } catch (_) {
    return { ok: false, error: '响应不是有效 JSON' };
  }
}

function treeTestRetryDelayMs(attempt) {
  return Math.min(30000, 1500 * (2 ** attempt));
}

function isRetryableTreeTestError(error) {
  return error?.name === 'AbortError'
    || error?.name === 'TimeoutError'
    || error instanceof TypeError
    || /timeout|超时|network|failed to fetch/i.test(String(error?.message || error || ''));
}

async function fetchTreeTestAttempt(req, timeoutMs) {
  const response = await chrome.runtime.sendMessage({
    action: 'aiProxyFetch',
    request: {
      url: req.url,
      headers: req.headers,
      body: JSON.stringify(req.body),
      timeoutMs,
    },
  });
  if (!response || response.success === false) {
    throw new Error(response?.error || '后台代理请求失败');
  }
  return { ok: !!response.ok, status: Number(response.status) || 0, text: String(response.text || '') };
}

async function fetchTreeTestWithRetry(req, settings, onRetry) {
  const timeoutMs = clampTreeNumber(settings.aiRequestTimeoutSeconds, DEFAULT_TREE_SETTINGS.aiRequestTimeoutSeconds, 5, 600) * 1000;
  const maxRetries = clampTreeNumber(settings.aiRetryCount, DEFAULT_TREE_SETTINGS.aiRetryCount, 0, 20);
  let lastResult = null;
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fetchTreeTestAttempt(req, timeoutMs);
      lastResult = result;
      const retryableStatus = result.status === 408 || result.status === 429 || result.status >= 500;
      if (!retryableStatus || attempt >= maxRetries) return result;
    } catch (error) {
      lastError = error;
      if (!isRetryableTreeTestError(error) || attempt >= maxRetries) throw error;
    }
    const delayMs = treeTestRetryDelayMs(attempt);
    onRetry?.({ attempt: attempt + 1, maxRetries, delayMs, timeoutMs });
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  if (lastError) throw lastError;
  return lastResult;
}

async function testTreeConnection() {
  if (!treeTestBtn) return;

  // 使用当前表单值，让权限弹窗始终由测试按钮的用户手势直接触发。
  const settings = readTreeSettingsFromUI(DEFAULT_TREE_SETTINGS);
  const style = settings.provider === 'custom'
    ? (settings.customApiStyle || 'openai')
    : (getTreeProvider(settings.provider).apiStyle || 'openai');

  if (!settings.apiKey) {
    setTreeStatus('请先填写 API Key', 'err');
    if (typeof showToast === 'function') showToast('请先填写 API Key', 'error');
    return;
  }
  if (settings.provider === 'custom' && !settings.baseUrl) {
    setTreeStatus('请先填写 API Base URL', 'err');
    if (typeof showToast === 'function') showToast('请先填写 API Base URL', 'error');
    return;
  }
  if (!settings.model) {
    setTreeStatus('请先填写模型名', 'err');
    if (typeof showToast === 'function') showToast('请先填写模型名', 'error');
    return;
  }

  const request = buildTreeChatRequest(settings, '回复"OK"两个字母即可。');
  const permission = await ensureApiHostPermission(request.url);
  if (!permission.granted) {
    setTreeStatus(`诊断失败：${permission.error}`, 'err');
    if (typeof showToast === 'function') showToast(permission.error, 'error');
    return;
  }

  const originalText = treeTestBtn.textContent;
  treeTestBtn.disabled = true;
  treeTestBtn.textContent = (typeof i18n === 'function' ? (i18n('aiTesting') || '诊断中...') : '诊断中...');
  setTreeStatus('诊断中…');

  try {
    // Provider Doctor：分环节诊断（配置完整性 → 请求地址 → 连通性）。
    // 连通性走 SW 代理（与真实分类同路径），避免页面直连触发 CORS 预检导致慢/报错。
    const steps = [];

    // 1) 配置完整性
    const missing = [];
    if (!settings.apiKey) missing.push('API Key');
    if (!settings.model) missing.push('模型名');
    if (settings.provider === 'custom' && !settings.baseUrl) missing.push('Base URL');
    steps.push({ step: '配置完整性', ok: missing.length === 0, detail: missing.length ? `缺少：${missing.join('、')}` : '必填字段齐全' });

    // 2) 请求地址
    const requestUrl = request.url;
    const hasValidUrl = !!requestUrl && /^https?:\/\//.test(requestUrl);
    steps.push({ step: '请求地址', ok: hasValidUrl, detail: requestUrl || '无法解析出有效的请求地址' });

    // 3) 连通性（经 SW 代理发一次极小的 chat 请求）
    if (hasValidUrl) {
      try {
        const result = await fetchTreeTestWithRetry(request, settings, ({ attempt, maxRetries }) => {
          setTreeStatus(`连接波动，正在进行第 ${attempt}/${maxRetries} 次重试…`);
        });
        if (!result.ok) {
          steps.push({ step: '连通性', ok: false, detail: `HTTP ${result.status}：${result.text.slice(0, 120)}` });
        } else {
          const parsed = parseTreeTestResponse(style, result.text);
          steps.push(parsed.ok
            ? { step: '连通性', ok: true, detail: `连接成功 · ${style} · ${settings.model}｜样例：${parsed.sample.slice(0, 40)}` }
            : { step: '连通性', ok: false, detail: parsed.error });
        }
      } catch (error) {
        steps.push({ step: '连通性', ok: false, detail: (error && error.message) || String(error) });
      }
    }

    const allOk = steps.every((s) => s.ok);
    const summary = steps.map((s) => `${s.ok ? '✅' : '❌'} ${s.step}：${s.detail}`).join('\n');

    if (allOk) {
      await chrome.storage.local.set({ settings });
      await saveTreeSyncSettings(settings);
      setTreeStatus(`诊断通过 · ${getTreeProvider(settings.provider).label} · ${settings.model}\n${summary}`, 'ok');
      if (typeof showToast === 'function') showToast('诊断通过，连接正常', 'success');
    } else {
      const failed = steps.find((s) => !s.ok);
      setTreeStatus(summary, 'err');
      if (typeof showToast === 'function') showToast(`诊断失败（${failed ? failed.step : '未知'}）：${failed ? failed.detail : ''}`.slice(0, 80), 'error');
    }
  } catch (e) {
    const readable = (e && e.message) || String(e);
    setTreeStatus(`诊断失败：${readable}`, 'err');
    if (typeof showToast === 'function') showToast(`诊断失败：${readable}`, 'error');
  } finally {
    treeTestBtn.disabled = false;
    treeTestBtn.textContent = originalText || (typeof i18n === 'function' ? (i18n('aiTest') || '测试连接') : '测试连接');
  }
}

function bindTreeSettings() {
  if (!treeProviderSelect) return;

  treeProviderSelect.addEventListener('change', () => {
    switchTreeProvider(treeProviderSelect.value);
    autoSaveTreeSettings();
  });

  if (treeApiStyleSelect) {
    treeApiStyleSelect.addEventListener('change', () => {
      updateTreeEndpointHint();
      autoSaveTreeSettings();
    });
  }
  if (treeFullUrlToggle) {
    treeFullUrlToggle.addEventListener('change', () => {
      updateTreeEndpointHint();
      autoSaveTreeSettings();
    });
  }
  if (treeBaseUrlInput) {
    treeBaseUrlInput.addEventListener('change', () => { autoSaveTreeSettings(); });
  }
  if (treeApiKeyInput) {
    treeApiKeyInput.addEventListener('change', () => { autoSaveTreeSettings(); });
  }
  if (treeModelInput) {
    treeModelInput.addEventListener('change', () => { autoSaveTreeSettings(); });
  }
  if (treePromptLabel) {
    treePromptLabel.addEventListener('change', () => { autoSaveTreeSettings(); });
  }
  if (treePromptBuild) {
    treePromptBuild.addEventListener('change', () => { autoSaveTreeSettings(); });
  }
  if (treePromptAssign) {
    treePromptAssign.addEventListener('change', () => { autoSaveTreeSettings(); });
  }
  if (treeSaveBtn) {
    treeSaveBtn.addEventListener('click', () => { saveTreeSettings(); });
  }
  if (treeTestBtn) {
    treeTestBtn.addEventListener('click', () => { testTreeConnection(); });
  }
  if (treeRespectFoldersToggle) {
    treeRespectFoldersToggle.addEventListener('change', () => {
      updateTreePreserveVisibility();
      autoSaveTreeSettings({ quiet: true });
    });
  }
  if (treeClearPreservedFoldersBtn) {
    treeClearPreservedFoldersBtn.addEventListener('click', () => {
      renderTreePreserveFolders([]);
      autoSaveTreeSettings();
    });
  }
  if (treePreserveFoldersList) {
    treePreserveFoldersList.addEventListener('change', (e) => {
      if (e.target && e.target.matches('input[type="checkbox"]')) autoSaveTreeSettings();
    });
  }
  if (treeReusePreviousToggle) {
    treeReusePreviousToggle.addEventListener('change', () => { autoSaveTreeSettings({ quiet: true }); });
  }
  if (treeBuiltInRulesToggle) {
    treeBuiltInRulesToggle.addEventListener('change', () => { autoSaveTreeSettings({ quiet: true }); });
  }
  if (treeCacheToggle) {
    treeCacheToggle.addEventListener('change', () => { autoSaveTreeSettings({ quiet: true }); });
  }
  if (treeMetadataToggle) {
    treeMetadataToggle.addEventListener('change', () => { autoSaveTreeSettings({ quiet: true }); });
  }
  if (treeIncrementalToggle) {
    treeIncrementalToggle.addEventListener('change', () => { autoSaveTreeSettings({ quiet: true }); });
  }
  if (treeRetryCountInput) {
    treeRetryCountInput.addEventListener('change', () => { autoSaveTreeSettings({ quiet: true }); });
  }
  if (treeRequestTimeoutInput) {
    treeRequestTimeoutInput.addEventListener('change', () => { autoSaveTreeSettings({ quiet: true }); });
  }
  if (treeLabelBatchSizeInput) {
    treeLabelBatchSizeInput.addEventListener('change', () => { autoSaveTreeSettings({ quiet: true }); });
  }
  if (treeLabelConcurrencyInput) {
    treeLabelConcurrencyInput.addEventListener('change', () => { autoSaveTreeSettings({ quiet: true }); });
  }
  if (treeAssignBatchSizeInput) {
    treeAssignBatchSizeInput.addEventListener('change', () => { autoSaveTreeSettings({ quiet: true }); });
  }
  if (treeResetPromptsBtn) {
    treeResetPromptsBtn.addEventListener('click', () => {
      if (treePromptLabel) treePromptLabel.value = DEFAULT_TREE_PROMPTS.label;
      if (treePromptBuild) treePromptBuild.value = DEFAULT_TREE_PROMPTS.buildTree;
      if (treePromptAssign) treePromptAssign.value = DEFAULT_TREE_PROMPTS.assign;
      autoSaveTreeSettings();
    });
  }
  if (treeOpenSidepanelBtn) {
    treeOpenSidepanelBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await openAiTreeClassifyPanel();
    });
  }
}


document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  await loadLanguage();
  loadCheckerSettings();
  loadRetentionDays();
  loadPreviewSettings();
  loadShortcutSettings();
  loadTagRules();
  loadAISettings();
  bindTreeSettings();
  loadTreeSettings();
  loadActiveLearning();
  loadNotificationSettings();
  loadRssSettings();
  renderAILogs();

  // 处理 URL hash / query，自动打开指定面板（如 #ai 或 ?panel=ai）
  openSettingsPanelFromLocation();
});

// ===== 通知设置 =====
async function loadNotificationSettings() {
  const result = await chrome.storage.local.get(['notificationEnabled']);
  notificationEnabledToggle.checked = !!result.notificationEnabled;
}

async function saveNotificationSetting(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

// ===== 快捷键设置 =====
const COMMAND_LABELS = {
  'quick-bookmark': { el: shortcutQuickBookmark, name: 'Quick Bookmark' },
  'open-command-palette': { el: shortcutOpenPalette, name: 'Command Palette' },
  'open-popup': { el: shortcutOpenPopup, name: 'Open AI Bookmark OS' }
};

async function loadShortcutSettings() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getCommands' });
    if (!res || !res.success) return;
    const commands = res.commands || [];

    for (const cmd of commands) {
      const info = COMMAND_LABELS[cmd.name];
      if (!info || !info.el) continue;

      const shortcut = cmd.shortcut || '';
      if (shortcut) {
        info.el.textContent = formatShortcut(shortcut);
        info.el.classList.remove('unset');
      } else {
        info.el.textContent = i18n('shortcutNotSet') || 'Not set';
        info.el.classList.add('unset');
      }
    }

    // 冲突检测
    detectShortcutConflicts(commands);
  } catch (e) {
    // 静默处理
  }
}

function formatShortcut(shortcut) {
  return shortcut
    .replace(/Command/i, '⌘')
    .replace(/Ctrl/i, 'Ctrl')
    .replace(/Shift/i, '⇧')
    .replace(/Alt/i, 'Alt')
    .replace(/\+/g, ' + ');
}

function detectShortcutConflicts(commands) {
  const conflicts = [];
  const keyMap = new Map(); // normalizedKey -> [commandName, ...]

  // 收集所有已设置的快捷键
  for (const cmd of commands) {
    if (!cmd.shortcut) continue;
    const key = cmd.shortcut.toLowerCase().replace(/\s+/g, '');
    if (!keyMap.has(key)) keyMap.set(key, []);
    keyMap.get(key).push(cmd.name);
  }

  // 检查内部冲突（同一扩展内重复）
  for (const [key, names] of keyMap) {
    if (names.length > 1) {
      const labels = names.map(n => COMMAND_LABELS[n]?.name || n);
      conflicts.push({
        key: formatShortcut(key),
        commands: labels,
        type: 'internal'
      });
    }
  }

  // 检查常见系统快捷键冲突
  const SYSTEM_CONFLICTS = [
    { key: 'Ctrl+D', system: 'Chrome 添加书签' },
    { key: 'Ctrl+Shift+D', system: 'Chrome 为所有标签页添加书签' },
    { key: 'Ctrl+Shift+B', system: 'Chrome 书签栏显示/隐藏' },
    { key: 'Ctrl+L', system: '聚焦地址栏' },
    { key: 'Ctrl+K', system: 'Chrome 搜索框' },
    { key: 'Ctrl+E', system: 'Chrome 搜索框' },
    { key: 'Ctrl+Shift+A', system: 'Chrome 搜索标签页' },
    { key: 'Ctrl+W', system: '关闭当前标签页' },
    { key: 'Ctrl+T', system: '新建标签页' },
    { key: 'Ctrl+N', system: '新建窗口' },
  ];

  for (const cmd of commands) {
    if (!cmd.shortcut) continue;
    const normalizedKey = cmd.shortcut.replace(/\s+/g, '');
    const systemConflict = SYSTEM_CONFLICTS.find(sc =>
      sc.key.toLowerCase() === normalizedKey.toLowerCase()
    );
    if (systemConflict) {
      conflicts.push({
        key: formatShortcut(normalizedKey),
        commands: [COMMAND_LABELS[cmd.name]?.name || cmd.name],
        system: systemConflict.system,
        type: 'system'
      });
    }
  }

  // 渲染冲突
  if (conflicts.length > 0) {
    shortcutConflicts.style.display = 'flex';
    conflictDetails.innerHTML = conflicts.map(c => {
      if (c.type === 'system') {
        return `<div class="conflict-item"><kbd>${escapeHtml(c.key)}</kbd> ${escapeHtml(c.commands[0])} → ${escapeHtml(c.system)}</div>`;
      }
      return `<div class="conflict-item"><kbd>${escapeHtml(c.key)}</kbd> ${escapeHtml(c.commands.join(' & '))} ${i18n('shortcutConflictInternal') || 'duplicate binding'}</div>`;
    }).join('');
  } else {
    shortcutConflicts.style.display = 'none';
  }
}

function escapeHtmlForTagRules(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 打开 Chrome 快捷键设置页
if (openShortcutsPageLink) {
  openShortcutsPageLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
}

// ===== 智能标签规则管理 =====
async function loadTagRules() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getDynamicRules' });
    if (!res || !res.success) return;
    const rules = res.rules || {};
    renderDomainRules(rules.domainRules || []);
    renderKeywordRules(rules.keywordRules || {});
    renderStopWords(rules.stopWords || []);
    renderLearnedTags(rules.learnedDomainTag || {});
  } catch (e) {
    // 静默处理
  }
}

function renderDomainRules(domainRules) {
  if (!domainRules || domainRules.length === 0) {
    domainRulesList.innerHTML = `<div class="tagrule-empty">${i18n('noDomainRules') || '暂无自定义域名规则'}</div>`;
    return;
  }
  domainRulesList.innerHTML = domainRules.map((r, idx) => `
    <div class="tagrule-item">
      <span class="tagrule-item-text">${escapeHtml((r.domains || []).join(', '))}</span>
      <span class="tagrule-item-tag">${escapeHtml(r.tag)}</span>
      <button class="tagrule-item-delete" data-idx="${idx}" data-tag="${escapeHtml(r.tag)}" title="${i18n('delete') || '删除'}">×</button>
    </div>
  `).join('');
  domainRulesList.querySelectorAll('.tagrule-item-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tag = btn.dataset.tag;
      await chrome.runtime.sendMessage({ action: 'removeDynamicDomainRule', tag });
      await loadTagRules();
      showToast(i18n('settingsSaved'), 'success');
    });
  });
}

function renderKeywordRules(keywordRules) {
  const entries = Object.entries(keywordRules || {});
  if (entries.length === 0) {
    keywordRulesList.innerHTML = `<div class="tagrule-empty">${i18n('noKeywordRules') || '暂无自定义关键词规则'}</div>`;
    return;
  }
  keywordRulesList.innerHTML = entries.map(([tag, kws]) => `
    <div class="tagrule-item">
      <span class="tagrule-item-text">${escapeHtml((kws || []).join(', '))}</span>
      <span class="tagrule-item-tag">${escapeHtml(tag)}</span>
    </div>
  `).join('');
}

function renderStopWords(stopWords) {
  if (!stopWords || stopWords.length === 0) {
    stopWordsList.innerHTML = `<div class="tagrule-empty">${i18n('noStopWords') || '暂无自定义停用词'}</div>`;
    return;
  }
  stopWordsList.innerHTML = stopWords.map(w => `
    <div class="tagrule-item">
      <span class="tagrule-item-text">${escapeHtml(w)}</span>
      <button class="tagrule-item-delete" data-word="${escapeHtml(w)}" title="${i18n('delete') || '删除'}">×</button>
    </div>
  `).join('');
  stopWordsList.querySelectorAll('.tagrule-item-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ action: 'removeDynamicStopWord', word: btn.dataset.word });
      await loadTagRules();
      showToast(i18n('settingsSaved'), 'success');
    });
  });
}

function renderLearnedTags(learnedDomainTag) {
  const entries = Object.entries(learnedDomainTag || {});
  if (entries.length === 0) {
    learnedTagsList.innerHTML = `<div class="tagrule-empty">${i18n('noLearnedTags') || '暂无自动学习记录'}</div>`;
    return;
  }
  learnedTagsList.innerHTML = entries.map(([domain, tag]) => `
    <div class="tagrule-item">
      <span class="tagrule-item-text">${escapeHtml(domain)}</span>
      <span class="tagrule-item-tag">${escapeHtml(tag)}</span>
    </div>
  `).join('');
}

// 添加域名规则
addDomainRuleBtn.addEventListener('click', async () => {
  const domainsStr = domainRuleDomains.value.trim();
  const tag = domainRuleTag.value.trim();
  if (!domainsStr || !tag) {
    showToast(i18n('fillAllFields') || '请填写完整', 'error');
    return;
  }
  const domains = domainsStr.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
  await chrome.runtime.sendMessage({ action: 'addDynamicDomainRule', domains, tag });
  domainRuleDomains.value = '';
  domainRuleTag.value = '';
  await loadTagRules();
  showToast(i18n('settingsSaved'), 'success');
});

// 添加关键词规则
addKeywordRuleBtn.addEventListener('click', async () => {
  const tag = keywordRuleTag.value.trim();
  const keyword = keywordRuleKeyword.value.trim();
  if (!tag || !keyword) {
    showToast(i18n('fillAllFields') || '请填写完整', 'error');
    return;
  }
  await chrome.runtime.sendMessage({ action: 'addDynamicKeyword', tag, keyword });
  keywordRuleTag.value = '';
  keywordRuleKeyword.value = '';
  await loadTagRules();
  showToast(i18n('settingsSaved'), 'success');
});

// 添加停用词
addStopWordBtn.addEventListener('click', async () => {
  const word = stopWordInput.value.trim();
  if (!word) {
    showToast(i18n('fillAllFields') || '请填写完整', 'error');
    return;
  }
  await chrome.runtime.sendMessage({ action: 'addDynamicStopWord', word });
  stopWordInput.value = '';
  await loadTagRules();
  showToast(i18n('settingsSaved'), 'success');
});

// 清空学习记录
clearLearnedTagsBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'clearLearnedDomainTags' });
  await loadTagRules();
  showToast(i18n('settingsSaved'), 'success');
});

// ===== 主动学习管理 =====
let recommendationRuleState = 'candidate';
let recommendationLearningState = null;
let reevaluationItems = new Map();
let reevaluationSelected = new Set();
let reevaluationCancelled = false;
let reevaluationApplying = false;
let learningFeedbackExpanded = false;

function makeSettingsOperationId(prefix) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;
}

async function loadActiveLearning() {
  try {
    const [queueRes, statsRes, recommendationRes] = await Promise.all([
      chrome.runtime.sendMessage({ action: 'getReviewQueue' }),
      chrome.runtime.sendMessage({ action: 'getLearningStats' }),
      chrome.runtime.sendMessage({ action: 'getRecommendationLearningState' })
    ]);

    const legacyQueue = (queueRes && queueRes.success) ? queueRes.queue || [] : [];
    const stats = (statsRes && statsRes.success) ? statsRes.stats : null;
    recommendationLearningState = recommendationRes?.success ? recommendationRes.state : null;
    const recommendationQueue = (recommendationLearningState?.reviewQueue || []).filter(item => !item.legacy);
    const queue = [...recommendationQueue, ...legacyQueue];

    updateActiveLearningBadge(queue.length);
    renderLearningStats(stats, recommendationLearningState?.stats);
    renderLearningFeedback(recommendationLearningState?.recentFeedback || []);
    renderPendingReviews(queue);
    renderRecommendationRules();
  } catch (e) {
    // 静默处理
  }
}

function renderRecommendationRules() {
  if (!recommendationRulesList) return;
  const rules = (recommendationLearningState?.rules || []).filter(rule => rule.state === recommendationRuleState);
  if (rules.length === 0) {
    recommendationRulesList.innerHTML = '<div class="tagrule-empty">当前状态暂无规则</div>';
    return;
  }
  recommendationRulesList.innerHTML = rules.map(rule => {
    const positives = (rule.positiveFingerprints || []).length;
    const negatives = (rule.negativeFingerprints || []).length;
    const source = rule.source === 'user' ? '手动' : rule.source === 'legacy' ? '旧版待验证' : '自动学习';
    const action = rule.state === 'disabled'
      ? '<button class="btn btn-secondary btn-sm recommendation-rule-action" data-mutation="restore">恢复</button>'
      : '<button class="btn btn-secondary btn-sm recommendation-rule-action" data-mutation="disable">停用</button>';
    return `<div class="tagrule-item recommendation-rule-item" data-id="${escapeHtml(rule.id)}">
      <span class="tagrule-item-text"><strong>${escapeHtml(rule.pattern)}</strong><small>${escapeHtml(rule.kind)} · ${source} · 确认 ${positives} / 反向 ${negatives}</small></span>
      <span class="tagrule-item-tag">${escapeHtml(rule.target)}</span>
      <span class="recommendation-rule-buttons">${action}<button class="btn btn-danger btn-sm recommendation-rule-action" data-mutation="delete">删除</button></span>
    </div>`;
  }).join('');
  recommendationRulesList.querySelectorAll('.recommendation-rule-action').forEach(button => {
    button.addEventListener('click', async () => {
      const item = button.closest('.recommendation-rule-item');
      const mutation = button.dataset.mutation;
      if (mutation === 'delete' && !confirm('确定删除这条学习规则吗？')) return;
      button.disabled = true;
      const result = await chrome.runtime.sendMessage({
        action: 'mutateRecommendationRule',
        operationId: makeSettingsOperationId('rule'),
        ruleId: item?.dataset.id,
        mutation
      }).catch(() => null);
      if (!result?.success) showToast('规则操作失败', 'error');
      await loadActiveLearning();
    });
  });
}

if (recommendationRuleTabs) {
  recommendationRuleTabs.querySelectorAll('[data-state]').forEach(tab => tab.addEventListener('click', () => {
    recommendationRuleState = tab.dataset.state || 'candidate';
    recommendationRuleTabs.querySelectorAll('[data-state]').forEach(item => {
      const active = item === tab;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
    });
    renderRecommendationRules();
  }));
}

if (undoRecommendationLearningBtn) {
  undoRecommendationLearningBtn.addEventListener('click', async () => {
    if (!confirm('撤销最近一次推荐学习反馈吗？')) return;
    const result = await chrome.runtime.sendMessage({
      action: 'mutateRecommendationRule',
      operationId: makeSettingsOperationId('undo'),
      mutation: 'undo_last'
    }).catch(() => null);
    showToast(result?.success ? '已撤销最近学习' : '撤销失败', result?.success ? 'success' : 'error');
    await loadActiveLearning();
  });
}

if (rebuildRecommendationLearningBtn) {
  rebuildRecommendationLearningBtn.addEventListener('click', async () => {
    if (!confirm('根据保留的反馈重建自动学习规则吗？手动规则不会改变。')) return;
    rebuildRecommendationLearningBtn.disabled = true;
    const result = await chrome.runtime.sendMessage({
      action: 'rebuildRecommendationLearning',
      operationId: makeSettingsOperationId('rebuild')
    }).catch(() => null);
    rebuildRecommendationLearningBtn.disabled = false;
    showToast(result?.success ? '学习规则已重建' : '重建失败', result?.success ? 'success' : 'error');
    await loadActiveLearning();
  });
}

function mergeReevaluationTags(existingTags, existingAutoTags, recommendedTag) {
  const tags = [];
  const tagsAuto = [];
  const addUnique = (target, value) => {
    const tag = String(value || '').trim();
    if (!tag || target.some(existing => existing.toLowerCase() === tag.toLowerCase())) return;
    target.push(tag);
  };
  for (const tag of existingTags || []) addUnique(tags, tag);
  for (const tag of existingAutoTags || []) {
    const normalized = String(tag || '').trim();
    if (normalized && tags.some(existing => existing.toLowerCase() === normalized.toLowerCase())) {
      addUnique(tagsAuto, normalized);
    }
  }
  if (recommendedTag) {
    addUnique(tags, recommendedTag);
    addUnique(tagsAuto, recommendedTag);
  }
  return {
    tags,
    tagsAuto: tagsAuto.filter(tag => tags.some(existing => existing.toLowerCase() === tag.toLowerCase())),
  };
}

function getHighConfidenceReevaluationTag(item) {
  const candidate = item?.recommendation?.tags?.[0];
  return candidate?.confidence === 'high' ? String(candidate.tag || '').trim() : '';
}

function getApplicableReevaluationFolder(item) {
  const folder = item?.recommendation?.folders?.[0];
  if (!(folder?.confidence === 'high' && folder?.exists)) return null;
  const id = folder.id || folder.folderId;
  return id ? { ...folder, id } : null;
}

function canApplyReevaluation(item) {
  const folder = getApplicableReevaluationFolder(item);
  const folderChanged = !!folder && folder.id !== item?.parentId;
  const recommendedTag = getHighConfidenceReevaluationTag(item);
  const tagChanged = !!recommendedTag
    && !(item?.tags || []).some(tag => String(tag).toLowerCase() === recommendedTag.toLowerCase());
  return folderChanged || tagChanged;
}

async function applyReevaluationItem(item) {
  if (!canApplyReevaluation(item)) return { success: false, reason: 'recommendation_not_applicable' };
  const recommendation = item.recommendation || {};
  const folder = getApplicableReevaluationFolder(item);
  const folderId = folder?.id || '';
  const recommendedTag = getHighConfidenceReevaluationTag(item);
  const tagChanged = !!recommendedTag
    && !(item.tags || []).some(tag => String(tag).toLowerCase() === recommendedTag.toLowerCase());
  const mergedTags = mergeReevaluationTags(item.tags, item.tagsAuto, tagChanged ? recommendedTag : '');
  const folderChanged = !!folderId && folderId !== item.parentId;
  let moved = false;
  try {
    if (folderChanged) {
      await chrome.bookmarks.move(item.id, { parentId: folderId });
      moved = true;
    }
    if (tagChanged) {
      const updated = await chrome.runtime.sendMessage({
        action: 'updateBookmark',
        id: item.id,
        tags: mergedTags.tags,
        tagsAuto: mergedTags.tagsAuto,
      }).catch(() => null);
      if (!updated?.success) throw new Error('tag_update_failed');
    }
    await chrome.runtime.sendMessage({
      action: 'submitBookmarkRecommendationFeedback',
      operationId: makeSettingsOperationId('reevaluate_apply'),
      recommendationId: recommendation.recommendationId,
      bookmarkId: item.id,
      outcome: 'accepted',
      changedFields: [
        ...(folderChanged ? ['folder'] : []),
        ...(tagChanged ? ['tags'] : []),
      ],
      selection: {
        folderPath: folder?.folderPath || folder?.path || item.folderPath || '',
        tags: mergedTags.tags,
      }
    }).catch(() => null);
    return { success: true };
  } catch (error) {
    if (moved && item.parentId) {
      await chrome.bookmarks.move(item.id, { parentId: item.parentId }).catch(() => null);
    }
    return { success: false, reason: error?.message || 'apply_failed' };
  }
}

async function applySelectedReevaluations(ids, requireConfirmation = true) {
  if (reevaluationApplying) return;
  const selectedItems = ids.map(id => reevaluationItems.get(id)).filter(canApplyReevaluation);
  if (selectedItems.length === 0) return;
  const tagChanges = selectedItems.filter(item => {
    const tag = getHighConfidenceReevaluationTag(item);
    return !!tag && !(item.tags || []).some(existing => String(existing).toLowerCase() === tag.toLowerCase());
  }).length;
  const folderChanges = selectedItems.filter(item => {
    const folder = getApplicableReevaluationFolder(item);
    return !!folder && folder.id !== item.parentId;
  }).length;
  if (requireConfirmation && !confirm(`将应用 ${selectedItems.length} 条高置信建议：移动 ${folderChanges} 条，更新标签 ${tagChanges} 条。是否继续？`)) return;
  reevaluationApplying = true;
  let succeeded = 0;
  const failures = [];
  for (let index = 0; index < selectedItems.length; index++) {
    renderReevaluationResults(reevaluationItems, `正在应用 ${index + 1} / ${selectedItems.length}`);
    const item = selectedItems[index];
    const result = await applyReevaluationItem(item);
    if (result.success) {
      succeeded += 1;
      reevaluationItems.delete(item.id);
      reevaluationSelected.delete(item.id);
    } else {
      failures.push({ id: item.id, reason: result.reason });
    }
  }
  renderReevaluationResults(
    reevaluationItems,
    failures.length > 0 ? `应用完成：成功 ${succeeded}，失败 ${failures.length}` : `已成功应用 ${succeeded} 条建议`,
  );
  reevaluationApplying = false;
  showToast(failures.length > 0 ? `部分应用失败：${failures.length} 条` : `已应用 ${succeeded} 条重新评估结果`, failures.length > 0 ? 'error' : 'success');
}

function renderReevaluationResults(items, progressText = '', evaluating = false) {
  if (!reevaluationResults) return;
  const values = [...items.values()];
  const rows = values.map(item => {
    const recommendation = item.recommendation;
    const folder = recommendation?.folders?.[0];
    const tags = (recommendation?.tags || []).map(tag => tag.tag).join(', ');
    const canApply = canApplyReevaluation(item);
    return `<div class="reevaluation-item" data-id="${escapeHtml(item.id)}">
      ${canApply ? `<label class="reevaluation-select"><input type="checkbox" ${reevaluationSelected.has(item.id) ? 'checked' : ''} aria-label="选择 ${escapeHtml(item.title || item.id)}"></label>` : '<span class="reevaluation-select-spacer"></span>'}
      <span><strong>${escapeHtml(item.title || item.id)}</strong><small>${folder ? `${escapeHtml(folder.folderPath || folder.path)} · ${escapeHtml(folder.confidence)}` : escapeHtml(item.reason || '暂不推荐目录')}${tags ? ` · ${escapeHtml(tags)}` : ''}</small></span>
      ${canApply ? `<button class="btn btn-primary btn-sm reevaluation-apply" ${reevaluationApplying ? 'disabled' : ''}>应用</button>` : ''}
    </div>`;
  }).join('');
  const applicableCount = values.filter(canApplyReevaluation).length;
  const selectedCount = [...reevaluationSelected].filter(id => canApplyReevaluation(items.get(id))).length;
  const batch = applicableCount > 0
    ? `<div class="reevaluation-batch"><span>可应用 ${applicableCount} 条，已选 ${selectedCount} 条</span><button id="applySelectedReevaluationsBtn" class="btn btn-primary btn-sm" type="button" ${selectedCount === 0 || reevaluationApplying ? 'disabled' : ''}>应用已选</button></div>`
    : '';
  const cancel = evaluating ? ' <button id="cancelReevaluationBtn" class="btn btn-secondary btn-sm" type="button">取消</button>' : '';
  reevaluationResults.innerHTML = `<div class="reevaluation-progress">${escapeHtml(progressText)}${cancel}</div>${batch}${rows || '<div class="tagrule-empty">暂无可显示结果</div>'}`;
  reevaluationResults.querySelector('#cancelReevaluationBtn')?.addEventListener('click', () => { reevaluationCancelled = true; });
  reevaluationResults.querySelectorAll('.reevaluation-select input').forEach(checkbox => checkbox.addEventListener('change', () => {
    const id = checkbox.closest('.reevaluation-item')?.dataset.id;
    if (!id) return;
    if (checkbox.checked) reevaluationSelected.add(id);
    else reevaluationSelected.delete(id);
    renderReevaluationResults(reevaluationItems, progressText);
  }));
  reevaluationResults.querySelector('#applySelectedReevaluationsBtn')?.addEventListener('click', () => {
    applySelectedReevaluations([...reevaluationSelected]).catch(() => showToast('批量应用失败', 'error'));
  });
  reevaluationResults.querySelectorAll('.reevaluation-apply').forEach(button => button.addEventListener('click', async () => {
    const row = button.closest('.reevaluation-item');
    const item = reevaluationItems.get(row?.dataset.id);
    const folder = getApplicableReevaluationFolder(item);
    if (!folder && item && canApplyReevaluation(item)) {
      if (!confirm('\u5e94\u7528\u8fd9\u6761\u9ad8\u7f6e\u4fe1\u5efa\u8bae\u5417\uff1f')) return;
      button.disabled = true;
      const result = await applyReevaluationItem(item);
      if (result.success) {
        reevaluationItems.delete(item.id);
        reevaluationSelected.delete(item.id);
        renderReevaluationResults(reevaluationItems, progressText);
        showToast('\u5df2\u5e94\u7528\u91cd\u65b0\u8bc4\u4f30\u7ed3\u679c', 'success');
      } else {
        button.disabled = false;
        showToast('\u5e94\u7528\u91cd\u65b0\u8bc4\u4f30\u7ed3\u679c\u5931\u8d25', 'error');
      }
      return;
    }
    if (!item || !folder || !confirm(`将“${item.title || item.id}”移动到“${folder.folderPath || folder.path}”并应用推荐标签吗？`)) return;
    button.disabled = true;
    const result = await applyReevaluationItem(item);
    if (result.success) {
      reevaluationItems.delete(item.id);
      reevaluationSelected.delete(item.id);
      renderReevaluationResults(reevaluationItems, progressText);
      showToast('已应用重新评估结果', 'success');
    } else {
      button.disabled = false;
      showToast('应用重新评估结果失败', 'error');
    }
  }));
}

if (reevaluateBookmarksBtn) {
  reevaluateBookmarksBtn.addEventListener('click', async () => {
    reevaluateBookmarksBtn.disabled = true;
    reevaluationCancelled = false;
    reevaluationItems = new Map();
    reevaluationSelected = new Set();
    const bookmarkResponse = await chrome.runtime.sendMessage({ action: 'getBookmarks' }).catch(() => null);
    const bookmarks = bookmarkResponse?.bookmarks || [];
    if (reevaluationResults) {
      reevaluationResults.innerHTML = '<div class="reevaluation-progress">准备重新评估… <button id="cancelReevaluationBtn" class="btn btn-secondary btn-sm" type="button">取消</button></div>';
      reevaluationResults.querySelector('#cancelReevaluationBtn')?.addEventListener('click', () => { reevaluationCancelled = true; });
    }
    for (let index = 0; index < bookmarks.length && !reevaluationCancelled; index += 10) {
      const chunk = bookmarks.slice(index, index + 10);
      const result = await chrome.runtime.sendMessage({ action: 'reevaluateBookmarks', ids: chunk.map(item => item.id), allowAI: false }).catch(() => null);
      for (const responseItem of result?.items || []) {
        const bookmark = chunk.find(item => item.id === responseItem.id);
        reevaluationItems.set(responseItem.id, {
          ...responseItem,
          title: bookmark?.title || responseItem.id,
          tags: bookmark?.tags || [],
          tagsAuto: bookmark?.tagsAuto || [],
          parentId: bookmark?.parentId || '',
          folderPath: bookmark?.folderPath || '',
        });
      }
      renderReevaluationResults(reevaluationItems, `已评估 ${Math.min(index + chunk.length, bookmarks.length)} / ${bookmarks.length}`, true);
    }
    renderReevaluationResults(reevaluationItems, reevaluationCancelled ? `已取消，保留 ${reevaluationItems.size} 条结果` : `评估完成，共 ${reevaluationItems.size} 条结果`);
    reevaluateBookmarksBtn.disabled = false;
  });
}

function updateActiveLearningBadge(count) {
  if (!activeLearningBadge) return;
  if (count > 0) {
    activeLearningBadge.textContent = count > 99 ? '99+' : String(count);
    activeLearningBadge.style.display = 'inline-flex';
  } else {
    activeLearningBadge.style.display = 'none';
  }
}

function renderLearningStats(stats, recommendationStats) {
  if (!stats && !recommendationStats) {
    learningStatsDesc.textContent = i18n('learningStatsDesc') || '—';
    return;
  }
  if (recommendationStats) {
    learningStatsDesc.textContent = i18n('recommendationStatsFormat', [
      recommendationStats.total || 0,
      recommendationStats.accepted || 0,
      recommendationStats.modified || 0,
      recommendationStats.rejected || 0,
      recommendationStats.cancelled || 0,
    ]);
    return;
  }
  const accepted = stats.totalAccepted || 0;
  const modified = stats.totalModified || 0;
  const ignored = stats.totalIgnored || 0;
  const total = stats.totalReviewed || 0;
  learningStatsDesc.textContent = i18n('learningStatsFormat')
    ? i18n('learningStatsFormat', [total, accepted, modified, ignored])
    : `已确认 ${total} 条：接受 ${accepted} / 修改 ${modified} / 忽略 ${ignored}`;
}

function renderLearningFeedback(records) {
  if (!learningFeedbackList || !viewLearningRecordsBtn) return;
  const items = Array.isArray(records) ? records : [];
  learningFeedbackList.hidden = !learningFeedbackExpanded;
  viewLearningRecordsBtn.textContent = i18n(learningFeedbackExpanded ? 'hideLearningRecords' : 'viewLearningRecords');
  viewLearningRecordsBtn.setAttribute('aria-expanded', String(learningFeedbackExpanded));
  if (items.length === 0) {
    const hasLegacySummary = Number(recommendationLearningState?.stats?.total || 0) > 0;
    learningFeedbackList.innerHTML = `<div class="tagrule-empty">${escapeHtml(i18n(hasLegacySummary ? 'learningRecordsUnavailable' : 'noLearningRecords'))}</div>`;
    return;
  }
  const outcomeKeys = {
    accepted: 'learningRecordAccepted',
    modified: 'learningRecordModified',
    rejected: 'learningRecordRejected',
    cancelled: 'learningRecordCancelled',
  };
  learningFeedbackList.innerHTML = items.map((item) => {
    const identity = item.domain || String(item.urlFingerprint || '').slice(0, 16) || item.recommendationId || '—';
    const folderPath = item.selection?.folderPath || '';
    const tags = Array.isArray(item.selection?.tags) ? item.selection.tags.join(', ') : '';
    const changedFields = (item.changedFields || []).map(field => field === 'folder'
      ? i18n('learningRecordFolder')
      : (field === 'tags' ? i18n('learningRecordTags') : field)).join(', ');
    const selections = [
      folderPath ? `${i18n('learningRecordFolder')}：${folderPath}` : '',
      tags ? `${i18n('learningRecordTags')}：${tags}` : '',
    ].filter(Boolean).join(' · ');
    const outcome = i18n(outcomeKeys[item.outcome] || 'learningRecordCancelled');
    const undone = item.undone ? ` · ${i18n('learningRecordUndone')}` : '';
    return `<div class="learning-feedback-item">
      <div class="learning-feedback-head"><strong>${escapeHtml(identity)}</strong><time>${escapeHtml(new Date(Number(item.createdAt) || 0).toLocaleString())}</time></div>
      <div class="learning-feedback-detail"><span>${escapeHtml(outcome + undone)}</span>${changedFields ? `<span>${escapeHtml(i18n('learningRecordChanged'))}：${escapeHtml(changedFields)}</span>` : ''}</div>
      ${selections ? `<div class="learning-feedback-selection">${escapeHtml(selections)}</div>` : ''}
    </div>`;
  }).join('');
}

function renderPendingReviews(queue) {
  if (!queue || queue.length === 0) {
    pendingReviewsList.innerHTML = `<div class="tagrule-empty">${i18n('noPendingReviews') || '暂无待确认的书签'}</div>`;
    return;
  }

  pendingReviewsList.innerHTML = queue.map(item => {
    if (item.type === 'move_observation') {
      return `<div class="review-item review-item--observation" data-id="${escapeHtml(item.id)}">
        <div class="review-info">
          <div class="review-title">${escapeHtml(item.title || item.bookmarkId)}</div>
          <div class="review-meta"><span class="review-reason">移动待复核</span><span>来源待确认</span></div>
        </div>
        <div class="review-folder-change"><span>${escapeHtml(item.fromFolderPath || '未分类')}</span><span aria-hidden="true">→</span><strong>${escapeHtml(item.toFolderPath || '未知目录')}</strong></div>
        <div class="review-actions">
          <button class="btn btn-primary btn-sm recommendation-review-action" data-decision="accept">确认为手动移动</button>
          <button class="btn btn-secondary btn-sm recommendation-review-action" data-decision="ignore">忽略观察</button>
        </div>
      </div>`;
    }
    if (item.type === 'bookmark_recommendation') {
      const recommendation = item.recommendation;
      const folders = (recommendation?.folders || []).slice(0, 3);
      const tags = (recommendation?.tags || []).slice(0, 3);
      const canApply = !!(folders[0]?.existing && folders[0]?.id) || !!tags[0]?.tag;
      const folderCandidates = folders.map((candidate, index) => `<span class="review-candidate"><b>${index + 1}</b><span class="review-candidate-label">${escapeHtml(candidate.folderPath || '未知目录')}</span><small>${recommendationConfidenceText(candidate.confidence)}</small></span>`).join('');
      const tagCandidates = tags.map((candidate, index) => `<span class="review-candidate"><b>${index + 1}</b><span class="review-candidate-label">#${escapeHtml(candidate.tag)}</span><small>${recommendationConfidenceText(candidate.confidence)}</small></span>`).join('');
      return `<div class="review-item review-item--recommendation" data-id="${escapeHtml(item.id)}">
        <div class="review-info">
          <div class="review-title">${escapeHtml(item.title || item.bookmarkId)}</div>
          <div class="review-meta"><span class="review-reason">智能分类建议</span><span class="review-confidence">${recommendationConfidenceText(item.confidence)}</span>${item.aiTriggered ? '<span class="review-source review-source--ai">AI 辅助</span>' : ''}</div>
        </div>
        ${folderCandidates ? `<div class="review-candidates" aria-label="目录候选">${folderCandidates}</div>` : ''}
        ${tagCandidates ? `<div class="review-candidates" aria-label="标签候选">${tagCandidates}</div>` : ''}
        <div class="review-actions">
          <button class="btn btn-primary btn-sm recommendation-review-action" data-decision="accept" ${canApply ? '' : 'disabled'}>采用首选</button>
          <button class="btn btn-danger btn-sm recommendation-review-action" data-decision="reject">不采用建议</button>
          ${recommendation ? '' : '<button class="btn btn-secondary btn-sm recommendation-review-action" data-decision="ignore">移除失效项</button>'}
        </div>
      </div>`;
    }
    const isAI = item.source === 'ai';
    const aiBadge = isAI
      ? `<span class="review-source review-source--ai">${i18n('aiAssistedTag') || 'AI 辅助分类'}</span>`
      : '';
    const reasonHtml = !isAI
      ? `<span class="review-reason">${escapeHtml(getReasonText(item.reason))}</span>`
      : '';
    return `
    <div class="review-item ${isAI ? 'review-item--ai' : ''}" data-id="${escapeHtml(item.id)}">
      <div class="review-info">
        <div class="review-title" title="${escapeHtml(item.url)}">${escapeHtml(item.title || item.url)}</div>
        <div class="review-meta">
          ${reasonHtml}
          ${aiBadge}
          <span class="review-confidence">置信度 ${(item.confidence * 100).toFixed(0)}%</span>
          <span class="review-score">权重分 ${(item.score ?? ((item.confidence || 0) * 100)).toFixed(2)}</span>
        </div>
        ${item.excerpt ? `<div class="review-excerpt">${escapeHtml(item.excerpt.slice(0, 120))}</div>` : ''}
      </div>
      <div class="review-suggested">
        <span class="tagrule-item-tag">${escapeHtml((item.suggestedTags || []).join(', ') || i18n('noTag') || '无标签')}</span>
      </div>
      <div class="review-actions">
        <input type="text" class="review-tag-input" placeholder="${i18n('tagPlaceholder') || '标签'}" value="${escapeHtml((item.suggestedTags || [])[0] || '')}">
        <button class="btn btn-primary btn-sm review-confirm" data-id="${escapeHtml(item.id)}">
          <span data-i18n="confirm">确认</span>
        </button>
        <button class="btn btn-secondary btn-sm review-modify" data-id="${escapeHtml(item.id)}">
          <span data-i18n="modify">修改</span>
        </button>
        <button class="btn btn-danger btn-sm review-ignore" data-id="${escapeHtml(item.id)}">
          <span data-i18n="ignore">忽略</span>
        </button>
      </div>
    </div>
  `}).join('');

  pendingReviewsList.querySelectorAll('.review-confirm').forEach(btn => {
    btn.addEventListener('click', () => onConfirmReview(btn.dataset.id, false));
  });
  pendingReviewsList.querySelectorAll('.review-modify').forEach(btn => {
    btn.addEventListener('click', () => onConfirmReview(btn.dataset.id, true));
  });
  pendingReviewsList.querySelectorAll('.review-ignore').forEach(btn => {
    btn.addEventListener('click', () => onIgnoreReview(btn.dataset.id));
  });
  pendingReviewsList.querySelectorAll('.recommendation-review-action').forEach(button => {
    button.addEventListener('click', () => onResolveRecommendationReview(
      button.closest('.review-item')?.dataset.id,
      button.dataset.decision,
    ));
  });
}

function recommendationConfidenceText(value) {
  return ({ high: '高置信', medium: '中置信', low: '低置信', none: '暂不推荐' })[value] || '暂不推荐';
}

async function onResolveRecommendationReview(reviewId, decision) {
  if (!reviewId || !decision) return;
  if (decision === 'accept' && !confirm('确认采用此项并用于后续推荐学习吗？')) return;
  const result = await chrome.runtime.sendMessage({
    action: 'resolveRecommendationReview',
    operationId: makeSettingsOperationId('resolve_review'),
    reviewId,
    decision,
  }).catch(() => null);
  showToast(result?.success ? '待复核项已处理' : `处理失败：${result?.error || 'unknown'}`, result?.success ? 'success' : 'error');
  await loadActiveLearning();
}

function getReasonText(reason) {
  const map = {
    empty: i18n('reasonEmpty') || '无标签',
    low_confidence: i18n('reasonLowConfidence') || '置信度低',
    ambiguous: i18n('reasonAmbiguous') || '标签相近',
    weak_signal: i18n('reasonWeakSignal') || '依据不足',
    new_domain: i18n('reasonNewDomain') || '新域名',
    title_noise: i18n('reasonTitleNoise') || '标题过短',
    signal_conflict: i18n('reasonSignalConflict') || '信号冲突',
    content_disagree: i18n('reasonContentDisagree') || '正文判断不一致',
    ai_assisted: i18n('reasonAIAssisted') || 'AI 辅助分类'
  };
  return map[reason] || reason;
}

async function onConfirmReview(id, isModify) {
  try {
    const queueRes = await chrome.runtime.sendMessage({ action: 'getReviewQueue' });
    if (!queueRes || !queueRes.success) return;
    const item = queueRes.queue.find(q => q.id === id);
    if (!item) return;

    const input = pendingReviewsList.querySelector(`.review-item[data-id="${CSS.escape(id)}"] .review-tag-input`);
    const tag = input ? input.value.trim() : ((item.suggestedTags || [])[0] || '');
    if (!tag) {
      showToast(i18n('fillAllFields') || '请填写标签', 'error');
      return;
    }

    await chrome.runtime.sendMessage({
      action: 'confirmTagReview',
      operationId: makeSettingsOperationId('legacy_review'),
      queueItem: item,
      confirmedTags: [tag],
      reviewAction: isModify ? 'modified' : 'accepted'
    });

    await loadActiveLearning();
    showToast(i18n('settingsSaved'), 'success');
  } catch (e) {
    // 静默处理
  }
}

async function onIgnoreReview(id) {
  try {
    const queueRes = await chrome.runtime.sendMessage({ action: 'getReviewQueue' });
    if (!queueRes || !queueRes.success) return;
    const item = queueRes.queue.find(q => q.id === id);
    if (!item) return;

    await chrome.runtime.sendMessage({
      action: 'ignoreTagReview',
      operationId: makeSettingsOperationId('legacy_ignore'),
      queueItem: item
    });
    await loadActiveLearning();
    showToast(i18n('settingsSaved'), 'success');
  } catch (e) {
    // 静默处理
  }
}

viewLearningRecordsBtn?.addEventListener('click', () => {
  learningFeedbackExpanded = !learningFeedbackExpanded;
  renderLearningFeedback(recommendationLearningState?.recentFeedback || []);
});

clearLearningRecordsBtn?.addEventListener('click', async () => {
  if (!confirm(i18n('clearLearningRecordsConfirm'))) return;
  clearLearningRecordsBtn.disabled = true;
  const result = await chrome.runtime.sendMessage({
    action: 'clearRecommendationLearning',
    operationId: makeSettingsOperationId('clear_learning'),
  }).catch(() => null);
  clearLearningRecordsBtn.disabled = false;
  if (!result?.success) {
    showToast(i18n('saveFailed'), 'error');
    return;
  }
  await loadActiveLearning();
  showToast(i18n('settingsSaved'), 'success');
});

// 清空待复核项，不影响已经完成的学习反馈和统计。
clearReviewQueueBtn?.addEventListener('click', async () => {
  if (!confirm(i18n('clearQueueConfirm'))) return;
  const result = await chrome.runtime.sendMessage({ action: 'clearReviewQueue', operationId: makeSettingsOperationId('clear_reviews') }).catch(() => null);
  if (!result?.success) {
    showToast(i18n('saveFailed'), 'error');
    return;
  }
  await loadActiveLearning();
  showToast(i18n('settingsSaved'), 'success');
});

// ===== 统计面板 =====
let _cachedBookmarks = null;
let _cachedStats = null;
let _currentTrendMode = 'daily';
let _currentHealthScore = null;
let _currentDateRange = { startTs: null, endTs: null };

async function loadStatsPanel() {
  try {
    if (!_cachedBookmarks) {
      const res = await chrome.runtime.sendMessage({ action: 'exportData' });
      _cachedBookmarks = (res && res.bookmarks) || [];
    }
    const bookmarks = _cachedBookmarks;
    const stats = BookmarkStats.computeBookmarkStats(bookmarks, _currentDateRange);
    _cachedStats = stats;
    _currentHealthScore = stats.health;

    renderStats(stats);
    renderCharts(stats);
    await loadAccuracyTrend();
    await loadHealthFavorites();
  } catch (err) {
    console.error('loadStatsPanel error:', err);
    showToast(i18n('loadFailed') || '加载失败', 'error');
  }
}

function renderStats(stats) {
  const ov = stats.overview;
  statTotal.textContent = ov.total;
  statTags.textContent = ov.totalTags;
  statDomains.textContent = ov.uniqueDomains;
  statFolders.textContent = ov.folders;

  renderHealthScore(stats.health);
}

function renderHealthScore(health) {
  if (!healthScoreValue || !healthScoreDetails) return;

  if (health.level === 'empty') {
    healthScoreValue.textContent = '—';
    healthScoreValue.className = 'stats-health-score';
    healthScoreDetails.innerHTML = '';
    healthScoreDesc.textContent = i18n('statsHealthScoreEmpty') || '添加一些书签后可查看健康度评分';
    return;
  }

  healthScoreValue.textContent = health.score;
  healthScoreValue.className = `stats-health-score level-${health.level}`;

  healthScoreDetails.innerHTML = health.details.map(d => `
    <div class="stats-health-item">
      <div class="stats-health-item-label">${d.label}</div>
      <div class="stats-health-item-bar">
        <div class="stats-health-item-fill" style="width: ${d.score}%"></div>
      </div>
      <div class="stats-health-item-value">${d.score}%</div>
    </div>
  `).join('');

  healthScoreDesc.textContent = i18n('statsHealthScoreDesc') || 'Overall quality of your bookmark collection';
}

function renderCharts(stats) {
  if (typeof SimpleCharts === 'undefined') return;

  // 时间趋势
  const trendData = stats.trend[_currentTrendMode].map(d => ({ label: d.date, value: d.count }));
  SimpleCharts.lineChart(SimpleCharts.init(trendChart), trendData);

  // Top 标签
  SimpleCharts.barChart(SimpleCharts.init(tagsChart), stats.tagDistribution.map(d => ({
    label: d.tag, value: d.count
  })));

  // Top 域名
  SimpleCharts.pieChart(SimpleCharts.init(domainsChart), stats.domainDistribution.map(d => ({
    label: d.domain, value: d.count
  })), { donut: true });

  // 时段分布
  SimpleCharts.barChart(SimpleCharts.init(hoursChart), stats.hourlyDistribution.map(d => ({
    label: `${d.hour}:00`, value: d.count
  })));

  // 文件夹分布（横向）
  SimpleCharts.barChart(SimpleCharts.init(foldersChart), stats.folderDistribution.map(d => ({
    label: d.folder, value: d.count
  })), { horizontal: true });
}

async function loadAccuracyTrend() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getLearningTrend', days: 30 });
    const trend = (res && res.success) ? res.trend || [] : [];

    if (trend.length === 0) {
      accuracyTrendChart.innerHTML = '';
      accuracyTrendEmpty.style.display = 'block';
      return;
    }
    accuracyTrendEmpty.style.display = 'none';

    const data = trend.map(d => ({
      label: d.date.slice(5),
      value: d.accuracy
    }));
    SimpleCharts.lineChart(SimpleCharts.init(accuracyTrendChart), data, {
      yLabelFormatter: v => v + '%'
    });
  } catch (err) {
    console.error('loadAccuracyTrend error:', err);
    accuracyTrendChart.innerHTML = '';
    accuracyTrendEmpty.style.display = 'block';
  }
}

async function loadHealthFavorites() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getHealthScoreFavorites' });
    const favorites = (res && res.success) ? res.favorites || [] : [];
    renderHealthFavorites(favorites);
  } catch (err) {
    console.error('loadHealthFavorites error:', err);
  }
}

function renderHealthFavorites(favorites) {
  if (!healthFavoritesSection || !healthFavoritesList) return;
  if (!favorites || favorites.length === 0) {
    healthFavoritesSection.style.display = 'none';
    return;
  }
  healthFavoritesSection.style.display = 'block';

  healthFavoritesList.innerHTML = favorites.map(f => {
    const date = new Date(f.createdAt).toLocaleString();
    const rangeText = f.range && (f.range.start || f.range.end)
      ? `${f.range.start || '...'} ~ ${f.range.end || '...'}`
      : i18n('statsAllTime') || '全部时间';
    return `
      <div class="stats-favorite-item" data-id="${f.id}">
        <div class="stats-favorite-info">
          <div class="stats-favorite-score">${f.score} <span style="font-size:12px;font-weight:400;color:var(--text-secondary)">${rangeText}</span></div>
          <div class="stats-favorite-meta">${date}${f.note ? ' · ' + escapeHtml(f.note) : ''}</div>
        </div>
        <div class="stats-favorite-actions">
          <button class="btn btn-danger btn-sm delete-favorite-btn" data-id="${f.id}">${i18n('delete') || 'Delete'}</button>
        </div>
      </div>
    `;
  }).join('');

  healthFavoritesList.querySelectorAll('.delete-favorite-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      await chrome.runtime.sendMessage({ action: 'deleteHealthScoreFavorite', id });
      await loadHealthFavorites();
      showToast(i18n('deleted') || '已删除', 'success');
    });
  });
}

async function handleFavoriteHealthScore() {
  if (!_currentHealthScore || _currentHealthScore.level === 'empty') {
    showToast(i18n('statsNoScoreToFavorite') || '暂无可收藏的评分', 'error');
    return;
  }

  const record = {
    score: _currentHealthScore.score,
    level: _currentHealthScore.level,
    details: _currentHealthScore.details,
    range: {
      start: statsStartDate.value || null,
      end: statsEndDate.value || null
    }
  };

  const res = await chrome.runtime.sendMessage({ action: 'saveHealthScoreFavorite', record });
  if (res && res.success) {
    await loadHealthFavorites();
    showToast(i18n('settingsSaved') || '已保存', 'success');
  } else if (res && res.error === 'already_exists') {
    showToast(i18n('statsFavoriteExists') || '今天已收藏过该评分', 'info');
  } else {
    showToast(i18n('saveFailed') || '保存失败', 'error');
  }
}

function handleExportCsv() {
  if (!_cachedStats) {
    showToast(i18n('statsNoData') || '暂无可导出的数据', 'error');
    return;
  }
  const csv = BookmarkStats.statsToCsv(_cachedStats);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadFile(`ai-bookmark-os-stats-${stamp}.csv`, '\uFEFF' + csv, 'text/csv;charset=utf-8;');
  showToast(i18n('settingsSaved') || '已导出', 'success');
}

function handleExportPdf() {
  if (!_cachedStats) {
    showToast(i18n('statsNoData') || '暂无可导出的数据', 'error');
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const isCN = (typeof _currentLang !== 'undefined' && _currentLang === 'zh_CN');
  const s = _cachedStats;

  const rows = [
    ['Total Bookmarks', s.overview.total],
    ['Total Tags', s.overview.totalTags],
    ['Unique Domains', s.overview.uniqueDomains],
    ['Folders', s.overview.folders],
    ['Health Score', s.health.score]
  ];

  const title = isCN ? 'AI Bookmark OS 书签统计报告' : 'AI Bookmark OS Bookmark Statistics';
  const html = `<!DOCTYPE html>
<html lang="${isCN ? 'zh-CN' : 'en'}">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #202124; }
h1 { font-size: 22px; margin-bottom: 8px; }
.meta { color: #5f6368; font-size: 12px; margin-bottom: 24px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e8eaed; }
th { background: #f8f9fa; font-weight: 500; }
.section-title { font-size: 14px; font-weight: 600; margin: 24px 0 12px; }
</style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">${stamp}</div>
  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    ${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}
  </table>
  <div class="section-title">Top Tags</div>
  <table>
    <tr><th>Tag</th><th>Count</th></tr>
    ${s.tagDistribution.map(d => `<tr><td>${escapeHtml(d.tag)}</td><td>${d.count}</td></tr>`).join('')}
  </table>
  <div class="section-title">Top Domains</div>
  <table>
    <tr><th>Domain</th><th>Count</th></tr>
    ${s.domainDistribution.map(d => `<tr><td>${escapeHtml(d.domain)}</td><td>${d.count}</td></tr>`).join('')}
  </table>
  <div class="section-title">Daily Trend</div>
  <table>
    <tr><th>Date</th><th>Count</th></tr>
    ${s.trend.daily.map(d => `<tr><td>${d.date}</td><td>${d.count}</td></tr>`).join('')}
  </table>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    showToast(i18n('statsPopupBlocked') || '弹窗被拦截', 'error');
    return;
  }
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

function applyDateRange() {
  const start = statsStartDate.value ? new Date(statsStartDate.value).getTime() : null;
  let end = statsEndDate.value ? new Date(statsEndDate.value).getTime() : null;
  if (end) end = end + 24 * 60 * 60 * 1000 - 1;
  _currentDateRange = { startTs: start, endTs: end };
  _cachedStats = null;
  loadStatsPanel();
}

function resetDateRange() {
  statsStartDate.value = '';
  statsEndDate.value = '';
  _currentDateRange = { startTs: null, endTs: null };
  _cachedStats = null;
  loadStatsPanel();
}

// 统计面板事件绑定
if (statsApplyRangeBtn) statsApplyRangeBtn.addEventListener('click', applyDateRange);
if (statsResetRangeBtn) statsResetRangeBtn.addEventListener('click', resetDateRange);
if (favoriteHealthScoreBtn) favoriteHealthScoreBtn.addEventListener('click', handleFavoriteHealthScore);
if (exportStatsCsvBtn) exportStatsCsvBtn.addEventListener('click', handleExportCsv);
if (exportStatsPdfBtn) exportStatsPdfBtn.addEventListener('click', handleExportPdf);

if (trendTabs) {
  trendTabs.addEventListener('click', (e) => {
    if (!e.target.classList.contains('tab-btn')) return;
    trendTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    _currentTrendMode = e.target.dataset.trend;
    if (_cachedStats) renderCharts(_cachedStats);
  });
}

// 监听存储变化，清除统计缓存
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.bookmark_timeline_data || changes.tag_learning_stats || changes.health_score_favorites) {
      _cachedBookmarks = null;
      _cachedStats = null;
      const panel = document.getElementById('panel-stats');
      if (panel && panel.classList.contains('active')) {
        loadStatsPanel();
      }
    }
  }
});

// 监听队列变化广播，刷新徽章和列表
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'reviewQueueChanged'
    || message.action === 'recommendationReviewQueueChanged'
    || message.action === 'recommendationLearningChanged') {
    loadActiveLearning();
  }
});
