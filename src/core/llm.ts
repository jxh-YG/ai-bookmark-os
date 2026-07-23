// 多供应商 LLM 客户端：OpenAI / Anthropic / Gemini 协议，限流、重试、JSON 解析
import { resolveProvider, resolveRequestUrl, type Settings } from '../types';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onRetry?: (info: { attempt: number; maxRetries: number; delayMs: number; reason: string }) => void;
}

const DEFAULT_MAX_RETRIES = 5;
const BASE_DELAY_MS = 1500;
const MAX_RETRY_DELAY_MS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_SECONDS = 90;

function retryDelayMs(attempt: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
}

export function getAiRetryCount(settings: Settings): number {
  const value = Number(settings.aiRetryCount ?? DEFAULT_MAX_RETRIES);
  if (!Number.isFinite(value)) return DEFAULT_MAX_RETRIES;
  return Math.min(20, Math.max(0, Math.round(value)));
}

export function getAiRequestTimeoutMs(settings: Settings): number {
  const value = Number(settings.aiRequestTimeoutSeconds ?? DEFAULT_REQUEST_TIMEOUT_SECONDS);
  const seconds = Number.isFinite(value) ? Math.round(value) : DEFAULT_REQUEST_TIMEOUT_SECONDS;
  return Math.min(600, Math.max(5, seconds)) * 1000;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('已取消', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('已取消', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * 优先把网络 I/O 代理到 Service Worker 执行：SW 具备 host 权限，不会触发扩展页面
 * 发起跨域请求时的 CORS 预检（OPTIONS 往返），从而消除"配置页比原生工具慢"的主因。
 * 返回 null 表示消息通道不可用（如单测环境），调用方回退到页面直连。
 */
async function fetchViaServiceWorker(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  outerSignal?: AbortSignal,
): Promise<{ ok: boolean; status: number; text: string } | null> {
  const runtime = (globalThis as { chrome?: { runtime?: { sendMessage?: (msg: unknown) => Promise<unknown> } } }).chrome?.runtime;
  if (!runtime?.sendMessage) return null;
  if (outerSignal?.aborted) throw outerSignal.reason ?? new DOMException('已取消', 'AbortError');

  const headers: Record<string, string> = {};
  const rawHeaders = init.headers as Record<string, string> | undefined;
  if (rawHeaders) for (const key in rawHeaders) headers[key] = rawHeaders[key];
  const request = {
    url,
    method: (init.method as string) || 'POST',
    headers,
    body: typeof init.body === 'string' ? init.body : undefined,
    timeoutMs,
  };

  const response = await new Promise<{ success?: boolean; ok?: boolean; status?: number; text?: string; error?: string } | null>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(outerSignal?.reason ?? new DOMException('已取消', 'AbortError'));
    };
    if (outerSignal) outerSignal.addEventListener('abort', onAbort, { once: true });
    runtime.sendMessage!({ action: 'aiProxyFetch', request })
      .then((res) => {
        if (settled) return;
        settled = true;
        if (outerSignal) outerSignal.removeEventListener('abort', onAbort);
        resolve(res as { success?: boolean; ok?: boolean; status?: number; text?: string; error?: string } | null);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        if (outerSignal) outerSignal.removeEventListener('abort', onAbort);
        reject(err);
      });
  });

  // 消息通道存在但 SW 未返回结构化结果时回退直连
  if (!response || typeof response !== 'object') return null;
  if (response.success === false) throw new Error(response.error || 'ai_proxy_fetch_failed');
  // 只有携带代理结果结构（数值 status）才采信为 aiProxyFetch 响应；
  // 否则说明消息通道被非本代理的处理器接管（如测试桩只处理 labelCache），回退直连。
  if (typeof response.status !== 'number') return null;
  return { ok: !!response.ok, status: Number(response.status) || 0, text: String(response.text ?? '') };
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  outerSignal?: AbortSignal,
): Promise<{ ok: boolean; status: number; text: string }> {
  // 先尝试 SW 代理（免 CORS 预检）；通道不可用则回退到页面直连。
  try {
    const viaSw = await fetchViaServiceWorker(String(input), init, timeoutMs, outerSignal);
    if (viaSw) return viaSw;
  } catch (e) {
    if (outerSignal?.aborted) throw e;
    const name = (e as Error).name;
    // SW 端超时/网络错误按可重试错误上抛，交给 chat() 的重试循环处理
    if (name === 'TimeoutError' || /超时|timeout/i.test((e as Error).message)) {
      throw new Error(`API 请求超时（${Math.round(timeoutMs / 1000)} 秒）`);
    }
    throw e;
  }

  const ctrl = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    ctrl.abort(new DOMException('请求超时', 'TimeoutError'));
  }, timeoutMs);
  const onAbort = () => ctrl.abort(outerSignal?.reason ?? new DOMException('已取消', 'AbortError'));
  if (outerSignal?.aborted) onAbort();
  else outerSignal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(input, { ...init, signal: ctrl.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (e) {
    if (outerSignal?.aborted) throw e;
    if (timedOut || (e as Error).name === 'TimeoutError') {
      throw new Error(`API 请求超时（${Math.round(timeoutMs / 1000)} 秒）`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
    outerSignal?.removeEventListener('abort', onAbort);
  }
}

function responseErrorDetail(text: string): string {
  let value: unknown = text;
  try {
    const data = JSON.parse(text) as { error?: unknown; message?: unknown };
    value = data?.error && typeof data.error === 'object'
      ? (data.error as { message?: unknown }).message
      : data?.error ?? data?.message ?? text;
  } catch {
    /* Plain-text provider errors are handled below. */
  }
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function httpError(status: number, text: string): Error {
  if (status === 401) return new Error('API 身份验证失败 (401)，请重新登录或更新 API Key 后重试。');
  if (status === 403) return new Error('API 访问被拒绝 (403)，请检查账号、模型权限和 API Key。');
  if (status === 408) return new Error('API 408：请求超时，请稍后重试。');
  if (status === 429) return new Error('API 429：请求过于频繁或额度受限，请稍后重试并检查账户额度。');
  if (status >= 500) return new Error(`API ${status}：服务暂时不可用，请稍后重试。`);
  const detail = responseErrorDetail(text);
  return new Error(`API 请求失败 (${status})${detail ? `：${detail}` : ''}`);
}

interface RequestSpec {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  extract: (data: any) => string | undefined;
}

/** 按供应商协议构造请求 */

/** 统一提取各家 API 文本内容（string / content parts / anthropic blocks） */
function normalizeMessageContent(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const p = part as Record<string, unknown>;
          if (typeof p.text === 'string') return p.text;
          if (typeof p.content === 'string') return p.content;
          if (typeof p.output_text === 'string') return p.output_text;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof content === 'object') {
    const o = content as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text;
    if (typeof o.content === 'string') return o.content;
  }
  return String(content);
}

function buildRequest(settings: Settings, messages: ChatMessage[], opts: ChatOptions): RequestSpec {
  const style = resolveProvider(settings).apiStyle;
  const requestUrl = resolveRequestUrl(settings);
  const temperature = opts.temperature ?? 0.2;
  const maxTokens = opts.maxTokens ?? 4096;

  if (style === 'anthropic') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    return {
      url: requestUrl,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: {
        model: settings.model,
        max_tokens: maxTokens,
        temperature,
        ...(system ? { system } : {}),
        messages: messages.filter((m) => m.role !== 'system'),
      },
      extract: (data) => normalizeMessageContent(data?.content),
    };
  }

  if (style === 'gemini') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const base = settings.baseUrl.replace(/\/$/, '');
    return {
      url: `${base}/models/${settings.model}:generateContent`,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': settings.apiKey,
      },
      body: {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      },
      extract: (data) => normalizeMessageContent(data?.candidates?.[0]?.content?.parts),
    };
  }

  // openai 兼容（Agnes / OpenRouter / OpenAI / DeepSeek）
  return {
    url: requestUrl,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: {
      model: settings.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    },
    extract: (data) => normalizeMessageContent(data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.message?.reasoning_content),
  };
}

