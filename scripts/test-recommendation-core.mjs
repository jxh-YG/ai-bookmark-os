import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { Intl, Map, Math, Number, Object, Set, String };
vm.createContext(context);
vm.runInContext(readFileSync('src/timeline/shared/recommendation-core.js', 'utf8'), context);
const core = context.BookmarkRecommendationCore;

assert.equal(core.RULE_VERSION, 'bookmark-recommendation-v2');
assert.deepEqual({ ...core.EVIDENCE_RELIABILITY }, {
  user_rule: 1,
  curated_domain: 0.90,
  learned_rule: 0.85,
  history_profile: 0.70,
  folder_leaf: 0.70,
  domain_path: 0.65,
  domain: 0.40,
  title_metadata: 0.35,
  content_semantic: 0.30,
  ai: 0.45,
  negative_feedback: -0.60,
});

const sameFamily = core.aggregateEvidence([
  { family: 'domain', strength: 0.5 },
  { family: 'domain', strength: 0.9 },
]);
assert.ok(Math.abs(sameFamily.support - 0.36) < 1e-9, '同一证据族只应保留最强贡献');

const independentFamilies = core.aggregateEvidence([
  { family: 'domain', strength: 1 },
  { family: 'title_metadata', strength: 1 },
]);
assert.ok(Math.abs(independentFamilies.support - 0.61) < 1e-9);

const penalized = core.aggregateEvidence([
  { family: 'domain_path', strength: 1 },
  { family: 'negative_feedback', strength: 1 },
]);
assert.ok(Math.abs(penalized.support - 0.05) < 1e-9);

const ranked = core.rankCandidates([
  { kind: 'tag', tag: '开发', evidence: [{ family: 'domain', strength: 1 }] },
  { kind: 'tag', tag: '开发', evidence: [{ family: 'title_metadata', strength: 1 }] },
  { kind: 'tag', tag: '项目', evidence: [{ family: 'domain_path', strength: 1 }] },
  { kind: 'tag', tag: 'AI', evidence: [{ family: 'content_semantic', strength: 1 }] },
  { kind: 'tag', tag: '工具', evidence: [{ family: 'domain', strength: 0.8 }] },
]);
assert.deepEqual(Array.from(ranked, item => item.tag), ['项目', '开发']);
assert.equal(ranked[0].confidence, 'low');
assert.equal(ranked[0].rank, 1);
assert.ok(Math.abs(ranked[0].support - 0.65) < 1e-9);

const explicit = core.rankCandidates([
  { kind: 'folder', folderId: 'folder-1', folderPath: '工作/开发', exists: true, evidence: [{ family: 'user_rule', strength: 1 }] },
  { kind: 'folder', folderId: 'folder-2', folderPath: '工作/设计', exists: true, evidence: [{ family: 'history_profile', strength: 1 }] },
]);
assert.equal(explicit[0].confidence, 'high');
assert.equal(explicit[0].folderId, 'folder-1');

const curatedDomain = core.rankCandidates([
  { kind: 'tag', tag: 'AI', evidence: [{ family: 'curated_domain', strength: 1 }] },
]);
assert.equal(curatedDomain[0].confidence, 'high');

const learnedDomain = core.rankCandidates([
  { kind: 'tag', tag: 'AI', evidence: [{ family: 'learned_rule', strength: 1 }] },
]);
assert.equal(learnedDomain[0].confidence, 'medium');

const highLocal = { folders: explicit, tags: [] };
assert.deepEqual({ ...core.shouldTriggerAI(highLocal) }, { trigger: false, reason: 'local_high_confidence' });
assert.deepEqual({ ...core.shouldTriggerAI(highLocal, { needsNewFolder: true }) }, { trigger: true, reason: 'new_folder_needed' });
assert.deepEqual({ ...core.shouldTriggerAI({ folders: ranked, tags: [] }, { signalConflict: true }) }, { trigger: true, reason: 'signal_conflict' });
assert.deepEqual({ ...core.shouldTriggerAI({ folders: [], tags: [] }) }, { trigger: true, reason: 'low_confidence' });

assert.equal(core.hostnameMatchesRule('docs.github.com', 'github.com'), true);
assert.equal(core.hostnameMatchesRule('notgithub.com', 'github.com'), false);
assert.equal(core.isValidDomainPattern('linkedin.com/learning'), false);
assert.equal(core.isValidDomainPattern('example.com'), true);

assert.deepEqual({ ...core.validateNewFolderPath('工作/项目', []) }, {
  valid: true,
  reason: '',
  normalized: '工作/项目',
});
assert.equal(core.validateNewFolderPath('工作/项目/前端/组件', []).reason, 'invalid_depth');
assert.equal(core.validateNewFolderPath('Bookmarks bar/Work', []).reason, 'browser_root');
assert.equal(core.validateNewFolderPath('工作/其他', []).reason, 'generic_name');
assert.equal(core.validateNewFolderPath('工作/项:目', []).reason, 'invalid_segment');
assert.equal(core.validateNewFolderPath('工作/项目', [{ id: '1', path: '工作/项目' }]).reason, 'already_exists');
assert.equal(core.validateNewFolderPath('AI-Research', [{ id: '2', path: 'AI Research' }]).reason, 'similar_existing');

const invalidAudit = core.auditRuleSet({
  domainRules: [
    { domains: ['example.com/path'], tag: '开发' },
    { domains: ['github.com'], tag: '开发' },
    { domains: ['github.com'], tag: '开发' },
  ],
  urlPathRules: [{ patterns: ['docs'], tag: '未知' }],
  keywordMap: { 开发: ['code'], 孤立: ['orphan'] },
  prototypes: { 开发: 'code', 孤立: 'orphan' },
  taxonomy: { development: { id: 'development', label: '开发' } },
  aliases: { 编程: '开发', 错误别名: '未知' },
});
assert.equal(invalidAudit.valid, false);
for (const code of [
  'invalid_domain',
  'duplicate_domain_rule',
  'unknown_path_tag',
  'unreachable_path_rule',
  'invalid_path_pattern',
  'orphan_prototype',
  'orphan_keyword_category',
  'unknown_alias',
]) {
  assert.ok(invalidAudit.errors.some(error => error.code === code), `缺少静态审计错误：${code}`);
}

console.log('recommendation core tests passed');
