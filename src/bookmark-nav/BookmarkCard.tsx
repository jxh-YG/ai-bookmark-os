import { ExternalLink, Globe2 } from 'lucide-react';
import type { FlatBookmark } from '../types';
import { getTagColor, getTagSoftBackground } from './tagColor';

interface BookmarkCardProps {
  bookmark: FlatBookmark;
  summary?: string;
  tags?: string[];
  faviconUrl?: string;
  activeTags?: string[];
  onOpen: (bookmark: FlatBookmark) => void;
  onTagClick?: (tag: string) => void;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function BookmarkCard({
  bookmark,
  summary,
  tags = [],
  faviconUrl,
  activeTags = [],
  onOpen,
  onTagClick,
}: BookmarkCardProps) {
  const hostname = getHostname(bookmark.url);
  const title = (bookmark.title || hostname || '未命名书签').trim();
  const displaySummary = summary?.trim() || '';
  const displayTags = tags.filter(Boolean).slice(0, 2);
  const activeSet = new Set(activeTags);

  return (
    <article
      className="bookmark-card"
      tabIndex={0}
      title={`${title}\n${bookmark.url}`}
      onClick={() => onOpen(bookmark)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(bookmark);
        }
      }}
    >
      <div className="bookmark-card__head">
        <div className="bookmark-card__favicon" aria-hidden="true">
          {faviconUrl ? <img src={faviconUrl} alt="" loading="lazy" /> : <Globe2 size={15} strokeWidth={2} />}
        </div>
        <div className="bookmark-card__main">
          <h2 className="bookmark-card__title">{title}</h2>
          <p className="bookmark-card__domain" title={bookmark.url}>{hostname}</p>
        </div>
        <ExternalLink className="bookmark-card__open" size={14} strokeWidth={2} aria-hidden="true" />
      </div>

      {displaySummary ? (
        <p className="bookmark-card__summary" title={displaySummary}>{displaySummary}</p>
      ) : null}

      {displayTags.length > 0 ? (
        <div className="bookmark-card__tags">
          {displayTags.map((tag) => {
            const color = getTagColor(tag);
            const active = activeSet.has(tag);
            return (
              <button
                type="button"
                className={`bookmark-card__tag${active ? ' is-active' : ''}`}
                key={tag}
                title={`筛选标签：${tag}`}
                style={{
                  color,
                  background: getTagSoftBackground(color),
                  borderColor: active ? color : 'transparent',
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onTagClick?.(tag);
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                }}
              >
                <span className="bookmark-card__tag-dot" style={{ background: color }} aria-hidden="true" />
                <span>{tag}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}
