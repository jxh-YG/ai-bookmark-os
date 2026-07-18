// ===== 智能分类引擎 =====
// 多层信号融合，纯本地运行，渐进增强

// ===== 域名特征库（200+ 域名） =====
const DOMAIN_RULES = [
  // 开发
  { domains: ['github.com', 'stackoverflow.com', 'gitlab.com', 'bitbucket.org',
               'npmjs.com', 'pypi.org', 'crates.io', 'golang.org', 'rust-lang.org',
               'codepen.io', 'jsfiddle.net', 'codesandbox.io', 'replit.com',
               'vercel.com', 'netlify.app', 'netlify.com', 'heroku.com',
               'railway.app', 'render.com', 'fly.io', 'deno.land',
               'pkg.go.dev', 'docs.rs', 'maven.apache.org', 'gradle.org',
               'spring.io', 'dotnet.microsoft.com', 'visualstudio.com',
               'jetbrains.com', 'eclipse.org', 'atom.io', 'sublimetext.com'],
    tag: '开发', color: '#4285f4' },

  // 文档/知识库
  { domains: ['docs.google.com', 'notion.so', 'confluence.atlassian.com',
               'yuque.com', 'feishu.cn', 'office.com', 'onedrive.live.com',
               'docs.microsoft.com', 'developer.apple.com', 'obsidian.md',
               'roamresearch.com', 'logseq.com', 'remnote.com', 'coda.io',
               'airtable.com', 'slite.com', 'slab.com', 'gitbook.com',
               'readme.io', 'docusaurus.io', 'swagger.io', 'postman.com'],
    tag: '文档', color: '#0f9d58' },

  // 设计
  { domains: ['figma.com', 'dribbble.com', 'behance.net', 'ui8.net',
               'mobbin.com', 'awwwards.com', 'cssdesignawards.com', 'sketch.com',
               'adobe.com', 'canva.com', 'invisionapp.com', 'framer.com',
               'spline.design', 'rive.app', 'lottiefiles.com', 'iconfont.cn',
               'flaticon.com', 'unsplash.com', 'pexels.com', 'pixabay.com',
               'coolors.co', 'colorhunt.co', 'fonts.google.com', 'fontawesome.com'],
    tag: '设计', color: '#e91e63' },

  // 学习/教育
  { domains: ['coursera.org', 'udemy.com', 'edx.org', 'khanacademy.org',
               'mdn.mozilla.org', 'developer.mozilla.org', 'w3schools.com',
               'runoob.com', 'liaoxuefeng.com', 'leetcode.com', 'hackerrank.com',
               'codecademy.com', 'pluralsight.com',
               'skillshare.com', 'udacity.com', 'brilliant.org', 'duolingo.com',
               'memrise.com', 'quizlet.com', 'ocw.mit.edu',
               'edu.cn', 'xuetangx.com', 'icourse163.org', 'imooc.com',
               'nowcoder.com', 'luogu.com.cn', 'atcoder.jp', 'codeforces.com'],
    tag: '学习', color: '#ff9800' },

  // 视频
  { domains: ['youtube.com', 'bilibili.com', 'vimeo.com', 'ted.com',
               'netflix.com', 'iqiyi.com', 'youku.com', 'twitch.tv',
               'dailymotion.com', 'hulu.com', 'disneyplus.com', 'hbomax.com',
               'primevideo.com', 'acfun.cn', 'nicovideo.jp', 'peertube.tv',
               'douyin.com', 'tiktok.com', 'kuaishou.com'],
    tag: '视频', color: '#f44336' },

  // 阅读
  { domains: ['medium.com', 'substack.com', 'juejin.cn',
               'csdn.net', 'dev.to', 'hackernoon.com', 'infoq.com',
               'freecodecamp.org', 'sspai.com',
               'qdaily.com', 'guokr.com',
               'douban.com', 'goodreads.com', 'book.douban.com',
               'readwise.io', 'pocket.co', 'instapaper.com', 'getpocket.com',
               'washup.co', 'weread.qq.com', 'duokan.com', 'kindle.amazon.com'],
    tag: '阅读', color: '#9c27b0' },

  // 工具
  { domains: ['tinypng.com', 'regex101.com', 'jsoneditoronline.org', 'convertio.co',
               'remove.bg', 'squoosh.app', 'excalidraw.com', 'draw.io',
               'diagrams.net', 'mermaid-js.github.io', 'carbon.now.sh',
               'diffchecker.com', 'prettier.io', 'babeljs.io', 'typescriptlang.org',
               'caniuse.com', 'bundlephobia.com', 'npmtrends.com',
               'speedtest.net', 'fast.com', 'virustotal.com', 'whois.com',
               'dnschecker.org', 'downforeveryoneorjustme.com', 'archive.org',
               'web.archive.org', 'temp-mail.org', '10minutemail.com'],
    tag: '工具', color: '#00bcd4' },

  // 资讯
  { domains: ['weibo.com', 'reddit.com',
               'news.ycombinator.com', '36kr.com', 'ifanr.com', 'techcrunch.com',
               'theverge.com', 'wired.com', 'arstechnica.com', 'engadget.com',
               'gizmodo.com', 'mashable.com', 'thenextweb.com', 'venturebeat.com',
               'bloomberg.com', 'reuters.com', 'apnews.com', 'bbc.com',
               'cnn.com', 'nytimes.com', 'washingtonpost.com', 'theguardian.com',
               'huanqiu.com', 'thepaper.cn', 'caixin.com', 'jiemian.com',
               'ithome.com', 'cnbeta.com', 'solidot.org', 'producthunt.com'],
    tag: '资讯', color: '#795548' },

  // 购物
  { domains: ['amazon.com', 'taobao.com', 'jd.com', 'ebay.com',
               'aliexpress.com', 'pinduoduo.com', 'tmall.com', 'suning.com',
               'walmart.com', 'target.com', 'bestbuy.com', 'costco.com',
               'shopify.com', 'etsy.com', 'wish.com', 'shein.com',
               'vip.com', 'dangdang.com', 'kaola.com', 'smzdm.com'],
    tag: '购物', color: '#ff5722' },

  // 音乐
  { domains: ['spotify.com', 'music.apple.com', 'music.163.com', 'soundcloud.com',
               'bandcamp.com', 'y.qq.com', 'kugou.com', 'kuwo.cn',
               'tidal.com', 'deezer.com', 'pandora.com', 'last.fm',
               'genius.com', 'azlyrics.com', 'musixmatch.com'],
    tag: '音乐', color: '#1db954' },

  // 金融
  { domains: ['stripe.com', 'paypal.com', 'coinbase.com', 'binance.com',
               'eastmoney.com', 'xueqiu.com', 'investing.com',
               'finance.yahoo.com', 'robinhood.com',
               'fidelity.com', 'vanguard.com', 'schwab.com', 'wise.com',
               'revolut.com', 'okx.com', 'huobi.com', 'gate.io',
               'tradingview.com', 'seekingalpha.com', 'morningstar.com'],
    tag: '金融', color: '#ffc107' },

  // 旅行
  { domains: ['booking.com', 'airbnb.com', 'trip.com',
               'maps.google.com', 'ctrip.com', 'lonelyplanet.com', 'mafengwo.cn',
               'tripadvisor.com', 'expedia.com', 'hotels.com', 'agoda.com',
               'kayak.com', 'skyscanner.com', 'priceline.com',
               'qunar.com', 'tuniu.com', 'qyer.com'],
    tag: '旅行', color: '#009688' },

  // AI
  { domains: ['openai.com', 'anthropic.com', 'huggingface.co', 'replicate.com',
               'stability.ai', 'midjourney.com', 'chat.openai.com', 'claude.ai',
               'poe.com', 'perplexity.ai', 'character.ai', 'civitai.com',
               'ollama.com', 'lmstudio.ai', 'together.ai', 'anyscale.com',
               'modal.com', 'runpod.io', 'vast.ai', 'lambda.ai',
               'deepmind.com', 'ai.google', 'ai.meta.com',
               'tongyi.aliyun.com', 'yiyan.baidu.com', 'chat.zhipu.ai',
               'kimi.moonshot.cn', 'doubao.com', 'tiangong.cn'],
    tag: 'AI', color: '#673ab7' },

  // 游戏
  { domains: ['store.steampowered.com', 'epicgames.com', 'gog.com',
               'playstation.com', 'xbox.com', 'nintendo.com',
               'blizzard.com', 'riotgames.com', 'ea.com', 'ubisoft.com',
               'ign.com', 'gamespot.com', 'kotaku.com',
               'pcgamer.com', 'rockpapershotgun.com', 'steampowered.com',
               'steamcommunity.com', 'itch.io',
               'moddb.com', 'nexusmods.com', 'gamefaqs.gamespot.com'],
    tag: '游戏', color: '#7c4dff' },

  // 健康/医疗
  { domains: ['webmd.com', 'mayoclinic.org', 'healthline.com', 'who.int',
               'nih.gov', 'cdc.gov', 'medicalnewstoday.com', 'verywellhealth.com',
               'dxy.com', 'chunyuyisheng.com', 'haodf.com', 'guahao.com',
               'dingxiangyisheng.com', 'medlive.cn', 'pmph.com'],
    tag: '健康', color: '#4caf50' },

  // 法律
  { domains: ['law.cornell.edu', 'findlaw.com', 'lawyer.com', 'legalzoom.com',
               'wenshu.court.gov.cn', 'chinacourt.org', 'pkulaw.com',
               'itslaw.com', 'court.gov.cn', 'moj.gov.cn'],
    tag: '法律', color: '#5d4037' },

  // 摄影
  { domains: ['flickr.com', '500px.com', 'vsco.co',
               'shutterstock.com', 'istockphoto.com', 'gettyimages.com',
               'tuchong.com', 'huaban.com',
               'petal.com', 'stocksnap.io', 'rawpixel.com'],
    tag: '摄影', color: '#e040fb' },

  // 社交
  { domains: ['facebook.com', 'instagram.com', 'linkedin.com',
               'snapchat.com', 'pinterest.com', 'tumblr.com', 'discord.com',
               'slack.com', 'telegram.org', 'web.telegram.org', 'whatsapp.com',
               'wechat.com', 'xiaohongshu.com', 'zhihu.com',
               'twitter.com', 'x.com'],
    tag: '社交', color: '#2196f3' },

  // 区块链/Web3
  { domains: ['ethereum.org', 'solana.com', 'polygon.technology', 'avalabs.org',
               'coinmarketcap.com', 'coingecko.com', 'dune.com', 'defillama.com',
               'opensea.io', 'rarible.com', 'etherscan.io', 'bscscan.com',
               'polygonscan.com', 'solscan.io', 'mirror.xyz', 'paragraph.xyz'],
    tag: '区块链', color: '#ff6f00' },

  // 学术/科研
  { domains: ['arxiv.org', 'scholar.google.com', 'researchgate.net',
               'academia.edu', 'semanticscholar.org', 'pubmed.ncbi.nlm.nih.gov',
               'doi.org', 'springer.com', 'nature.com', 'science.org',
               'ieee.org', 'acm.org', 'sciencedirect.com', 'wiley.com',
               'cnki.net', 'wanfangdata.com.cn', 'cqvip.com'],
    tag: '学术', color: '#00838f' },

  // 美食
  { domains: ['meituan.com', 'dianping.com', 'ele.me', 'michelin.com',
               'xiachufang.com', 'meishichina.com', 'douguo.com',
               'kfc.com.cn', 'mcdonalds.com.cn', 'starbucks.com.cn'],
    tag: '美食', color: '#ff9800' },

  // 汽车
  { domains: ['autohome.com.cn', 'che168.com', 'dongchedi.com', 'pcauto.com.cn',
               'yiche.com', 'autotimes.com.cn', 'cars.com', 'edmunds.com',
               'kbb.com', 'motortrend.com', 'topgear.com', 'tesla.com'],
    tag: '汽车', color: '#607d8b' },

  // 房产
  { domains: ['lianjia.com', 'anjuke.com', 'fang.com', 'ziroom.com',
               'ke.com', '5i5j.com', 'homelink.com.cn', 'soufun.com',
               'zillow.com', 'realtor.com', 'redfin.com', 'apartments.com'],
    tag: '房产', color: '#795548' },

  // 政务
  { domains: ['gov.cn', 'ndrc.gov.cn', 'mof.gov.cn', 'moe.gov.cn',
               'miit.gov.cn', 'mps.gov.cn', 'nhc.gov.cn', 'samr.gov.cn',
               'china.com.cn', 'people.com.cn', 'xinhuanet.com'],
    tag: '政务', color: '#b71c1c' },

  // 体育
  { domains: ['espn.com', 'nba.com', 'fifa.com', 'uefa.com',
               'espncricinfo.com', 'goal.com', 'transfermarkt.com',
               'sports.sina.com.cn', 'hupu.com',
               'dongqiudi.com', 'liveScore.com', 'flashscore.com'],
    tag: '体育', color: '#2e7d32' },

  // 数据
  { domains: ['kaggle.com', 'data.world', 'kdnuggets.com', 'dataversity.net',
               'towardsdatascience.com', 'analyticsvidhya.com', 'mode.com'],
    tag: '数据', color: '#0277bd' }
];

// ===== URL 路径模式（分层权重版）=====
// weight: 1.0 高置信路径，0.5-0.7 低置信/易泛化路径
const URL_PATH_RULES = [
  // 文章/博客
  { patterns: ['/blog/', '/article/', '/post/', '/p/', '/posts/', '/articles/', '/column/'],
    tag: '文章', weight: 1.0 },
  { patterns: ['/writing/', '/story/', '/opinion/'],
    tag: '文章', weight: 0.6 },
  { patterns: ['/news/'],
    tag: '文章', weight: 0.4 },
  // 教程/文档
  { patterns: ['/docs/', '/documentation/', '/guide/', '/tutorial/', '/tutorials/',
               '/handbook/', '/manual/', '/cookbook/', '/recipes/',
               '/getting-started/', '/quickstart/', '/walkthrough/', '/learn/'],
    tag: '教程', weight: 1.0 },
  // API/参考
  { patterns: ['/api/', '/reference/', '/sdk/', '/devdocs/', '/spec/',
               '/schema/', '/endpoint/', '/rest/', '/graphql/'],
    tag: 'API', weight: 1.0 },
  // 视频
  { patterns: ['/watch', '/video/', '/v/', '/videos/', '/playlist', '/live/', '/stream/', '/clip/', '/shorts/'],
    tag: '视频', weight: 1.0 },
  // 项目/仓库
  { patterns: ['/repo/', '/repository/', '/source/', '/tree/', '/blob/', '/commits/'],
    tag: '项目', weight: 1.0 },
  { patterns: ['/project/', '/projects/'],
    tag: '项目', weight: 0.6 },
  // 工具/应用
  { patterns: ['/tool/', '/tools/', '/playground/', '/calculator/', '/converter/', '/generator/'],
    tag: '工具', weight: 1.0 },
  { patterns: ['/app/', '/demo/', '/sandbox/'],
    tag: '工具', weight: 0.5 },
  // 学术/论文
  { patterns: ['/paper/', '/research/', '/thesis/', '/dissertation/',
               '/publication/', '/proceedings/', '/preprint/', '/arxiv/',
               '/abstract/', '/citation/', '/doi/'],
    tag: '学术', weight: 1.0 },
  // 设计资源
  { patterns: ['/design/', '/ui/', '/ux/', '/prototype/', '/mockup/',
               '/figma/', '/sketch/', '/asset/', '/icon/', '/illustration/'],
    tag: '设计', weight: 1.0 },
  // 数据集
  { patterns: ['/dataset/', '/open-data/', '/benchmark/'],
    tag: '数据', weight: 1.0 },
  { patterns: ['/data/', '/download/', '/export/', '/csv/', '/json/'],
    tag: '数据', weight: 0.5 },
  // 社区/论坛
  { patterns: ['/forum/', '/community/', '/discuss/', '/thread/',
               '/topic/', '/question/', '/answer/', '/q/', '/issues/'],
    tag: '社交', weight: 0.6 },
  // 法律/合规
  { patterns: ['/legal/', '/terms/', '/privacy/', '/policy/',
               '/compliance/', '/regulation/', '/license/', '/gdpr/'],
    tag: '法律', weight: 1.0 }
];

// ===== 标题清洗配置 =====
const TITLE_PLATFORM_SUFFIXES = [
  /\s*[|\-–—:：]\s*(知乎|哔哩哔哩|bilibili|csdn|掘金|简书|微博|twitter|x|github|gitlab|hugging face|medium|substack)\s*$/i,
  /\s*[|\-–—]\s*(中文版|中文|英文版|英文|原创|转载|独家)\s*$/i
];

// ===== 文件夹名→标签同义词映射（解决“AI学习”这类非标准文件夹） =====
const FOLDER_SYNONYM_MAP = new Map([
  ['ai\u6574\u7406', 'AI'], ['api\u4e2d\u8f6c', '中转站'], ['api\u4e2d\u8f6c\u7ad9', '中转站'],
  ['api\u4ee3\u7406', '中转站'], ['api\u8f6c\u53d1', '中转站'],
  ['ai学习', 'AI'], ['ai', 'AI'], ['人工智能', 'AI'],
  ['大模型', 'AI'], ['机器学习', 'AI'], ['深度学习', 'AI'],
  ['前端', '开发'], ['后端', '开发'], ['全栈', '开发'], ['开发工具', '开发'],
  ['办公', '办公'], ['oa', '办公'], ['协同', '办公'], ['协同办公', '办公'],
  ['企业管理', '办公'], ['项目管理', '办公'], ['行政办公', '办公'],
  ['设计资源', '设计'], ['uiux', '设计'], ['ux', '设计'],
  ['数据科学', '数据'], ['数据分析', '数据'], ['数据库', '数据'],
  ['devops', 'DevOps'], ['运维', 'DevOps'],
  ['产品笔记', '产品'], ['读书笔记', '阅读'], ['阅读清单', '阅读'],
  ['金融投资', '金融'], ['投资理财', '金融'],
  ['健康知识', '健康'], ['法律资料', '法律']
]);

