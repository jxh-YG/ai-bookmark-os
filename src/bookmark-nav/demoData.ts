import type { ClassifyResult, FlatBookmark } from '../types';

export interface BookmarkFolderFixture {
  id: string;
  title: string;
  path: string;
  bookmarkIds: string[];
  children: BookmarkFolderFixture[];
}

type DemoBookmark = FlatBookmark & {
  summary: string;
  tags: string[];
};

const demoBookmarks: DemoBookmark[] = [
  {
    id: 'demo-figma',
    title: 'Figma - Design and prototype',
    url: 'https://www.figma.com/',
    folderPath: '设计灵感/产品设计',
    summary: '协作式界面设计与原型工具，集中整理产品方案和组件资产。',
    tags: ['设计', '产品'],
  },
  {
    id: 'demo-dribbble',
    title: 'Dribbble - Discover the world’s top designers',
    url: 'https://dribbble.com/',
    folderPath: '设计灵感/视觉参考',
    summary: '收集界面、品牌和插画的高质量视觉案例。',
    tags: ['设计', '灵感'],
  },
  {
    id: 'demo-mobbin',
    title: 'Mobbin - UI and UX design inspiration',
    url: 'https://mobbin.com/',
    folderPath: '设计灵感/视觉参考',
    summary: '从真实产品中研究移动端交互和页面结构。',
    tags: ['设计', '产品'],
  },
  {
    id: 'demo-github',
    title: 'GitHub',
    url: 'https://github.com/',
    folderPath: '开发资料/工程协作',
    summary: '代码托管、协作和开源项目的日常入口。',
    tags: ['开发', '工具'],
  },
  {
    id: 'demo-vercel',
    title: 'Vercel - Build and deploy the best web experiences',
    url: 'https://vercel.com/',
    folderPath: '开发资料/前端工程',
    summary: '前端部署、预览环境和性能优化平台。',
    tags: ['开发', '部署'],
  },
  {
    id: 'demo-mdn',
    title: 'MDN Web Docs',
    url: 'https://developer.mozilla.org/',
    folderPath: '开发资料/前端工程',
    summary: 'Web 平台 API、CSS 和 JavaScript 的权威参考。',
    tags: ['开发', '文档'],
  },
  {
    id: 'demo-linear',
    title: 'Linear - The system for product development',
    url: 'https://linear.app/',
    folderPath: '工作效率/项目协作',
    summary: '轻量的产品研发协作和问题跟踪工具。',
    tags: ['效率', '产品'],
  },
  {
    id: 'demo-notion',
    title: 'Notion - Your connected workspace',
    url: 'https://www.notion.so/',
    folderPath: '工作效率/知识管理',
    summary: '笔记、文档与知识库的统一工作空间。',
    tags: ['效率', '知识库'],
  },
  {
    id: 'demo-raycast',
    title: 'Raycast - A collection of powerful productivity tools',
    url: 'https://www.raycast.com/',
    folderPath: '工作效率/常用工具',
    summary: '把常用工作流收进快速、可扩展的命令面板。',
    tags: ['效率', '工具'],
  },
  {
    id: 'demo-openai',
    title: 'OpenAI Platform',
    url: 'https://platform.openai.com/',
    folderPath: 'AI 与研究/模型平台',
    summary: '构建 AI 功能时使用的模型、文档与开发工具。',
    tags: ['AI', '开发'],
  },
  {
    id: 'demo-anthropic',
    title: 'Anthropic - Building reliable AI systems',
    url: 'https://www.anthropic.com/',
    folderPath: 'AI 与研究/模型平台',
    summary: '关注可靠、可控 AI 系统的研究与产品动态。',
    tags: ['AI', '研究'],
  },
  {
    id: 'demo-huggingface',
    title: 'Hugging Face - The AI community',
    url: 'https://huggingface.co/',
    folderPath: 'AI 与研究/开源模型',
    summary: '探索开放模型、数据集与机器学习工具。',
    tags: ['AI', '开源'],
  },
  {
    id: 'demo-coursera',
    title: 'Coursera - Learn without limits',
    url: 'https://www.coursera.org/',
    folderPath: '学习成长/在线课程',
    summary: '系统课程和专业证书的学习入口。',
    tags: ['学习', '课程'],
  },
  {
    id: 'demo-youtube',
    title: 'YouTube - Learning playlists',
    url: 'https://www.youtube.com/',
    folderPath: '学习成长/视频课程',
    summary: '保存值得反复观看的技术和创作课程。',
    tags: ['学习', '视频'],
  },
  {
    id: 'demo-smashing',
    title: 'Smashing Magazine',
    url: 'https://www.smashingmagazine.com/',
    folderPath: '待读文章/设计与前端',
    summary: '前端、体验设计和内容策略的深度文章。',
    tags: ['阅读', '设计'],
  },
  {
    id: 'demo-a16z',
    title: 'a16z - Future',
    url: 'https://a16z.com/',
    folderPath: '待读文章/产品与商业',
    summary: '产品、创业与科技趋势的长期观察。',
    tags: ['阅读', '趋势'],
  },
  {
    id: 'demo-nyt',
    title: 'The New York Times - Technology',
    url: 'https://www.nytimes.com/section/technology',
    folderPath: '待读文章/行业资讯',
    summary: '跟踪技术行业的重要新闻和观点。',
    tags: ['阅读', '资讯'],
  },
  {
    id: 'demo-excalidraw',
    title: 'Excalidraw - Virtual whiteboard',
    url: 'https://excalidraw.com/',
    folderPath: '工作效率/常用工具',
    summary: '用手绘风格快速梳理方案、流程和讨论内容。',
    tags: ['工具', '协作'],
  },
  {
    id: 'demo-unsplash',
    title: 'Unsplash - Free high-resolution images',
    url: 'https://unsplash.com/',
    folderPath: '设计灵感/素材资源',
    summary: '寻找真实、清晰的摄影素材和视觉参考。',
    tags: ['设计', '素材'],
  },
  {
    id: 'demo-arc',
    title: 'Arc Browser',
    url: 'https://arc.net/',
    folderPath: '工作效率/常用工具',
    summary: '重新组织标签页与浏览工作流的浏览器体验。',
    tags: ['工具', '效率'],
  },
];

