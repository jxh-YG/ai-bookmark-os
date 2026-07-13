# AI Bookmark OS

AI Bookmark OS 是一个 Manifest V3 Chrome 扩展，提供时间线书签管理、规则/AI 标签、知识图谱、RSS、链接健康检查、真实书签树导航，以及完整的 AI 金字塔书签分类能力。项目源码按运行时模块和 AI 工作台模块组织，最终统一打包到 `dist/`。

## 核心功能

- 书签时间线：弹窗与完整窗口浏览、热度排序、置顶、最近删除、右键菜单与快捷收藏。
- 搜索与筛选：模糊搜索、命令面板、Omnibox `bk` 搜索、标签和时间线视图。
- 书签管理：新增、编辑、删除、批量删除、导入导出、备份恢复、归档/最近删除工作流。
- 书签导航：读取浏览器真实书签树，按文件夹层级展开/收起，并展示站点摘要、标签和 favicon。
- 智能标签：规则标签引擎、AI 标签增强、AI 调用日志与缓存。
- AI 金字塔分类：Map-Reduce 三阶段分类、试分类、成本预估、分类树编辑、应用到真实书签、一键撤销、自动备份、新书签增量归类。
- 分类规则控制：可配置是否参照原有书签夹、是否沿用上一次 AI 分类树、是否使用分类缓存、是否抓取页面描述、是否启用内置分类规则增强，以及可选“保持原样”的书签夹。
- AI 连接稳定性：可配置失败重连次数和单次请求超时时间；默认重连 5 次、超时 90 秒。
- 内容理解与预览：页面元信息抓取、悬浮预览、Readability 内容提取。
- 健康检查：重复书签、失效链接、疑似失效链接、批量清理。
- 知识图谱与统计：书签关系图、健康分、统计报告、RSS 订阅。
- 本地优先：书签、分类结果、缓存和设置主要保存在 Chrome 本地存储中，API Key 仅保存到 `storage.local`。

## 技术栈

- Chrome Extension Manifest V3
- Vite + React 18 + TypeScript
- 原生 JavaScript/HTML/CSS 时间线模块
- Chrome APIs：`bookmarks`、`storage`、`sidePanel`、`contextMenus`、`omnibox`、`alarms`、`notifications`、`scripting`、`declarativeNetRequest`
- LLM 协议：OpenAI-compatible、Anthropic Messages、Gemini GenerateContent
- 构建：`tsc -b`、`vite build`、自定义 `scripts/package-extension.mjs`

## 目录结构

```text
.
├─ src/                    # 项目源码
│  ├─ core/                # LLM、分类、书签、缓存、设置、健康检查、导入导出
│  ├─ sidepanel/           # AI 分类侧边栏 React 页面
│  ├─ bookmark-nav/        # 真实书签树导航 React 页面
│  ├─ options/             # AI 统一设置页 React 页面
│  ├─ bridge/              # 注入到最终 service worker 的 AI 桥接脚本
│  ├─ timeline/            # 扩展运行时、弹窗、完整工作台、设置、图谱、RSS、检查页
│  └─ styles/              # Apple OS 统一设计变量
├─ scripts/                # 打包、入口注入、验收脚本
├─ docs/                   # 源码分析、功能合并、UI 说明
└─ dist/                   # 最终可加载的 Chrome 扩展目录，AI 页面由 Vite 输出到 dist/ai/
```

## 环境要求

- Node.js 18+
- npm 9+
- Chrome 114+

## 安装与构建

```bash
npm install
npm run build
npm run preview:check
```

`npm run build` 会先把 React AI 页面生成到 `dist/ai/`，再把时间线模块、图标、语言包和统一 manifest 组装到 `dist/`。

## 本地加载

1. 打开 Chrome：`chrome://extensions`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择本项目的 `dist/` 目录

注意：请加载 `dist/`，不要加载项目根目录。根目录包含开发源码和中间配置，最终可运行扩展以 `dist/manifest.json` 为准。

## 使用入口

- 工具栏图标：打开时间线弹窗
- 弹窗顶部 AI 按钮或入口横幅：打开 AI 分类侧边栏，并自动关闭弹窗以避免遮挡
- 完整管理窗口：`dist/index.html` 或扩展内入口
- AI 设置：时间线设置页的 AI 区域，或 AI 侧边栏右上角设置入口
- 快捷键：
  - `Alt+Shift+A`：打开 AI 分类侧边栏
  - `Alt+Shift+B`：打开弹窗
  - `Alt+Shift+D`：快速收藏当前页面
  - `Ctrl/Command+Shift+E`：命令面板
  - 地址栏输入 `bk 关键词`：搜索书签

## AI 配置

统一设置页中可以配置：

- 模型供应商：Agnes AI、OpenRouter、OpenAI、Claude、Gemini、DeepSeek、自定义提供商
- API Key：仅保存到 `chrome.storage.local`
- Base URL 与模型名
- 自定义提供商协议：OpenAI-compatible、Anthropic、Gemini
- 分类提示词：打标、构建分类树、分配分类三个阶段均可替换
- 分类规则开关：原有书签夹参照、旧 AI 树参照、内置规则、分类缓存、页面描述增强
- 连接稳定性：失败重连次数和请求超时秒数，默认分别为 5 和 90

AI 分类调用会发送书签标题、URL、域名、原文件夹路径和可选页面元信息到用户选择的模型服务。页面正文不会默认发送到分类模型。

## 构建与验收命令

```bash
npm run typecheck       # TypeScript 类型检查
npm run build:ai        # 仅构建 React AI 页面
npm run build:ext       # 将 AI 页面与时间线模块打包成最终扩展
npm run build           # 完整生产构建
npm run preview:check   # 检查 dist 关键文件、入口、品牌和 AI 入口
```

## 项目文档

- [Apple OS UI 说明](docs/UI_APPLE_OS.md)

## 仓库整理

- `vendor/`、`.sources/`、`dist/`、`node_modules/` 和 `*.tsbuildinfo` 不纳入 git。
- 当前构建依赖的运行时代码已保留在 `src/timeline/`，不再依赖根目录外的开源项目副本。
- `dist/` 是构建产物，用于加载扩展；源码对照以 git 中的项目文件为准。

## 常见问题

### 加载扩展时报错怎么办？

确认加载的是 `dist/` 目录，并先执行 `npm run build`。不要直接加载项目根目录。

### AI 分类提示“回复中未找到 JSON”怎么办？

通常是模型没有遵守 JSON 输出格式。系统会自动进行 JSON 修复请求和失败重连；也可以在设置页检查三段分类提示词，确保要求“只输出 JSON”。

### 为什么分类结果和上一次很像？

检查设置页的“沿用上一次 AI 分类树”和“使用分类缓存”。如果正在验证新提示词，可以关闭这两个开关后重新分类。

### 如何避免原有公司/项目书签被打散？

开启“参照原有书签夹”，并在需要完全保留的书签夹中勾选“保持原样的书签夹”。未勾选的书签夹会作为优化参考，而不是强制照抄。

### AI 服务不稳定导致分类中断怎么办？

在 AI 设置页的“连接稳定性”中调高失败重连次数或请求超时时间。默认是失败后重连 5 次、每次请求超时 90 秒。