const GENERIC_FOLDER_NAMES = new Set([
  '收件箱', '收藏', '书签', '未分类', '其他', '默认', '临时', '杂项', 'newfolder'
]);

function cleanTitle(title) {
  if (!title) return '';
  return TITLE_PLATFORM_SUFFIXES.reduce(
    (t, re) => t.replace(re, ''),
    title
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Za-z])(\d)|(\d)([A-Za-z])/g, '$1$3 $2$4')
  ).replace(/\s+/g, ' ').trim();
}

function normalizeFolderName(name) {
  const key = String(name || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .toLowerCase()
    .replace(/[\s_./-]+/g, '')
    .trim();
  if (!key) return '';
  if (GENERIC_FOLDER_NAMES.has(key)) return '';
  const canonical = canonicalizeTagName(FOLDER_SYNONYM_MAP.get(key) || name);
  return canonicalCategoryTag(canonical);
}

function inferFolderCategory(name) {
  const normalized = normalizeFolderName(name);
  if (normalized) return { tag: normalized, signal: 'folder' };

  const text = cleanTitle(name).toLowerCase();
  if (!text) return null;

  const titleMatch = extractTagsFromTitle(text).find(item => canonicalCategoryTag(item.tag));
  if (titleMatch) return { tag: titleMatch.tag, signal: 'folder-keyword' };

  const taxonomyMatch = Object.keys(CATEGORY_ID_BY_LABEL)
    .filter(tag => tag !== '其他')
    .flatMap(tag => getCanonicalCategoryTerms(tag)
      .map(term => ({ tag, term: String(term).toLowerCase() }))
      .filter(({ term }) => term && text.includes(term)))
    .sort((left, right) => right.term.length - left.term.length)[0];
  return taxonomyMatch ? { tag: taxonomyMatch.tag, signal: 'folder-keyword' } : null;
}

// ===== 信号基础权重（便于统一调参） =====
const SIGNAL_WEIGHTS = {
  folder: 50,
  domain: 30,
  subdomain: 12,
  path: 15,
  extension: 12,
  query: 8,
  title: 10,

  // 内容特征增强层
  metaDescription: 12,
  contentFingerprint: 10,
  techStack: 15,

  // 语义原型层
  prototypeBm25: 14,

  // 图推理层（异步场景）
  siblingPropagation: 20,
  temporalCluster: 12,
  domainCooccurrence: 10,

  // AI 增强层
  ai: 45,

  // 统计层
  tfidf: 1,
  bayes: 1,
  override: 100
};

// ===== 标题关键词映射 =====
const KEYWORD_TAG_MAP = {
  '开发': ['javascript', 'typescript', 'python', 'react', 'vue', 'angular',
           'node', 'css', 'html', 'webpack', 'vite', 'docker', 'kubernetes',
           'git', 'frontend', 'backend', 'fullstack', '算法', '编程',
           '框架', '组件', '库', 'npm', 'yarn', 'package', 'rust', 'go',
           'java', 'c++', 'swift', 'kotlin', 'flutter', 'dart', 'ruby',
           'php', 'laravel', 'django', 'flask', 'spring', 'svelte',
           'nextjs', 'nuxt', 'remix', 'astro', 'tailwind', 'sass',
           'graphql', 'rest', 'microservice', 'serverless', 'wasm',
           '编译', '调试', '重构', '部署', '单元测试', 'e2e'],
  'AI':   ['ai', 'ml', 'machine learning', 'deep learning', 'neural',
           'gpt', 'llm', 'chatgpt', 'openai', 'diffusion', 'transformer',
           '人工智能', '机器学习', '深度学习', '大模型', '生成式', 'prompt',
           'embedding', 'vector', 'rag', 'agent', 'fine-tune', '微调',
           'stable diffusion', 'midjourney', 'copilot', 'claude', 'gemini',
           '训练', '推理', 'context window',
           '多模态', '视觉语言', 'aigc', '文生图', '文生视频',
           'mcp', 'model context protocol', 'cua', 'computer use agent',
           'lora', 'qlora', 'sft', 'rlhf', 'dpo', 'ppo',
           'hallucination', '幻觉', 'token', '参数', 'foundation model',
           'huggingface', 'hf', 'replicate', 'civitai', 'ollama',
           'kimi', '通义千问', '文心一言', '智谱', '豆包', 'deepseek'],
  '设计': ['ui', 'ux', 'design', 'figma', 'sketch', 'typography',
           'layout', 'color', '图标', '交互', '视觉', '配色', '字体',
           'icon', 'mockup', 'prototype', 'wireframe', '响应式', '动效',
           '设计系统', '组件库', 'design system', 'dark mode', '暗色',
           '渐变', '阴影', '圆角', '间距', '栅格', 'grid', 'flex',
           'accessibility', '无障碍', '可用性', '用户体验'],
  '数据': ['data', 'database', 'sql', 'analytics', 'visualization',
           'pandas', 'excel', 'chart', '统计', '数据', '分析', '报表',
           'bigquery', 'snowflake', 'tableau', 'powerbi', 'etl',
           '数据仓库', '数据湖', '数据管道', '数据治理', '数据质量',
           'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch',
           'kafka', 'spark', 'hive', 'clickhouse', 'doris', 'flink'],
  '安全': ['security', 'encryption', 'auth', 'oauth', 'jwt',
           'vulnerability', 'pentest', '安全', '加密', '漏洞', '渗透',
           'firewall', 'ssl', 'tls', 'xss', 'csrf', '注入', 'sql注入',
           'rbac', '零信任', 'waf', 'ddos', '钓鱼', '社工',
           'cve', 'cwe', 'owasp', '等保', '审计'],
  '产品': ['product', 'roadmap', 'agile', 'scrum',
           '需求', '产品', '用户', '运营', '增长', '竞品', 'mvp', 'okr',
           '用户画像', '用户旅程', '北极星指标', '留存', '转化', '裂变',
           'ab测试', '灰度', '迭代', 'sprint', 'backlog', '看板',
           '用户研究', '可用性测试', 'a/b test', 'funnel', 'cohort'],
  'DevOps': ['pipeline', 'jenkins', 'github actions', 'gitlab ci',
              'terraform', 'ansible', 'k8s', 'helm', 'prometheus', 'grafana',
              '监控', '告警', '日志', '链路追踪', 'sre', 'sla', 'sli',
              'argo', 'istio', 'envoy', 'consul', 'vault', 'nexus',
              '容器', '编排', '弹性伸缩', '蓝绿部署', '金丝雀发布'],
  '游戏': ['game', 'gaming', 'unity', 'unreal', 'godot', '游戏',
           '3d', '2d', 'rpg', 'fps', 'moba', '像素', '独立游戏',
           'shader', '渲染', '物理引擎', '碰撞检测', 'ai行为树',
           'steam', '手游', '端游', '主机', 'switch', 'ps5'],
  '健康': ['health', 'medical', 'fitness', 'wellness', '健康', '医疗',
           '运动', '健身', '营养', '饮食', '睡眠', '心理', '冥想',
           'yoga', '跑步', '卡路里', 'bmi', '体检', '中医', '养生',
           '康复', '疫苗', '症状', '诊断', '处方'],
  '法律': ['law', 'legal', 'regulation', 'privacy', 'compliance', '法律', '法规', '合规',
           '合同', '知识产权', '专利', '商标', '版权',
           '隐私', 'gdpr', '数据保护', '诉讼', '仲裁', '劳动法',
           '公司法', '证券法', '反垄断', '牌照'],
  '摄影': ['photo', 'photography', 'camera', 'lens', '摄影', '相机',
           '镜头', '曝光', '光圈', '快门', 'iso', 'raw', '修图',
           'lightroom', 'photoshop', '构图', '人像', '风光', '街拍',
           '延时', '全景', 'hdr', '滤镜', '胶片'],
  '区块链': ['blockchain', 'crypto', 'web3', 'defi', 'nft', '区块链',
            '加密货币', '智能合约', 'solidity', '以太坊', '比特币',
            'dao', '跨链', 'layer2', '零知识证明', 'zk',
            '空投', '质押', '流动性', 'amm', 'swap', 'mint'],
  '学术': ['paper', 'research', 'thesis', 'journal', '论文', '研究',
           '期刊', '学术', '引用', 'impact factor', 'peer review',
           '博士', '硕士', '毕业论文', '文献', '综述', '实验',
           'h-index', 'sci', 'ei', '核心期刊', '开源论文'],
  '金融': ['finance', 'invest', 'stock', 'fund', '金融', '投资',
           '股票', '基金', '期货', '期权', '债券', '外汇',
           '量化', '风控', '估值', 'ipo',
           '理财', '保险', '信贷', '利率', '通胀', 'gdp'],
  '旅行': ['travel', 'trip', 'flight', 'hotel', '旅行', '旅游',
           '机票', '酒店', '签证', '攻略', '自由行', '跟团',
           '景点', '民宿', '自驾', '背包客', '签证', '出入境'],
  '音乐': ['music', 'song', 'album', 'guitar', '音乐', '歌曲',
           '专辑', '吉他', '钢琴', '编曲', '混音', '母带',
           'midi', 'daw', 'ableton', 'logic pro', '乐理', '和弦',
           '节奏', '旋律', '歌词', '翻唱', '原创'],
  '社交': ['social', 'community', 'forum', 'chat', '社交', '社区',
           '论坛', '聊天', '群组', '粉丝', '关注', '互动',
           '直播', '短视频', 'vlog', '内容创作', '自媒体', 'kol',
           '私域', '公域', '流量', '涨粉', '变现'],
  '文章': ['article', 'blog post', 'longform', '专栏文章', '技术文章', '深度报道'],
  '项目': ['repository', 'source code', 'open source project', '代码仓库', '开源项目', '项目主页'],
  'API': ['api', 'api reference', 'sdk reference', 'endpoint', '接口文档', '开发接口', 'webhook'],
  '学习': ['course', 'lesson', 'curriculum', '学习', '课程', '课堂', '练习题', '在线教育'],
  '教程': ['tutorial', 'how to', 'getting started', 'quickstart', '教程', '入门指南', '操作步骤'],
  '文档': ['documentation', 'manual', 'reference guide', '文档', '手册', '知识库', '帮助中心'],
  '工具': ['online tool', 'converter', 'generator', 'calculator', '在线工具', '转换器', '生成器'],
  '视频': ['video', 'movie', 'streaming', '视频', '影视', '直播回放', '播放列表'],
  '阅读': ['reading', 'book review', 'essay', '阅读', '读书', '书评', '随笔'],
  '资讯': ['news', 'breaking news', 'press release', '新闻', '资讯', '快讯', '行业动态'],
  '购物': ['shopping', 'product detail', 'coupon', '购物', '商品详情', '优惠券', '比价'],
  '美食': ['food', 'recipe', 'restaurant', '美食', '菜谱', '餐厅', '烹饪'],
  '汽车': ['automotive', 'car review', 'vehicle', '汽车', '车型', '购车', '试驾'],
  '房产': ['real estate', 'property listing', '房产', '楼盘', '租房', '买房'],
  '政务': ['government', 'public service', '政务', '政府公报', '办事指南', '行政许可'],
  '体育': ['sports', 'football', 'basketball', '体育', '足球', '篮球', '赛事'],
  '其他': ['uncategorized', 'miscellaneous', '未分类内容']
};

// ===== 标签原型语义文档（用于 BM25 文档级匹配） =====
const TAG_PROTOTYPES = {
  '开发': `软件开发、编程语言、代码仓库、框架与库、前端后端全栈开发、算法与数据结构、API 接口文档、开发者工具与 IDE、编译构建部署、代码审查与重构、性能优化与调试、开源项目与版本控制`,
  'AI': `人工智能、机器学习与深度学习、大语言模型 LLM 与 GPT、神经网络与 Transformer、计算机视觉与图像生成、自然语言处理 NLP、RAG 检索增强生成、Agent 智能体、模型训练与微调、Stable Diffusion 与 Midjourney、文生图与文生视频、AI 应用与工具平台`,
  '设计': `UI UX 设计、界面设计与视觉设计、设计系统与组件库、Figma Sketch 原型工具、图标字体配色排版、交互设计与用户体验、品牌与平面设计、动画与动效、图片素材与摄影资源`,
  '数据': `数据分析与数据科学、数据库与数据仓库、数据可视化与报表、统计与机器学习、大数据与实时计算、数据治理与 ETL、SQL 查询与 BI 工具、数据集与基准测试`,
  '安全': `网络安全与信息安全、加密与认证授权、漏洞扫描与渗透测试、Web 安全与代码审计、零信任、防火墙 WAF 与 DDoS 防护、安全运营与事件响应`,
  '产品': `产品管理与产品设计、需求分析与用户研究、敏捷开发与 Scrum、增长运营与 A/B 测试、竞品分析与路线图、用户画像与旅程地图、MVP 与 OKR`,
  'DevOps': `CI/CD 持续集成与交付、容器与 Kubernetes 编排、监控告警与可观测性、基础设施即代码、SRE 站点可靠性工程、日志追踪与自动化运维`,
  '游戏': `电子游戏与独立游戏、Unity Unreal 游戏引擎、3D 建模与渲染、游戏设计与关卡设计、Steam 主机与手游、物理引擎与 AI 行为树、像素艺术与 Shader`,
  '健康': `健康医疗与健身、运动锻炼与营养饮食、心理健康与冥想、疾病症状与诊疗、疫苗体检与中医养生、睡眠与康复、医疗资讯与健康管理`,
  '法律': `法律法规与监管要求、合同协议与知识产权、专利商标与版权、隐私保护 GDPR、诉讼仲裁与劳动法、公司法证券法反垄断、牌照许可与监管`,
  '摄影': `摄影与拍摄、相机镜头与曝光、人像风光与街拍、构图与后期修图、Lightroom Photoshop、RAW 处理与滤镜、延时全景与 HDR、胶片与视频创作`,
  '区块链': `区块链与 Web3、加密货币与 DeFi、智能合约与 Solidity、以太坊比特币与跨链、NFT DAO 与 Layer2、零知识证明与 zk、空投质押与流动性挖矿`,
  '学术': `学术论文与期刊、学位论文与毕业论文、文献综述与引用、实验研究与数据集、arXiv 预印本、DOI 与影响因子、同行评审 peer review、SCI 核心期刊与研究方法`,
  '金融': `金融投资与理财、股票基金与期货期权、债券外汇与量化交易、风险控制与估值、IPO 与宏观经济、保险信贷与利率通胀、个人理财与财富管理`,
  '旅行': `旅行与旅游、机票酒店与签证、攻略自由行与跟团、景点民宿与自驾、出境游与背包客、地图导航与行程规划`,
  '美食': `美食与烹饪、菜谱食谱与食材、餐厅外卖与点评、烘焙甜品与饮品、地方菜系与小吃、营养搭配与饮食文化`,
  '汽车': `汽车与交通工具、新车评测与购车指南、新能源车与智能驾驶、维修保养与改装、汽车行业新闻与赛事`,
  '房产': `房产与房地产、买房卖房与租房、小区楼盘与户型、装修与家居、房价走势与房贷政策`,
  '政务': `政府政策与政务公开、国务院与部委通知、法律法规与公共服务、民生政策与行政许可、官方文件与新闻报道`,
  '体育': `体育与运动赛事、足球篮球与电竞、NBA FIFA 与世界杯、运动员与转会、健身训练与体育新闻`,
  '教程': `入门指南与快速开始、step-by-step 步骤教程、最佳实践与实战案例、视频教程与课程、文档手册与 API 参考、How-to 与 FAQ、从零基础到进阶的学习路径`,
  '文档': `技术文档与参考手册、API 文档与 SDK、产品说明与帮助中心、知识库与 Wiki、规范标准与 Release Notes`,
  '工具': `在线工具与实用软件、代码编辑器与格式化、转换器与生成器、效率工具与插件、计算器与检查器`,
  '视频': `视频与影视、在线视频与直播、短视频与电影剧集、视频教程与流媒体、剪辑制作与弹幕`,
  '音乐': `音乐与歌曲、专辑与歌手、乐器演奏与编曲、音乐制作与 DAW、歌词与乐理、流媒体与播客`,
  '阅读': `阅读与文章、博客与专栏、新闻资讯与书评、知识分享与读书笔记、长文与深度报道、社区内容`,
  '资讯': `科技新闻与行业动态、产品发布与更新公告、公司融资与收购并购、政策法规与监管、市场分析与趋势预测、热点事件与突发事件报道、媒体报道与专访`,
  '社交': `社交与社区、论坛与聊天、内容创作与自媒体、粉丝关注与互动、直播短视频与 KOL、私域流量与社群运营`,
  '购物': `购物与电商、商品详情与价格、淘宝京东亚马逊、优惠券与比价、数码家电与服装、海淘与跨境电商`,
  '文章': `文章、博客、专栏与长文，技术文章、观点评论、深度报道、知识分享、原创内容与专题写作`,
  '项目': `软件项目、代码仓库与开源项目，项目主页、源码、提交记录、问题追踪、版本发布与协作开发`,
  'API': `API 接口与 SDK 参考，端点、请求响应、认证、Webhook、OpenAPI Swagger 与开发者接口文档`,
  '学习': `在线学习、课程与课堂，教学大纲、练习题、培训、教育平台、学习路径与技能提升`,
  '其他': ` miscellaneous 其他未分类内容、个人笔记与随笔、生活记录与杂项、无法明确归类的网页`
};

const CATEGORY_ID_BY_LABEL = Object.freeze({
  '开发': 'development', 'AI': 'ai', '设计': 'design', '数据': 'data', '安全': 'security',
  '产品': 'product', 'DevOps': 'devops', '游戏': 'gaming', '健康': 'health', '法律': 'legal',
  '摄影': 'photography', '区块链': 'blockchain', '学术': 'academic', '金融': 'finance',
  '旅行': 'travel', '美食': 'food', '汽车': 'automotive', '房产': 'real_estate',
  '政务': 'government', '体育': 'sports', '教程': 'tutorial', '文档': 'documentation',
  '工具': 'tools', '视频': 'video', '音乐': 'music', '阅读': 'reading', '资讯': 'news',
  '社交': 'social', '购物': 'shopping', '文章': 'article', '项目': 'project', 'API': 'api',
  '学习': 'learning', '其他': 'other',
});

const CATEGORY_ALIASES = Object.freeze({
  '人工智能': 'AI', '机器学习': 'AI', '大模型': 'AI',
  '编程': '开发', '前端': '开发', '后端': '开发', '代码': '开发',
  '运维': 'DevOps', '数据科学': '数据', '数据库': '数据',
  '投资': '金融', '理财': '金融', '新闻': '资讯', '博客': '文章',
  '课程': '学习', '教育': '学习', '说明书': '文档', '接口': 'API',
});

const CATEGORY_TAXONOMY = Object.freeze(Object.fromEntries(
  Object.keys(TAG_PROTOTYPES).map(label => [CATEGORY_ID_BY_LABEL[label], {
    id: CATEGORY_ID_BY_LABEL[label],
    label,
    aliases: Object.entries(CATEGORY_ALIASES).filter(([, target]) => target === label).map(([alias]) => alias),
  }])
));

function canonicalizeTagName(value) {
  const tag = String(value || '').trim();
  return CATEGORY_ALIASES[tag] || tag;
}

function isUsableTagName(value) {
  const tag = String(value || '').trim();
  return tag.length >= 2
    && tag.length <= 24
    && !isGenericFallbackTag(tag)
    && !/^\d+(?:[._:/-]\d+)*$/.test(tag)
    && /[A-Za-z\u4e00-\u9fa5]/.test(tag);
}

function getCanonicalCategoryTerms(value) {
  const canonical = canonicalizeTagName(value);
  if (!canonical) return [];
  const terms = [canonical];
  for (const [alias, target] of Object.entries(CATEGORY_ALIASES)) {
    if (target === canonical) terms.push(alias);
  }
  for (const [folderName, target] of FOLDER_SYNONYM_MAP) {
    if (canonicalizeTagName(target) === canonical) terms.push(folderName);
  }
  return [...new Set(terms.map(term => String(term || '').trim()).filter(Boolean))];
}

function isCanonicalCategoryTag(value) {
  return Object.prototype.hasOwnProperty.call(CATEGORY_ID_BY_LABEL, canonicalizeTagName(value));
}

function canonicalCategoryTag(value) {
  const tag = canonicalizeTagName(value);
  return isUsableTagName(tag) ? tag : '';
}

function getSmartTaggerRuleAudit() {
  const core = typeof globalThis !== 'undefined' ? globalThis.BookmarkRecommendationCore : null;
  if (!core?.auditRuleSet) return { valid: false, errors: [{ code: 'recommendation_core_unavailable' }] };
  return core.auditRuleSet({
    domainRules: DOMAIN_RULES,
    urlPathRules: URL_PATH_RULES,
    keywordMap: KEYWORD_TAG_MAP,
    prototypes: TAG_PROTOTYPES,
    taxonomy: CATEGORY_TAXONOMY,
    aliases: CATEGORY_ALIASES,
  });
}

// ===== 关键词权重覆盖（泛词低权，专属词高权） =====
const KEYWORD_WEIGHT_OVERRIDES = {
  // 极泛英文词
  'ai': 1, 'ml': 1, 'api': 2, 'ui': 1, 'ux': 1, 'data': 1, 'sql': 2,
  'photo': 2, 'game': 2, 'gaming': 2, 'health': 2, 'law': 2, 'video': 2,
  'music': 2, 'travel': 2, 'trip': 2, 'social': 2, 'finance': 2,
  'product': 2, 'code': 2, 'web': 2, 'app': 2, 'tool': 2, 'tools': 2,
  'system': 1, 'model': 1, 'network': 1, 'node': 2, 'css': 2, 'html': 2,
  'git': 2, 'docker': 2, 'kubernetes': 2, 'test': 2, 'testing': 2,
  'bug': 2, 'user': 2, 'design': 2, 'paper': 2, 'research': 2,
  'thesis': 2, 'stock': 2, 'fund': 2, 'invest': 2, 'food': 2,
  'hotel': 2, 'flight': 2, 'song': 2, 'album': 2, 'guitar': 2,
  'fitness': 2, 'medical': 2, 'legal': 2, 'regulation': 2,
  'compliance': 2, 'encryption': 2, 'auth': 2, 'oauth': 2, 'jwt': 2,
  'pentest': 2,
  // 极泛中文词
  '安全': 2, '加密': 2, '漏洞': 2, '数据': 2, '数据库': 2, '分析': 2,
  '可视化': 2, '图标': 2, '交互': 2, '视觉': 2, '配色': 2, '字体': 2,
  '算法': 2, '编程': 2, '框架': 2, '组件': 2, '库': 2, '编译': 2,
  '调试': 2, '重构': 2, '部署': 2, '测试': 2, '需求': 2, '产品': 2,
  '用户': 2, '运营': 2, '迭代': 2, '日志': 2, '学术': 2, '引用': 2,
  '文献': 2, '实验': 2, '运动': 2, '健身': 2, '营养': 2, '饮食': 2,
  '睡眠': 2, '心理': 2, '冥想': 2, '合同': 2, '诉讼': 2, '仲裁': 2,
  '牌照': 2, '理财': 2, '保险': 2, '信贷': 2, '利率': 2, '通胀': 2,
  'gdp': 2, '民宿': 2, '自驾': 2, '跟团': 2, '景点': 2, '攻略': 2,
  '钢琴': 2, '和弦': 2, '节奏': 2, '旋律': 2, '歌词': 2, '翻唱': 2,
  '原创': 2, '论坛': 2, '聊天': 2, '群组': 2, '粉丝': 2, '关注': 2,
  '互动': 2, '直播': 2, '短视频': 2, 'vlog': 2, '流量': 2,
};

function keywordBaseWeight(kw) {
  const lower = kw.toLowerCase();
  if (KEYWORD_WEIGHT_OVERRIDES[lower] !== undefined) {
    return KEYWORD_WEIGHT_OVERRIDES[lower];
  }
  const cn = Array.from(kw).filter(c => c >= '\u4e00' && c <= '\u9fff').length;
  if (cn >= 4) return 4;
  if (cn === 3) return 3;
  if (cn === 2) return 2;
  if (cn === 1) return 1;
  if (lower.includes(' ')) return 4;
  if (lower.length <= 2) return 1;
  if (lower.length <= 4) return 2;
  return 3;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const CHINESE_WORD_SEGMENTER = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('zh', { granularity: 'word' })
  : null;

function segmentChineseWords(text) {
  const value = String(text || '');
  if (CHINESE_WORD_SEGMENTER) {
    return [...CHINESE_WORD_SEGMENTER.segment(value)]
      .filter(item => item.isWordLike && /[\u4e00-\u9fa5]/.test(item.segment))
      .map(item => item.segment.toLowerCase());
  }
  const words = [];
  for (const segment of value.match(/[\u4e00-\u9fa5]+/g) || []) {
    if (segment.length === 1) words.push(segment);
    else for (let index = 0; index < segment.length - 1; index++) words.push(segment.slice(index, index + 2));
  }
  return words;
}

// 英文关键词要求整词匹配，避免 node → notes 这类子串误命中
function keywordMatchesWhole(kw, textLower) {
  const lowerKw = kw.toLowerCase();
  if (/[\u4e00-\u9fa5]/.test(lowerKw)) {
    if (lowerKw === '合规' && textLower.includes('合规格')) return false;
    return textLower.includes(lowerKw);
  }
  if (lowerKw.includes(' ')) {
    return textLower.includes(lowerKw);
  }
  const re = new RegExp(`\\b${escapeRegex(lowerKw)}\\b`, 'i');
  return re.test(textLower);
}

// ===== 标题正则规则（精准匹配，替代简单 includes） =====
const TITLE_REGEX_RULES = [
  // 开发框架组合
  { regex: /(react|vue|angular|svelte|next|nuxt|remix)[\s\-_]*(组件|component|plugin|hook|插件|教程|入门|实战|最佳实践|实践|进阶|源码|原理)/i, tag: '开发', score: 2 },
  { regex: /(docker|k8s|kubernetes)[\s\-_]*(部署|compose|编排|集群|容器|pod|service)/i, tag: 'DevOps', score: 2 },
  { regex: /(python|java|go|rust|swift)[\s\-_]*(性能|优化|并发|内存|协程|goroutine)/i, tag: '开发', score: 2 },
  // AI 组合
  { regex: /(gpt|llm|大模型|chatgpt|claude|gemini)[\s\-_]*(微调|fine.?tun|训练|推理|部署|api|应用|agent|prompt)/i, tag: 'AI', score: 2 },
  { regex: /(stable.?diffusion|midjourney|dall.?e)[\s\-_]*(提示词|prompt|模型|lora|controlnet|comfyui)/i, tag: 'AI', score: 2 },
  // 设计组合
  { regex: /(figma|sketch|xd)[\s\-_]*(插件|plugin|组件|设计系统|模板|template)/i, tag: '设计', score: 2 },
  { regex: /(css|tailwind|sass)[\s\-_]*(动画|animation|过渡|transition|布局|layout|grid|flex)/i, tag: '设计', score: 2 },
  // 数据组合
  { regex: /(mysql|postgres|mongodb|redis)[\s\-_]*(优化|索引|集群|分片|复制|备份|性能)/i, tag: '数据', score: 2 },
  { regex: /(spark|flink|kafka)[\s\-_]*(流式|实时|批处理|数据管道|etl)/i, tag: '数据', score: 2 },
  // 安全组合
  { regex: /(xss|csrf|sql.?注入|漏洞|渗透)[\s\-_]*(攻击|防御|修复|检测|防护)/i, tag: '安全', score: 2 },
  { regex: /((网络|信息|数据|云|系统)安全|等保|零信任).{0,10}(合规|compliance)|(合规|compliance).{0,10}((网络|信息|数据|云|系统)安全|等保|零信任)/i, tag: '安全', score: 3 },
  { regex: /(法律|法规|监管|隐私|gdpr|合同).{0,10}(合规|compliance)|(合规|compliance).{0,10}(法律|法规|监管|隐私|gdpr|合同)/i, tag: '法律', score: 3 },
  // 企业 OA、协同及管理系统属于办公；“管理”或“测试”单独出现时不归类。
  { regex: /(?:协同|办公|\boa\b|审批|报销|企业管理|综合管理|移动管理|项目管理|管理平台|审核系统|wps).{0,12}(系统|平台|门户|客户端|应用)?/i, tag: '办公', score: 4 },
  { regex: /(?:国投|集团|股份|公司|企业).{0,8}(?:测试|业务|管理|办公).{0,6}(?:系统|平台)/i, tag: '办公', score: 4 },
  { regex: /(?:单元|自动化|集成|接口|e2e).{0,4}测试|测试.{0,4}(?:框架|用例|代码|接口|工具)/i, tag: '开发', score: 3 },
  // 产品组合
  { regex: /(用户|user)[\s\-_]*(增长|留存|转化|画像|旅程|研究|调研)/i, tag: '产品', score: 2 },
  // 金融组合
  { regex: /(股票|基金|期货|期权)[\s\-_]*(策略|量化|回测|交易|风控|分析)/i, tag: '金融', score: 2 },
  // 学术组合
  { regex: /(论文|paper)[\s\-_]*(阅读|笔记|写作|投稿|审稿|引用|综述)/i, tag: '学术', score: 2 },
  // 区块链组合
  { regex: /(defi|nft|web3|智能合约)[\s\-_]*(协议|项目|安全|审计|开发|部署)/i, tag: '区块链', score: 2 },
  // 游戏组合
  { regex: /(unity|unreal|godot)[\s\-_]*(shader|渲染|物理|ai|动画|入门|实战)/i, tag: '游戏', score: 2 },
  // 长尾标签组合触发（降低单泛词误触）
  { regex: /(api|接口|openapi|swagger|graphql|rest api)[\s\-_]*(文档|规范|参考|设计|定义|调用)/i, tag: 'API', score: 3 },
  { regex: /(入门|新手|零基础|step.?by.?step|quickstart|getting started|快速开始)[\s\-_]*(教程|指南|guide|tutorial)/i, tag: '教程', score: 3 },
  { regex: /(教程|指南|guide|tutorial)[\s\-_]*(入门|实战|详解|系列|合集)/i, tag: '教程', score: 2 },
  { regex: /(在线|网页|免费)[\s\-_]*(工具|转换|格式化|压缩|生成|计算器)/i, tag: '工具', score: 3 },
  { regex: /(json|regex|markdown|yaml|sql|图片|pdf|base64)[\s\-_]*(格式化|转换|压缩|美化|工具)/i, tag: '工具', score: 3 },
  { regex: /(隐私政策|用户协议|服务条款|法律声明|版权声明|gdpr|license agreement|terms of service)/i, tag: '法律', score: 3 },
  { regex: /(github|gitlab|bitbucket|gitea)[\s\-_]*(仓库|项目|repository|project)/i, tag: '项目', score: 2 },
  { regex: /(博客|专栏|长文|随笔|读后感|原创文章|blog post|article)/i, tag: '文章', score: 2 }
];

// ===== 停用词表 =====
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  'the', 'this', 'that', 'these', 'those', 'it', 'its', 'my', 'your',
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都',
  '一', '一个', '上', '也', '很', '到', '说', '为', '去', '能', '会',
  '着', '过', '地', '得', '被', '把', '给', '让', '用', '从',
  // URL 协议/通用词，避免被误提为分类信号
  'http', 'https', 'www', 'com', 'cn', 'net', 'org', 'html', 'htm'
]);