export const DEMO_BOOKMARKS: FlatBookmark[] = demoBookmarks.map(({ summary: _summary, tags: _tags, ...bookmark }) => bookmark);

const ids = (...bookmarkIds: string[]) => bookmarkIds;

export const DEMO_FOLDER_TREE: BookmarkFolderFixture[] = [
  {
    id: 'demo-design',
    title: '设计灵感',
    path: '设计灵感',
    bookmarkIds: ids('demo-figma', 'demo-dribbble', 'demo-mobbin', 'demo-unsplash'),
    children: [
      { id: 'demo-design-product', title: '产品设计', path: '设计灵感/产品设计', bookmarkIds: ids('demo-figma'), children: [] },
      { id: 'demo-design-visual', title: '视觉参考', path: '设计灵感/视觉参考', bookmarkIds: ids('demo-dribbble', 'demo-mobbin'), children: [] },
      { id: 'demo-design-assets', title: '素材资源', path: '设计灵感/素材资源', bookmarkIds: ids('demo-unsplash'), children: [] },
    ],
  },
  {
    id: 'demo-development',
    title: '开发资料',
    path: '开发资料',
    bookmarkIds: ids('demo-github', 'demo-vercel', 'demo-mdn'),
    children: [
      { id: 'demo-development-projects', title: '工程协作', path: '开发资料/工程协作', bookmarkIds: ids('demo-github'), children: [] },
      { id: 'demo-development-frontend', title: '前端工程', path: '开发资料/前端工程', bookmarkIds: ids('demo-vercel', 'demo-mdn'), children: [] },
    ],
  },
  {
    id: 'demo-ai',
    title: 'AI 与研究',
    path: 'AI 与研究',
    bookmarkIds: ids('demo-openai', 'demo-anthropic', 'demo-huggingface'),
    children: [
      { id: 'demo-ai-platforms', title: '模型平台', path: 'AI 与研究/模型平台', bookmarkIds: ids('demo-openai', 'demo-anthropic'), children: [] },
      { id: 'demo-ai-open', title: '开源模型', path: 'AI 与研究/开源模型', bookmarkIds: ids('demo-huggingface'), children: [] },
    ],
  },
  {
    id: 'demo-productivity',
    title: '工作效率',
    path: '工作效率',
    bookmarkIds: ids('demo-linear', 'demo-notion', 'demo-raycast', 'demo-excalidraw', 'demo-arc'),
    children: [
      { id: 'demo-productivity-projects', title: '项目协作', path: '工作效率/项目协作', bookmarkIds: ids('demo-linear'), children: [] },
      { id: 'demo-productivity-knowledge', title: '知识管理', path: '工作效率/知识管理', bookmarkIds: ids('demo-notion'), children: [] },
      { id: 'demo-productivity-tools', title: '常用工具', path: '工作效率/常用工具', bookmarkIds: ids('demo-raycast', 'demo-excalidraw', 'demo-arc'), children: [] },
    ],
  },
  {
    id: 'demo-learning',
    title: '学习成长',
    path: '学习成长',
    bookmarkIds: ids('demo-coursera', 'demo-youtube'),
    children: [
      { id: 'demo-learning-courses', title: '在线课程', path: '学习成长/在线课程', bookmarkIds: ids('demo-coursera'), children: [] },
      { id: 'demo-learning-video', title: '视频课程', path: '学习成长/视频课程', bookmarkIds: ids('demo-youtube'), children: [] },
    ],
  },
  {
    id: 'demo-reading',
    title: '待读文章',
    path: '待读文章',
    bookmarkIds: ids('demo-smashing', 'demo-a16z', 'demo-nyt'),
    children: [
      { id: 'demo-reading-design', title: '设计与前端', path: '待读文章/设计与前端', bookmarkIds: ids('demo-smashing'), children: [] },
      { id: 'demo-reading-business', title: '产品与商业', path: '待读文章/产品与商业', bookmarkIds: ids('demo-a16z'), children: [] },
      { id: 'demo-reading-news', title: '行业资讯', path: '待读文章/行业资讯', bookmarkIds: ids('demo-nyt'), children: [] },
    ],
  },
];

export const DEMO_CLASSIFY_RESULT: ClassifyResult = {
  tree: [],
  labels: Object.fromEntries(demoBookmarks.map((bookmark) => [bookmark.id, {
    id: bookmark.id,
    summary: bookmark.summary,
    tags: bookmark.tags,
  }])),
  createdAt: 0,
};
