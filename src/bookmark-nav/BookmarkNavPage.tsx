import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  AlertCircle,
  Bookmark,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { getFlatBookmarks } from '../core/bookmarks';
import { hashUrl } from '../core/cache';
import type { ClassifyResult, FlatBookmark } from '../types';
import { BookmarkCard } from './BookmarkCard';

type LoadStatus = 'loading' | 'ready' | 'empty' | 'error';
type LabelLike = { summary?: string; tags?: string[] };
type LabelCache = Record<string, LabelLike>;
type BookmarkMeta = { title: string; description: string };
type BookmarkMetaMap = Record<string, BookmarkMeta>;

interface BookmarkFolderNode {
  id: string;
  title: string;
  path: string;
  bookmarkIds: string[];
  children: BookmarkFolderNode[];
}

function canUseBookmarksApi() {
  return typeof chrome !== 'undefined' && !!chrome.bookmarks?.getTree;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function uniqueStrings(values: Array<string | undefined>, limit = 3) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = value?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getFaviconUrl(url: string) {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(`_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`);
  }
  return '';
}

function cleanMetaText(value = '') {
  return value.replace(/\s+/g, ' ').replace(/&nbsp;/gi, ' ').trim();
}

function inferTags(bookmark: FlatBookmark) {
  const text = `${bookmark.title} ${bookmark.url} ${bookmark.folderPath}`.toLowerCase();
  const folderParts = bookmark.folderPath.split('/').filter(Boolean);
  const rules: Array<[RegExp, string]> = [
    [/github|gitlab|npm|api|docs|developer|dev|code|前端|后端|开发|编程|技术|文档/, '开发技术'],
    [/figma|design|icon|ui|ux|素材|设计|图片|photo|image/, '设计资源'],
    [/learn|course|tutorial|教程|学习|课程|大学|school/, '学习教程'],
    [/news|blog|medium|日报|周刊|资讯|新闻/, '新闻资讯'],
    [/tool|app|convert|compress|效率|工具|管理|自动化/, '效率工具'],
    [/cloud|server|aws|azure|aliyun|腾讯云|云服务/, '云服务'],
    [/data|chart|analytics|table|数据库|数据/, '数据分析'],
    [/shop|buy|store|mall|taobao|jd|amazon|购物|商品/, '购物消费'],
    [/video|music|movie|game|bilibili|youtube|娱乐|游戏|视频/, '影音娱乐'],
  ];
  const matched = rules.filter(([rule]) => rule.test(text)).map(([, tag]) => tag);
  return uniqueStrings([...matched, folderParts[folderParts.length - 1], getHostname(bookmark.url)], 3);
}

function buildSummary(bookmark: FlatBookmark, label?: LabelLike, meta?: BookmarkMeta) {
  const labelSummary = cleanMetaText(label?.summary);
  if (labelSummary) return labelSummary;
  const metaDescription = cleanMetaText(meta?.description);
  if (metaDescription) return metaDescription.slice(0, 120);
  const metaTitle = cleanMetaText(meta?.title);
  if (metaTitle && metaTitle !== bookmark.title) return `${metaTitle}。`;
  const folderParts = bookmark.folderPath.split('/').filter(Boolean);
  const folder = folderParts[folderParts.length - 1];
  const hostname = getHostname(bookmark.url);
  if (folder) return `${folder} 文件夹中来自 ${hostname} 的收藏内容。`;
  return `${hostname} 上收藏的「${bookmark.title || '网页'}」相关内容。`;
}

function isSupportedBookmarkUrl(url: string) {
  return /^(https?|ftp):/.test(url);
}