// ===== 用户覆盖规则存储键 =====
const USER_OVERRIDES_KEY = 'tag_user_overrides';
const TAG_COLORS_KEY = 'tag_colors';
const DOC_FREQ_KEY = 'tag_doc_frequency'; // TF-IDF 文档频率存储
const DOC_PROCESSED_URLS_KEY = 'tag_doc_processed_urls'; // 已统计过的文档 URL
const CONTENT_CACHE_KEY = 'tag_content_cache'; // 已提取正文缓存
const CONTENT_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 天
const CONTENT_CACHE_MAX = 300; // 最大缓存条数

// ===== 同义词库（术语归一化） =====
const SYNONYM_GROUPS = [
  ['react', 'reactjs', 'react.js', 'react 18', 'react 19', 'reactjs教程'],
  ['vue', 'vuejs', 'vue.js', 'vue3', 'vue2'],
  ['angular', 'angularjs', 'angular 2'],
  ['svelte', 'sveltekit'],
  ['next', 'nextjs', 'next.js'],
  ['nuxt', 'nuxtjs', 'nuxt.js'],
  ['node', 'nodejs', 'node.js'],
  ['typescript', 'ts'],
  ['javascript', 'js', 'es6', 'es2015'],
  ['python', 'py', 'python3'],
  ['golang', 'go语言', 'go 语言'],
  ['rust', 'rustlang'],
  ['docker', '容器', 'container', 'dockerfile'],
  ['k8s', 'kubernetes', 'k8s集群'],
  ['ai', '人工智能', 'a.i.', 'machine intelligence', 'ai智能'],
  ['ml', '机器学习', 'machine learning'],
  ['dl', '深度学习', 'deep learning'],
  ['llm', '大模型', '大语言模型', 'large language model'],
  ['gpt', 'chatgpt', 'gpt-4', 'gpt4', 'gpt-3'],
  ['css', '样式', 'stylesheet'],
  ['html', 'h5', 'html5'],
  ['sql', '数据库查询', 'query'],
  ['mysql', 'mariadb'],
  ['postgresql', 'postgres', 'pg'],
  ['mongodb', 'mongo'],
  ['redis', '缓存'],
  ['figma', 'figma设计'],
  ['photoshop', 'ps', 'ps修图'],
  ['linux', 'ubuntu', 'centos', 'debian'],
  ['git', 'github', 'gitlab', '版本控制'],
  ['api', '接口', 'restful', 'rest api'],
  ['graphql', 'gql'],
  ['wasm', 'webassembly'],
  ['vite', 'vitest'],
  ['webpack', 'bundler'],
  ['tailwind', 'tailwindcss', 'tailwind css'],
  ['bootstrap', 'bs5'],
  ['spring', 'springboot', 'spring boot'],
  ['django', 'flask', 'python web'],
  ['devops', 'devsecops', 'cicd', 'ci/cd'],
  ['nft', 'nfts', '非同质化代币'],
  ['defi', '去中心化金融'],
  ['web3', 'web 3.0', 'web3.0'],
  ['blockchain', '区块链'],
  ['unity', 'unity3d', 'unity3d引擎'],
  ['unreal', 'unreal engine', 'ue5', 'ue4'],
  ['shader', '着色器', 'glsl', 'hlsl'],
  ['摄影', 'photography', '拍摄'],
  ['健身', 'fitness', '运动', '锻炼'],
  ['冥想', 'meditation', '正念'],
  ['理财', '投资', 'invest', 'finance'],
  ['股票', 'stock', '股市', 'a股', '美股'],
  ['基金', 'fund', '公募基金'],
  ['论文', 'paper', 'research paper'],
  ['教程', 'tutorial', 'tutorials', '指南', 'guide'],
  ['文档', 'docs', 'documentation', '参考文档'],
  ['工具', 'tool', 'tools', 'utility'],
  ['视频', 'video', 'videos', '视频教程'],
  ['游戏', 'game', 'gaming', 'games'],
  ['音乐', 'music', 'song', 'songs'],
  ['旅行', 'travel', 'trip', '旅游'],
  ['美食', 'food', 'cooking', '烹饪', '菜谱'],
  ['新闻', 'news', '资讯', '热点'],
];

