import { ExternalLink, Folder, Globe2 } from 'lucide-react';
import type { FlatBookmark } from '../types';

interface BookmarkCardProps {
  bookmark: FlatBookmark;
  summary?: string;
  tags?: string[];
  faviconUrl?: string;
  onOpen: (bookmark: FlatBookmark) => void;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function BookmarkCard({ bookmark, summary, tags = [], faviconUrl, onOpen }: BookmarkCardProps) {
  const hostname = getHostname(bookmark.url);
  const folder = bookmark.folderPath || '未分类';
  const displaySummary = summary?.trim() || `${hostname} 上收藏的「${bookmark.title || '网页'}」相关内容。`;
  const displayTags = tags.filter(Boolean).slice(0, 3);

  return (
    <article
      className="bookmark-card"
      tabIndex={0}
      onClick={() => onOpen(bookmark)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(bookmark);
        }
      }}
    >
      <div className="bookmark-card__topline">
        <div className="bookmark-card__favicon" aria-hidden="true">
          {faviconUrl ? <img src={faviconUrl} alt="" loading="lazy" /> : <Globe2 size={18} strokeWidth={2} />}
        </div>
        <span className="bookmark-card__domain">{hostname}</span>
        <ExternalLink className="bookmark-card__open" size={16} strokeWidth={2} aria-hidden="true" />
      </div>

      <h2 className="bookmark-card__title">{bookmark.title}</h2>
      <p className="bookmark-card__summary">{displaySummary}</p>

      <div className="bookmark-card__footer">
        <span className="bookmark-card__folder" title={folder}>
          <Folder size={14} strokeWidth={2} aria-hidden="true" />
          <span>{folder}</span>
        </span>
        {displayTags.map((tag) => (
          <span className="bookmark-card__tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>
    </article>
  );
}
