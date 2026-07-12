# 功能合并说明

AI Bookmark OS 的目标是把时间线式书签管理与 AI 金字塔分类合并成一个统一扩展。最终扩展目录是 `dist/`：时间线能力位于 `dist/pages`、`dist/shared`、`dist/background`，AI 分类能力位于 `dist/ai`，两者通过 `dist/background/ai-sw-bridge.js` 和 Chrome Side Panel 入口协同。

## 功能对照表

| 来源能力 | 原能力说明 | 新项目实现 | 状态 |
|---|---|---|---|
| bookmark-pilot | Map-Reduce AI 分类，先打标、再建树、再分配书签 | `src/core/classifier.ts`，构建后进入 `dist/ai/assets/*sidepanel*.js` | 保留并增强 |
| bookmark-pilot | 多供应商 LLM 配置、连接测试、模型列表 | `src/core/llm.ts` + 统一设置页 `src/timeline/pages/settings/settings.html#ai` | 保留并增强，设置入口已合并 |
| bookmark-pilot | 分类提示词可编辑 | `classifyPrompts` 三阶段设置：打标、建树、分配 | 增强 |
| bookmark-pilot | 应用分类结果到真实 Chrome 书签并支持撤销 | `src/core/bookmarks.ts`，自动备份与 apply record | 保留 |
| bookmark-pilot | 分类树编辑 | `src/sidepanel/Tree.tsx` + `src/core/treeEdit.ts` | 保留 |
| bookmark-pilot | 新书签增量归类 | `src/bridge/ai-sw-bridge.js` 记录 pending，侧边栏执行增量分类 | 保留 |
| bookmark-pilot | 健康检查 | 为避免 AI 分类页功能重叠，主 AI 页聚焦分类；健康能力保留在时间线健康检查和共享检查模块 | 合并 |
| Markline | 时间线弹窗与完整管理窗口 | `src/timeline/pages/popup`、`pages/standalone` 打包到 `dist/pages` | 保留 |
| Markline | 新增、编辑、删除、批量操作、最近删除 | `dist/pages/popup`、`dist/pages/standalone`、`dist/background/background.js` | 保留 |
| Markline | 模糊搜索、命令面板、Omnibox | `dist/pages/*` + manifest commands / omnibox | 保留 |
| Markline | 规则标签、AI 标签增强、AI 日志 | `dist/shared/smart-tagger.js`、`ai-tagger.js`、`ai-logger.js` | 保留 |
| Markline | 链接预览、元信息抓取、Readability | `dist/background/preview-extractor.js`、`content/content-extractor.js` | 保留 |
| Markline | 知识图谱、统计、RSS、失效检查 | `dist/pages/graph`、`dist/pages/checker`、`dist/shared/rss-parser.js` 等 | 保留 |
| 合并项目 | 统一入口、统一品牌、统一设置 | `scripts/package-extension.mjs` 生成统一 manifest、语言包和入口 | 重构 |
| 合并项目 | Popup 打开 AI 分类侧边栏并关闭自身 | `openAiClassifyPanel` + `chrome.sidePanel.open` + `window.close()` | 增强 |
| 合并项目 | AI 请求重连与超时配置 | `aiRetryCount`、`aiRequestTimeoutSeconds`，默认 5 次 / 90 秒 | 增强 |

## 架构整合

- 时间线管理仍使用成熟的原生 JS 模块，避免重写大量已验证的浏览器扩展逻辑。
- AI 分类使用 React + TypeScript 独立构建，再被打包进 `dist/ai`，避免和时间线页面的全局脚本互相污染。
- 最终 manifest 由 `scripts/package-extension.mjs` 生成，统一权限、快捷键、Side Panel、Popup、Options 和 Omnibox。
- 统一品牌由打包脚本重写语言包、图标和入口页面，构建产物不暴露参考项目品牌。
- AI 与时间线通过 Chrome storage 和 bridge 脚本共享新书签待分类状态、侧边栏打开入口和基础数据。

## 入口整合

- 默认工具栏弹窗：时间线主界面。
- AI 分类按钮：打开 Side Panel 的 `ai/sidepanel.html`，并关闭 Popup，避免悬浮层遮挡。
- 设置入口：统一设置页保留时间线设置，同时 AI 分类设置集中在 AI 区域。
- `dist/index.html` 提供开发/验收时的页面入口导航。

## 保留与取舍

- 保留两个项目的核心能力，但 AI 分类页不再重复放置重复检测、死链检测等健康功能；这类能力由时间线主项目承载，AI 页面专注分类树。
- 原有书签夹既可作为优化参考，也可通过“保持原样的书签夹”明确指定不参与 AI 优化。
- 旧 AI 树、缓存、页面描述抓取和内置规则均做成用户可控开关，避免隐藏规则压过用户自定义提示词。

## 验收证据

- `npm run build`：生成最终扩展目录 `dist/`。
- `npm run preview:check`：检查 manifest、背景脚本桥接、AI 入口、Popup 自动关闭、品牌泄漏、AI 页面聚焦分类等关键项。
- `dist/manifest.json`：最终可加载 manifest，Side Panel 指向 `ai/sidepanel.html`，Popup 指向 `pages/popup/popup.html`。