// 同义词映射表：term -> 标准词
const SYNONYM_MAP = (() => {
  const map = new Map();
  for (const group of SYNONYM_GROUPS) {
    const canonical = group[0];
    for (const synonym of group) {
      map.set(synonym.toLowerCase(), canonical);
    }
  }
  return map;
})();

// 术语归一化：将同义词映射到标准词
function normalizeTerm(term) {
  if (!term) return term;
  const lower = term.toLowerCase().trim();
  return SYNONYM_MAP.get(lower) || term;
}

// ===== Levenshtein 距离（模糊匹配） =====
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // 删除
        matrix[i][j - 1] + 1,      // 插入
        matrix[i - 1][j - 1] + cost // 替换
      );
    }
  }
  return matrix[b.length][a.length];
}

// 模糊匹配：判断 input 是否与 target 相似（允许 maxDistance 编辑距离）
function fuzzyMatch(input, target, maxDistance = 2) {
  if (!input || !target) return false;
  const a = input.toLowerCase().trim();
  const b = target.toLowerCase().trim();
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > maxDistance) return false;
  return levenshtein(a, b) <= maxDistance;
}

// 简单英文词干提取（去掉常见的 s/es/ing/ed）
function stemEnglish(word) {
  if (!word || word.length <= 3) return word;
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('ches') || word.endsWith('shes')) {
    return word.slice(0, -2);
  }
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('ied') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && word.length > 3) return word.slice(0, -1);
  return word;
}

// ===== TF-IDF 计算 =====

// 分词：中英文混合分词，中文优先使用 Intl.Segmenter，不可用时回退双字组合。
function tokenize(text) {
  if (!text) return [];
  const lowerText = text.toLowerCase();

  // 英文：提取字母数字词，并做词干提取
  const englishWords = lowerText.match(/[a-z][a-z0-9._-]*/g) || [];
  const englishTokens = englishWords.map(stemEnglish).filter(w => w.length > 1);

  const chineseTokens = segmentChineseWords(text);

  const tokens = [...englishTokens, ...chineseTokens];

  // 过滤停用词（内置 + 动态）+ 归一化
  const mergedStopWords = getMergedStopWords();
  return tokens
    .map(normalizeTerm)
    .filter(t => t && t.length > 1 && !mergedStopWords.has(t.toLowerCase()));
}

// 词频统计
function termFrequency(tokens) {
  const tf = new Map();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  return tf;
}

// 从内置规则构建默认种子语料（解决冷启动问题）
function buildDefaultCorpusFromRules() {
  const tagFreq = {};
  const tagTotalWords = {};
  const df = {};
  const tagCount = Object.keys(KEYWORD_TAG_MAP).length || 1;
  const totalDocs = Math.max(1000, tagCount * 50);

  for (const [tag, keywords] of Object.entries(KEYWORD_TAG_MAP)) {
    tagFreq[tag] = {};
    let total = 0;
    for (const kw of keywords) {
      const tokens = tokenize(kw);
      if (tokens.length === 0) continue;
      for (const t of tokens) {
        const weight = Math.max(3, Math.min(8, t.length));
        tagFreq[tag][t] = (tagFreq[tag][t] || 0) + weight;
        total += weight;
        // 文档频率：假设该词出现在一部分文档中
        df[t] = (df[t] || 0) + Math.max(2, Math.floor(totalDocs / (tagCount * 3)));
      }
    }
    tagTotalWords[tag] = total;
  }

  return {
    docFreq: { df, totalDocs },
    tagCorpus: {
      tagFreq,
      tagTotalWords,
      globalVocabSize: Object.keys(df).length
    }
  };
}

// 获取文档频率（从 chrome.storage.local，空则导入种子语料）
let _docFreqCache = null;
let _totalDocsCache = 0;
let _totalTokenLenCache = 0;
let _processedDocUrlsCache = null;

async function loadDocFrequency() {
  if (_docFreqCache) return { df: _docFreqCache, totalDocs: _totalDocsCache, totalTokenLen: _totalTokenLenCache };
  try {
    const result = await chrome.storage.local.get(DOC_FREQ_KEY);
    let data = result[DOC_FREQ_KEY] || { df: {}, totalDocs: 0, totalTokenLen: 0 };
    // 冷启动：没有本地语料时，用内置规则生成默认种子语料
    if (!data.totalDocs || Object.keys(data.df || {}).length === 0) {
      const defaults = buildDefaultCorpusFromRules();
      data = defaults.docFreq;
      data.totalTokenLen = data.totalDocs * 30; // 种子语料平均 30 token
      await chrome.storage.local.set({ [DOC_FREQ_KEY]: data });
    }
    _docFreqCache = data.df || {};
    _totalDocsCache = data.totalDocs || 0;
    _totalTokenLenCache = data.totalTokenLen || 0;
    return { df: _docFreqCache, totalDocs: _totalDocsCache, totalTokenLen: _totalTokenLenCache };
  } catch {
    return { df: {}, totalDocs: 0, totalTokenLen: 0 };
  }
}

async function loadProcessedDocUrls() {
  if (_processedDocUrlsCache) return _processedDocUrlsCache;
  const result = await chrome.storage.local.get(DOC_PROCESSED_URLS_KEY);
  _processedDocUrlsCache = new Set(result[DOC_PROCESSED_URLS_KEY] || []);
  return _processedDocUrlsCache;
}

async function saveProcessedDocUrls(set) {
  _processedDocUrlsCache = set;
  await chrome.storage.local.set({ [DOC_PROCESSED_URLS_KEY]: Array.from(set) });
}

// 增量更新文档频率（新书签入库时调用）
async function updateDocFrequency(text, url = null) {
  // URL 级去重：同一文档只统计一次 df
  if (url) {
    const processed = await loadProcessedDocUrls();
    const key = url.toLowerCase().trim();
    if (processed.has(key)) return;
    processed.add(key);
    await saveProcessedDocUrls(processed);
  }

  const tokens = tokenize(text);
  const tokenSet = new Set(tokens); // 去重：每篇文档每个词只计一次
  const { df, totalDocs, totalTokenLen } = await loadDocFrequency();

  for (const token of tokenSet) {
    df[token] = (df[token] || 0) + 1;
  }
  _docFreqCache = df;
  _totalDocsCache = totalDocs + 1;
  _totalTokenLenCache = totalTokenLen + tokens.length;

  await chrome.storage.local.set({
    [DOC_FREQ_KEY]: { df, totalDocs: _totalDocsCache, totalTokenLen: _totalTokenLenCache }
  });
}

// 计算 TF-IDF 得分（BM25 风格）：返回每个标签的得分
function computeTfIdfScores(text, df, totalDocs, totalTokenLen) {
  const tokens = tokenize(text);
  const tf = termFrequency(tokens);
  const scores = {}; // tag -> score

  const N = Math.max(totalDocs, 1); // 避免除零
  const avgDocLen = Math.max(totalTokenLen / N, 20); // 防止冷启动除零
  const k1 = 1.2;
  const b = 0.75;

  for (const [tag, keywords] of Object.entries(getMergedKeywordMap())) {
    let tagScore = 0;
    for (const kw of keywords) {
      const normalizedKw = normalizeTerm(kw);
      let matched = false;
      let tfVal = 0;
      let term = normalizedKw;

      // 精确匹配
      if (tf.has(normalizedKw)) {
        tfVal = tf.get(normalizedKw);
        matched = true;
      } else {
        // 模糊匹配（对英文短词跳过，避免误匹配）
        if (normalizedKw.length < 4) continue;
        for (const [token, count] of tf) {
          if (fuzzyMatch(token, normalizedKw, 1)) {
            tfVal = count;
            term = token;
            matched = true;
            break; // 每个关键词只匹配一次
          }
        }
      }

      if (!matched) continue;

      const dfVal = Math.min(Math.max(df[term] || 1, 1), N); // 防止 df > N 导致负 IDF
      // BM25 IDF
      const idf = Math.log((N - dfVal + 0.5) / (dfVal + 0.5) + 1);
      // BM25 饱和 TF + 长度归一化
      const tfSat = (tfVal * (k1 + 1)) / (tfVal + k1 * (1 - b + b * tokens.length / avgDocLen));
      tagScore += tfSat * idf * (normalizedKw.length < 4 ? 0.6 : 1.0);
    }
    if (tagScore > 0) {
      scores[tag] = tagScore;
    }
  }

  return scores;
}

// ===== 正文内容缓存 =====
async function getCachedContent(url) {
  if (!url) return null;
  try {
    const result = await chrome.storage.local.get(CONTENT_CACHE_KEY);
    const cache = result[CONTENT_CACHE_KEY] || {};
    const hit = cache[url];
    if (!hit) return null;
    if (Date.now() - hit.ts > CONTENT_CACHE_TTL) return null;
    return hit.data || null;
  } catch {
    return null;
  }
}

async function setCachedContent(url, data) {
  if (!url || !data) return;
  try {
    const result = await chrome.storage.local.get(CONTENT_CACHE_KEY);
    const cache = result[CONTENT_CACHE_KEY] || {};
    const trimmed = {
      title: (data.title || '').slice(0, 200),
      excerpt: (data.excerpt || data.metaDesc || '').slice(0, 500),
      textContent: (data.textContent || '').slice(0, 3000),
      metaDesc: (data.metaDesc || '').slice(0, 500),
      lengthChars: data.lengthChars || (data.textContent || '').length
    };
    cache[url] = { data: trimmed, ts: Date.now() };
    // 清理过期 + 限制条数
    const valid = Object.entries(cache)
      .filter(([_, v]) => Date.now() - v.ts < CONTENT_CACHE_TTL)
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, CONTENT_CACHE_MAX);
    await chrome.storage.local.set({ [CONTENT_CACHE_KEY]: Object.fromEntries(valid) });
  } catch {
    // 缓存失败不影响主流程
  }
}

// 归一化置信度到 0-1 范围（使用固定参考值，避免 top1 永远为 1.0）
function normalizeConfidence(score) {
  // 增强后信号层增多，参考最大值相应提升，避免置信度长期顶格
  const REFERENCE_MAX = 180;
  return Math.min(score / REFERENCE_MAX, 1.0);
}

// 判断标签是否有强规则信号（文件夹/域名/用户覆盖）
function hasStrongSignal(signals, tag) {
  const list = signals[tag] || [];
  return list.some(s =>
    s === 'folder' ||
    s === 'domain' ||
    s.startsWith('user-override')
  );
}

function hasDirectLocalSignal(signals, tag) {
  const list = signals[tag] || [];
  return hasStrongSignal(signals, tag) || list.some(s =>
    s === 'folder-keyword' ||
    s === 'subdomain' ||
    s === 'extension' ||
    s === 'domain+path' ||
    s === 'url-path:1' ||
    s.startsWith('semantic-title:') ||
    s.startsWith('semantic-summary:') ||
    s.startsWith('semantic-url:') ||
    s.startsWith('regex:') ||
    s.startsWith('keyword:') ||
    s.startsWith('ngram:')
  );
}

// 判断当前书签是否存在任何强规则信号
function hasAnyStrongSignal(signals) {
  for (const list of Object.values(signals)) {
    if (list.some(s => s === 'folder' || s === 'domain' || s.startsWith('user-override'))) {
      return true;
    }
  }
  return false;
}

function applyConfidenceFilter(sortedEntries, signals) {
  if (sortedEntries.length === 0) return [];

  const top1Score = sortedEntries[0][1];
  const top1Tag = sortedEntries[0][0];

  // 强规则信号下提高阈值，避免内容噪声产生过多副标签拉低精确匹配率
  const ratio = hasStrongSignal(signals, top1Tag) ? 0.65 : 0.45;
  const relativeThreshold = top1Score * ratio;
  const filtered = sortedEntries.filter(([_, score]) => score >= relativeThreshold);

  return filtered.slice(0, 3);
}

function selectFinalTagEntries(scores, signals) {
  const sortedEntries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sortedEntries.length === 0) return [['其他', 0]];

  // 明确的标题、文件夹、域名或路径线索优先于正文统计分数，避免弱语义挤掉实际业务标签。
  const directEntries = sortedEntries.filter(([tag]) => hasDirectLocalSignal(signals, tag));
  if (directEntries.length > 0) return applyConfidenceFilter(directEntries, signals);

  const filteredEntries = applyConfidenceFilter(sortedEntries, signals);
  const topScore = filteredEntries[0]?.[1] || 0;
  if (topScore > 16) return filteredEntries;

  // 弱统计或语义信号不足以归类。
  return [['其他', 0]];
}

const GENERIC_FALLBACK_TAGS = new Set(['其他', '其它', '未知', '未分类', 'other', 'others', 'unknown', 'uncategorized', 'misc']);

function isGenericFallbackTag(tag) {
  return GENERIC_FALLBACK_TAGS.has(
    String(tag || '').trim().toLowerCase()
  );
}

// ===== 双向贝叶斯评分（is / is_not + delta） =====
// 参考 pncnmnp/Bookmark-Manager 的多项式朴素贝叶斯，适配本地书签场景
// 每个标签维护一个"语料"（该标签下所有书签的词频统计），计算：
//   p_is     = log P(词 | 属于该标签)     — 正向概率
//   p_is_not = log P(词 | 不属于该标签)    — 反向概率
//   delta = |p_is_not - p_is|             — 置信度间距

const TAG_CORPUS_KEY = 'tag_bayesian_corpus';
// 存储结构: { tagFreq: { tag: { word: count } }, tagTotalWords: { tag: count }, globalVocabSize: number }

let _tagCorpusCache = null;

async function loadTagCorpus() {
  if (_tagCorpusCache) return _tagCorpusCache;
  try {
    const result = await chrome.storage.local.get(TAG_CORPUS_KEY);
    let data = result[TAG_CORPUS_KEY] || { tagFreq: {}, tagTotalWords: {}, globalVocabSize: 0 };
    // 冷启动：没有本地语料时，用内置规则生成默认种子语料
    const hasData = Object.keys(data.tagFreq || {}).length > 0;
    if (!hasData) {
      const defaults = buildDefaultCorpusFromRules();
      data = defaults.tagCorpus;
      await chrome.storage.local.set({ [TAG_CORPUS_KEY]: data });
    }
    _tagCorpusCache = {
      tagFreq: data.tagFreq || {},
      tagTotalWords: data.tagTotalWords || {},
      globalVocabSize: data.globalVocabSize || 0
    };
    return _tagCorpusCache;
  } catch {
    return { tagFreq: {}, tagTotalWords: {}, globalVocabSize: 0 };
  }
}

// 增量更新标签语料（书签打标签后调用）
async function updateTagCorpus(text, tags) {
  if (!tags || tags.length === 0) return;
  const corpus = await loadTagCorpus();
  const tokens = tokenize(text);
  const tokenFreq = new Map();
  for (const t of tokens) {
    tokenFreq.set(t, (tokenFreq.get(t) || 0) + 1);
  }

  // 全局词汇表更新
  const globalVocabSet = new Set(Object.keys(corpus.tagFreq).length > 0
    ? collectAllVocab(corpus) : []);
  for (const token of tokenFreq.keys()) {
    globalVocabSet.add(token);
  }
  corpus.globalVocabSize = globalVocabSet.size;

  // 为每个标签更新词频
  for (const tag of tags) {
    if (!corpus.tagFreq[tag]) {
      corpus.tagFreq[tag] = {};
      corpus.tagTotalWords[tag] = 0;
    }
    const freq = corpus.tagFreq[tag];
    for (const [token, count] of tokenFreq) {
      freq[token] = (freq[token] || 0) + count;
      corpus.tagTotalWords[tag] += count;
    }
  }

  _tagCorpusCache = corpus;
  await chrome.storage.local.set({ [TAG_CORPUS_KEY]: corpus });
}

// 收集语料中所有词汇（用于全局词汇表大小）
function collectAllVocab(corpus) {
  const vocab = new Set();
  for (const tag of Object.keys(corpus.tagFreq)) {
    for (const word of Object.keys(corpus.tagFreq[tag])) {
      vocab.add(word);
    }
  }
  return [...vocab];
}

