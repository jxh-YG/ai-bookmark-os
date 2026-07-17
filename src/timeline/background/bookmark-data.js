/* Shared, side-effect-free bookmark data rules for the service worker. */
(function attachBookmarkData(global) {
  function text(value) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  }

  function normalizeUrl(value) {
    try {
      const parsed = new URL(String(value || '').trim());
      if (!/^(https?|ftp):$/.test(parsed.protocol) || !parsed.hostname) return '';
      parsed.protocol = parsed.protocol.toLowerCase();
      parsed.hostname = parsed.hostname.toLowerCase();
      parsed.hash = '';
      if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) {
        parsed.port = '';
      }
      const parameters = [...parsed.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
        const keyComparison = leftKey.localeCompare(rightKey);
        return keyComparison || leftValue.localeCompare(rightValue);
      });
      parsed.search = '';
      for (const [key, parameterValue] of parameters) parsed.searchParams.append(key, parameterValue);
      return parsed.toString();
    } catch {
      return '';
    }
  }

  function normalizeFolderPath(value) {
    return String(value || '')
      .split(/[\\/]+/)
      .map(text)
      .filter(Boolean)
      .join('/');
  }

  function normalizeTags(tags) {
    const unique = new Map();
    for (const rawTag of tags || []) {
      const tag = text(typeof rawTag === 'string' ? rawTag : rawTag && rawTag.tag).replace(/^#+/, '').replace(/\s+/g, ' ').slice(0, 24);
      if (tag && !unique.has(tag.toLocaleLowerCase())) unique.set(tag.toLocaleLowerCase(), tag);
    }
    return [...unique.values()].slice(0, 8);
  }

  function addFolderPath(folders, path) {
    const parts = normalizeFolderPath(path).split('/').filter(Boolean);
    let parentKey = '';
    for (const title of parts) {
      const key = parentKey ? `${parentKey}/${title}` : title;
      if (!folders.has(key)) folders.set(key, { key, parentKey, title });
      parentKey = key;
    }
  }

  function buildImportPlan({ incoming, existing, folders: sourceFolders = [], rootTitle, rootDate, duplicateStrategy = 'merge' }) {
    const rootPath = normalizeFolderPath(`${text(rootTitle) || 'AI Bookmark OS Import'}/${text(rootDate) || 'import'}`);
    const existingByLocation = new Map();
    for (const item of existing || []) {
      const url = normalizeUrl(item && item.url);
      const folderPath = normalizeFolderPath(item && item.folderPath);
      if (url && folderPath) existingByLocation.set(`${folderPath}\n${url}`, item);
    }

    const folders = new Map();
    const create = [];
    const skipped = [];
    const merge = [];
    const invalid = [];
    const plannedKeys = new Set();

    for (const sourcePath of sourceFolders || []) {
      const normalized = normalizeFolderPath(sourcePath);
      if (normalized) addFolderPath(folders, `${rootPath}/${normalized}`);
    }

    for (const source of incoming || []) {
      const url = normalizeUrl(source && source.url);
      if (!url) {
        invalid.push({ item: source, reason: 'unsupported_url' });
        continue;
      }
      const sourcePath = normalizeFolderPath(source && source.folderPath);
      const folderKey = normalizeFolderPath(sourcePath ? `${rootPath}/${sourcePath}` : rootPath);
      const duplicateKey = `${folderKey}\n${url}`;
      const existingItem = existingByLocation.get(duplicateKey);
      const metadata = {
        ...source,
        id: '',
        parentId: '',
        title: text(source && source.title) || url,
        url,
        folderPath: folderKey,
        folderName: folderKey.split('/').pop() || '',
        tags: normalizeTags(source && source.tags),
        pinned: !!(source && source.pinned),
      };

      if (existingItem || plannedKeys.has(duplicateKey)) {
        const duplicate = existingItem || create.find(item => item.duplicateKey === duplicateKey);
        if (duplicateStrategy === 'merge' && duplicate && duplicate.id) {
          merge.push({ existingId: duplicate.id, metadata });
        } else {
          skipped.push({ item: source, reason: 'duplicate_in_destination', existingId: duplicate && duplicate.id || '' });
        }
        continue;
      }

      plannedKeys.add(duplicateKey);
      addFolderPath(folders, folderKey);
      create.push({ folderKey, duplicateKey, metadata });
    }

    return { rootPath, folders: [...folders.values()], create, skipped, merge, invalid };
  }

  function buildRestoredBookmark(item, validParentIds) {
    const originalParentId = text(item && item.parentId);
    const hasOriginalParent = !!originalParentId && validParentIds && validParentIds.has(originalParentId);
    const index = Number.isInteger(item && item.index) && item.index >= 0 ? item.index : undefined;
    const create = {
      parentId: hasOriginalParent ? originalParentId : '',
      title: text(item && item.title) || text(item && item.url),
      url: text(item && item.url),
    };
    if (index !== undefined && hasOriginalParent) create.index = index;
    return {
      create,
      restoredToFallback: !hasOriginalParent,
      metadata: {
        ...(item || {}),
        tags: normalizeTags(item && item.tags),
        pinned: !!(item && item.pinned),
      },
    };
  }

  function buildCheckerSummary(results, timestamp) {
    const all = Array.isArray(results) ? results : [];
    const pendingCleanup = all.filter(item => item && item.status === 'broken').map(item => ({
      id: item.bookmark && item.bookmark.id || '',
      title: item.bookmark && item.bookmark.title || '',
      url: item.bookmark && item.bookmark.url || '',
      message: item.message || '',
      status: 'confirmed_broken',
    }));
    return {
      timestamp: Number(timestamp) || Date.now(),
      total: all.length,
      ok: all.filter(item => item && item.status === 'ok').length,
      broken: pendingCleanup.length,
      warning: all.filter(item => item && item.status === 'warning').length,
      pendingCleanup,
      brokenUrls: pendingCleanup,
    };
  }

  global.BookmarkData = {
    normalizeUrl,
    normalizeFolderPath,
    normalizeTags,
    buildImportPlan,
    buildRestoredBookmark,
    buildCheckerSummary,
  };
})(globalThis);
