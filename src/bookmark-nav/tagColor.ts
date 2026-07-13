/** Stable tag color — matches workspace style (dot + chip). */
const TAG_PALETTE = [
  '#0A84FF', '#30D158', '#FF9F0A', '#FF375F', '#BF5AF2',
  '#64D2FF', '#FFD60A', '#FF6482', '#5E5CE6', '#AC8E68',
  '#32ADE6', '#34C759', '#FF9500', '#AF52DE', '#FF2D55',
  '#5856D6', '#00C7BE', '#A2845E',
];

export function getTagColor(tag: string): string {
  const text = String(tag || '').trim();
  if (!text) return TAG_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}

/** Soft background derived from solid tag color */
export function getTagSoftBackground(color: string): string {
  // Prefer modern color-mix when available in CSS; fallback for style attr
  return color.startsWith('hsl')
    ? color.replace('hsl(', 'hsla(').replace(')', ', 0.14)')
    : `${color}22`;
}
