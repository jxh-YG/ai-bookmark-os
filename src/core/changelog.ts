// 版本更新日志：商店自动更新后向用户展示「新版本内容」弹窗
// 新版本发布时在此追加条目（新版本放最前）

export interface ChangelogEntry {
  version: string;
  zh: string[];
  en: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.5.1',
    zh: [
      'Chrome 应用商店支持多语言展示：新增 _locales 元数据',
      '支持开发者入口改为 GitHub Star 引导，不再包含金钱捐赠通道',
      '设置页新增报告问题与作者 GitHub 入口',
    ],
    en: [
      'Chrome Web Store multilingual listing support via _locales metadata',
      'Support page now points to GitHub Star instead of monetary donations',
      'Options page now includes issue reporting and author GitHub links',
    ],
  },
  {
    version: '0.5.0',
    zh: [
      '新增版本更新提示：自动更新后首次打开会展示新功能说明',
      '死链检测进度与分类过程统一为流光动效',
      '修复背景流光动画循环接缝',
    ],
    en: [
      'What\u2019s-new dialog after automatic updates',
      'Dead-link check now shares the animated progress style',
      'Seamless looping flow background',
    ],
  },
  {
    version: '0.4.0',
    zh: [
      '数据导出/导入：分类结果与缓存可备份恢复，重装不丢失',
      'Meta 增强：无意义标题的书签自动抓取页面描述辅助分类',
      '保结构重分类：手动调整过的分类在重新分类时保留',
      '设置跨设备漫游（API Key 永不同步）',
      '重复检测增强：忽略锚点、跟踪参数、www 前缀等差异',
    ],
    en: [
      'Data export / import: back up and restore classification without re-spending API quota',
      'Meta enrichment for bookmarks with meaningless titles',
      'Structure-preserving re-classify keeps your manual curation',
      'Settings roam across devices (API key never syncs)',
      'Stronger duplicate detection (hash, tracking params, www)',
    ],
  },
  {
    version: '0.3.0',
    zh: [
      '首次使用三步引导，可跳过',
      '试分类前 20 条快速预览',
      '分类前成本预估',
      '搜索支持 AI 标签',
      '两级死链检测：确定死链与疑似失效分组，登录后可单条重检',
    ],
    en: [
      'Three-step onboarding (skippable)',
      'Trial classify for the first 20 bookmarks',
      'Cost estimate before a full run',
      'Search matches AI tags',
      'Two-tier dead-link detection with per-item recheck',
    ],
  },
];

/**
 * 取 prevVersion（不含）到 currentVersion（含）之间的所有更新条目。
 * 版本号比较仅支持 x.y.z 数字格式。
 */
export function entriesSince(prevVersion: string, currentVersion: string): ChangelogEntry[] {
  const cmp = (a: string, b: string): number => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const d = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  };
  return CHANGELOG.filter((e) => cmp(e.version, prevVersion) > 0 && cmp(e.version, currentVersion) <= 0);
}
