import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/sidepanel/App.tsx', 'utf8');

assert.match(
  app,
  /setSelectedLiveFolderId\(\(current\) => current === folder\.id \? '' : folder\.id\)/,
  '再次点击已选目录必须取消当前树选择',
);
assert.match(app, /<optgroup label="当前草稿">/, '方案选择器必须展示当前草稿分组');
assert.match(app, /<optgroup label="历史版本">/, '方案选择器必须展示历史版本分组');
assert.match(app, /检查兼容性并应用/, '过期或历史方案必须提供兼容性应用入口');
assert.match(app, /历史版本为只读/, '历史版本必须明确以只读方式展示');
assert.match(app, /inspectClassificationPlanCompatibility\(/, '回用方案前必须执行兼容性检查');
assert.match(app, /unplannedBookmarkIds\.length/, '兼容确认框必须展示新增或未纳入方案的书签数');
assert.match(app, /本次不调用 AI/, '兼容确认框必须说明回用不会调用 AI');
assert.match(app, /基于当前书签重新分类/, '不兼容方案必须提供重新分类入口');
assert.match(app, /planVersionId:\s*appliedPlanVersionId/, '变更记录必须关联实际应用的方案版本');
assert.match(app, /classificationPlanArchive/, '工作区必须监听历史版本存储变化');

const historySelectorStart = app.indexOf('<optgroup label="历史版本">');
const historySelectorEnd = app.indexOf('</optgroup>', historySelectorStart);
assert.ok(historySelectorStart >= 0 && historySelectorEnd > historySelectorStart, '必须能定位历史版本选择器');
const historySelector = app.slice(historySelectorStart, historySelectorEnd);
assert.match(historySelector, /归档时间 \{new Date\(version\.archivedAt\)/, '历史版本必须按归档时间展示');
assert.doesNotMatch(historySelector, /version\.createdAt/, '历史版本选择器不得显示与排序不一致的创建时间');

const runClassifyStart = app.indexOf('const runClassify = useCallback');
const runClassifyEnd = app.indexOf('/** 点击分类：先出成本预估确认 */', runClassifyStart);
assert.ok(runClassifyStart >= 0 && runClassifyEnd > runClassifyStart, '必须能定位重新分类流程');
const runClassify = app.slice(runClassifyStart, runClassifyEnd);
const archiveIndex = runClassify.indexOf('await archiveClassificationPlan(replaced)');
const classifyIndex = runClassify.indexOf('const r = await classify(');
assert.ok(archiveIndex >= 0 && classifyIndex >= 0 && archiveIndex < classifyIndex, '旧草稿归档必须在 AI 分类调用前完成');

console.log('classification version UI contract checks passed');
