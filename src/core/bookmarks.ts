// 书签读取、拍平、备份与回写
import type { ApplyRecord, CategoryNode, FlatBookmark, BookmarkBackup } from '../types';

const APPLY_FOLDER_TITLE = '✨ AI 整理';
const BACKUP_KEY = 'bookmarkBackup';
const APPLY_RECORD_KEY = 'applyRecord';

/** 读取并拍平整棵书签树（只保留有 url 的项，过滤无效协议） */
export async function getFlatBookmarks(): Promise<FlatBookmark[]> {
  const tree = await chrome.bookmarks.getTree();
  const result: FlatBookmark[] = [];

  const walk = (nodes: chrome.bookmarks.BookmarkTreeNode[], path: string[]) => {
    for (const node of nodes) {
      if (node.url) {
        if (/^(https?|ftp):/.test(node.url)) {
          result.push({
            id: node.id,
            title: node.title || node.url,
            url: node.url,
            folderPath: path.join('/'),
          });
        }
      } else if (node.children) {
        walk(node.children, node.title ? [...path, node.title] : path);
      }
    }
  };
  walk(tree, []);
  return result;
}

/** 去重：同一 URL 只保留第一条（用于送 LLM 的列表；回写时全部书签都会移动） */
export function dedupeByUrl(bookmarks: FlatBookmark[]): FlatBookmark[] {
  const seen = new Set<string>();
  return bookmarks.filter((b) => {
    if (seen.has(b.url)) return false;
    seen.add(b.url);
    return true;
  });
}

/** 备份当前书签树到 storage.local */
export async function backupBookmarks(): Promise<void> {
  const tree = await chrome.bookmarks.getTree();
  const backup: BookmarkBackup = { createdAt: Date.now(), tree };
  await chrome.storage.local.set({ [BACKUP_KEY]: backup });
}

export async function getBackup(): Promise<BookmarkBackup | null> {
  const data = await chrome.storage.local.get(BACKUP_KEY);
  return data[BACKUP_KEY] ?? null;
}

/** 把书签树备份导出为 Netscape HTML 字符串（可导入回浏览器） */
export function backupToHtml(backup: BookmarkBackup): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const lines: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];
  const walk = (nodes: chrome.bookmarks.BookmarkTreeNode[], indent: string) => {
    for (const node of nodes) {
      if (node.url) {
        lines.push(`${indent}<DT><A HREF="${esc(node.url)}">${esc(node.title)}</A>`);
      } else if (node.children) {
        if (node.title) {
          lines.push(`${indent}<DT><H3>${esc(node.title)}</H3>`);
          lines.push(`${indent}<DL><p>`);
          walk(node.children, indent + '    ');
          lines.push(`${indent}</DL><p>`);
        } else {
          walk(node.children, indent);
        }
      }
    }
  };
  walk(backup.tree, '    ');
  lines.push('</DL><p>');
  return lines.join('\n');
}

export interface ApplyPlan {
  folderCount: number;
  moveCount: number;
}

/** 统计应用计划（用于 diff 预览） */
export function planApply(tree: CategoryNode[]): ApplyPlan {
  let folderCount = 0;
  let moveCount = 0;
  const walk = (nodes: CategoryNode[]) => {
    for (const n of nodes) {
      folderCount++;
      moveCount += n.bookmarkIds?.length ?? 0;
      if (n.children) walk(n.children);
    }
  };
  walk(tree);
  return { folderCount, moveCount };
}

/**
 * 应用分类树到书签：
 * 在书签栏下创建「✨ AI 整理」根文件夹，按树结构建文件夹并移动书签。
 * 调用前必须先 backupBookmarks()。同时记录每条书签原位置供撤销。
 */
export async function applyToBookmarks(
  tree: CategoryNode[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const { moveCount } = planApply(tree);
  let done = 0;

  // 书签栏 id：取根节点第一个子节点（"1" 在 Chrome 中是书签栏，但不要硬编码假设）
  const roots = await chrome.bookmarks.getTree();
  const bar = roots[0].children?.[0];
  if (!bar) throw new Error('未找到书签栏');

  // 若已存在同名整理文件夹，加时间戳避免混淆
  const existing = (await chrome.bookmarks.getChildren(bar.id)).find(
    (n) => !n.url && n.title === APPLY_FOLDER_TITLE,
  );
  const rootTitle = existing
    ? `${APPLY_FOLDER_TITLE} ${new Date().toLocaleString('zh-CN')}`
    : APPLY_FOLDER_TITLE;
  const rootFolder = await chrome.bookmarks.create({ parentId: bar.id, title: rootTitle });

  const record: ApplyRecord = { createdAt: Date.now(), rootFolderId: rootFolder.id, moves: [] };

  const createLevel = async (nodes: CategoryNode[], parentId: string) => {
    for (const n of nodes) {
      const folder = await chrome.bookmarks.create({ parentId, title: n.name });
      if (n.children) await createLevel(n.children, folder.id);
      for (const id of n.bookmarkIds ?? []) {
        try {
          const [node] = await chrome.bookmarks.get(id);
          await chrome.bookmarks.move(id, { parentId: folder.id });
          record.moves.push({
            id,
            oldParentId: node.parentId ?? bar.id,
            oldIndex: node.index ?? 0,
          });
        } catch {
          // 书签可能已被用户删除，跳过
        }
        done++;
        onProgress?.(done, moveCount);
      }
    }
  };
  await createLevel(tree, rootFolder.id);
  await chrome.storage.local.set({ [APPLY_RECORD_KEY]: record });
}

export async function getApplyRecord(): Promise<ApplyRecord | null> {
  const data = await chrome.storage.local.get(APPLY_RECORD_KEY);
  return data[APPLY_RECORD_KEY] ?? null;
}

/**
 * 一键撤销上次应用：把每条书签移回原位置，并删除创建的 AI 整理文件夹。
 * 返回成功移回的数量。
 */
export async function undoApply(
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const record = await getApplyRecord();
  if (!record) return 0;
  let restored = 0;
  // 倒序移回，尽量还原 index 顺序
  const moves = [...record.moves].reverse();
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    try {
      await chrome.bookmarks.move(m.id, { parentId: m.oldParentId, index: m.oldIndex });
      restored++;
    } catch {
      // 原文件夹或书签已不存在，跳过
    }
    onProgress?.(i + 1, moves.length);
  }
  try {
    await chrome.bookmarks.removeTree(record.rootFolderId);
  } catch {
    // 文件夹可能已被用户删除
  }
  await chrome.storage.local.remove(APPLY_RECORD_KEY);
  return restored;
}
