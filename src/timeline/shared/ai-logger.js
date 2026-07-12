// ===== AI 辅助分类日志 =====
// 轻量日志记录，用于排查 AI 分类触发、成功、失败、回填等问题

const AI_LOGS_KEY = 'ai_classifier_logs';
const AI_MAX_LOGS = 500;

function _getDomainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url || '';
  }
}

async function getAILogs(limit = 100) {
  try {
    const data = await chrome.storage.local.get(AI_LOGS_KEY);
    const logs = data[AI_LOGS_KEY] || [];
    return logs.slice(-limit).reverse();
  } catch (e) {
    return [];
  }
}

async function logAIEvent(event) {
  try {
    if (!event || !event.type) return null;
    const entry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      type: event.type || 'unknown',
      provider: event.provider || '',
      model: event.model || '',
      domain: event.domain || (event.url ? _getDomainFromUrl(event.url) : ''),
      duration: typeof event.duration === 'number' ? event.duration : undefined,
      success: event.success,
      error: event.error,
      details: event.details || {}
    };

    const data = await chrome.storage.local.get(AI_LOGS_KEY);
    const logs = data[AI_LOGS_KEY] || [];
    logs.push(entry);
    if (logs.length > AI_MAX_LOGS) {
      logs.splice(0, logs.length - AI_MAX_LOGS);
    }
    await chrome.storage.local.set({ [AI_LOGS_KEY]: logs });
    notifyAILogUpdate();
    return entry;
  } catch (e) {
    console.warn('AI log failed:', e);
    return null;
  }
}

async function notifyAILogUpdate() {
  try {
    await chrome.runtime.sendMessage({ action: 'aiLogUpdated' }).catch(() => {});
  } catch (e) {
    // ignore
  }
}

async function clearAILogs() {
  try {
    await chrome.storage.local.remove(AI_LOGS_KEY);
    return true;
  } catch (e) {
    return false;
  }
}

async function getAILogStats() {
  try {
    const data = await chrome.storage.local.get(AI_LOGS_KEY);
    const logs = data[AI_LOGS_KEY] || [];
    const total = logs.length;
    const triggered = logs.filter(l => l.type === 'trigger').length;
    const success = logs.filter(l => l.type === 'classify_success').length;
    const fail = logs.filter(l => l.type === 'classify_fail').length;
    const cacheHit = logs.filter(l => l.type === 'cache_hit').length;
    const backfillSuccess = logs.filter(l => l.type === 'backfill_success').length;
    const backfillFail = logs.filter(l => l.type === 'backfill_fail').length;
    const latencies = logs
      .filter(l => typeof l.duration === 'number' && l.duration > 0)
      .map(l => l.duration);
    const avgDuration = latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;
    const cacheHitRate = cacheHit + triggered > 0
      ? (cacheHit / (cacheHit + triggered))
      : 0;
    return { total, triggered, success, fail, cacheHit, cacheHitRate, backfillSuccess, backfillFail, avgDuration };
  } catch (e) {
    return { total: 0, triggered: 0, success: 0, fail: 0, cacheHit: 0, cacheHitRate: 0, backfillSuccess: 0, backfillFail: 0, avgDuration: 0 };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getAILogs, logAIEvent, clearAILogs, getAILogStats };
}
