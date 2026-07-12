import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  AlertCircle,
  Bookmark,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  X,
  PanelLeft,
  LayoutGrid,
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
type BookmarkEnrichment = { summary: string; tags: string[] };

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
    const key = text?.toLowerCase();
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
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
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function getUrlParts(url: string) {
  try {
    const parsed = new URL(url);
    return {
      hostname: parsed.hostname.replace(/^www\./, ''),
      pathWords: decodeURIComponent(parsed.pathname)
        .split(/[\W_]+/)
        .filter((part) => part.length > 2)
        .slice(0, 5),
    };
  } catch {
    return { hostname: url, pathWords: [] as string[] };
  }
}

function inferTags(bookmark: FlatBookmark, meta?: BookmarkMeta) {
  const text = `${bookmark.title} ${bookmark.url} ${bookmark.folderPath}`.toLowerCase();
  const metaText = `${meta?.title ?? ''} ${meta?.description ?? ''}`.toLowerCase();
  const folderParts = bookmark.folderPath.split('/').filter(Boolean);
  const rules: Array<[RegExp, string]> = [
    [/github|gitlab|npm|api|docs|developer|dev|code|前端|后端|开发|编程|技术|文档|framework|library/, '开发技术'],
    [/figma|design|icon|ui|ux|素材|设计|图片|photo|image|creative|dribbble|behance/, '设计资源'],
    [/learn|course|tutorial|教程|学习|课程|大学|school|guide|manual/, '学习教程'],
    [/news|blog|medium|日报|周刊|资讯|新闻/, '新闻资讯'],
    [/tool|app|convert|compress|效率|工具|管理|自动化|workflow|productivity/, '效率工具'],
    [/cloud|server|aws|azure|aliyun|腾讯云|云服务/, '云服务'],
    [/data|chart|analytics|table|数据库|数据/, '数据分析'],
    [/shop|buy|store|mall|taobao|jd|amazon|购物|商品/, '购物消费'],
    [/video|music|movie|game|bilibili|youtube|娱乐|游戏|视频/, '影音娱乐'],
    [/ai|llm|gpt|claude|gemini|prompt|模型|智能|机器人/, 'AI 工具'],
    [/finance|bank|stock|pay|invoice|财务|支付|股票|基金/, '财务金融'],
    [/office|work|crm|erp|oa|会议|邮箱|文档|协作|公司|项目/, '办公协作'],
  ];
  const matched = rules.filter(([rule]) => rule.test(text) || rule.test(metaText)).map(([, tag]) => tag);
  const folderTag = folderParts[folderParts.length - 1];
  const hostTag = getHostname(bookmark.url).split('.')[0];
  return uniqueStrings([...matched, folderTag, hostTag], 3);
}