function buildFolderTree(nodes: chrome.bookmarks.BookmarkTreeNode[], path: string[] = []): BookmarkFolderNode[] {
  const folders: BookmarkFolderNode[] = [];

  for (const node of nodes) {
    if (node.url || !node.children) continue;

    const nextPath = node.title ? [...path, node.title] : path;
    const children = buildFolderTree(node.children, nextPath);
    const directBookmarkIds = node.children
      .filter((child) => child.url && isSupportedBookmarkUrl(child.url))
      .map((child) => child.id);
    const bookmarkIds = [...directBookmarkIds, ...children.flatMap((child) => child.bookmarkIds)];

    if (node.title) {
      folders.push({
        id: node.id,
        title: node.title,
        path: nextPath.join('/'),
        bookmarkIds,
        children,
      });
    } else {
      folders.push(...children);
    }
  }

  return folders;
}

function findFolder(nodes: BookmarkFolderNode[], id: string): BookmarkFolderNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findFolder(node.children, id);
    if (child) return child;
  }
  return null;
}

function countFolders(nodes: BookmarkFolderNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countFolders(node.children), 0);
}

function FolderNavItems({
  nodes,
  activeId,
  expandedIds,
  onSelect,
  onToggle,
  depth = 0,
}: {
  nodes: BookmarkFolderNode[];
  activeId: string;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  depth?: number;
}) {
  return (
    <>
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const isExpanded = expandedIds.has(node.id);
        return (
          <div className="folder-nav-group" key={node.id}>
            <div
              className={`folder-nav-row ${activeId === node.id ? 'is-active' : ''}`}
              style={{ '--folder-depth': depth } as CSSProperties}
            >
              <button
                type="button"
                className="folder-nav-toggle"
                onClick={() => hasChildren && onToggle(node.id)}
                disabled={!hasChildren}
                aria-label={hasChildren ? `${isExpanded ? '收起' : '展开'} ${node.title}` : undefined}
                aria-expanded={hasChildren ? isExpanded : undefined}
              >
                {hasChildren ? (
                  isExpanded ? <ChevronDown size={14} strokeWidth={2.2} /> : <ChevronRight size={14} strokeWidth={2.2} />
                ) : null}
              </button>
              <button type="button" className="folder-nav-item" onClick={() => onSelect(node.id)} title={node.path}>
                <FolderKanban size={16} strokeWidth={2} aria-hidden="true" />
                <span>{node.title}</span>
                <strong>{node.bookmarkIds.length}</strong>
              </button>
            </div>
            {hasChildren && isExpanded ? (
              <FolderNavItems
                nodes={node.children}
                activeId={activeId}
                expandedIds={expandedIds}
                onSelect={onSelect}
                onToggle={onToggle}
                depth={depth + 1}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export function BookmarkNavPage() {
  const [bookmarks, setBookmarks] = useState<FlatBookmark[]>([]);
  const [folderTree, setFolderTree] = useState<BookmarkFolderNode[]>([]);
  const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(null);
  const [labelCache, setLabelCache] = useState<LabelCache>({});
  const [bookmarkMeta, setBookmarkMeta] = useState<BookmarkMetaMap>({});
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [activeFolderId, setActiveFolderId] = useState('all');
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set());

  const loadBookmarks = useCallback(async () => {
    setStatus('loading');
    setError('');

    if (!canUseBookmarksApi()) {
      setStatus('error');
      setError('请在已加载的 Chrome 扩展中打开 AI 书签导航页面。');
      return;
    }

    try {
      const [items, storage] = await Promise.all([
        getFlatBookmarks(),
        chrome.storage.local.get(['classifyResult', 'labelCache']),
      ]);
      const tree = await chrome.bookmarks.getTree();
      const nextFolderTree = buildFolderTree(tree);
      setBookmarks(items.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')));
      setFolderTree(nextFolderTree);
      setActiveFolderId((current) => (current !== 'all' && !findFolder(nextFolderTree, current) ? 'all' : current));
      setClassifyResult(storage.classifyResult ?? null);
      setLabelCache(storage.labelCache ?? {});
      setExpandedFolderIds((current) => {
        const valid = new Set<string>();
        const collect = (nodes: BookmarkFolderNode[]) => {
          for (const node of nodes) {
            valid.add(node.id);
            collect(node.children);
          }
        };
        collect(nextFolderTree);
        const kept = new Set([...current].filter((id) => valid.has(id)));
        if (!kept.size) nextFolderTree.forEach((node) => kept.add(node.id));
        return kept;
      });
      setStatus(items.length ? 'ready' : 'empty');
    } catch (err) {
      setStatus('error');
      setError((err as Error).message || '读取书签失败，请稍后重试。');
    }
  }, []);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  const getBookmarkLabel = useCallback((bookmark: FlatBookmark): LabelLike | undefined => {
    return classifyResult?.labels[bookmark.id] ?? labelCache[hashUrl(bookmark.url)];
  }, [classifyResult, labelCache]);

  useEffect(() => {
    if (!canUseBookmarksApi()) return;
    const refresh = () => loadBookmarks();
    chrome.bookmarks.onCreated.addListener(refresh);
    chrome.bookmarks.onRemoved.addListener(refresh);
    chrome.bookmarks.onChanged.addListener(refresh);
    chrome.bookmarks.onMoved.addListener(refresh);
    return () => {
      chrome.bookmarks.onCreated.removeListener(refresh);
      chrome.bookmarks.onRemoved.removeListener(refresh);
      chrome.bookmarks.onChanged.removeListener(refresh);
      chrome.bookmarks.onMoved.removeListener(refresh);
    };
  }, [loadBookmarks]);

  const visibleBookmarks = useMemo(() => {
    const selectedFolder = activeFolderId === 'all' ? null : findFolder(folderTree, activeFolderId);
    const selectedIds = selectedFolder ? new Set(selectedFolder.bookmarkIds) : null;
    const q = normalize(query);

    return bookmarks.filter((bookmark) => {
      const label = classifyResult?.labels[bookmark.id];
      const cacheLabel = labelCache[hashUrl(bookmark.url)];
      const meta = bookmarkMeta[bookmark.id];
      if (selectedIds && !selectedIds.has(bookmark.id)) return false;
      if (!q) return true;
      return [
        bookmark.title,
        bookmark.url,
        bookmark.folderPath,
        label?.summary,
        cacheLabel?.summary,
        meta?.title,
        meta?.description,
        ...(label?.tags ?? []),
        ...(cacheLabel?.tags ?? []),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [activeFolderId, bookmarks, bookmarkMeta, classifyResult, folderTree, labelCache, query]);

  useEffect(() => {
    if (status !== 'ready' || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    const targets = visibleBookmarks
      .filter((bookmark) => {
        const label = getBookmarkLabel(bookmark);
        return !label?.summary && !bookmarkMeta[bookmark.id];
      })
      .slice(0, 18);
    if (!targets.length) return;

    let cancelled = false;
    let cursor = 0;
    const workers = Array.from({ length: 3 }, async () => {
      while (!cancelled && cursor < targets.length) {
        const bookmark = targets[cursor++];
        try {
          const meta = (await chrome.runtime.sendMessage({ type: 'fetchMeta', url: bookmark.url })) as BookmarkMeta | null;
          if (!cancelled && meta && (meta.title || meta.description)) {
            setBookmarkMeta((current) => ({ ...current, [bookmark.id]: meta }));
          }
        } catch {
          // Keep the card usable if the service worker cannot fetch metadata.
        }
      }
    });
    void Promise.all(workers);
    return () => {
      cancelled = true;
    };
  }, [bookmarkMeta, getBookmarkLabel, status, visibleBookmarks]);

  const toggleFolder = useCallback((id: string) => {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openBookmark = useCallback((bookmark: FlatBookmark) => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url: bookmark.url });
      return;
    }
    window.open(bookmark.url, '_blank', 'noopener,noreferrer');
  }, []);

  const totalFolders = useMemo(() => countFolders(folderTree), [folderTree]);

  return (
    <main className="bookmark-nav-shell">
      <header className="bookmark-nav-header">
        <div className="bookmark-nav-brand">
          <div className="bookmark-nav-mark" aria-hidden="true">
            <Bookmark size={22} strokeWidth={2.2} />
          </div>
          <div>
            <p className="bookmark-nav-eyebrow">AI Bookmark OS</p>
            <h1>AI 书签导航</h1>
          </div>
        </div>
        <button className="bookmark-nav-refresh" type="button" onClick={loadBookmarks} disabled={status === 'loading'}>
          {status === 'loading' ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
          <span>刷新</span>
        </button>
      </header>

      <section className="bookmark-nav-toolbar" aria-label="书签筛选">
        <div className="bookmark-nav-search">
          <Search size={18} strokeWidth={2} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、网址、文件夹或 AI 标签"
          />
          {query ? (
            <button type="button" className="bookmark-nav-clear" onClick={() => setQuery('')} aria-label="清空搜索">
              <X size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="bookmark-nav-stats" aria-label="书签统计">
          <span>{bookmarks.length} 个书签</span>
          <span>{totalFolders} 个文件夹</span>
        </div>
      </section>

      <div className="bookmark-nav-content">
        <aside className="bookmark-folder-sidebar" aria-label="浏览器书签树">
          <button
            type="button"
            className={`folder-nav-item folder-nav-item--all ${activeFolderId === 'all' ? 'is-active' : ''}`}
            onClick={() => setActiveFolderId('all')}
          >
            <Bookmark size={16} strokeWidth={2} aria-hidden="true" />
            <span>全部书签</span>
            <strong>{bookmarks.length}</strong>
          </button>
          <div className="folder-nav-scroll">
            <FolderNavItems
              nodes={folderTree}
              activeId={activeFolderId}
              expandedIds={expandedFolderIds}
              onSelect={setActiveFolderId}
              onToggle={toggleFolder}
            />
          </div>
        </aside>

        <div className="bookmark-nav-results">
          {status === 'loading' ? (
            <section className="bookmark-grid" aria-label="正在加载书签">
              {Array.from({ length: 8 }, (_, index) => <div className="bookmark-skeleton" key={index} />)}
            </section>
          ) : null}

          {status === 'error' ? (
            <section className="bookmark-nav-state" role="alert">
              <AlertCircle size={34} strokeWidth={1.8} aria-hidden="true" />
              <h2>加载失败</h2>
              <p>{error}</p>
              <button type="button" onClick={loadBookmarks}>重试</button>
            </section>
          ) : null}

          {status === 'empty' ? (
            <section className="bookmark-nav-state">
              <Bookmark size={34} strokeWidth={1.8} aria-hidden="true" />
              <h2>暂无书签</h2>
              <p>收藏一些网页后，这里会自动生成可浏览的书签导航。</p>
            </section>
          ) : null}

          {status === 'ready' && visibleBookmarks.length === 0 ? (
            <section className="bookmark-nav-state">
              <Search size={34} strokeWidth={1.8} aria-hidden="true" />
              <h2>没有匹配结果</h2>
              <p>换一个文件夹或关键词试试。</p>
            </section>
          ) : null}

          {status === 'ready' && visibleBookmarks.length > 0 ? (
            <section className="bookmark-grid" aria-label="书签列表">
              {visibleBookmarks.map((bookmark) => {
                const label = getBookmarkLabel(bookmark);
                const meta = bookmarkMeta[bookmark.id];
                const tags = uniqueStrings([...(label?.tags ?? []), ...inferTags(bookmark)], 3);
                return (
                  <BookmarkCard
                    key={bookmark.id}
                    bookmark={bookmark}
                    summary={buildSummary(bookmark, label, meta)}
                    tags={tags}
                    faviconUrl={getFaviconUrl(bookmark.url)}
                    onOpen={openBookmark}
                  />
                );
              })}
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
