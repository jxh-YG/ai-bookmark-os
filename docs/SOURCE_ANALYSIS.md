# 源码分析摘要

本文档记录 AI Bookmark OS 合并前后的源码结构、核心模块与构建方式，用于对应项目方案中的源码获取与分析要求。

## 来源一：AI 分类工作台源码

当前 `src/` 目录承载 AI 分类能力，工程化方式为 Vite + React + TypeScript。

### 技术栈

- Vite 单入口构建：`sidepanel.html`。AI 设置已经收口到 `src/timeline/pages/settings/settings.html#ai`，打包后的 `dist/ai/options.html` 仅作为统一设置重定向页。
- React 18 + TypeScript
- Chrome Extension APIs：`bookmarks`、`storage`、`permissions`、`runtime`
- LLM 协议：OpenAI-compatible、Anthropic Messages、Gemini GenerateContent

### 目录结构

- `src/core/bookmarks.ts`：读取扁平书签、去重、应用分类树、备份与撤销。
- `src/core/classifier.ts`：AI 金字塔分类主流程，包括打标、建树、分配、增量分类、成本预估。
- `src/core/llm.ts`：多供应商请求封装、超时、重连、JSON 解析、连接测试、模型列表。
- `src/core/settings.ts`：设置读写，敏感 API Key 仅保存在本地。
- `src/core/cache.ts`：URL 级分类缓存，避免重复消耗 API。
- `src/core/treeEdit.ts`：分类树重命名、删除、移动书签。
- `src/sidepanel/`：AI 分类 Side Panel UI。
- `src/options/`：历史 AI 设置组件源码，仅作兼容与参考；用户可访问的 AI 设置统一在 `src/timeline/pages/settings/`。
- `src/bridge/ai-sw-bridge.js`：注入最终 service worker，用于连接时间线运行时和 AI 侧边栏。

### 核心能力

- Map-Reduce 三阶段 AI 分类。
- 自定义供应商、自定义提示词和模型列表拉取。
- 原有书签夹参照、保持原样文件夹、旧 AI 树参照、分类缓存等可控规则。
- AI 请求失败重连和请求超时配置。
- 分类树编辑、应用到真实 Chrome 书签、备份与撤销。
- 新书签增量归类。

## 来源二：时间线书签管理源码

当前 `src/timeline/` 目录保留时间线书签管理能力，技术形态为原生 JavaScript/HTML/CSS 的 MV3 扩展源码。

### 技术栈

- Chrome Extension Manifest V3
- 原生 JS 模块和静态页面
- Chrome APIs：`bookmarks`、`history`、`contextMenus`、`omnibox`、`alarms`、`notifications`、`declarativeNetRequest`
- 内容预览：Readability、content script、background fetch
- 图谱：Cytoscape

### 目录结构

- `src/timeline/background/`：后台服务、书签同步、RSS、预览、通知、快捷命令。
- `src/timeline/pages/popup/`：工具栏弹窗主界面。
- `src/timeline/pages/standalone/`：完整管理窗口、MDI 管理、RSS 视图。
- `src/timeline/pages/settings/`：通用设置页。
- `src/timeline/pages/checker/`：失效链接检查页。
- `src/timeline/pages/graph/`：知识图谱页。
- `src/timeline/shared/`：规则标签、AI 标签、日志、统计、RSS 解析、设计系统。
- `src/timeline/content/`：页面内容提取。

### 核心能力

- 时间线浏览、搜索、排序、置顶、最近删除。
- 书签新增、编辑、删除、批量操作、导入导出。
- 规则标签和 AI 标签增强。
- 命令面板、Omnibox 搜索、快捷收藏。
- 失效链接检查、知识图谱、RSS、统计健康分。
- 页面预览和元信息抓取。

## 合并策略

1. 保留时间线项目作为最终扩展主运行时，避免重写成熟的浏览器扩展能力。
2. 保留 AI 分类项目的 React + TypeScript 工程化结构，作为 Side Panel 独立页面构建。
3. 使用 `scripts/package-extension.mjs` 生成最终 `dist/`：
   - 复制时间线模块到扩展根目录。
   - 复制 `dist-ai/` 到 `dist/ai/`。
   - 注入 `ai-sw-bridge.js` 到最终 background service worker。
   - 生成统一 manifest、语言包、图标和入口页。
4. 使用 `scripts/verify-build.mjs` 检查关键交付项：manifest、背景桥接、AI 入口、Popup 自动关闭、品牌泄漏、AI 页面聚焦分类。
5. UI 统一通过共享 Apple OS 设计变量和页面级 polish 实现，避免时间线页面与 AI 页面视觉割裂。

## 数据模型与存储

- Chrome 原生书签树是权威数据源。
- 时间线模块使用本地存储缓存书签记录、标签、统计、RSS 等数据。
- AI 分类模块使用扁平书签结构：`id`、`title`、`url`、`folderPath`。
- AI 分类结果存储为 `classifyResult`：分类树、标签字典、创建时间。
- API Key 保存在 `chrome.storage.local`；非敏感设置可镜像到 `chrome.storage.sync`。

## 构建与运行

```bash
npm install
npm run build:ai
npm run build:ext
npm run build
npm run preview:check
```

最终加载目录是 `dist/`。项目根目录中的源码和中间配置不作为最终扩展直接加载。

## 风险与控制

- 两套源码风格不同：通过打包隔离 AI 页面和时间线页面，减少全局脚本冲突。
- AI 输出不稳定：`llm.ts` 提供 JSON 提取、修复请求、失败重连和超时控制。
- 用户提示词可能被旧分类结果影响：旧 AI 树、缓存、内置规则均提供设置开关。
- Popup 与 AI 页面重叠：AI 入口打开 Side Panel 后关闭 Popup。