function buildBookmarkEnrichment(bookmark: FlatBookmark, label?: LabelLike, meta?: BookmarkMeta): BookmarkEnrichment {
  const labelSummary = cleanMetaText(label?.summary);
  const labelTags = label?.tags ?? [];
  if (labelSummary) return { summary: labelSummary, tags: uniqueStrings([...labelTags, ...inferTags(bookmark, meta)], 3) };

  const metaDescription = cleanMetaText(meta?.description);
  if (metaDescription) {
    return { summary: metaDescription.slice(0, 132), tags: uniqueStrings([...labelTags, ...inferTags(bookmark, meta)], 3) };
  }

  const metaTitle = cleanMetaText(meta?.title);
  if (metaTitle && metaTitle !== bookmark.title) {
    return {
      summary: `页面标题显示为「${metaTitle}」，适合从当前书签快速回到该站点内容。`,
      tags: uniqueStrings([...labelTags, ...inferTags(bookmark, meta)], 3),
    };
  }

  const folderParts = bookmark.folderPath.split('/').filter(Boolean);
  const folder = folderParts[folderParts.length - 1];
  const { hostname, pathWords } = getUrlParts(bookmark.url);
  const title = bookmark.title || hostname;
  const pathHint = pathWords.length ? `，URL 路径指向 ${pathWords.join(' / ')}` : '';
  const context = folder ? `位于「${folder}」集合` : '来自浏览器书签树';
  return {
    summary: `${context}，站点域名为 ${hostname}${pathHint}。可从「${title}」继续查看对应页面。`,
    tags: uniqueStrings([...labelTags, ...inferTags(bookmark, meta)], 3),
  };
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

function collectFolderIds(nodes: BookmarkFolderNode[], ids = new Set<string>()) {
  for (const node of nodes) {
    ids.add(node.id);
    collectFolderIds(node.children, ids);
  }
  return ids;
}

function collectDefaultExpandedIds(nodes: BookmarkFolderNode[]) {
  const ids = new Set<string>();
  for (const node of nodes) {
    ids.add(node.id);
    for (const child of node.children) {
      if (child.children.length) ids.add(child.id);
    }
  }
  return ids;
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
                onClick={(event) => {
                  event.stopPropagation();
                  if (hasChildren) onToggle(node.id);
                }}
                disabled={!hasChildren}
                aria-label={hasChildren ? `${isExpanded ? '收起' : '展开'} ${node.title}` : undefined}
                aria-expanded={hasChildren ? isExpanded : undefined}
              >
                {hasChildren ? (
                  isExpanded ? <ChevronDown size={14} strokeWidth={2.2} /> : <ChevronRight size={14} strokeWidth={2.2} />
                ) : null}
              </button>
              <button
                type="button"
                className="folder-nav-item"
                onClick={() => onSelect(node.id)}
                onDoubleClick={() => {
                  if (hasChildren) onToggle(node.id);
                }}
                title={node.path}
              >
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
        if (!kept.size) return collectDefaultExpandedIds(nextFolderTree);
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

  const collapseAllFolders = useCallback(() => {
    setExpandedFolderIds(new Set());
  }, []);

  const expandAllFolders = useCallback(() => {
    setExpandedFolderIds(collectFolderIds(folderTree));
  }, [folderTree]);

  const openBookmark = useCallback((bookmark: FlatBookmark) => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url: bookmark.url });
      return;
    }
    window.open(bookmark.url, '_blank', 'noopener,noreferrer');
  }, []);

  const totalFolders = useMemo(() => countFolders(folderTree), [folderTree]);
  const allFoldersExpanded = totalFolders > 0 && expandedFolderIds.size >= totalFolders;
  const activeFolder = useMemo(
    () => (activeFolderId === 'all' ? null : findFolder(folderTree, activeFolderId)),
    [activeFolderId, folderTree],
  );
  const activeTitle = activeFolder?.title ?? '全部书签';
  const activePath = activeFolder?.path ?? '浏览器真实书签树';

  return (
    <main className="bookmark-nav-shell">
      <div className="bookmark-nav-chrome">
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
      </div>

      <div className="bookmark-nav-content">
        <aside className="bookmark-folder-sidebar" aria-label="浏览器书签树">
          <div className="folder-sidebar-head">
            <div>
              <span>真实书签树</span>
              <strong>{totalFolders} 个集合</strong>
            </div>
            <button
              type="button"
              className="folder-sidebar-toggle-all"
              onClick={allFoldersExpanded ? collapseAllFolders : expandAllFolders}
              aria-label={allFoldersExpanded ? '收起全部文件夹' : '展开全部文件夹'}
              disabled={!totalFolders}
            >
              {allFoldersExpanded ? <ChevronsDownUp size={15} aria-hidden="true" /> : <ChevronsUpDown size={15} aria-hidden="true" />}
            </button>
          </div>
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
          <div className="bookmark-results-head">
            <div>
              <span>{activePath}</span>
              <strong>{activeTitle}</strong>
            </div>
            <p>
              <Sparkles size={14} strokeWidth={2} aria-hidden="true" />
              {visibleBookmarks.length} 条可浏览书签
            </p>
          </div>

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
                const enrichment = buildBookmarkEnrichment(bookmark, label, meta);
                return (
                  <BookmarkCard
                    key={bookmark.id}
                    bookmark={bookmark}
                    summary={enrichment.summary}
                    tags={enrichment.tags}
                    faviconUrl={getFaviconUrl(bookmark.url)}
                    onOpen={openBookmark}
                  />
                );
              })}
            </section>
          ) : null}
        </div>
      </div>

      <div className="bookmark-nav-float-actions" aria-label="快捷操作">
        <div className="bookmark-nav-float-actions__inner">
          <button type="button" onClick={() => setActiveFolderId('all')}>
            <LayoutGrid size={15} aria-hidden="true" />
            <span>全部书签</span>
          </button>
          <button type="button" onClick={allFoldersExpanded ? collapseAllFolders : expandAllFolders} disabled={!totalFolders}>
            <PanelLeft size={15} aria-hidden="true" />
            <span>{allFoldersExpanded ? '收起目录' : '展开目录'}</span>
          </button>
          <button type="button" className="is-primary" onClick={loadBookmarks} disabled={status === 'loading'}>
            {status === 'loading' ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
            <span>刷新</span>
          </button>
        </div>
      </div>

      <footer className="bookmark-nav-footer">
        <strong>AI Bookmark OS</strong>
        · 真实书签树 · 玻璃拟态导航 · 本地优先
      </footer>
    </main>
  );
}