// 计算双向贝叶斯得分
// 返回: { tag -> { pIs, pIsNot, delta, score } }
function computeBayesianScores(text, candidateTags, corpus) {
  const tokens = tokenize(text);
  if (tokens.length === 0 || candidateTags.length === 0) return {};

  const V = Math.max(corpus.globalVocabSize, 1); // 全局词汇表大小（拉普拉斯平滑分母）
  const results = {};

  // 计算所有标签的总词数，用于先验
  let allTagTotal = 0;
  for (const total of Object.values(corpus.tagTotalWords || {})) {
    allTagTotal += total;
  }
  allTagTotal = Math.max(allTagTotal, 1);

  // 文本内词频（加权似然用）
  const tokenFreq = new Map();
  for (const t of tokens) {
    tokenFreq.set(t, (tokenFreq.get(t) || 0) + 1);
  }

  for (const tag of candidateTags) {
    const tagFreq = corpus.tagFreq[tag];
    const tagTotal = corpus.tagTotalWords[tag] || 0;

    // 如果该标签还没有语料数据，跳过（无法计算贝叶斯概率）
    if (!tagFreq || tagTotal === 0) continue;

    // 计算其他所有标签的总词频（作为"不属于该标签"的语料）
    let otherTotal = 0;
    const otherFreq = {};
    for (const otherTag of Object.keys(corpus.tagFreq)) {
      if (otherTag === tag) continue;
      for (const [word, count] of Object.entries(corpus.tagFreq[otherTag])) {
        otherFreq[word] = (otherFreq[word] || 0) + count;
        otherTotal += count;
      }
    }

    // 如果没有"其他"语料，用全局平均回退
    if (otherTotal === 0) otherTotal = tagTotal;

    // 先验：该标签在所有标签语料中的占比
    const priorTag = Math.max(tagTotal / allTagTotal, 0.001);
    const priorNotTag = Math.max(1 - priorTag, 0.001);

    let pIs = Math.log(priorTag);     // log P(属于该标签) + log P(文本 | 属于该标签)
    let pIsNot = Math.log(priorNotTag);  // log P(不属于该标签) + log P(文本 | 不属于该标签）

    for (const [token, count] of tokenFreq) {
      // 正向：P(词 | 属于该标签)，拉普拉斯平滑
      const wordMatchInTag = tagFreq[token] || 0;
      const pWordGivenTag = (wordMatchInTag + 1) / (tagTotal + V);

      // 反向：P(词 | 不属于该标签)，拉普拉斯平滑
      const wordMatchInOther = otherFreq[token] || 0;
      const pWordGivenNotTag = (wordMatchInOther + 1) / (otherTotal + V);

      // 按词在本文中的占比加权，避免重复词刷分
      const weight = count / tokens.length;
      pIs += Math.log(pWordGivenTag) * weight;
      pIsNot += Math.log(pWordGivenNotTag) * weight;
    }

    const delta = Math.abs(pIsNot - pIs);

    // 转换为得分：
    // - pIs > pIsNot → 正信号（该标签更可能）
    // - delta 越大 → 置信度越高
    // 得分 = (pIs - pIsNot) 的正值部分，缩放到与规则权重可比的范围
    let score = 0;
    if (pIs > pIsNot) {
      // 正向得分：delta 越大越好，缩放到 0-25 范围
      score = Math.min(delta * 2, 25);
    } else {
      // 反向：pIsNot > pIs，该标签不太可能，给微弱负分（降低该标签排名）
      score = -Math.min(delta, 5);
    }

    results[tag] = { pIs, pIsNot, delta, score };
  }

  return results;
}

// ===== 网页内容特征提取（Service Worker 抓取 HTML 时使用） =====
function extractMetaFromHtml(html) {
  if (!html) return { description: '', ogDescription: '', keywords: [] };
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i);
  const keywordsMatch = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)/i);

  return {
    description: descMatch?.[1]?.trim() || '',
    ogDescription: ogDescMatch?.[1]?.trim() || '',
    keywords: keywordsMatch?.[1]?.split(',').map(s => s.trim()).filter(Boolean) || []
  };
}

function extractPageFingerprintFromHtml(html) {
  if (!html) {
    return { leadingText: '', codeBlocks: 0, images: 0, tables: 0, headings: [], techStack: [] };
  }
  const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                   .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                   .replace(/<[^>]+>/g, ' ');
  const leadingText = text.replace(/\s+/g, ' ').trim().slice(0, 500);
  const codeBlocks = (html.match(/<pre[\s>]/gi) || []).length
                   + (html.match(/<code[\s>]/gi) || []).length;
  const images = (html.match(/<img[\s>]/gi) || []).length;
  const tables = (html.match(/<table[\s>]/gi) || []).length;
  const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, ' ').trim())
    .filter(Boolean);

  const lowerHtml = html.toLowerCase();
  const techStack = [];
  if (lowerHtml.includes('react')) techStack.push('react');
  if (lowerHtml.includes('vue.js') || lowerHtml.includes('vuejs')) techStack.push('vue');
  if (lowerHtml.includes('angular')) techStack.push('angular');
  if (lowerHtml.includes('svelte')) techStack.push('svelte');
  if (lowerHtml.includes('tailwind')) techStack.push('tailwind');
  if (lowerHtml.includes('github.com')) techStack.push('github');
  if (lowerHtml.includes('arxiv.org') || lowerHtml.includes('doi.org')) techStack.push('academic');
  if (lowerHtml.includes('huggingface.co')) techStack.push('ai');

  return { leadingText, codeBlocks, images, tables, headings, techStack };
}

