/** Stable tag color — matches workspace style (dot + chip). */
export type TagColorMap = Record<string, string>;

export function getTagColor(tag: string, tagColors: TagColorMap = {}): string {
  const text = String(tag || '').trim();
  if (!text) return 'hsl(0, 60%, 50%)';
  if (tagColors[text]) return tagColors[text];
  const hue = Array.from(text).reduce((total, char) => total + char.charCodeAt(0), 0) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}
