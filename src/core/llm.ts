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

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  outerSignal?: AbortSignal,
): Promise<{ ok: boolean; status: number; text: string }> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    ctrl.abort(new DOMException('请求超时', 'TimeoutError'));
  }, timeoutMs);
  const onAbort = () => ctrl.abort(outerSignal?.reason ?? new DOMException('已取消', 'AbortError'));
  outerSignal?.addEventListener('abort', onAbort, { once: true });
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
        lastError = new Error(`API ${res.status}: ${res.text}`);
        if (attempt < maxRetries) {
          const delayMs = retryDelayMs(attempt);
          opts.onRetry?.({ attempt: attempt + 1, maxRetries, delayMs, reason: lastError.message });
          await sleep(delayMs, opts.signal);
        }
        continue;
      }
      if (!res.ok) {
        throw new Error(`API 请求失败 (${res.status}): ${res.text}`);
      }

      let data: any;
      try {
        data = JSON.parse(res.text);
      } catch {
        throw new Error('API 返回的 JSON 格式无效');
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
