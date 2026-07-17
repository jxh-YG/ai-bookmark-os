import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const storage = new Map();
const chrome = {
  storage: {
    local: {
      async get(keys) {
        const names = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(names.filter(key => storage.has(key)).map(key => [key, storage.get(key)]));
      },
      async set(values) {
        for (const [key, value] of Object.entries(values)) storage.set(key, value);
      },
    },
  },
};
const context = { Array, Date, Intl, JSON, Map, Math, Number, Object, Promise, Set, String, URL, chrome, console };
vm.createContext(context);
vm.runInContext(readFileSync('src/timeline/shared/recommendation-core.js', 'utf8'), context);
vm.runInContext(`${readFileSync('src/timeline/shared/smart-tagger.js', 'utf8')}; this.rules = {
  CATEGORY_TAXONOMY,
  autoTagBookmarkSync,
  getSmartTaggerRuleAudit,
  keywordMatchesWhole,
  matchDomainTag,
  matchUrlPathTag,
  segmentChineseWords
};`, context);

const {
  CATEGORY_TAXONOMY,
  autoTagBookmarkSync,
  getSmartTaggerRuleAudit,
  keywordMatchesWhole,
  matchDomainTag,
  matchUrlPathTag,
  segmentChineseWords,
} = context.rules;
assert.equal(getSmartTaggerRuleAudit().valid, true);
assert.equal(Object.keys(CATEGORY_TAXONOMY).length, 34);
assert.equal(keywordMatchesWhole('node', 'release notes'), false);
assert.equal(keywordMatchesWhole('合规', '产品不合规格需要返工'), false);
assert.ok(segmentChineseWords('数据分析与机器学习').length > 0);

