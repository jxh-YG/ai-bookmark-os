# Apple Dynamic Glassmorphism UI 说明

AI Bookmark OS 界面统一采用 Apple 风格的动态玻璃拟态（Dynamic Glassmorphism）视觉语言：简洁、通透、精致、未来感，同时保持业务信息结构不变。

## 设计原则

- 银白 / 冰蓝 / 浅灰 / 冷白为主，低饱和冷色渐变背景。
- 多层毛玻璃面板 + 细边框 + 柔和阴影 + 内高光，避免厚重装饰。
- 圆角统一为大圆角体系（约 12 / 18 / 24）。
- 主按钮使用冰蓝微光渐变；次按钮为半透明描边玻璃。
- 动效克制：150–380ms，支持 `prefers-reduced-motion`。
- 文本与玻璃背景保持足够对比，优先可读性。

## 样式来源

- `src/styles/apple-design-system.css`：统一设计令牌与玻璃组件语言（同步至 `src/timeline/shared/`）
- `src/timeline/shared/apple-page-polish.css`：Popup / Settings / Standalone / Graph / Checker 统一抛光
- `src/sidepanel/sidepanel.css`：AI 分类侧边栏玻璃壳层
- `src/bookmark-nav/bookmark-nav.css`：书签导航 Hero / 卡片 / 悬浮操作 / 页脚

## 页面覆盖

- AI 分类 Side Panel：悬浮玻璃顶栏、搜索条、操作条、进度卡、弹窗
- 书签导航：沉浸式 Hero、模块化卡片网格、悬浮操作区、分层页脚
- Popup / 完整窗口 / 设置 / 图谱 / 健康检查：共享 glass 顶栏、卡片、输入与主按钮

## 验收

- `npm run build`
- `npm run preview:check`