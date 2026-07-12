# Apple OS 风格 UI 说明

AI Bookmark OS 的界面目标是统一成接近 Apple Human Interface Guidelines 的视觉语言：克制、清晰、轻量、响应自然。时间线页面与 AI 分类页面虽然来自不同源码体系，但最终都共享 Apple OS 风格的设计变量、圆角、阴影、按钮状态和输入控件风格。

## 设计原则

- 大面积浅色/深色系统背景，减少复杂装饰。
- 使用柔和边框、轻阴影、半透明工具栏和清晰分隔线。
- 组件圆角保持一致，常用半径为 8、10、14、16。
- 文字层级遵循系统风格：主文本、次文本、弱提示文本分层明显。
- 交互反馈轻量：hover、active、focus-visible、disabled 都有状态，但不使用突兀动画。
- 主要操作使用系统蓝 `#0A84FF`，危险操作使用系统红，成功状态使用系统绿。
- 不使用复杂渐变和重装饰背景，避免页面之间出现割裂风格。

## 统一设计变量

主要样式来源：

- `src/styles/apple-design-system.css`：AI 页面设计变量。
- `src/sidepanel/pilot.css`：AI 分类侧边栏 Apple OS 风格组件。
- `src/timeline/pages/settings/settings.css`：统一设置页 Apple OS 风格组件；`src/options/pilot-options.css` 仅保留为历史兼容源码，不再作为用户入口打包。
- `src/timeline/shared/apple-design-system.css` 与 `apple-page-polish.css`：时间线页面统一样式基础，打包后进入 `dist/shared`。

核心变量包括：

- 背景：`--bg-primary`、`--bg-secondary`、`--bg-tertiary`
- 文本：`--text-primary`、`--text-secondary`、`--text-tertiary`
- 边框：`--border-light`、`--border-medium`
- 主色：`--accent`、`--accent-light`、`--accent-hover`
- 状态色：`--danger`、`--success`
- 间距：4 / 8 / 12 / 16 / 20 / 24
- 圆角：8 / 10 / 14 / full
- 动效：140ms / 200ms 标准缓动

## 组件规范

- Button：统一最小高度、圆角、hover/active/disabled/focus-visible。
- Input / Select / Textarea：统一背景、边框、焦点环和可读字号。
- Card：轻边框、柔和阴影，不嵌套装饰性卡片。
- Sidebar / Nav：侧边栏按钮使用轻量选中态，避免高饱和块面过多。
- Toolbar / Topbar：固定高度、细分隔线、简洁图标按钮。
- Modal：居中、轻阴影、清晰主次按钮。
- Tag / Pill：胶囊样式用于模型、模式、颜色等选项。
- Empty / Loading / Progress：空状态、进度条、阶段提示保持同一视觉语言。

## 页面改造点

### 时间线 Popup

- 保留高频书签管理入口，新增 AI 分类按钮和入口横幅。
- AI 分类入口打开 Side Panel 后自动关闭 Popup，避免两个浮层互相遮挡。
- 品牌、图标、按钮和搜索框统一为 AI Bookmark OS 风格。

### 完整管理窗口

- 保留时间线、批量操作、搜索、图谱、RSS、健康检查等能力。
- 入口和导航统一使用新品牌与 Apple OS 样式。

### AI 分类侧边栏

- 从独立窗口改为 Side Panel 内完整页面。
- 页面只专注 AI 分类、分类树编辑、应用与撤销，不再重复放置健康检查面板。
- 进度区展示三阶段状态，并在 AI 连接失败时展示重连提示。

### AI 设置页

- 统一模型供应商、自定义提供商、API Key、Base URL、模型名、分类提示词、分类规则开关、连接稳定性设置。
- 新增失败重连次数和请求超时秒数，默认 5 次 / 90 秒。
- 保持和侧边栏一致的卡片、输入框、按钮、开关、提示文本风格。

## 响应式与可用性

- 设置页在窄屏下侧边栏变为横向导航。
- AI 侧边栏使用固定顶部、搜索区、操作区和可滚动树区域，避免 Popup 尺寸限制导致压缩变形。
- 所有输入控件保留清晰 focus-visible，按钮点击区域不小于常见桌面交互尺寸。
- 支持系统浅色/深色模式，并允许用户在设置页指定模式。

## 验收方式

- `npm run build` 确认 AI 页面与时间线页面都能被打包。
- `npm run preview:check` 确认 AI 入口、品牌、Side Panel 路径和关键资源存在。
- 手动加载 `dist/` 后检查：Popup、完整窗口、设置页、AI 分类侧边栏在视觉语言、按钮状态、输入控件和页面间距上保持一致。