const fixtures = [
  ['开发', 'JavaScript TypeScript 编程 开发 代码', 'software development programming source code', 'https://github.com/acme/library'],
  ['AI', '人工智能 大模型 机器学习 神经网络', 'artificial intelligence machine learning transformer llm', 'https://openai.com/research/models'],
  ['设计', '界面设计 交互设计 设计系统 原型', 'ui ux design system prototype typography', 'https://figma.com/community/design-system'],
  ['数据', '数据分析 数据库 可视化 统计', 'data analytics database sql visualization', 'https://kaggle.com/datasets/sample'],
  ['安全', '网络安全 漏洞 加密 渗透测试', 'cybersecurity vulnerability encryption pentest owasp', 'https://owasp.org/www-project-security'],
  ['产品', '产品管理 用户研究 需求 路线图', 'product management user research roadmap mvp', 'https://productboard.com/roadmap'],
  ['DevOps', '持续集成 容器 编排 可观测性', 'devops ci cd docker kubernetes observability sre', 'https://docker.com/resources/devops'],
  ['游戏', '电子游戏 游戏引擎 关卡设计 主机', 'video game unity unreal gameplay steam', 'https://store.steampowered.com/app/100'],
  ['健康', '健康 医疗 健身 营养 睡眠', 'health medical fitness nutrition wellness', 'https://webmd.com/health/fitness'],
  ['法律', '法律 法规 合同 知识产权 诉讼', 'law legal regulation contract intellectual property', 'https://findlaw.com/legal/contracts'],
  ['摄影', '摄影 相机 镜头 曝光 构图', 'photography camera lens exposure portrait', 'https://flickr.com/photos/sample'],
  ['区块链', '区块链 智能合约 加密货币 去中心化', 'blockchain web3 smart contract solidity defi', 'https://etherscan.io/address/0x1'],
  ['学术', '学术论文 文献 引用 实验 期刊', 'academic paper research citation journal peer review', 'https://arxiv.org/abs/2601.00001'],
  ['金融', '金融 投资 股票 基金 风险控制', 'finance investment stock fund portfolio risk', 'https://finance.yahoo.com/quote/TEST'],
  ['旅行', '旅行 酒店 机票 签证 行程', 'travel hotel flight visa itinerary tourism', 'https://booking.com/hotel/sample'],
  ['美食', '美食 菜谱 烹饪 食材 餐厅', 'food recipe cooking ingredient restaurant', 'https://allrecipes.com/recipe/sample'],
  ['汽车', '汽车 新车 车型 试驾 保养', 'automotive car vehicle test drive maintenance', 'https://autohome.com.cn/car/series'],
  ['房产', '房产 楼盘 买房 租房 房贷', 'real estate property listing rental mortgage', 'https://zillow.com/homes/sample'],
  ['政务', '政府 政策 政务公开 公共服务 通知', 'government policy public service official notice', 'https://gov.cn/zhengce/content'],
  ['体育', '体育 足球 篮球 赛事 运动员', 'sports football basketball tournament athlete', 'https://nba.com/game/sample'],
  ['教程', '教程 入门指南 操作步骤 最佳实践', 'tutorial how to getting started step by step', 'https://example.test/tutorial/getting-started'],
  ['文档', '技术文档 参考手册 产品说明 知识库', 'documentation manual reference guide knowledge base', 'https://example.test/documentation/manual'],
  ['工具', '在线工具 转换器 生成器 计算器', 'online tool converter generator calculator utility', 'https://remove.bg/tools/background'],
  ['视频', '在线视频 电影 直播 播放列表', 'video movie streaming live playlist', 'https://youtube.com/watch?v=sample'],
  ['音乐', '音乐 歌曲 专辑 歌手 乐器', 'music song album artist guitar melody', 'https://spotify.com/album/sample'],
  ['阅读', '阅读 书评 随笔 长文 读书笔记', 'reading book review essay longform notes', 'https://medium.com/reading/sample'],
  ['资讯', '新闻 资讯 快讯 行业动态 报道', 'news breaking news press release industry report', 'https://reuters.com/world/sample'],
  ['社交', '社交 社区 论坛 聊天 群组', 'social community forum chat interaction', 'https://reddit.com/r/community'],
  ['购物', '购物 商品详情 优惠券 比价 电商', 'shopping product detail coupon price ecommerce', 'https://amazon.com/product/sample'],
  ['文章', '专栏文章 技术文章 深度报道 原创内容', 'article blog post longform opinion writing', 'https://example.test/blog/post/sample'],
  ['项目', '开源项目 代码仓库 项目主页 源码', 'open source project repository source code release', 'https://github.com/acme/project/tree/main'],
  ['API', '接口文档 端点 请求响应 认证', 'api reference sdk endpoint webhook openapi', 'https://example.test/api/reference/users'],
  ['学习', '在线学习 课程 课堂 练习题 培训', 'online learning course lesson curriculum education', 'https://coursera.org/learn/sample'],
  ['其他', '', '', 'https://example.test/plain'],
];

assert.equal(fixtures.length, 34);

function createVariants([expected, chinese, english, url]) {
  const domain = new URL(url).hostname;
  if (expected === '其他') {
    return [
      { expected, title: '', url, domain },
      { expected, title: 'Home', url: `${url}/home`, domain },
      { expected, title: 'Welcome overview', url: `${url}/overview`, domain },
      { expected, title: '个人页面', url: `${url}/about`, domain },
    ];
  }
  return [
    { expected, title: `${chinese} ${english}`, url, domain },
    { expected, title: chinese, metaDesc: english, url, domain },
    { expected, title: english, contentText: `${chinese} ${english} `.repeat(8), url, domain },
    { expected, title: `${chinese} ${english}`, headings: [chinese, english], metaKeywords: english.split(' '), url, domain },
  ];
}

const benchmark = fixtures.flatMap(createVariants);
assert.equal(benchmark.length, 136);

let top1Correct = 0;
let top3Correct = 0;
let highCount = 0;
let highCorrect = 0;
const failures = [];
for (const sample of benchmark) {
  const results = Array.from(autoTagBookmarkSync(sample), item => ({
    tag: item.tag,
    score: item.score,
    confidence: item.confidence,
    signals: Array.from(item.signals || []),
  }));
  const tags = results.map(item => item.tag);
  const top1 = tags[0] || '其他';
  if (top1 === sample.expected) top1Correct += 1;
  if (tags.includes(sample.expected)) top3Correct += 1;
  const strongSignals = new Set(results[0]?.signals || []);
  const high = (results[0]?.score || 0) >= 45
    && [...strongSignals].some(signal => signal === 'domain' || signal === 'domain+path' || signal === 'url-path:1')
    && strongSignals.size >= 2;
  if (high) {
    highCount += 1;
    if (top1 === sample.expected) highCorrect += 1;
  }
  if (!tags.includes(sample.expected)) failures.push({ expected: sample.expected, title: sample.title, tags, scores: results.map(item => item.score) });
}

