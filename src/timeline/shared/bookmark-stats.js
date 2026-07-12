// ===== 书签收藏统计计算模块 =====
// 纯函数：输入书签数组，输出各类统计指标
// 不依赖 DOM，可在 Service Worker / 设置页 / 测试脚本中复用

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeek(ts) {
  const d = new Date(ts);
  const day = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day + 1);
  return d.getTime();
}

function startOfMonth(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

function formatDateISO(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMonth(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatWeekRange(ts) {
  const start = new Date(ts);
  const end = new Date(ts + 6 * 24 * 60 * 60 * 1000);
  const sameYear = start.getFullYear() === end.getFullYear();
  const fmt = (d, showYear) => {
    const year = showYear ? `${d.getFullYear()}/` : '';
    return `${year}${d.getMonth() + 1}/${d.getDate()}`;
  };
  return `${fmt(start, true)}-${fmt(end, !sameYear)}`;
}

/**
 * 过滤书签时间范围
 * @param {Array} bookmarks
 * @param {number|null} startTs 起始时间戳（包含）
 * @param {number|null} endTs 结束时间戳（包含，默认当天结束）
 */
function filterByDateRange(bookmarks, startTs = null, endTs = null) {
  if (!startTs && !endTs) return bookmarks;
  const end = endTs ? startOfDay(endTs) + 24 * 60 * 60 * 1000 - 1 : Infinity;
  return bookmarks.filter(b => {
    const t = b.dateAdded || 0;
    if (startTs && t < startTs) return false;
    if (endTs && t > end) return false;
    return true;
  });
}

function topN(items, n = 10) {
  return items
    .filter(i => i.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/**
 * 计算核心统计指标
 */
function computeBookmarkStats(bookmarks, options = {}) {
  const { startTs = null, endTs = null } = options;
  const list = filterByDateRange(bookmarks, startTs, endTs);

  // ===== 概览 =====
  const total = list.length;
  const domains = new Set();
  const folders = new Set();
  const tagSet = new Set();
  const tagCounts = new Map();
  const domainCounts = new Map();
  const folderCounts = new Map();
  const hourlyCounts = Array(24).fill(0);

  let earliest = Infinity;
  let latest = 0;
  let totalClicks = 0;

  // 重复 URL 检测
  const urlMap = new Map();
  let duplicateCount = 0;
  let taggedCount = 0;
  let folderedCount = 0;

  for (const b of list) {
    const t = b.dateAdded || 0;
    if (t < earliest) earliest = t;
    if (t > latest) latest = t;

    const domain = b.domain || extractDomain(b.url);
    if (domain) domains.add(domain);
    if (b.folderPath || b.folderName) folders.add(b.folderPath || b.folderName);

    // 标签统计
    const tags = Array.isArray(b.tags) ? b.tags : [];
    if (tags.length > 0) taggedCount += 1;
    for (const tag of tags) {
      tagSet.add(tag);
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }

    // 域名统计
    if (domain) {
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    }

    // 文件夹统计
    const folder = b.folderPath || b.folderName || (typeof i18n === 'function' ? i18n('rootFolder') : null) || 'Root';
    folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);
    if (b.folderPath || b.folderName) folderedCount += 1;

    // 时段统计
    if (t) {
      const h = new Date(t).getHours();
      hourlyCounts[h] += 1;
    }

    // 点击数
    totalClicks += b.clickCount || 0;

    // 重复检测
    const key = (b.url || '').toLowerCase();
    if (key) {
      if (urlMap.has(key)) {
        duplicateCount += 1;
      } else {
        urlMap.set(key, true);
      }
    }
  }

  // ===== 时间趋势 =====
  const dailyMap = new Map();
  const weeklyMap = new Map();
  const monthlyMap = new Map();

  for (const b of list) {
    const t = b.dateAdded || 0;
    if (!t) continue;
    const day = startOfDay(t);
    const week = startOfWeek(t);
    const month = startOfMonth(t);
    dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
    weeklyMap.set(week, (weeklyMap.get(week) || 0) + 1);
    monthlyMap.set(month, (monthlyMap.get(month) || 0) + 1);
  }

  const toSortedArray = (map, formatter) =>
    [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([ts, count]) => ({ date: formatter(ts), ts, count }));

  // ===== 热门书签 =====
  const topClicked = [...list]
    .filter(b => (b.clickCount || 0) > 0)
    .sort((a, b) => (b.clickCount || 0) - (a.clickCount || 0))
    .slice(0, 10);

  const recentlyAdded = [...list]
    .filter(b => b.dateAdded)
    .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0))
    .slice(0, 10);

  // ===== 健康度评分 =====
  const health = computeHealthScore({
    total,
    taggedCount,
    folderedCount,
    duplicateCount,
    totalClicks,
    earliest,
    latest
  });

  return {
    overview: {
      total,
      totalTags: tagSet.size,
      uniqueDomains: domains.size,
      folders: folders.size,
      earliest: earliest === Infinity ? null : earliest,
      latest: latest || null,
      totalClicks,
      duplicateCount
    },
    coverage: {
      taggedRate: total ? taggedCount / total : 0,
      folderedRate: total ? folderedCount / total : 0,
      duplicateRate: total ? duplicateCount / total : 0
    },
    trend: {
      daily: toSortedArray(dailyMap, formatDateISO),
      weekly: toSortedArray(weeklyMap, formatWeekRange),
      monthly: toSortedArray(monthlyMap, formatMonth)
    },
    tagDistribution: topN([...tagCounts.entries()].map(([tag, count]) => ({ tag, count })), 15),
    domainDistribution: topN([...domainCounts.entries()].map(([domain, count]) => ({ domain, count })), 10),
    folderDistribution: topN([...folderCounts.entries()].map(([folder, count]) => ({ folder, count })), 15),
    hourlyDistribution: hourlyCounts.map((count, hour) => ({ hour, count })),
    topClicked,
    recentlyAdded,
    health
  };
}

/**
 * 健康度评分算法
 * 维度：标签覆盖率、目录覆盖率、重复率、活跃度、时效性
 * 返回 0-100 的分数及明细
 */
function computeHealthScore(metrics) {
  const {
    total,
    taggedCount,
    folderedCount,
    duplicateCount,
    totalClicks,
    earliest,
    latest
  } = metrics;

  if (total === 0) {
    return { score: 0, level: 'empty', details: [] };
  }

  const taggedRate = taggedCount / total;
  const folderedRate = folderedCount / total;
  const duplicateRate = duplicateCount / total;

  // 活跃度：近 30 天平均每天点击数（简单模型）
  const daysSinceFirst = Math.max(1, Math.round((Date.now() - (earliest || Date.now())) / 86400000));
  const avgClicksPerDay = totalClicks / daysSinceFirst;
  const activityScore = Math.min(1, avgClicksPerDay / 5); // 每天 5 次点击为满分

  // 时效性：近 30 天是否有新增
  const daysSinceLast = Math.round((Date.now() - (latest || Date.now())) / 86400000);
  const recencyScore = daysSinceLast <= 7 ? 1 : (daysSinceLast <= 30 ? 0.6 : 0.2);

  // 权重
  const weights = {
    tagged: 0.25,
    foldered: 0.20,
    unique: 0.20,
    active: 0.15,
    recent: 0.20
  };

  const details = [
    { name: 'tagCoverage', label: '标签覆盖', score: Math.round(taggedRate * 100), weight: weights.tagged, weighted: taggedRate * weights.tagged },
    { name: 'folderCoverage', label: '目录覆盖', score: Math.round(folderedRate * 100), weight: weights.foldered, weighted: folderedRate * weights.foldered },
    { name: 'uniqueness', label: '去重健康', score: Math.round((1 - duplicateRate) * 100), weight: weights.unique, weighted: (1 - duplicateRate) * weights.unique },
    { name: 'activity', label: '使用活跃', score: Math.round(activityScore * 100), weight: weights.active, weighted: activityScore * weights.active },
    { name: 'recency', label: '更新时效', score: Math.round(recencyScore * 100), weight: weights.recent, weighted: recencyScore * weights.recent }
  ];

  const rawScore = details.reduce((sum, d) => sum + d.weighted, 0);
  const score = Math.round(rawScore * 100);

  let level = 'good';
  if (score < 40) level = 'poor';
  else if (score < 70) level = 'fair';

  return { score, level, details };
}

/**
 * 计算自动标签准确率趋势
 * @param {Array} history - [{ date: 'YYYY-MM-DD', accepted, modified, ignored }]
 */
function computeAccuracyTrend(history = []) {
  if (history.length === 0) return [];

  // 按日期聚合
  const map = new Map();
  for (const h of history) {
    const key = h.date || formatDateISO(h.ts || Date.now());
    if (!map.has(key)) {
      map.set(key, { date: key, accepted: 0, modified: 0, ignored: 0 });
    }
    const entry = map.get(key);
    entry.accepted += h.accepted || 0;
    entry.modified += h.modified || 0;
    entry.ignored += h.ignored || 0;
  }

  const sorted = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map(item => {
    const total = item.accepted + item.modified + item.ignored;
    const accuracy = total > 0 ? item.accepted / total : 0;
    return {
      date: item.date,
      total,
      accepted: item.accepted,
      accuracy: Math.round(accuracy * 1000) / 10 // 保留一位小数
    };
  });
}

/**
 * 将统计结果导出为 CSV
 */
function statsToCsv(stats) {
  const lines = [];
  lines.push(['Metric', 'Value'].join(','));
  lines.push(['Total Bookmarks', stats.overview.total].join(','));
  lines.push(['Total Tags', stats.overview.totalTags].join(','));
  lines.push(['Unique Domains', stats.overview.uniqueDomains].join(','));
  lines.push(['Folders', stats.overview.folders].join(','));
  lines.push(['Health Score', stats.health.score].join(','));
  lines.push([]);

  lines.push(['Tag', 'Count'].join(','));
  for (const item of stats.tagDistribution) {
    lines.push([`"${item.tag}"`, item.count].join(','));
  }
  lines.push([]);

  lines.push(['Domain', 'Count'].join(','));
  for (const item of stats.domainDistribution) {
    lines.push([`"${item.domain}"`, item.count].join(','));
  }
  lines.push([]);

  lines.push(['Date', 'Count'].join(','));
  for (const item of stats.trend.daily) {
    lines.push([item.date, item.count].join(','));
  }

  return lines.join('\n');
}

// 兼容 Service Worker / 普通脚本
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    computeBookmarkStats,
    computeHealthScore,
    computeAccuracyTrend,
    statsToCsv,
    filterByDateRange,
    extractDomain
  };
}

if (typeof self !== 'undefined') {
  self.BookmarkStats = {
    computeBookmarkStats,
    computeHealthScore,
    computeAccuracyTrend,
    statsToCsv,
    filterByDateRange,
    extractDomain
  };
}
