# AI 请求链路改造方案

## 诊断结论（基于实读代码）

### 症状根因
1. **CORS 预检拖慢 + 报错**：分类/测试请求都在扩展页面（sidepanel、settings）里 `fetch`，带 `Authorization`/`x-api-key` 自定义头的跨域请求会触发浏览器 OPTIONS 预检（双倍往返）。桌面 AI 工具无浏览器 CORS 约束，故快。部分端点对预检响应异常即报错。
2. **非流式 + 大 max_tokens**：分类请求 `max_tokens` 4096–8192 且不用流式，必须等整段生成完才返回。
3. **三套独立请求代码不一致**：
   - `core/llm.ts` `buildRequest`（分类主链路，带 `anthropic-dangerous-direct-browser-access` 头）
   - `settings.js` `buildTreeChatRequest`（树分类测试连接，**缺** Anthropic CORS 头 → Anthropic 测试必失败）
   - SW `ai-tagger.js`（标签系统，独立 endpoint 表）
   URL 拼接、请求头、协议各有差异 → “相同配置行为不一致”。
4. **仅支持 JSON**：三阶段分类只接受 JSON（有容错提取），不支持 SSE 流式传输。

## 目标（已与用户确认）
- 性能兼容 + 流式解析
- 将 AI 请求迁移到后台 Service Worker 执行（根治 CORS）
- 分类仍需完整 JSON，但兼容流式传输（累积 SSE 分片 → 完整文本 → 现有 JSON 提取）

## 实施方案（分阶段，每阶段独立可验证）

### 阶段 1：SW 统一请求代理 + 流式累积（核心，根治慢/报错）
- SW 新增 `aiProxyRequest` 消息处理：接收 `{url, headers, body, stream, timeoutMs, requestId}`，在 SW 内 `fetch`（对 host_permissions 内主机不触发 CORS 预检）。
- 流式支持：`stream:true` 时读取 `ReadableStream`，累积 SSE `data:` 分片（openai `choices[].delta.content` / anthropic `content_block_delta` / gemini 分片）拼成完整文本后返回。分类拿到的仍是完整 JSON。
- 中止：页面 abort → 发 `aiProxyAbort{requestId}`，SW 侧 `AbortController.abort()`。
- `core/llm.ts` `chat()` 改为：不再直接 `fetch`，而是走 `aiProxyRequest`。`buildRequest` 逻辑保留（只是把 fetch 换成消息代理）。进度回调仍在页面，无需跨通道。

### 阶段 2：统一请求构造，修请求格式不一致
- 抽出单一 `buildProviderRequest`（供 llm.ts + settings 测试连接 + SW 共用），统一 URL 拼接、请求头（补齐 Anthropic CORS 头）、协议分支。
- `settings.js` 树分类测试连接改用统一构造（修 Anthropic 测试必败）。
- 兼容常见格式：OpenAI Chat Completions、Anthropic Messages、Gemini generateContent，以及 OpenAI Responses 协议（`/responses`，参照 CodexPlusPlus 的 wire_api 区分）。

### 阶段 3：供应商配置增强（参照 CodexPlusPlus）
- 协议选择：Chat Completions / Responses（wire_api）。
- 更强的模型测试：返回样例内容 + 诊断（协议/URL/Key/模型匹配检查，类似 Provider Doctor）。
- 流式开关（默认开），超时/重试沿用现有可配项。

## 验证
- 单测：SSE 累积解析（openai/anthropic/gemini 三种分片格式）、abort 传播、请求构造快照。
- 回归：现有 40+ 测试全过。
- 手动：设置页测试连接（含 Anthropic）、真实分类计时对比。
- 构建：typecheck + 全测试 + 打包。

## 风险与取舍
- SW 代理增加消息通道复杂度；流式累积需处理分片边界。
- 保守起见，分类 pipeline 仍留在页面（progress/abort 已工作），只迁移网络层——这是“迁移到 SW”的外科手术版，精准命中 CORS/慢的根因。
- host_permissions 需授予 all_urls（已作为 optional 声明）才能让 SW 直连任意 API 端点。