assert.ok(highCount >= 20, `高置信样本不足：${highCount}`);
assert.ok(highCorrect / highCount >= 0.95, `高置信精确率不足：${highCorrect}/${highCount}`);
assert.ok((highCount - highCorrect) / highCount <= 0.02, `错误高置信率过高：${highCount - highCorrect}/${highCount}`);
assert.ok(top3Correct / benchmark.length >= 0.90, `Top 3 命中率不足：${top3Correct}/${benchmark.length}\n${JSON.stringify(failures, null, 2)}`);

const ambiguous = [
  ['', '/'], ['Home', '/home'], ['Welcome', '/welcome'], ['Overview', '/overview'], ['Untitled', '/item/1'],
  ['个人主页', '/about'], ['收藏页面', '/favorite'], ['详情', '/detail'], ['开始', '/start'], ['内容', '/content'],
].map(([title, path]) => ({ title, url: `https://neutral.example${path}`, domain: 'neutral.example' }));
const abstained = ambiguous.filter(sample => autoTagBookmarkSync(sample)[0]?.tag === '其他').length;
assert.ok(abstained / ambiguous.length >= 0.80, `模糊样本放弃率不足：${abstained}/${ambiguous.length}`);

assert.equal(matchDomainTag('docs.github.com')?.tag, '开发');
assert.equal(matchDomainTag('notgithub.com'), null);
assert.equal(matchUrlPathTag('https://example.test/watch/123')?.tag, '视频');
assert.equal(matchUrlPathTag('https://example.test/?next=/watch'), null);

const contextual = [
  { expected: '金融', title: 'Market finance investing analysis', url: 'https://bloomberg.com/markets/stocks', domain: 'bloomberg.com' },
  { expected: '资讯', title: 'Latest world news report', url: 'https://bloomberg.com/world', domain: 'bloomberg.com' },
  { expected: '游戏', title: 'Game directory and esports streams', url: 'https://twitch.tv/directory/game/chess', domain: 'twitch.tv' },
  { expected: '视频', title: 'Live video streaming channel', url: 'https://twitch.tv/channel', domain: 'twitch.tv' },
  { expected: '安全', title: '网络安全 合规 等保 零信任', url: 'https://example.test/security', domain: 'example.test' },
  { expected: '法律', title: '法律 法规 合规 隐私 GDPR', url: 'https://example.test/legal', domain: 'example.test' },
];
for (const sample of contextual) {
  const tags = Array.from(autoTagBookmarkSync(sample), item => item.tag);
  assert.ok(tags.includes(sample.expected), `${sample.url} 应包含 ${sample.expected}，实际为 ${tags.join(', ')}`);
}
assert.equal(autoTagBookmarkSync({ title: '企业合规清单', url: 'https://example.test/checklist', domain: 'example.test' })[0]?.tag, '其他');

const fallbackContext = {
  Array, Date, Intl: {}, JSON, Map, Math, Number, Object, Promise, Set, String, URL, chrome, console,
};
vm.createContext(fallbackContext);
vm.runInContext(readFileSync('src/timeline/shared/recommendation-core.js', 'utf8'), fallbackContext);
vm.runInContext(`${readFileSync('src/timeline/shared/smart-tagger.js', 'utf8')}; this.segmentChineseWords = segmentChineseWords;`, fallbackContext);
assert.deepEqual(Array.from(fallbackContext.segmentChineseWords('人工智能')), ['人工', '工智', '智能']);

console.log(`recommendation rule benchmark passed: ${benchmark.length} samples, high precision ${highCorrect}/${highCount}, top3 ${top3Correct}/${benchmark.length}`);
