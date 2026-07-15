import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function importTypeScript(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const {
  checkFolderDeletion,
  createCategoryWithBookmarks,
  deleteEmptyFolder,
  deleteNode,
  moveBookmark,
  moveBookmarks,
  removeBookmarksFromPlan,
} = await importTypeScript('src/core/treeEdit.ts');

const treeWithBookmarks = [
  {
    name: '工作',
    bookmarkIds: ['work-home'],
    children: [
      { name: '项目', bookmarkIds: ['project-doc', 'project-repo'] },
      { name: '空子目录', children: [] },
    ],
  },
  { name: '空目录', children: [] },
];

const deletionCheck = checkFolderDeletion(treeWithBookmarks, [0]);
assert.deepEqual(deletionCheck, {
  canDelete: false,
  bookmarkCount: 3,
  folderName: '工作',
});
assert.deepEqual(
  deleteEmptyFolder(treeWithBookmarks, [0]),
  treeWithBookmarks,
  '包含直接或嵌套书签的目录不得被删除',
);
assert.deepEqual(
  deleteNode(treeWithBookmarks, [0]),
  treeWithBookmarks,
  '兼容入口 deleteNode 也不得再将书签自动转移到其他目录',
);
assert.deepEqual(
  treeWithBookmarks,
  [
    {
      name: '工作',
      bookmarkIds: ['work-home'],
      children: [
        { name: '项目', bookmarkIds: ['project-doc', 'project-repo'] },
        { name: '空子目录', children: [] },
      ],
    },
    { name: '空目录', children: [] },
  ],
  '删除检查不得修改原始方案树',
);

assert.deepEqual(
  checkFolderDeletion(treeWithBookmarks, [1]),
  { canDelete: true, bookmarkCount: 0, folderName: '空目录' },
);
assert.deepEqual(
  deleteEmptyFolder(treeWithBookmarks, [1]),
  [
    {
      name: '工作',
      bookmarkIds: ['work-home'],
      children: [
        { name: '项目', bookmarkIds: ['project-doc', 'project-repo'] },
        { name: '空子目录', children: [] },
      ],
    },
  ],
  '只有完全为空的目录可以删除',
);
assert.deepEqual(
  checkFolderDeletion(treeWithBookmarks, [9]),
  { canDelete: false, bookmarkCount: 0, folderName: '' },
  '不存在的路径不能被当作可删除目录',
);

const editableTree = [
  {
    name: '来源',
    bookmarkIds: ['a', 'b'],
    children: [{ name: '子分类', bookmarkIds: ['c'] }],
  },
  { name: '目标', bookmarkIds: ['d'] },
];

assert.deepEqual(
  moveBookmark(editableTree, 'a', [1]),
  [
    {
      name: '来源',
      bookmarkIds: ['b'],
      children: [{ name: '子分类', bookmarkIds: ['c'] }],
    },
    { name: '目标', bookmarkIds: ['d', 'a'] },
  ],
  '现有单书签拖拽入口应继续可用',
);

assert.deepEqual(
  moveBookmarks(editableTree, ['c', 'a'], [1], 1),
  [
    {
      name: '来源',
      bookmarkIds: ['b'],
      children: [{ name: '子分类', bookmarkIds: [] }],
    },
    { name: '目标', bookmarkIds: ['d', 'a', 'c'] },
  ],
  '批量移动按方案树原有顺序保留书签，并支持指定插入位置',
);

assert.deepEqual(
  moveBookmarks(
    [{ name: '目标', bookmarkIds: ['x', 'y', 'z'] }],
    ['x', 'z'],
    [0],
    2,
  ),
  [{ name: '目标', bookmarkIds: ['y', 'x', 'z'] }],
  '同一目录内批量调整顺序时应按删除后的正确索引插入',
);

assert.deepEqual(
  createCategoryWithBookmarks(editableTree, '新分类', ['b', 'c']),
  [
    {
      name: '来源',
      bookmarkIds: ['a'],
      children: [{ name: '子分类', bookmarkIds: [] }],
    },
    { name: '目标', bookmarkIds: ['d'] },
    { name: '新分类', bookmarkIds: ['b', 'c'] },
  ],
  '批量移动到新分类必须在同一次方案更新中创建分类并保留书签相对顺序',
);

assert.deepEqual(
  removeBookmarksFromPlan(editableTree, ['b', 'c', 'missing']),
  [
    {
      name: '来源',
      bookmarkIds: ['a'],
      children: [{ name: '子分类', bookmarkIds: [] }],
    },
    { name: '目标', bookmarkIds: ['d'] },
  ],
  '从方案移除只取消分类归属，不会把书签转移到其他分类',
);

console.log('tree edit safety checks passed');
