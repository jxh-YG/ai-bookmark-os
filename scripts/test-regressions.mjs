import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';

async function importTypeScript(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function readFunctionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `未找到函数 ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  assert.fail(`函数 ${name} 缺少闭合括号`);
}

async function testTreeEditing() {
  const { deleteNode } = await importTypeScript('src/core/treeEdit.ts');
  const next = deleteNode(
    [{ name: '开发', bookmarkIds: ['1'], children: [{ name: '前端', bookmarkIds: ['2'] }] }],
    [0],
  );
  assert.deepEqual(next, [{ name: '其他', bookmarkIds: ['1', '2'] }]);
}

async function testApplyRecoveryPoint() {
  const events = [];
  let createdIndex = 0;
  let storedApplyRecord = null;
  globalThis.chrome = {
    bookmarks: {
      getTree: async () => [{ id: '0', children: [{ id: 'bar', title: '书签栏', children: [] }] }],
      getChildren: async () => [],
      create: async (options) => {
        events.push(`create:${options.title}`);
        createdIndex += 1;
        return { id: `folder-${createdIndex}`, ...options };
      },
      get: async (id) => [{ id, parentId: 'old-folder', index: 0 }],
      move: async (id) => {
        events.push(`move:${id}`);
        return { id };
      },
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async (value) => {
          if (value.applyRecord) {
            storedApplyRecord = structuredClone(value.applyRecord);
            events.push('save:applyRecord');
          }
        },
      },
    },
  };

  const { applyToBookmarks } = await importTypeScript('src/core/bookmarks.ts');
  await applyToBookmarks([{ name: '开发', bookmarkIds: ['bookmark-1'] }]);

  assert.equal(events[0], 'create:✨ AI 整理');
  assert.ok(storedApplyRecord, '移动前必须建立撤销记录');
  assert.ok(
    events.indexOf('save:applyRecord') < events.indexOf('move:bookmark-1'),
    '撤销记录必须先于书签移动落盘',
  );
}

async function testApplyDoesNotOverwriteUndo() {
  let created = false;
  globalThis.chrome = {
    bookmarks: {
      getTree: async () => {
        created = true;
        return [];
      },
    },
    storage: {
      local: {
        get: async () => ({
          applyRecord: { createdAt: Date.now(), rootFolderId: 'existing', moves: [] },
        }),
      },
    },
  };

  const { applyToBookmarks } = await importTypeScript('src/core/bookmarks.ts');
  await assert.rejects(
    () => applyToBookmarks([{ name: '开发', bookmarkIds: [] }]),
    /撤销|undo/i,
  );
  assert.equal(created, false, '存在撤销记录时不得开始新的应用');
}

async function testUndoKeepsUnrestoredBookmarks() {
  const record = {
    createdAt: Date.now(),
    rootFolderId: 'ai-root',
    moves: [
      { id: 'bookmark-1', oldParentId: 'old-folder', oldIndex: 0 },
      { id: 'bookmark-2', oldParentId: 'missing-folder', oldIndex: 1 },
    ],
  };
  let removedTree = false;
  let removedRecord = false;
  let savedRecord = null;

  globalThis.chrome = {
    bookmarks: {
      move: async (id) => {
        if (id === 'bookmark-2') throw new Error('parent missing');
        return { id };
      },
      getSubTree: async () => [{
        id: 'ai-root',
        children: [{ id: 'bookmark-2', url: 'https://example.com' }],
      }],
      removeTree: async () => {
        removedTree = true;
      },
    },
    storage: {
      local: {
        get: async () => ({ applyRecord: record }),
        set: async (value) => {
          if (value.applyRecord) savedRecord = structuredClone(value.applyRecord);
        },
        remove: async () => {
          removedRecord = true;
        },
      },
    },
  };

  const { undoApply } = await importTypeScript('src/core/bookmarks.ts');
  const restored = await undoApply();

  assert.equal(restored, 1);
  assert.equal(removedTree, false, '存在未恢复书签时不得递归删除 AI 目录');
  assert.equal(removedRecord, false, '部分恢复失败时应保留撤销记录');
  assert.deepEqual(savedRecord?.moves, [record.moves[1]]);
}

function testUiContracts() {
  const rootOptions = read('options.html');
  const popup = read('src/timeline/pages/popup/popup.js');
  const standalone = read('src/timeline/pages/standalone/standalone.js');
  const settings = read('src/timeline/pages/settings/settings.html');
  const settingsScript = read('src/timeline/pages/settings/settings.js');
  const background = read('src/timeline/background/background.js');

  assert.match(rootOptions, /<script\s+src=["']options\.js["']><\/script>/, '开发态设置重定向必须使用外部脚本');
  assert.doesNotMatch(rootOptions, /<script>\s*location\.replace/, 'Manifest V3 页面不得使用内联重定向脚本');

  assert.match(
    popup,
    /timelineEmpty\.style\.display\s*=\s*allBookmarks\.length\s*===\s*0\s*&&\s*!hasActiveFilter\s*\?\s*['"]flex['"]\s*:\s*['"]none['"]/,
    '弹窗无书签时应显示首次使用空态',
  );
  assert.match(
    standalone,
    /if\s*\(\s*!bookmarks\s*\|\|\s*bookmarks\.length\s*===\s*0\s*\)[\s\S]{0,500}saTimelineView\.style\.display\s*=\s*['"]none['"]/,
    '工作台空数据时应隐藏占位视图，避免把空态推到首屏之外',
  );
  assert.match(settings, /<kbd[^>]*>\s*bk\s*<\/kbd>/, '设置页必须显示 manifest 的 bk 关键词');
  assert.match(
    standalone,
    /const\s+res\s*=\s*await chrome\.runtime\.sendMessage\(\{\s*action:\s*['"]togglePin['"][\s\S]{0,180}res\s*&&\s*res\.success/,
    '置顶操作必须检查后台业务结果',
  );
  assert.match(
    standalone,
    /const\s+updated\s*=\s*await updateBookmark\([\s\S]{0,180}if\s*\(\s*!updated\s*\)\s*return/,
    '编辑失败后不得继续移动书签或显示成功',
  );
  assert.match(
    background,
    /bookmarks\.onRemoved\.addListener[\s\S]{0,900}action:\s*['"]bookmarksDeleted['"]/,
    '原生书签删除后必须广播刷新事件',
  );
  assert.match(
    background,
    /bookmarks\.onMoved\.addListener[\s\S]{0,1800}stored\.parentId\s*=\s*moveInfo\.parentId/,
    '原生书签移动后必须更新本地镜像的 parentId',
  );
  assert.match(
    background,
    /bookmarks\.onMoved\.addListener[\s\S]{0,2200}stored\.folderPath\s*=\s*folderPath/,
    '原生书签移动后必须更新本地镜像的 folderPath',
  );
  assert.match(
    background,
    /bookmarks\.onMoved\.addListener[\s\S]{0,2600}action:\s*['"]bookmarksUpdated['"]/,
    '原生书签移动后必须广播页面刷新',
  );
  assert.match(popup, /message\.action\s*===\s*['"]bookmarksDeleted['"]/, '弹窗必须响应删除广播');
  assert.match(standalone, /msg\.action\s*===\s*['"]bookmarksDeleted['"]/, '工作台必须响应删除广播');

  const standaloneEdit = readFunctionBody(standalone, 'startApp').includes('saEditSave')
    ? standalone.slice(standalone.indexOf("saEditSave.addEventListener('click'"))
    : standalone;
  assert.match(
    standaloneEdit,
    /const\s+bookmarkId\s*=\s*editingBookmarkId/,
    '工作台保存编辑时必须在关闭弹窗前捕获书签 ID',
  );
  assert.match(
    standaloneEdit,
    /const\s+targetFolderId\s*=\s*editingFolderId/,
    '工作台保存编辑时必须在关闭弹窗前捕获目标文件夹',
  );
  assert.match(
    standaloneEdit,
    /await\s+updateBookmark\(\s*bookmarkId\s*,/,
    '工作台保存编辑必须使用稳定捕获的书签 ID',
  );

  const popupEdit = readFunctionBody(popup, 'handleEditSave');
  assert.ok(
    popupEdit.indexOf("action: 'updateBookmark'") < popupEdit.indexOf('chrome.bookmarks.move'),
    '弹窗编辑必须先确认内容更新成功，再移动书签文件夹',
  );

  const popupPin = readFunctionBody(popup, 'togglePin');
  assert.match(
    popupPin,
    /else\s*\{[\s\S]*showToast\(\s*i18n\(['"]saveFailed['"]\)/,
    '弹窗置顶业务失败时必须向用户显示错误反馈',
  );

  assert.match(
    background,
    /const\s+filtered\s*=\s*bookmarks\.filter\(\(b\)\s*=>\s*b\.id\s*!==\s*message\.id\);/,
    '单条删除只能从本地镜像移除目标书签 ID',
  );
  const popupDelete = readFunctionBody(popup, 'deleteBookmark');
  assert.match(
    popupDelete,
    /allBookmarks\s*=\s*allBookmarks\.filter\(\(b\)\s*=>\s*b\.id\s*!==\s*id\);/,
    '弹窗单条删除不得隐藏同 URL 的其他书签',
  );

  const saveAIConfig = readFunctionBody(settingsScript, 'saveAIConfig');
  assert.match(
    saveAIConfig,
    /const\s+res\s*=\s*await\s+chrome\.runtime\.sendMessage/,
    'AI 设置保存必须读取后台业务结果',
  );
  assert.match(
    saveAIConfig,
    /if\s*\(\s*!res\s*\|\|\s*!res\.success\s*\)\s*throw/,
    'AI 设置后台保存失败时不得显示成功',
  );
}

await testTreeEditing();
await testApplyRecoveryPoint();
await testApplyDoesNotOverwriteUndo();
await testUndoKeepsUnrestoredBookmarks();
testUiContracts();

console.log('regression checks passed');