/** 调用 LLM，带 429/5xx 指数退避重试 */
export async function chat(
  settings: Settings,
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<string> {
  const spec = buildRequest(settings, messages, opts);
  const maxRetries = getAiRetryCount(settings);
  const timeoutMs = getAiRequestTimeoutMs(settings);
  let lastError: Error = new Error('未知错误');
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(spec.url, {
        method: 'POST',
        headers: spec.headers,
        body: JSON.stringify(spec.body),
      }, timeoutMs, opts.signal);

      if (res.status === 408 || res.status === 429 || res.status >= 500) {
        lastError = httpError(res.status, res.text);
        if (attempt < maxRetries) {
          const delayMs = retryDelayMs(attempt);
          opts.onRetry?.({ attempt: attempt + 1, maxRetries, delayMs, reason: lastError.message });
          await sleep(delayMs, opts.signal);
        }
        continue;
      }
      if (!res.ok) {
        throw httpError(res.status, res.text);
      }

      let data: any;
      try {
        data = JSON.parse(res.text);
      } catch {
        // 带上响应体预览，便于区分 HTML 错误页 / SSE 流 / 登录墙等常见配置问题。
        const preview = String(res.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
        const hint = /^\s*</.test(res.text ?? '')
          ? '（返回了 HTML 而非 JSON，通常是 baseUrl 指向了网页而非 API 端点，或被网关/登录页拦截）'
          : /^\s*data:\s/.test(res.text ?? '')
            ? '（返回了流式 SSE 响应，请关闭 stream 或改用非流式端点）'
            : '';
        throw new Error(`API 返回的 JSON 格式无效${hint}${preview ? `：${preview}` : ''}`);
      }
      let content = normalizeMessageContent(spec.extract(data));
      // 部分兼容网关把文本放在 output / result / data 字段
      if (!content) {
        content = normalizeMessageContent(
          (data as any)?.output_text ??
            (data as any)?.result ??
            (data as any)?.data ??
            (data as any)?.message?.content ??
            (data as any)?.response,
        );
      }
      if (!content) throw new Error('API 返回内容为空');
      return content;
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      if (e instanceof TypeError || /超时|timeout|network|failed to fetch/i.test((e as Error).message)) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (attempt < maxRetries) {
          const delayMs = retryDelayMs(attempt);
          opts.onRetry?.({ attempt: attempt + 1, maxRetries, delayMs, reason: lastError.message });
          await sleep(delayMs, opts.signal);
        }
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

/** 规范化 LLM 文本：去 BOM、全角括号、常见包装 */
function normalizeLlmText(text: string): string {
  return String(text ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\u00a0/g, ' ')
    // 全角括号 → 半角，避免某些中文模型输出 ［{...}］
    .replace(/［/g, '[')
    .replace(/］/g, ']')
    .replace(/｛/g, '{')
    .replace(/｝/g, '}')
    .replace(/：/g, ':')
    .trim();
}

/** 从任意文本中截取首个平衡的 JSON 数组/对象 */
function sliceBalancedJson(text: string): string | null {
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  const open = text[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** 尝试修复轻微损坏的 JSON（尾逗号、单引号键值） */
function softRepairJson(raw: string): string {
  return raw
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/'/g, '"');
}

/** 从 LLM 回复中提取 JSON（容忍 markdown 围栏、前后缀说明、轻度格式错误） */
export function extractJson<T>(text: string): T {
  const normalized = normalizeLlmText(text);
  if (!normalized) {
    throw new Error('回复中未找到 JSON');
  }

  const candidates: string[] = [];
  const fencedAll = [...normalized.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)];
  for (const m of fencedAll) {
    if (m[1]?.trim()) candidates.push(m[1].trim());
  }
  candidates.push(normalized);

  // 也尝试去掉常见前缀：“这是结果：”等
  const stripped = normalized.replace(/^[\s\S]{0,200}?(?=[[{])/m, '');
  if (stripped && stripped !== normalized) candidates.push(stripped);

  let lastErr: Error | null = null;
  for (const cand of candidates) {
    const slices = [sliceBalancedJson(cand), cand].filter(Boolean) as string[];
    // 兜底：首 {/[ 到 末 }/]
    const s = cand.search(/[[{]/);
    const e = Math.max(cand.lastIndexOf('}'), cand.lastIndexOf(']'));
    if (s >= 0 && e > s) slices.push(cand.slice(s, e + 1));

    for (const slice of slices) {
      for (const variant of [slice, softRepairJson(slice)]) {
        try {
          return JSON.parse(variant) as T;
        } catch (err) {
          lastErr = err as Error;
        }
      }
    }
  }

  const preview = normalized.replace(/\s+/g, ' ').slice(0, 160);
  throw new Error(
    `回复中未找到 JSON${preview ? `（预览: ${preview}${normalized.length > 160 ? '…' : ''}）` : ''}` +
      (lastErr ? ` / ${lastErr.message}` : ''),
  );
}

/** 测试 API 连接 */
export async function testConnection(settings: Settings): Promise<string> {
  return chat(settings, [{ role: 'user', content: '回复"OK"两个字母即可。' }], {
    maxTokens: 16,
  });
}

/** 拉取供应商可用模型列表（各家均提供 /models 接口）。
 *  失败时抛出明确错误，不再静默返回空数组。
 */
export async function listModels(settings: Settings): Promise<string[]> {
  const style = resolveProvider(settings).apiStyle;
  let url: string;
  let headers: Record<string, string>;

  if (style === 'anthropic') {
    const raw = resolveRequestUrl(settings) || settings.baseUrl;
    url = raw.replace(/\/messages\/?$/, '/models').replace(/\/v1\/?$/, '/v1/models');
    if (!/\/models$/.test(url)) url = raw.replace(/\/?$/, '') + '/models';
    headers = {
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  } else if (style === 'gemini') {
    url = `${settings.baseUrl.replace(/\/$/, '')}/models?pageSize=1000`;
    headers = { 'x-goog-api-key': settings.apiKey };
  } else {
    // openai 兼容：base 或 .../chat/completions → .../models
    const raw = resolveRequestUrl(settings) || settings.baseUrl;
    url = raw.replace(/\/chat\/completions\/?$/, '/models');
    if (!/\/models$/.test(url)) url = raw.replace(/\/?$/, '') + '/models';
    headers = { Authorization: `Bearer ${settings.apiKey}` };
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`获取模型列表失败 (${res.status}): ${await res.text().catch(() => '')}`);
  }
  const data = await res.json();

  let ids: string[];
  if (style === 'gemini') {
    // { models: [{ name: "models/gemini-..." , supportedGenerationMethods: [...] }] }
    ids = (data?.models ?? [])
      .filter((m: any) => m?.supportedGenerationMethods?.includes('generateContent') ?? true)
      .map((m: any) => String(m.name).replace(/^models\//, ''));
  } else {
    // OpenAI / Anthropic 风格均为 { data: [{ id }] }
    ids = (data?.data ?? []).map((m: any) => String(m.id));
  }
  return [...new Set(ids)].sort();
}

export interface ProviderDiagnostic {
  step: string;
  ok: boolean;
  detail: string;
}

/**
 * Provider Doctor：分环节诊断 AI 供应商配置，返回结构化结果。
 * 参照 CodexPlusPlus 的 Provider Doctor 思路，逐步检查配置完整性、请求地址形态与实时连通性，
 * 让用户能精确定位问题出在哪一环，而不是只看到一句笼统的失败。
 */
export async function diagnoseProvider(settings: Settings): Promise<ProviderDiagnostic[]> {
  const results: ProviderDiagnostic[] = [];
  const style = resolveProvider(settings).apiStyle;

  // 1) 必填字段
  const missing: string[] = [];
  if (!settings.apiKey) missing.push('API Key');
  if (!settings.model) missing.push('模型名');
  if (settings.provider === 'custom' && !settings.baseUrl) missing.push('Base URL');
  results.push({
    step: '配置完整性',
    ok: missing.length === 0,
    detail: missing.length ? `缺少：${missing.join('、')}` : '必填字段齐全',
  });
  if (missing.length) return results;

  // 2) 请求地址形态
  const url = resolveRequestUrl(settings);
  const hasValidUrl = !!url && /^https?:\/\//.test(url);
  results.push({
    step: '请求地址',
    ok: hasValidUrl,
    detail: url || '无法解析出有效的请求地址',
  });
  if (!hasValidUrl) return results;

  // 3) 实时连通性（走与真实分类相同的 chat 路径，即 SW 代理）
  try {
    const reply = await chat(settings, [{ role: 'user', content: '回复"OK"两个字母即可。' }], { maxTokens: 16 });
    results.push({
      step: '连通性',
      ok: true,
      detail: `连接成功 · ${style} · ${settings.model}｜样例：${String(reply).slice(0, 40)}`,
    });
  } catch (e) {
    results.push({ step: '连通性', ok: false, detail: (e as Error).message || String(e) });
  }
  return results;
}