// ===== 正文指纹提取（基于已提取的纯文本 contentText） =====
function extractPageFingerprintFromText(text) {
  if (!text) {
    return { leadingText: '', codeBlocks: 0, images: 0, tables: 0, headings: [], techStack: [] };
  }
  const leadingText = text.replace(/\s+/g, ' ').trim().slice(0, 500);
  const codeBlocks = (text.match(/```[\s\S]*?```/g) || []).length
                   + (text.match(/`[^`]+`/g) || []).length;
  const images = (text.match(/图片|image|photo|图/gi) || []).length;
  const tables = (text.match(/\|[^\n]+\|[^\n]+\|/g) || []).length;
  const headings = [];

  const lowerText = text.toLowerCase();
  const techStack = [];
  if (lowerText.includes('react')) techStack.push('react');
  if (lowerText.includes('vue')) techStack.push('vue');
  if (lowerText.includes('angular')) techStack.push('angular');
  if (lowerText.includes('svelte')) techStack.push('svelte');
  if (lowerText.includes('tailwind')) techStack.push('tailwind');
  if (lowerText.includes('github')) techStack.push('github');
  if (lowerText.includes('arxiv') || lowerText.includes('doi')) techStack.push('academic');
  if (lowerText.includes('huggingface') || lowerText.includes('civitai') || lowerText.includes('ollama')) techStack.push('ai');

  return { leadingText, codeBlocks, images, tables, headings, techStack };
}

// ===== 标签原型 BM25 语义匹配 =====
function computePrototypeBm25Scores(text, prototypes) {
  const tokens = tokenize(text);
  if (tokens.length === 0) return {};
  const tf = termFrequency(tokens);
  const scores = {};

  // 预计算原型 token，避免重复分词
  const prototypeTokens = {};
  for (const [tag, protoText] of Object.entries(prototypes)) {
    prototypeTokens[tag] = tokenize(protoText);
  }

  const numPrototypes = Object.keys(prototypes).length || 1;

  for (const [tag, protoTokens] of Object.entries(prototypeTokens)) {
    if (protoTokens.length === 0) continue;
    const protoFreq = termFrequency(protoTokens);
    const protoLen = protoTokens.length;

    let score = 0;
    for (const [term, freq] of tf) {
      if (!protoFreq.has(term)) continue;
      const protoTf = protoFreq.get(term);
      const idf = Math.log((numPrototypes - 1 + 0.5) / (1 + 0.5) + 1);
      const tfSat = (protoTf * 2.2) / (protoTf + 1.2 * (1 - 0.75 + 0.75 * protoLen / 50));
      score += tfSat * idf * (freq / tokens.length);
    }
    if (score > 0) scores[tag] = score;
  }

  return scores;
}

// ===== 内容指纹信号评分 =====
function scoreContentFingerprint(fingerprint) {
  const scores = {};
  const { codeBlocks, images, tables, techStack, leadingText } = fingerprint;
  if (codeBlocks >= 3) scores['开发'] = (scores['开发'] || 0) + 10;
  else if (codeBlocks >= 1) scores['开发'] = (scores['开发'] || 0) + 4;

  if (images >= 10 && codeBlocks === 0) scores['设计'] = (scores['设计'] || 0) + 6;
  if (tables >= 2) {
    scores['学术'] = (scores['学术'] || 0) + 6;
    scores['数据'] = (scores['数据'] || 0) + 3;
  }
  if (techStack.includes('academic')) scores['学术'] = (scores['学术'] || 0) + 12;
  if (techStack.includes('ai')) scores['AI'] = (scores['AI'] || 0) + 8;
  if (techStack.includes('github')) scores['开发'] = (scores['开发'] || 0) + 6;

  if (leadingText) {
    const tutorialRe = /(教程|指南|入门|快速开始|quickstart|getting started|how to|step by step|step-by-step|最佳实践|实战)/i;
    const docRe = /(文档|documentation|reference|manual|api|sdk|手册)/i;
    const newsRe = /(新闻|news|报道|快讯|融资|发布|宣布|收购|财报|资讯)/i;
    if (tutorialRe.test(leadingText)) scores['教程'] = (scores['教程'] || 0) + 8;
    if (docRe.test(leadingText)) scores['文档'] = (scores['文档'] || 0) + 6;
    if (newsRe.test(leadingText)) scores['资讯'] = (scores['资讯'] || 0) + 6;
  }

  return scores;
}

// ===== 图关系推理（异步场景） =====
async function inferTagsFromSiblings(bookmarkId, folderId) {
  if (!folderId || typeof chrome === 'undefined' || !chrome.bookmarks) return {};
  try {
    const siblings = await chrome.bookmarks.getChildren(folderId);
    const tagVotes = {};
    let taggedCount = 0;
    for (const sibling of siblings) {
      if (sibling.id === bookmarkId || !sibling.url) continue;
      const stored = await chrome.storage.local.get(`tags_${sibling.id}`);
      const tags = stored[`tags_${sibling.id}`] || [];
      if (tags.length === 0) continue;
      taggedCount += 1;
      for (const tag of tags) {
        tagVotes[tag] = (tagVotes[tag] || 0) + 1;
      }
    }
    if (taggedCount < 2) return {};
    const scores = {};
    for (const [tag, count] of Object.entries(tagVotes)) {
      const ratio = count / taggedCount;
      if (ratio >= 0.7) scores[tag] = 25;
      else if (ratio >= 0.4) scores[tag] = 15;
    }
    return scores;
  } catch {
    return {};
  }
}

async function inferTagsFromTemporalCluster(url, addTime) {
  if (!url || typeof chrome === 'undefined' || !chrome.history) return {};
  try {
    const windowStart = addTime - 10 * 60 * 1000;
    const windowEnd = addTime + 10 * 60 * 1000;
    const history = await chrome.history.search({
      text: '',
      startTime: windowStart,
      endTime: windowEnd,
      maxResults: 20
    });
    const domainTagVotes = {};
    for (const item of history) {
      if (!item.url) continue;
      const domain = extractHostname(item.url);
      const match = matchDomainTag(domain);
      if (match) {
        domainTagVotes[match.tag] = (domainTagVotes[match.tag] || 0) + 1;
      }
    }
    const scores = {};
    for (const [tag, count] of Object.entries(domainTagVotes)) {
      if (count >= 3) scores[tag] = 12;
      else if (count >= 1) scores[tag] = 6;
    }
    return scores;
  } catch {
    return {};
  }
}

function extractHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

const DOMAIN_COOCUR_KEY = 'tag_domain_cooccurrence';

async function learnDomainCooccurrence(domain1, domain2) {
  if (!domain1 || !domain2 || domain1 === domain2) return;
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  try {
    const data = await chrome.storage.local.get(DOMAIN_COOCUR_KEY);
    const matrix = data[DOMAIN_COOCUR_KEY] || {};
    const d1 = domain1.toLowerCase();
    const d2 = domain2.toLowerCase();
    if (!matrix[d1]) matrix[d1] = {};
    matrix[d1][d2] = (matrix[d1][d2] || 0) + 1;
    await chrome.storage.local.set({ [DOMAIN_COOCUR_KEY]: matrix });
  } catch {
    // ignore
  }
}

async function getDomainCooccurrenceTags(domain, knownTags) {
  if (!domain || typeof chrome === 'undefined' || !chrome.storage) return {};
  try {
    const data = await chrome.storage.local.get(DOMAIN_COOCUR_KEY);
    const matrix = data[DOMAIN_COOCUR_KEY] || {};
    const row = matrix[domain.toLowerCase()] || {};
    const scores = {};
    for (const [otherDomain, count] of Object.entries(row)) {
      const match = matchDomainTag(otherDomain);
      if (match && knownTags.includes(match.tag)) {
        scores[match.tag] = (scores[match.tag] || 0) + Math.log(count + 1) * 4;
      }
    }
    return scores;
  } catch {
    return {};
  }
}

// ===== 从标题提取标签（正则 + 关键词双层匹配） =====
function extractTagsFromTitle(title) {
  if (!title) return [];

  const cleaned = cleanTitle(title);
  const lower = cleaned.toLowerCase();
  const rawLower = String(title).toLowerCase();
  const scores = {};
  const signals = {}; // tag -> string[] 信号来源追踪

  function addScore(tag, score, signal) {
    tag = canonicalCategoryTag(tag);
    if (!tag) return;
    scores[tag] = (scores[tag] || 0) + score;
    if (!signals[tag]) signals[tag] = [];
    signals[tag].push(signal);
  }

  // Layer 1: 正则精准匹配（高分）
  for (const rule of TITLE_REGEX_RULES) {
    if (rule.regex.test(cleaned)) {
      addScore(rule.tag, rule.score, `regex:${rule.tag}`);
    }
  }

  // Layer 2: 关键词精确匹配（同义词归并 + 模糊匹配增强，动态+内置合并）
  const mergedKeywordMap = getMergedKeywordMap();
  for (const [tag, keywords] of Object.entries(mergedKeywordMap)) {
    for (const kw of keywords) {
      const normalizedKw = normalizeTerm(kw);
      const kwWeight = keywordBaseWeight(kw);
      // 精确匹配（英文整词，中文/短语子串）
      if (keywordMatchesWhole(kw, lower) || keywordMatchesWhole(kw, rawLower)) {
        addScore(tag, kwWeight, `keyword:${kw}`);
        continue;
      }
      // 模糊匹配（仅对长度 >= 5 的词，避免 node~notes 这类短词误匹配）
      if (normalizedKw.length >= 5) {
        const tokens = tokenize(lower);
        for (const token of tokens) {
          if (fuzzyMatch(token, normalizedKw, 1)) {
            addScore(tag, kwWeight * 0.5, `fuzzy:${token}~${normalizedKw}`);
            break;
          }
        }
      }
    }
  }

  // Layer 3: 标题 n-gram 组合匹配（捕获复合技术词）
  const chineseSegments = cleaned.match(/[\u4e00-\u9fa5]+/g) || [];
  for (let segment of chineseSegments) {
    if (segment.length < 2) continue;
    if (segment.length > 40) segment = segment.slice(0, 40); // 防止超长标题拖慢
    for (let n = 2; n <= 4 && n <= segment.length; n++) {
      for (let i = 0; i <= segment.length - n; i++) {
        const gram = segment.substring(i, i + n);
        for (const [tag, keywords] of Object.entries(mergedKeywordMap)) {
          if (keywords.includes(gram)) {
            addScore(tag, keywordBaseWeight(gram) * 0.6, `ngram:${gram}`);
          }
        }
      }
    }
  }

  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag, score]) => ({ tag, score, signals: signals[tag] || [] }));
}

function extractLocalSemanticTags(title) {
  const cleaned = cleanTitle(title);
  if (!cleaned) return [];

  const tags = new Map();
  const add = (tag, score) => {
    const normalized = canonicalCategoryTag(tag);
    if (normalized) tags.set(normalized, Math.max(tags.get(normalized) || 0, score));
  };

  if (/(协同|办公|\boa\b|审批|报销|考勤|请假|wps)/i.test(cleaned)) add('办公', 4);
  if (/中转(?:站|服务|平台)/.test(cleaned)) add('中转站', 10);
  const management = cleaned.match(/(企业管理|综合管理|移动管理|项目管理|管理平台|审核系统)/i);
  if (management) add(management[1], 8);
  if (/(?:国投|集团|股份|公司|企业).{0,8}(?:测试|业务|管理|办公).{0,6}(?:系统|平台)/i.test(cleaned)) add('办公', 4);

  for (const match of cleaned.matchAll(/([\u4e00-\u9fa5A-Za-z]{2,20}(?:系统|平台|门户))/g)) {
    const tag = match[1]
      .replace(/^(?:\d{4}年|年)/, '')
      .replace(/^(?:[\u4e00-\u9fa5]{2,10}(?:公司|集团|股份))/, '');
    add(tag, 10);
  }
  return [...tags].map(([tag, score]) => ({ tag, score, signal: `semantic-title:${tag}` }));
}

// ===== URL 深度特征规则 =====
const SUBDOMAIN_RULES = [
  { patterns: ['blog', 'news', 'articles', 'stories'], tag: '文章' },
  { patterns: ['docs', 'help', 'support', 'guide'], tag: '教程' },
  { patterns: ['api', 'developers', 'dev'], tag: 'API' },
  { patterns: ['watch', 'video', 'tv', 'channel'], tag: '视频' },
  { patterns: ['play', 'app', 'tool', 'tools'], tag: '工具' },
  { patterns: ['forum', 'community', 'discuss'], tag: '社交' }
];

const EXTENSION_RULES = [
  { extensions: ['.pdf'], tag: '学术' },
  { extensions: ['.mp4', '.webm', '.mov', '.avi'], tag: '视频' },
  { extensions: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'], tag: '设计' },
  { extensions: ['.zip', '.tar.gz', '.dmg', '.exe', '.apk'], tag: '工具' }
];

const QUERY_RULES = [
  { keys: ['v', 'video', 'watch'], tag: '视频' },
  { keys: ['q', 'query', 'search'], tag: '工具' },
  { keys: ['issue', 'pull'], tag: '开发' }
];

const COMBINATION_RULES = [
  { domainIncludes: 'github.com', pathIncludes: ['blob', 'tree', 'commits'], tag: '开发', score: 10 },
  { domainIncludes: 'github.com', pathIncludes: ['issues', 'pull'], tag: '开发', score: 8 },
  { domainIncludes: 'youtube.com', pathIncludes: ['watch', 'playlist', 'shorts'], tag: '视频', score: 15 },
  { domainIncludes: 'bilibili.com', pathIncludes: ['video', 'bangumi'], tag: '视频', score: 15 },
  { domainIncludes: 'huggingface.co', pathIncludes: ['models', 'datasets', 'papers', 'spaces'], tag: 'AI', score: 15 },
  { domainIncludes: 'zhihu.com', pathIncludes: ['question', 'answer', 'zhuanlan'], tag: '社交', score: 10 },
  { domainIncludes: 'juejin.cn', pathIncludes: ['post'], tag: '阅读', score: 10 },
  { domainIncludes: 'csdn.net', pathIncludes: ['article', 'blog'], tag: '阅读', score: 8 },
  { domainIncludes: 'linkedin.com', pathIncludes: ['learning'], tag: '学习', score: 30 },
  { domainIncludes: 'yahoo.com', pathIncludes: ['finance'], tag: '金融', score: 30 },
  { domainIncludes: 'google.com', pathIncludes: ['maps'], tag: '旅行', score: 30 },
  { domainIncludes: 'microsoft.com', pathIncludes: ['ai'], tag: 'AI', score: 30 },
  { domainIncludes: 'adobe.com', pathIncludes: ['stock'], tag: '摄影', score: 30 },
  { domainIncludes: 'sohu.com', pathIncludes: ['sports'], tag: '体育', score: 30 },
  { domainIncludes: 'bloomberg.com', pathIncludes: ['markets', 'economics', 'finance'], tag: '金融', score: 24 },
  { domainIncludes: 'twitch.tv', pathIncludes: ['directory', 'game'], tag: '游戏', score: 18 }
];

function extractUrlFeatures(url) {
  try {
    const u = new URL(url);
    const parts = u.hostname.toLowerCase().split('.');
    return {
      hostname: u.hostname,
      effectiveDomain: getEffectiveDomain(u.hostname),
      subdomain: parts.length > 2 ? parts[0] : '',
      path: u.pathname.toLowerCase(),
      pathSegments: u.pathname.split('/').filter(Boolean).map(s => s.toLowerCase()),
      extension: getFileExtension(u.pathname),
      queryKeys: Array.from(u.searchParams.keys()).map(k => k.toLowerCase())
    };
  } catch {
    return null;
  }
}

function getEffectiveDomain(hostname) {
  if (!hostname) return '';
  const parts = hostname.toLowerCase().split('.');
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join('.');
}

function getFileExtension(pathname) {
  const m = pathname.match(/\.[a-z0-9]+(?:\.[a-z0-9]+)?$/i);
  return m ? m[0].toLowerCase() : '';
}

function matchSubdomainTag(features) {
  if (!features || !features.subdomain) return null;
  for (const rule of SUBDOMAIN_RULES) {
    if (rule.patterns.some(p => features.subdomain === p)) return rule.tag;
  }
  return null;
}

function matchExtensionTag(features) {
  if (!features || !features.extension) return null;
  for (const rule of EXTENSION_RULES) {
    if (rule.extensions.includes(features.extension)) return rule.tag;
  }
  return null;
}

function matchQueryTag(features) {
  if (!features || !features.queryKeys || features.queryKeys.length === 0) return null;
  for (const rule of QUERY_RULES) {
    if (rule.keys.some(k => features.queryKeys.includes(k))) return rule.tag;
  }
  return null;
}

function matchCombinationRules(features) {
  if (!features) return [];
  const hits = [];
  for (const rule of COMBINATION_RULES) {
    const recommendationCore = typeof globalThis !== 'undefined' ? globalThis.BookmarkRecommendationCore : null;
    const domainMatches = recommendationCore?.hostnameMatchesRule
      ? recommendationCore.hostnameMatchesRule(features.effectiveDomain, rule.domainIncludes)
      : features.effectiveDomain === rule.domainIncludes || features.effectiveDomain.endsWith('.' + rule.domainIncludes);
    if (!domainMatches) continue;
    if (rule.pathIncludes.some(p =>
      features.path.includes('/' + p + '/') || features.path.endsWith('/' + p)
    )) {
      hits.push({ tag: rule.tag, score: rule.score });
    }
  }
  return hits;
}

// ===== 从域名匹配标签（动态规则优先，再内置） =====
function matchDomainTag(domain) {
  if (!domain) return null;

  const lowerDomain = domain.toLowerCase().replace(/\.$/, '');
  const matchesDomain = ruleDomain => {
    const candidate = String(ruleDomain || '').toLowerCase().replace(/\.$/, '');
    if (!candidate || candidate.includes('/')) return false;
    const recommendationCore = typeof globalThis !== 'undefined' ? globalThis.BookmarkRecommendationCore : null;
    if (recommendationCore?.hostnameMatchesRule) {
      return recommendationCore.hostnameMatchesRule(lowerDomain, candidate);
    }
    return lowerDomain === candidate || lowerDomain.endsWith('.' + candidate);
  };

  // 动态规则优先（含自动学习到的域名→标签）
  const mergedRules = getMergedDomainRules();
  for (const rule of mergedRules) {
    if (rule.domains.some(matchesDomain)) {
      const tag = canonicalCategoryTag(rule.tag);
      if (!tag) continue;
      const source = DOMAIN_RULES.includes(rule)
        ? 'curated'
        : (rule.source === 'user' ? 'user' : 'learned');
      return { tag, color: rule.color, confidence: 1.0, curated: source === 'curated', source };
    }
  }

  // 自动学习的域名→标签映射（带置信度）
  if (_dynamicRulesCache?.learnedDomainTag) {
    for (const [d, info] of Object.entries(_dynamicRulesCache.learnedDomainTag)) {
      if (matchesDomain(d)) {
        const isObj = info && typeof info === 'object';
        const tag = canonicalCategoryTag(isObj ? info.tag : info);
        if (!tag) continue;
        const count = isObj ? (info.count || 1) : 1;
        const confidence = Math.min(count / 3, 1.0); // 确认 3 次后置信度 1.0
        return { tag, color: '#607d8b', confidence, source: 'learned' };
      }
    }
  }

  return null;
}

// ===== 从 URL 路径匹配标签（动态规则优先，再内置） =====
// 返回 { tag, weight }，weight 用于分层控制路径信号强度
function matchUrlPathTag(url) {
  if (!url) return null;

  let lowerPath;
  try {
    lowerPath = new URL(url).pathname.toLowerCase();
  } catch {
    return null;
  }

  for (const rule of getMergedUrlPathRules()) {
    if (rule.patterns.some(pattern => {
      const normalized = String(pattern || '').toLowerCase();
      if (!normalized) return false;
      if (normalized.endsWith('/')) return lowerPath.includes(normalized);
      return lowerPath === normalized || lowerPath.startsWith(normalized + '/') || lowerPath.includes(normalized + '/');
    })) {
      const tag = canonicalCategoryTag(rule.tag);
      if (!tag) continue;
      return { tag, weight: rule.weight ?? 1.0 };
    }
  }
  return null;
}

// ===== 获取用户覆盖规则 =====
let _userOverridesCache = null;

async function getUserOverrides() {
  if (_userOverridesCache) return _userOverridesCache;
  const result = await chrome.storage.local.get(USER_OVERRIDES_KEY);
  _userOverridesCache = result[USER_OVERRIDES_KEY] || [];
  return _userOverridesCache;
}

// ===== 记录用户覆盖 =====
async function recordUserOverride(domain, autoTag, userTag) {
  const overrides = await getUserOverrides();
  const existing = overrides.findIndex(o => o.domain === domain && o.autoTag === autoTag);

  if (existing >= 0) {
    overrides[existing].userTag = userTag;
  } else {
    overrides.push({ domain, autoTag, userTag });
  }

  _userOverridesCache = overrides;
  await chrome.storage.local.set({ [USER_OVERRIDES_KEY]: overrides });
}

// ===== 保存标签颜色 =====
async function saveTagColor(tag, color) {
  const result = await chrome.storage.local.get(TAG_COLORS_KEY);
  const colors = result[TAG_COLORS_KEY] || {};
  colors[tag] = color;
  await chrome.storage.local.set({ [TAG_COLORS_KEY]: colors });
}

// ===== 获取标签颜色 =====
async function getTagColor(tag) {
  // 先从存储中获取
  const result = await chrome.storage.local.get(TAG_COLORS_KEY);
  const colors = result[TAG_COLORS_KEY] || {};

  if (colors[tag]) return colors[tag];

  // 从域名规则中查找
  for (const rule of DOMAIN_RULES) {
    if (rule.tag === tag) {
      await saveTagColor(tag, rule.color);
      return rule.color;
    }
  }

  // 生成默认颜色
  const hash = Array.from(tag).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue = hash % 360;
  const color = `hsl(${hue}, 60%, 50%)`;
  await saveTagColor(tag, color);
  return color;
}

// ===== 主分类函数（5 层信号融合 + 置信度评分） =====
async function autoTagBookmark(bookmark, options = {}) {
  const scores = {};   // tag -> total score
  const signals = {};  // tag -> string[] 信号来源
  const tagColors = {};

  function addScore(tag, score, signal) {
    tag = canonicalCategoryTag(tag);
    if (!tag) return;
    scores[tag] = (scores[tag] || 0) + score;
    if (!signals[tag]) signals[tag] = [];
    signals[tag].push(signal);
  }

  // 解析 URL 深度特征，供后续多层使用
  const urlFeatures = extractUrlFeatures(bookmark.url);

  // Layer 1: 文件夹名（权重 50），先做同义词归一化
  if (bookmark.folderName &&
      bookmark.folderName !== '书签栏' &&
      bookmark.folderName !== '其他书签' &&
      bookmark.folderName !== 'Other bookmarks' &&
      bookmark.folderName !== 'Bookmarks bar') {
    const folderCategory = inferFolderCategory(bookmark.folderName);
    if (folderCategory) addScore(folderCategory.tag, SIGNAL_WEIGHTS.folder, folderCategory.signal);
  }

  // Layer 2: 域名匹配（权重 30 × 置信度）
  const domainMatch = matchDomainTag(bookmark.domain || urlFeatures?.hostname || '');
  const hasDomainRule = Boolean(domainMatch);
  if (domainMatch) {
    const domainWeight = SIGNAL_WEIGHTS.domain * (domainMatch.confidence || 1.0);
    addScore(domainMatch.tag, domainWeight, 'domain');
    if (domainMatch.curated) addScore(domainMatch.tag, 0, 'curated-domain');
    else if (domainMatch.source === 'user') addScore(domainMatch.tag, 0, 'user-override:domain');
    else if (domainMatch.source === 'learned') addScore(domainMatch.tag, 0, 'learned-domain');
    tagColors[domainMatch.tag] = domainMatch.color;
  }

  // Layer 2.5: 子域名规则
  const subdomainTag = matchSubdomainTag(urlFeatures);
  if (subdomainTag) {
    addScore(subdomainTag, SIGNAL_WEIGHTS.subdomain, 'subdomain');
  }

  // Layer 3: URL 路径（权重 15 × 路径置信度）
  const pathMatch = matchUrlPathTag(bookmark.url);
  if (pathMatch) {
    addScore(pathMatch.tag, SIGNAL_WEIGHTS.path * pathMatch.weight, `url-path:${pathMatch.weight}`);
  }

  // Layer 3.5: 文件后缀 + 查询参数 + 域名/路径组合规则
  const extensionTag = matchExtensionTag(urlFeatures);
  if (extensionTag) {
    addScore(extensionTag, SIGNAL_WEIGHTS.extension, 'extension');
  }
  const queryTag = matchQueryTag(urlFeatures);
  if (queryTag) {
    addScore(queryTag, SIGNAL_WEIGHTS.query, 'query-param');
  }
  for (const hit of matchCombinationRules(urlFeatures)) {
    addScore(hit.tag, hit.score, 'domain+path');
  }
  for (const { tag, score, signal } of extractLocalSemanticTags(`${bookmark.url || ''} ${bookmark.domain || ''}`)) {
    addScore(tag, score, signal.replace('semantic-title:', 'semantic-url:'));
  }

  // Layer 4: 标题关键词（权重 10）+ 同义词归并 + 模糊匹配 + n-gram
  const titleTags = extractTagsFromTitle(bookmark.title);
  for (const { tag, score, signals: titleSignals } of titleTags) {
    addScore(tag, SIGNAL_WEIGHTS.title + score, ...titleSignals);
  }
  for (const { tag, score, signal } of extractLocalSemanticTags(bookmark.title)) {
    addScore(tag, score, signal);
  }

  // ===== 增强信号：网页内容特征与语义原型 =====
  const contentText = bookmark.contentText || '';
  const metaDesc = bookmark.metaDesc || '';
  const ogDescription = bookmark.ogDescription || '';
  const metaKeywords = Array.isArray(bookmark.metaKeywords)
    ? bookmark.metaKeywords
    : (Array.isArray(bookmark.contentMetaKeywords) ? bookmark.contentMetaKeywords : []);
  const extractedHeadings = Array.isArray(bookmark.headings)
    ? bookmark.headings
    : (Array.isArray(bookmark.contentHeadings) ? bookmark.contentHeadings : []);
  const structuredTypes = Array.isArray(bookmark.structuredTypes)
    ? bookmark.structuredTypes
    : (Array.isArray(bookmark.contentStructuredTypes) ? bookmark.contentStructuredTypes : []);

  // 优先使用已提取的纯文本，回退到 HTML
  const fingerprint = contentText
    ? extractPageFingerprintFromText(contentText)
    : (bookmark.html ? extractPageFingerprintFromHtml(bookmark.html) : extractPageFingerprintFromText(''));
  const headings = [...new Set([...(fingerprint.headings || []), ...extractedHeadings])];
  for (const summary of [metaDesc, ogDescription, ...headings]) {
    for (const { tag, score, signal } of extractLocalSemanticTags(summary)) {
      addScore(tag, score * 0.8, signal.replace('semantic-title:', 'semantic-summary:'));
    }
  }

  const richText = [
    cleanTitle(bookmark.title || ''),
    bookmark.url || '',
    bookmark.domain || '',
    metaDesc,
    ogDescription,
    fingerprint.leadingText,
    ...headings,
    ...metaKeywords,
    ...structuredTypes
  ].filter(Boolean).join(' ');

  const baseText = `${cleanTitle(bookmark.title || '')} ${bookmark.url || ''} ${bookmark.domain || ''}`;
  const fullText = `${richText}`;

  // 强规则信号存在时，大幅降低内容/语义信号权重，避免噪声压过确定性规则
  const anyStrongSignal = hasAnyStrongSignal(signals);
  const contentDamp = anyStrongSignal ? 0.3 : 1.0;

  // Layer 4.5: 内容指纹信号（代码块、图片、表格、技术栈、体裁）
  const fingerprintScores = scoreContentFingerprint(fingerprint);
  for (const [tag, score] of Object.entries(fingerprintScores)) {
    addScore(tag, score * contentDamp, `content-fingerprint:${tag}`);
  }

  // Layer 4.6: meta description 关键词命中（仅保留前两名，避免噪声扩散）
  if (metaDesc) {
    const metaDescTags = extractTagsFromTitle(metaDesc)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    for (const { tag, score } of metaDescTags) {
      addScore(tag, Math.min(score + 4, SIGNAL_WEIGHTS.metaDescription) * contentDamp, `meta-desc:${tag}`);
    }
  }

  // Layer 4.7: 标签原型 BM25 语义匹配（仅当相对得分足够高时才生效）
  const prototypeScores = computePrototypeBm25Scores(richText, TAG_PROTOTYPES);
  const maxProtoScore = Math.max(...Object.values(prototypeScores), 0.001);
  for (const [tag, score] of Object.entries(prototypeScores)) {
    const normalized = score / maxProtoScore;
    if (normalized < 0.35) continue;
    addScore(tag, normalized * SIGNAL_WEIGHTS.prototypeBm25 * contentDamp, `prototype-bm25:${tag}:${score.toFixed(3)}`);
  }

  // Layer 4.8: 图关系推理（兄弟标签传播 + 时序聚类 + 域名共现）
  const knownTags = Object.keys(scores);
  if (bookmark.parentId) {
    const siblingScores = await inferTagsFromSiblings(bookmark.id, bookmark.parentId);
    for (const [tag, score] of Object.entries(siblingScores)) {
      addScore(tag, score, 'sibling-propagation');
    }
  }
  const temporalScores = await inferTagsFromTemporalCluster(bookmark.url, bookmark.dateAdded || Date.now());
  for (const [tag, score] of Object.entries(temporalScores)) {
    if (knownTags.includes(tag)) addScore(tag, score, 'temporal-cluster');
  }
  const cooccurScores = await getDomainCooccurrenceTags(bookmark.domain, knownTags);
  for (const [tag, score] of Object.entries(cooccurScores)) {
    addScore(tag, score, 'domain-cooccurrence');
  }

  // Layer 4.9: 云端 AI 分类增强（仅对低置信样本触发）
  // AI 结果作为独立信号加入排序，不替代规则引擎
  const localDirectTop = Object.entries(scores)
    .filter(([tag]) => hasDirectLocalSignal(signals, tag))
    .sort((a, b) => b[1] - a[1])[0];
  if (options.skipAI !== true && typeof classifyWithAI === 'function') {
    const preAiTopTags = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, score]) => ({ tag, score, signals: signals[tag] || [] }));
    try {
      const aiResults = await classifyWithAI(bookmark, preAiTopTags, signals, scores);
      if (aiResults && aiResults.length > 0) {
        for (const item of aiResults) {
          if (isGenericFallbackTag(item?.tag)) continue;
          const rawAiScore = item.confidence * SIGNAL_WEIGHTS.ai;
          const aiScore = localDirectTop && item.tag !== localDirectTop[0]
            ? Math.min(rawAiScore, localDirectTop[1] * 0.8)
            : rawAiScore;
          addScore(item.tag, aiScore, `ai:${item.confidence.toFixed(2)}`);
        }
      }
    } catch (err) {
      console.warn('AI classification failed:', err);
    }
  }

  // Layer 5: TF-IDF 加权评分（BM25 风格）
  const { df, totalDocs, totalTokenLen } = await loadDocFrequency();
  const tfidfScores = computeTfIdfScores(baseText, df, totalDocs, totalTokenLen);
  for (const [tag, tfidfScore] of Object.entries(tfidfScores)) {
    // TF-IDF 得分缩放到 0-10 范围，降低短标题/URL 的噪声
    const scaledScore = Math.min(tfidfScore * 3, 10);
    addScore(tag, scaledScore, `tfidf:${tag}:${tfidfScore.toFixed(2)}`);
  }

  // Layer 5.4: 正文 TF-IDF（只在规则信号弱或分数低时触发，避免污染强规则样本）
  if (contentText) {
    const baseTop1 = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    const baseTop1Strong = baseTop1 && hasStrongSignal(signals, baseTop1[0]);
    const baseTop1Score = baseTop1 ? baseTop1[1] : 0;
    const needContent = !hasDomainRule || !baseTop1Strong || baseTop1Score < 40;
    if (needContent) {
      const contentSnippet = contentText.slice(0, 1500);
      const contentFull = `${cleanTitle(bookmark.title || '')} ${metaDesc} ${contentSnippet} ${bookmark.url || ''} ${bookmark.domain || ''}`;
      const contentTfIdf = computeTfIdfScores(contentFull, df, totalDocs, totalTokenLen);
      const qualityFactor = Math.min(contentText.length / 800, 1); // 短正文降权，800字以上才满权
      // 域名未命中时仍触发正文特征，但不过度加权，避免通用正文噪声
      const multiplier = 2;
      const cap = 8;
      const minScaled = 0.5;
      for (const [tag, score] of Object.entries(contentTfIdf)) {
        const scaled = Math.min(score * multiplier, cap) * qualityFactor * contentDamp;
        if (scaled >= minScaled) addScore(tag, scaled, `content-tfidf:${tag}:${score.toFixed(2)}`);
      }
    }
  }

  // Layer 5.5: 双向贝叶斯评分（is/is_not + delta）
  // 用已有标签语料验证候选标签的统计显著性
  const candidateTags = Object.keys(scores);
  if (candidateTags.length > 0) {
    const corpus = await loadTagCorpus();
    const bayesianScores = computeBayesianScores(fullText, candidateTags, corpus);
    for (const [tag, info] of Object.entries(bayesianScores)) {
      if (info.score !== 0) {
        const direction = info.pIs > info.pIsNot ? 'is' : 'is-not';
        addScore(tag, info.score, `bayesian:${direction}:Δ${info.delta.toFixed(2)}`);
      }
    }
  }

  // Layer 6: 用户覆盖（最高优先级）
  const overrides = await getUserOverrides();
  for (const override of overrides) {
    if (bookmark.domain && bookmark.domain.includes(override.domain)) {
      if (scores[override.autoTag] !== undefined) {
        addScore(override.userTag, 100, 'user-override');
      }
    }
  }

  const filteredEntries = selectFinalTagEntries(scores, signals);

  const results = filteredEntries.map(([tag, score]) => ({
    tag,
    confidence: normalizeConfidence(score),
    score,
    signals: signals[tag] || []
  }));

  // 保存颜色
  for (const { tag } of results) {
    if (tagColors[tag]) {
      await saveTagColor(tag, tagColors[tag]);
    }
  }

  return results;
}

// ===== 预加载所有缓存（启动时调用一次，之后 autoTagBookmarkSync 可同步运行） =====
async function preloadSmartTaggerCaches() {
  await Promise.all([
    loadDocFrequency(),
    loadTagCorpus(),
    getUserOverrides(),
    loadDynamicRules()
  ]);
}

// ===== 同步版自动打标签（只用内存缓存，无 await） =====
// 缓存未就绪时自动降级：跳过对应层，仅用规则层
function autoTagBookmarkSync(bookmark) {
  const scores = {};
  const signals = {};
  const tagColors = {};

  function addScore(tag, score, signal) {
    tag = canonicalCategoryTag(tag);
    if (!tag) return;
    scores[tag] = (scores[tag] || 0) + score;
    if (!signals[tag]) signals[tag] = [];
    signals[tag].push(signal);
  }

  // 解析 URL 深度特征
  const urlFeatures = extractUrlFeatures(bookmark.url);

  // Layer 1: 文件夹名（权重 50），先做同义词归一化
  if (bookmark.folderName &&
      bookmark.folderName !== '书签栏' &&
      bookmark.folderName !== '其他书签' &&
      bookmark.folderName !== 'Other bookmarks' &&
      bookmark.folderName !== 'Bookmarks bar') {
    const folderCategory = inferFolderCategory(bookmark.folderName);
    if (folderCategory) addScore(folderCategory.tag, SIGNAL_WEIGHTS.folder, folderCategory.signal);
  }

  // Layer 2: 域名匹配（权重 30 × 置信度）
  const domainMatch = matchDomainTag(bookmark.domain || urlFeatures?.hostname || '');
  const hasDomainRule = Boolean(domainMatch);
  if (domainMatch) {
    const domainWeight = SIGNAL_WEIGHTS.domain * (domainMatch.confidence || 1.0);
    addScore(domainMatch.tag, domainWeight, 'domain');
    if (domainMatch.curated) addScore(domainMatch.tag, 0, 'curated-domain');
    else if (domainMatch.source === 'user') addScore(domainMatch.tag, 0, 'user-override:domain');
    else if (domainMatch.source === 'learned') addScore(domainMatch.tag, 0, 'learned-domain');
    tagColors[domainMatch.tag] = domainMatch.color;
  }

  // Layer 2.5: 子域名规则
  const subdomainTag = matchSubdomainTag(urlFeatures);
  if (subdomainTag) {
    addScore(subdomainTag, SIGNAL_WEIGHTS.subdomain, 'subdomain');
  }

  // Layer 3: URL 路径（权重 15 × 路径置信度）
  const pathMatch = matchUrlPathTag(bookmark.url);
  if (pathMatch) {
    addScore(pathMatch.tag, SIGNAL_WEIGHTS.path * pathMatch.weight, `url-path:${pathMatch.weight}`);
  }

  // Layer 3.5: 文件后缀 + 查询参数 + 域名/路径组合规则
  const extensionTag = matchExtensionTag(urlFeatures);
  if (extensionTag) {
    addScore(extensionTag, SIGNAL_WEIGHTS.extension, 'extension');
  }
  const queryTag = matchQueryTag(urlFeatures);
  if (queryTag) {
    addScore(queryTag, SIGNAL_WEIGHTS.query, 'query-param');
  }
  for (const hit of matchCombinationRules(urlFeatures)) {
    addScore(hit.tag, hit.score, 'domain+path');
  }
  for (const { tag, score, signal } of extractLocalSemanticTags(`${bookmark.url || ''} ${bookmark.domain || ''}`)) {
    addScore(tag, score, signal.replace('semantic-title:', 'semantic-url:'));
  }

  // Layer 4: 标题关键词（权重 10）+ 同义词归并 + 模糊匹配 + n-gram
  const titleTags = extractTagsFromTitle(bookmark.title);
  for (const { tag, score, signals: titleSignals } of titleTags) {
    addScore(tag, SIGNAL_WEIGHTS.title + score, ...titleSignals);
  }
  for (const { tag, score, signal } of extractLocalSemanticTags(bookmark.title)) {
    addScore(tag, score, signal);
  }

  // ===== 增强信号：网页内容特征与语义原型 =====
  const contentText = bookmark.contentText || '';
  const metaDesc = bookmark.metaDesc || '';
  const ogDescription = bookmark.ogDescription || '';
  const metaKeywords = Array.isArray(bookmark.metaKeywords)
    ? bookmark.metaKeywords
    : (Array.isArray(bookmark.contentMetaKeywords) ? bookmark.contentMetaKeywords : []);
  const extractedHeadings = Array.isArray(bookmark.headings)
    ? bookmark.headings
    : (Array.isArray(bookmark.contentHeadings) ? bookmark.contentHeadings : []);
  const structuredTypes = Array.isArray(bookmark.structuredTypes)
    ? bookmark.structuredTypes
    : (Array.isArray(bookmark.contentStructuredTypes) ? bookmark.contentStructuredTypes : []);

  const fingerprint = contentText
    ? extractPageFingerprintFromText(contentText)
    : (bookmark.html ? extractPageFingerprintFromHtml(bookmark.html) : extractPageFingerprintFromText(''));
  const headings = [...new Set([...(fingerprint.headings || []), ...extractedHeadings])];
  for (const summary of [metaDesc, ogDescription, ...headings]) {
    for (const { tag, score, signal } of extractLocalSemanticTags(summary)) {
      addScore(tag, score * 0.8, signal.replace('semantic-title:', 'semantic-summary:'));
    }
  }

  const richText = [
    cleanTitle(bookmark.title || ''),
    bookmark.url || '',
    bookmark.domain || '',
    metaDesc,
    ogDescription,
    fingerprint.leadingText,
    ...headings,
    ...metaKeywords,
    ...structuredTypes
  ].filter(Boolean).join(' ');

  const baseText = `${cleanTitle(bookmark.title || '')} ${bookmark.url || ''} ${bookmark.domain || ''}`;
  const fullText = `${richText}`;

  // 强规则信号存在时，大幅降低内容/语义信号权重，避免噪声压过确定性规则
  const anyStrongSignal = hasAnyStrongSignal(signals);
  const contentDamp = anyStrongSignal ? 0.3 : 1.0;

  // Layer 4.5: 内容指纹信号（代码块、图片、表格、技术栈、体裁）
  const fingerprintScores = scoreContentFingerprint(fingerprint);
  for (const [tag, score] of Object.entries(fingerprintScores)) {
    addScore(tag, score * contentDamp, `content-fingerprint:${tag}`);
  }

  // Layer 4.6: meta description 关键词命中（仅保留前两名，避免噪声扩散）
  if (metaDesc) {
    const metaDescTags = extractTagsFromTitle(metaDesc)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    for (const { tag, score } of metaDescTags) {
      addScore(tag, Math.min(score + 4, SIGNAL_WEIGHTS.metaDescription) * contentDamp, `meta-desc:${tag}`);
    }
  }

  // Layer 4.7: 标签原型 BM25 语义匹配（仅当相对得分足够高时才生效）
  const prototypeScores = computePrototypeBm25Scores(richText, TAG_PROTOTYPES);
  const maxProtoScore = Math.max(...Object.values(prototypeScores), 0.001);
  for (const [tag, score] of Object.entries(prototypeScores)) {
    const normalized = score / maxProtoScore;
    if (normalized < 0.35) continue;
    addScore(tag, normalized * SIGNAL_WEIGHTS.prototypeBm25 * contentDamp, `prototype-bm25:${tag}:${score.toFixed(3)}`);
  }

  // Layer 5: TF-IDF（仅当缓存就绪时）
  if (_docFreqCache) {
    const tfidfScores = computeTfIdfScores(baseText, _docFreqCache, _totalDocsCache, _totalTokenLenCache);
    for (const [tag, tfidfScore] of Object.entries(tfidfScores)) {
      // TF-IDF 得分缩放到 0-10 范围，降低短标题/URL 的噪声
      const scaledScore = Math.min(tfidfScore * 3, 10);
      addScore(tag, scaledScore, `tfidf:${tag}:${tfidfScore.toFixed(2)}`);
    }

    // Layer 5.4: 正文 TF-IDF（仅当缓存就绪且有正文时）
    if (contentText) {
      const baseTop1 = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
      const baseTop1Strong = baseTop1 && hasStrongSignal(signals, baseTop1[0]);
      const baseTop1Score = baseTop1 ? baseTop1[1] : 0;
      const needContent = !hasDomainRule || !baseTop1Strong || baseTop1Score < 40;
      if (needContent) {
        const contentSnippet = contentText.slice(0, 1500);
        const contentFull = `${cleanTitle(bookmark.title || '')} ${metaDesc} ${contentSnippet} ${bookmark.url || ''} ${bookmark.domain || ''}`;
        const contentTfIdf = computeTfIdfScores(contentFull, _docFreqCache, _totalDocsCache, _totalTokenLenCache);
        const qualityFactor = Math.min(contentText.length / 800, 1);
        // 域名未命中时仍触发正文特征，但不过度加权，避免通用正文噪声
        const multiplier = 2;
        const cap = 8;
        const minScaled = 0.5;
        for (const [tag, score] of Object.entries(contentTfIdf)) {
          const scaled = Math.min(score * multiplier, cap) * qualityFactor * contentDamp;
          if (scaled >= minScaled) addScore(tag, scaled, `content-tfidf:${tag}:${score.toFixed(2)}`);
        }
      }
    }
  }

  // Layer 5.5: 双向贝叶斯（仅当缓存就绪时）
  const candidateTags = Object.keys(scores);
  if (_tagCorpusCache && candidateTags.length > 0) {
    const bayesianScores = computeBayesianScores(fullText, candidateTags, _tagCorpusCache);
    for (const [tag, info] of Object.entries(bayesianScores)) {
      if (info.score !== 0) {
        const direction = info.pIs > info.pIsNot ? 'is' : 'is-not';
        addScore(tag, info.score, `bayesian:${direction}:Δ${info.delta.toFixed(2)}`);
      }
    }
  }

  // Layer 6: 用户覆盖（仅当缓存就绪时）
  if (_userOverridesCache) {
    for (const override of _userOverridesCache) {
      if (bookmark.domain && bookmark.domain.includes(override.domain)) {
        if (scores[override.autoTag] !== undefined) {
          addScore(override.userTag, 100, 'user-override');
        }
      }
    }
  }

  const filteredEntries = selectFinalTagEntries(scores, signals);

  const results = filteredEntries.map(([tag, score]) => ({
    tag,
    confidence: normalizeConfidence(score),
    score,
    signals: signals[tag] || []
  }));

  // 颜色保存异步触发（不阻塞）
  for (const { tag } of results) {
    if (tagColors[tag]) {
      saveTagColor(tag, tagColors[tag]); // fire-and-forget
    }
  }

  return results;
}

// ===== 动态规则层（用户自定义 + 自动学习，与内置规则合并） =====
// 存储结构：
//   domainRules:  [{ domains: ['xxx.com'], tag: 'AI', color: '#673ab7', source: 'user' | 'learned' }]
//   urlPathRules: [{ patterns: ['/blog/'], tag: '文章' }]
//   keywordRules: { 'AI': ['qianwen', '通义千问'] }  // 与 KEYWORD_TAG_MAP 同构
//   stopWords:    ['xxx', 'yyy']
//   learnedDomainTag: { 'qianwen.com': 'AI' }  // 自动学习：域名→标签
//   seenDomains:  ['qianwen.com']              // 系统已见过的域名（主动学习）

const DYNAMIC_RULES_KEY = 'tag_dynamic_rules';

let _dynamicRulesCache = null; // { domainRules, urlPathRules, keywordRules, stopWords, learnedDomainTag, seenDomains }

async function loadDynamicRules() {
  if (_dynamicRulesCache) return _dynamicRulesCache;
  try {
    const data = await chrome.storage.local.get(DYNAMIC_RULES_KEY);
    _dynamicRulesCache = data[DYNAMIC_RULES_KEY] || {
      domainRules: [],
      urlPathRules: [],
      keywordRules: {},
      stopWords: [],
      learnedDomainTag: {},
      seenDomains: []
    };
  } catch {
    _dynamicRulesCache = {
      domainRules: [],
      urlPathRules: [],
      keywordRules: {},
      stopWords: [],
      learnedDomainTag: {},
      seenDomains: []
    };
  }
  return _dynamicRulesCache;
}

async function saveDynamicRules(rules) {
  _dynamicRulesCache = rules;
  await chrome.storage.local.set({ [DYNAMIC_RULES_KEY]: rules });
}

function setDynamicRulesSnapshot(rules) {
  _dynamicRulesCache = rules && typeof rules === 'object' ? rules : null;
}

// 判断域名是否已被系统见过（用于主动学习的 new_domain 触发）
function isDomainSeen(domain) {
  if (!domain) return false;
  const seen = _dynamicRulesCache?.seenDomains || [];
  return seen.includes(domain.toLowerCase());
}

// 标记域名已被见过
async function markDomainSeen(domain) {
  if (!domain) return;
  const rules = await loadDynamicRules();
  const lower = domain.toLowerCase();
  if (!rules.seenDomains) rules.seenDomains = [];
  if (!rules.seenDomains.includes(lower)) {
    rules.seenDomains.push(lower);
    await saveDynamicRules(rules);
  }
}

// 获取合并后的停用词集合（内置 + 动态）
function getMergedStopWords() {
  const dynamic = _dynamicRulesCache?.stopWords || [];
  return dynamic.length > 0 ? new Set([...STOP_WORDS, ...dynamic]) : STOP_WORDS;
}

// 获取合并后的域名规则（动态优先，再内置）
function getMergedDomainRules() {
  const dynamic = _dynamicRulesCache?.domainRules || [];
  return dynamic.length > 0 ? [...dynamic, ...DOMAIN_RULES] : DOMAIN_RULES;
}

// 获取合并后的 URL 路径规则（动态优先，再内置）
function getMergedUrlPathRules() {
  const dynamic = _dynamicRulesCache?.urlPathRules || [];
  return dynamic.length > 0 ? [...dynamic, ...URL_PATH_RULES] : URL_PATH_RULES;
}

// 获取合并后的关键词映射（动态 + 内置，同标签关键词合并去重）
function getMergedKeywordMap() {
  const dynamic = _dynamicRulesCache?.keywordRules || {};
  if (Object.keys(dynamic).length === 0) return KEYWORD_TAG_MAP;
  const merged = {};
  // 先放内置
  for (const [tag, kws] of Object.entries(KEYWORD_TAG_MAP)) {
    merged[tag] = [...kws];
  }
  // 合并动态
  for (const [tag, kws] of Object.entries(dynamic)) {
    if (!merged[tag]) merged[tag] = [];
    for (const kw of kws) {
      if (!merged[tag].includes(kw)) merged[tag].push(kw);
    }
  }
  return merged;
}

// 自动学习：当用户手动将书签移入某目录时，学习"域名→目录名(标签)"映射
// domain: 书签域名, folderName: 目标目录名（视为标签）
async function learnDomainTag(domain, folderName) {
  folderName = canonicalCategoryTag(folderName);
  if (!domain || !folderName) return;
  const rules = await loadDynamicRules();
  const lowerDomain = domain.toLowerCase();

  // 1. 更新学习到的域名→标签映射（带计数/置信度）
  if (!rules.learnedDomainTag) rules.learnedDomainTag = {};
  const existing = rules.learnedDomainTag[lowerDomain];
  if (existing && typeof existing === 'object' && existing.tag === folderName) {
    existing.count = (existing.count || 1) + 1;
  } else {
    rules.learnedDomainTag[lowerDomain] = { tag: folderName, count: 1 };
  }

  // 2. 若该域名未在任何域名规则中且置信度足够，自动加入 domainRules
  const learned = rules.learnedDomainTag[lowerDomain];
  const inBuiltin = DOMAIN_RULES.some(r => r.domains.some(d => lowerDomain.includes(d)));
  const inDynamic = (rules.domainRules || []).some(r => r.domains.some(d => lowerDomain.includes(d)));
  if (!inBuiltin && !inDynamic && learned.count >= 2) {
    if (!rules.domainRules) rules.domainRules = [];
    const existingRule = rules.domainRules.find(r => r.tag === folderName && r.source !== 'user');
    if (existingRule) {
      existingRule.source = 'learned';
      if (!existingRule.domains.includes(lowerDomain)) existingRule.domains.push(lowerDomain);
    } else {
      rules.domainRules.push({ domains: [lowerDomain], tag: folderName, color: '#607d8b', source: 'learned' });
    }
  }

  await saveDynamicRules(rules);
}

// 供 popup 设置页调用：获取/添加/删除动态规则
async function getDynamicRules() {
  return await loadDynamicRules();
}

async function addDynamicDomainRule(domains, tag, color) {
  tag = canonicalCategoryTag(tag);
  if (!tag) throw new Error('invalid_category_tag');
  const rules = await loadDynamicRules();
  if (!rules.domainRules) rules.domainRules = [];
  rules.domainRules.push({ domains, tag, color: color || '#607d8b', source: 'user' });
  await saveDynamicRules(rules);
}

async function addDynamicKeyword(tag, keyword) {
  const rules = await loadDynamicRules();
  if (!rules.keywordRules) rules.keywordRules = {};
  if (!rules.keywordRules[tag]) rules.keywordRules[tag] = [];
  if (!rules.keywordRules[tag].includes(keyword)) {
    rules.keywordRules[tag].push(keyword);
  }
  await saveDynamicRules(rules);
}

async function addDynamicStopWord(word) {
  const rules = await loadDynamicRules();
  if (!rules.stopWords) rules.stopWords = [];
  if (!rules.stopWords.includes(word)) {
    rules.stopWords.push(word);
  }
  await saveDynamicRules(rules);
}

// ===== 从用户反馈中学习关键词 =====
async function learnKeywords(text, tag) {
  if (!text || !tag) return;
  const cleaned = cleanTitle(text);
  const tokens = tokenize(cleaned);
  if (tokens.length === 0) return;

  const rules = await loadDynamicRules();
  if (!rules.keywordStats) rules.keywordStats = {};
  if (!rules.keywordStats[tag]) rules.keywordStats[tag] = {};

  for (const t of tokens) {
    rules.keywordStats[tag][t] = (rules.keywordStats[tag][t] || 0) + 1;
  }

  // 出现 2 次以上且在该标签下显著高频的词提升为动态关键词
  if (!rules.keywordRules) rules.keywordRules = {};
  if (!rules.keywordRules[tag]) rules.keywordRules[tag] = [];

  const tagStats = rules.keywordStats[tag];
  const total = Object.values(tagStats).reduce((a, b) => a + b, 0);
  for (const [word, count] of Object.entries(tagStats)) {
    if (count >= 2 && (count / total) > 0.05 && !rules.keywordRules[tag].includes(word)) {
      rules.keywordRules[tag].push(word);
    }
  }

  await saveDynamicRules(rules);
}

// ===== 从用户反馈中学习 URL 路径规则 =====
async function learnPathRule(url, tag) {
  if (!url || !tag) return;
  const features = extractUrlFeatures(url);
  if (!features || features.pathSegments.length === 0) return;

  const rules = await loadDynamicRules();
  if (!rules.pathStats) rules.pathStats = {};
  if (!rules.pathStats[tag]) rules.pathStats[tag] = {};

  for (const seg of features.pathSegments) {
    if (seg.length < 2) continue;
    rules.pathStats[tag][seg] = (rules.pathStats[tag][seg] || 0) + 1;
  }

  // 出现 2 次以上的路径段加入动态 URL 路径规则
  if (!rules.urlPathRules) rules.urlPathRules = [];
  const tagStats = rules.pathStats[tag];
  for (const [seg, count] of Object.entries(tagStats)) {
    if (count >= 2 && !rules.urlPathRules.some(r => r.tag === tag && r.patterns.includes('/' + seg + '/'))) {
      const existing = rules.urlPathRules.find(r => r.tag === tag);
      if (existing) {
        existing.patterns.push('/' + seg + '/');
      } else {
        rules.urlPathRules.push({ patterns: ['/' + seg + '/'], tag });
      }
    }
  }

  await saveDynamicRules(rules);
}

async function removeDynamicDomainRule(tag) {
  const rules = await loadDynamicRules();
  if (rules.domainRules) {
    rules.domainRules = rules.domainRules.filter(r => r.tag !== tag);
  }
  await saveDynamicRules(rules);
}

async function clearLearnedDomainTags() {
  const rules = await loadDynamicRules();
  rules.learnedDomainTag = {};
  await saveDynamicRules(rules);
}

// ===== 主动学习层（Active Learning）=====
// 当模型对分类结果不确定时，将样本加入待确认队列，由用户提供正确标签，
// 反馈结果用于更新本地语料，形成学习闭环。

const TAG_REVIEW_QUEUE_KEY = 'tag_review_queue';
const TAG_LEARNING_STATS_KEY = 'tag_learning_stats';
const MAX_REVIEW_QUEUE_SIZE = 50;

let _reviewQueueCache = null;
let _learningStatsCache = null;

// 判断结果是否需要人工确认
function needsHumanReview(results, bookmark) {
  if (!results || results.length === 0) {
    return { need: true, reason: 'empty' };
  }

  const top1 = results[0];
  const top2 = results[1];

  const readableContent = String(bookmark?.contentText || bookmark?.excerpt || bookmark?.metaDesc || '').trim();
  const hasPageSignals = readableContent.length >= 80 ||
    (Array.isArray(bookmark?.headings) && bookmark.headings.length > 0) ||
    (Array.isArray(bookmark?.contentHeadings) && bookmark.contentHeadings.length > 0) ||
    (Array.isArray(bookmark?.metaKeywords) && bookmark.metaKeywords.length > 0) ||
    (Array.isArray(bookmark?.contentMetaKeywords) && bookmark.contentMetaKeywords.length > 0) ||
    (Array.isArray(bookmark?.structuredTypes) && bookmark.structuredTypes.length > 0) ||
    (Array.isArray(bookmark?.contentStructuredTypes) && bookmark.contentStructuredTypes.length > 0);

  // 强规则信号：文件夹 / 域名 / 用户覆盖
  const hasStrongSignal = (tag) => (tag.signals || []).some(s =>
    s === 'folder' || s === 'domain' || s.startsWith('user-override')
  );

  // 标题信息极少，规则信号可能不可靠
  const cleanedTitle = cleanTitle(bookmark?.title || '');
  const titleTokens = tokenize(cleanedTitle);
  if (!hasPageSignals && !hasStrongSignal(top1)) {
    return { need: true, reason: 'insufficient_page_evidence' };
  }
  if (titleTokens.length <= 2 && !hasStrongSignal(top1)) {
    return { need: true, reason: 'title_noise' };
  }

  // 正文信号与标题/规则信号冲突
  const contentTop = results.find(r => (r.signals || []).some(s => s.startsWith('content-tfidf:')));
  const ruleTop = results.find(r => (r.signals || []).some(s =>
    s === 'folder' || s === 'domain' || s === 'subdomain' || s === 'url-path' ||
    s.startsWith('regex:') || s.startsWith('keyword:') || s.startsWith('ngram:')
  ));
  if (contentTop && ruleTop && contentTop.tag !== ruleTop.tag && (contentTop.score || 0) >= (ruleTop.score || 0) * 0.75) {
    return { need: true, reason: 'content_disagree' };
  }

  // 没有强规则信号且原始分数偏低
  const LOW_SCORE_THRESHOLD = 20;
  if (!hasStrongSignal(top1) && (top1.score || 0) < LOW_SCORE_THRESHOLD) {
    return { need: true, reason: 'low_confidence' };
  }

  // top1/top2 太接近，模型不确定
  if (top2 && (top2.score || 0) >= (top1.score || 0) * 0.85) {
    return { need: true, reason: 'ambiguous' };
  }

  // 信号冲突：top1 和 top2 来自不同强规则且分数接近
  if (top2 && hasStrongSignal(top1) && hasStrongSignal(top2) && top1.tag !== top2.tag) {
    if ((top2.score || 0) >= (top1.score || 0) * 0.70) {
      return { need: true, reason: 'signal_conflict' };
    }
  }

  // 没有强规则信号且领先优势仍不足
  const WEAK_SIGNAL_THRESHOLD = 40;
  if (!hasStrongSignal(top1) && (top1.score || 0) < WEAK_SIGNAL_THRESHOLD) {
    return { need: true, reason: 'weak_signal' };
  }

  // 全新域名（无强域名信号时才触发）
  if (bookmark && bookmark.domain && !hasStrongSignal(top1)) {
    if (!isDomainSeen(bookmark.domain)) {
      return { need: true, reason: 'new_domain' };
    }
  }

  return { need: false, reason: null };
}

async function loadReviewQueue() {
  if (_reviewQueueCache) return _reviewQueueCache;
  try {
    const data = await chrome.storage.local.get(TAG_REVIEW_QUEUE_KEY);
    _reviewQueueCache = data[TAG_REVIEW_QUEUE_KEY] || [];
  } catch {
    _reviewQueueCache = [];
  }
  return _reviewQueueCache;
}

async function saveReviewQueue(queue) {
  _reviewQueueCache = queue;
  await chrome.storage.local.set({ [TAG_REVIEW_QUEUE_KEY]: queue });
}

async function getReviewQueue() {
  return await loadReviewQueue();
}

async function addToReviewQueue(item) {
  const queue = await loadReviewQueue();

  // 用 URL 去重
  const existingIndex = queue.findIndex(q => q.url === item.url);
  if (existingIndex >= 0) {
    // 更新已有项的建议标签和置信度
    queue[existingIndex] = { ...queue[existingIndex], ...item, createdAt: Date.now() };
  } else {
    queue.unshift(item);
    if (queue.length > MAX_REVIEW_QUEUE_SIZE) {
      queue.pop(); // FIFO 淘汰
    }
  }

  await saveReviewQueue(queue);

  // 广播队列变化
  try {
    chrome.runtime.sendMessage({
      action: 'reviewQueueChanged',
      count: queue.length
    }).catch(() => {});
  } catch {
    // 静默失败
  }

  return queue.length;
}

async function removeFromReviewQueue(id) {
  const queue = await loadReviewQueue();
  const newQueue = queue.filter(q => q.id !== id);
  await saveReviewQueue(newQueue);

  // 广播队列变化
  try {
    chrome.runtime.sendMessage({
      action: 'reviewQueueChanged',
      count: newQueue.length
    }).catch(() => {});
  } catch {
    // 静默失败
  }

  return newQueue.length;
}

async function clearReviewQueue() {
  await saveReviewQueue([]);
  try {
    chrome.runtime.sendMessage({
      action: 'reviewQueueChanged',
      count: 0
    }).catch(() => {});
  } catch {
    // 静默失败
  }
}

async function loadLearningStats() {
  if (_learningStatsCache) return _learningStatsCache;
  try {
    const data = await chrome.storage.local.get(TAG_LEARNING_STATS_KEY);
    _learningStatsCache = data[TAG_LEARNING_STATS_KEY] || {
      totalReviewed: 0,
      totalAccepted: 0,
      totalModified: 0,
      totalIgnored: 0,
      lastReviewAt: 0,
      tagAccuracy: {},
      history: []
    };
  } catch {
    _learningStatsCache = {
      totalReviewed: 0,
      totalAccepted: 0,
      totalModified: 0,
      totalIgnored: 0,
      lastReviewAt: 0,
      tagAccuracy: {},
      history: []
    };
  }
  return _learningStatsCache;
}

async function saveLearningStats(stats) {
  _learningStatsCache = stats;
  await chrome.storage.local.set({ [TAG_LEARNING_STATS_KEY]: stats });
}

async function getLearningStats() {
  return await loadLearningStats();
}

/**
 * 获取自动标签准确率历史趋势
 * 返回按日期聚合的 { date, accuracy, total } 数组
 */
async function getLearningTrend(days = 30) {
  const stats = await loadLearningStats();
  const history = stats.history || [];
  if (history.length === 0) return [];

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const map = new Map();

  for (const h of history) {
    if (h.ts < cutoff) continue;
    const key = h.date;
    if (!map.has(key)) {
      map.set(key, { date: key, accepted: 0, modified: 0, ignored: 0, total: 0 });
    }
    const entry = map.get(key);
    entry.accepted += h.accepted || 0;
    entry.modified += h.modified || 0;
    entry.ignored += h.ignored || 0;
    entry.total += h.total || 0;
  }

  const sorted = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map(item => {
    const total = item.total || item.accepted + item.modified + item.ignored || 0;
    const accuracy = total > 0 ? item.accepted / total : 0;
    return {
      date: item.date,
      total,
      accepted: item.accepted,
      accuracy: Math.round(accuracy * 1000) / 10
    };
  });
}

// 用户确认/修改/忽略标签后的回调
// action: 'accepted' | 'modified' | 'ignored'
async function onUserConfirmTag(queueItem, confirmedTags, action) {
  if (!queueItem) return;

  if (action === 'ignored') {
    await updateLearningStats(queueItem.suggestedTags || [], [], 'ignored');
    await removeFromReviewQueue(queueItem.id);
    return;
  }

  const text = `${queueItem.title || ''} ${queueItem.url || ''}`;
  const tags = Array.isArray(confirmedTags) && confirmedTags.length > 0
    ? confirmedTags
    : (queueItem.suggestedTags || []);

  if (tags.length === 0) {
    await removeFromReviewQueue(queueItem.id);
    return;
  }

  // 更新贝叶斯标签语料（文档频率已在书签入库时更新，避免同一文档重复计数）
  await updateTagCorpus(text, tags);

  // 更新学习统计
  await updateLearningStats(queueItem.suggestedTags || [], tags, action);

  // 从队列移除
  await removeFromReviewQueue(queueItem.id);
}

async function updateLearningStats(suggestedTags, confirmedTags, action) {
  const stats = await loadLearningStats();
  stats.totalReviewed += 1;
  stats.lastReviewAt = Date.now();

  if (action === 'accepted') stats.totalAccepted += 1;
  else if (action === 'modified') stats.totalModified += 1;
  else if (action === 'ignored') stats.totalIgnored += 1;

  // 按建议标签统计接受率
  for (const tag of suggestedTags) {
    if (!stats.tagAccuracy[tag]) {
      stats.tagAccuracy[tag] = { accepted: 0, modified: 0, ignored: 0 };
    }
    if (action === 'accepted') stats.tagAccuracy[tag].accepted += 1;
    else if (action === 'modified') stats.tagAccuracy[tag].modified += 1;
    else if (action === 'ignored') stats.tagAccuracy[tag].ignored += 1;
  }

  // 记录每日准确率历史，供趋势图使用
  const now = new Date();
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (!Array.isArray(stats.history)) stats.history = [];
  let todayEntry = stats.history.find(h => h.date === dateKey);
  if (!todayEntry) {
    todayEntry = { date: dateKey, ts: Date.now(), accepted: 0, modified: 0, ignored: 0, total: 0 };
    stats.history.push(todayEntry);
  }
  todayEntry.total += 1;
  if (action === 'accepted') todayEntry.accepted += 1;
  else if (action === 'modified') todayEntry.modified += 1;
  else if (action === 'ignored') todayEntry.ignored += 1;

  // 只保留最近 180 天历史，避免 storage 无限增长
  const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
  stats.history = stats.history.filter(h => (h.ts || 0) >= cutoff);

  await saveLearningStats(stats);
}

async function autoTagBookmarks(bookmarks, concurrency = 10, options = {}) {
  const results = new Array(bookmarks.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, bookmarks.length) }, async () => {
    while (true) {
      const i = nextIndex++;
      if (i >= bookmarks.length) return;
      const bookmark = bookmarks[i];
      const tags = await autoTagBookmark(bookmark, options);
      results[i] = {
        ...bookmark,
        tags: tags.map(t => t.tag),
        tagsAuto: tags.map(t => t.tag)
      };
      // 仅更新通用文档频率；批量场景的自动标签不直接写入贝叶斯语料，避免未验证标签污染模型
      const text = `${cleanTitle(bookmark.title || '')} ${bookmark.url || ''}`;
      await updateDocFrequency(text, bookmark.url);
    }
  });
  await Promise.all(runners);
  return results;
}

// ===== 从书签树提取文件夹路径 =====
function extractFolderPaths(nodes, parentPath = '', parentTitle = '') {
  let results = [];

  for (const node of nodes) {
    const currentPath = parentPath ? `${parentPath}/${node.title}` : node.title;
    const folderName = node.title;

    if (node.url) {
      results.push({
        id: node.id,
        url: node.url,
        title: node.title,
        folderPath: parentPath,
        folderName: parentTitle
      });
    }

    if (node.children && node.children.length > 0) {
      results = results.concat(
        extractFolderPaths(node.children, currentPath, folderName)
      );
    }
  }

  return results;
}
