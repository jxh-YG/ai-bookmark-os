/** Stable tag color — matches workspace style (dot + chip). */
export type TagColorMap = Record<string, string>;

/**
 * Preset category colors — mirror of DOMAIN_RULES tag colors in
 * src/timeline/shared/smart-tagger.js. Keeps preset category tags visually
 * consistent between the popup and this workspace. Keep in sync when the
 * smart-tagger category set changes.
 */
const CATEGORY_COLORS: Readonly<TagColorMap> = {
  开发: '#4285f4',
  文档: '#0f9d58',
  设计: '#e91e63',
  学习: '#ff9800',
  视频: '#f44336',
  阅读: '#9c27b0',
  工具: '#00bcd4',
  资讯: '#795548',
  购物: '#ff5722',
  音乐: '#1db954',
  金融: '#ffc107',
  旅行: '#009688',
  AI: '#673ab7',
  游戏: '#7c4dff',
  健康: '#4caf50',
  法律: '#5d4037',
  摄影: '#e040fb',
  社交: '#2196f3',
  区块链: '#ff6f00',
  学术: '#00838f',
  美食: '#ff9800',
  汽车: '#607d8b',
  房产: '#795548',
  政务: '#b71c1c',
  体育: '#2e7d32',
  数据: '#0277bd',
};

export function getTagColor(tag: string, tagColors: TagColorMap = {}): string {
  const text = String(tag || '').trim();
  if (!text) return 'hsl(0, 60%, 50%)';
  if (tagColors[text]) return tagColors[text];
  if (CATEGORY_COLORS[text]) return CATEGORY_COLORS[text];
  const hue = Array.from(text).reduce((total, char) => total + char.charCodeAt(0), 0) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}
