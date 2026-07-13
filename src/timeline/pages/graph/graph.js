// ===== 知识图谱：Cytoscape.js + cose 布局 =====

// ===== DOM 引用 =====
const particleCanvas = document.getElementById('particleCanvas');
const pCtx = particleCanvas.getContext('2d');
const backBtn = document.getElementById('backBtn');
const workspaceBtn = document.getElementById('workspaceBtn');
const bookmarkNavBtn = document.getElementById('bookmarkNavBtn');
const aiClassifyBtn = document.getElementById('aiClassifyBtn');
const settingsBtn = document.getElementById('settingsBtn');
const graphStats = document.getElementById('graphStats');
const graphEmpty = document.getElementById('graphEmpty');
const graphLoading = document.getElementById('graphLoading');
const hoverCard = document.getElementById('hoverCard');
const hoverTitle = document.getElementById('hoverTitle');
const hoverMeta = document.getElementById('hoverMeta');
const hoverTags = document.getElementById('hoverTags');
const graphLegend = document.getElementById('graphLegend');
const zoomLevelEl = document.getElementById('zoomLevel');

const clusterSelect = document.getElementById('clusterSelect');
const linkDomain = document.getElementById('linkDomain');
const linkTag = document.getElementById('linkTag');
const linkSimilar = document.getElementById('linkSimilar');
const resetViewBtn = document.getElementById('resetViewBtn');
const reLayoutBtn = document.getElementById('reLayoutBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const searchInput = document.getElementById('searchInput');
const searchCount = document.getElementById('searchCount');
const exportBtn = document.getElementById('exportBtn');

// ===== 状态 =====
let bookmarks = [];
let cy = null;           // Cytoscape 实例
let clusterMap = new Map();
let tagColorCache = new Map();
let currentClusterBy = 'domain';
let particleAnimId = null;

function openExtensionPage(path) {
  chrome.tabs.create({ url: chrome.runtime.getURL(path) });
}

async function openAiClassifyPanel() {
  try {
    if (chrome.sidePanel?.setOptions) {
      await chrome.sidePanel.setOptions({ path: 'ai/sidepanel.html', enabled: true });
    }
    const win = await chrome.windows.getCurrent();
    if (chrome.sidePanel?.open && win?.id != null) {
      await chrome.sidePanel.open({ windowId: win.id });
      return;
    }
  } catch (err) {
    console.warn('sidePanel open failed, fallback', err);
  }
  openExtensionPage('ai/sidepanel.html');
}

// ===== 主题检测 =====
function applyThemeClass(theme) {
  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('theme-dark', isDark);
  document.body.classList.toggle('theme-light', !isDark);
}

async function detectTheme() {
  const result = await chrome.storage.local.get('theme');
  applyThemeClass(result.theme || 'system');
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.theme) applyThemeClass(changes.theme.newValue || 'system');
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
  const result = await chrome.storage.local.get('theme');
  if ((result.theme || 'system') === 'system') applyThemeClass('system');
});

// ===== 工具函数 =====
function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function isDarkTheme() {
  return document.body.classList.contains('theme-dark');
}

const URL_STOP_WORDS = new Set(['http', 'https', 'www', 'com', 'cn', 'org', 'net', 'io']);

function tokenize(text) {
  if (!text) return new Set();
  const cleaned = text.toLowerCase().replace(/[^\w\u4e00-\u9fa5\s]/g, ' ');
  const tokens = new Set();
  cleaned.split(/\s+/).forEach(w => {
    if (w.length >= 2 && !STOP_WORDS.has(w) && !URL_STOP_WORDS.has(w)) tokens.add(w);
  });
  const cjk = cleaned.match(/[\u4e00-\u9fa5]+/g) || [];
  cjk.forEach(seg => {
    for (let i = 0; i < seg.length - 1; i++) tokens.add(seg.substring(i, i + 2));
    for (let i = 0; i < seg.length; i++) tokens.add(seg[i]);
  });
  return tokens;
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  const smaller = setA.size < setB.size ? setA : setB;
  const larger = setA.size < setB.size ? setB : setA;
  for (const item of smaller) { if (larger.has(item)) intersection++; }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function cosineSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  const smaller = setA.size < setB.size ? setA : setB;
  const larger = setA.size < setB.size ? setB : setA;
  for (const item of smaller) { if (larger.has(item)) intersection++; }
  return intersection / Math.sqrt(setA.size * setB.size);
}

function urlPathSimilarity(urlA, urlB) {
  if (!urlA || !urlB) return 0;
  try {
    const segA = new URL(urlA).pathname.split('/').filter(s => s.length > 0);
    const segB = new URL(urlB).pathname.split('/').filter(s => s.length > 0);
    if (segA.length === 0 || segB.length === 0) return 0;
    let common = 0;
    const minLen = Math.min(segA.length, segB.length);
    for (let i = 0; i < minLen; i++) { if (segA[i] === segB[i]) common++; else break; }
    return common / Math.max(segA.length, segB.length);
  } catch { return 0; }
}

// ===== 颜色生成 =====
// 精选专业调色板：饱和度适中、区分度高、素雅不刺眼
const CLUSTER_PALETTE = [
  '#4263eb', '#e8590c', '#2f9e44', '#f08c00', '#9c36b5',
  '#0c8599', '#c92a2a', '#5c940d', '#e64980', '#1864ab',
  '#d9480f', '#087f5b', '#6741d9', '#e67700', '#364fc7',
  '#c2255c', '#5a9e6f', '#d6336c', '#3b5bdb', '#ae3ec9'
];

// 边分组颜色（参考官方 demo 的 edge[group] 着色方案）
const EDGE_GROUP_COLORS = {
  domain: '#a0b3dc',   // 域名关联：蓝灰
  tag: '#90e190',      // 标签关联：浅绿
  similar: '#f6c384'   // 相似关联：暖橙
};

function colorForCluster(key, index) {
  if (index < CLUSTER_PALETTE.length) return CLUSTER_PALETTE[index];
  let hash = 0;
  for (let i = 0; i < key.length; i++) { hash = ((hash << 5) - hash) + key.charCodeAt(i); hash |= 0; }
  return `hsl(${Math.abs(hash) % 360}, 65%, 50%)`;
}

// ===== 关联分析引擎 =====
function buildGraphElements(bookmarks, options) {
  const { linkByDomain, linkByTag, linkBySimilar } = options;
  const elements = [];
  const tokenCache = new Map();
  const nodeIndex = new Map();

  // 构建节点
  for (const b of bookmarks) {
    const domain = b.domain || extractDomain(b.url);
    const node = {
      id: b.id,
      title: b.title || b.url || '',
      url: b.url,
      domain,
      tags: b.tags || [],
      folder: b.folderName || '',
      cluster: ''
    };
    nodeIndex.set(b.id, node);
    tokenCache.set(b.id, tokenize(node.title + ' ' + node.domain));

    elements.push({
      data: {
        id: b.id,
        label: node.title.length > 20 ? node.title.substring(0, 20) + '...' : node.title,
        fullTitle: node.title,
        url: node.url,
        domain,
        tags: node.tags,
        folder: node.folder,
        weight: 1
      }
    });
  }

  // 边构建
  const edgeMap = new Map();  // key -> { weight, groups: Set }
  const addEdge = (a, b, w, group) => {
    if (a.id === b.id) return;
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    const prev = edgeMap.get(key);
    if (prev) {
      prev.weight += w;
      prev.groups.add(group);
    } else {
      edgeMap.set(key, { weight: w, groups: new Set([group]) });
    }
  };

  const domainGroups = new Map();
  const tagGroups = new Map();
  for (const node of nodeIndex.values()) {
    if (node.domain) {
      if (!domainGroups.has(node.domain)) domainGroups.set(node.domain, []);
      domainGroups.get(node.domain).push(node);
    }
    for (const tag of node.tags) {
      if (!tagGroups.has(tag)) tagGroups.set(tag, []);
      tagGroups.get(tag).push(node);
    }
  }

  const FULL_CONNECT_LIMIT = 12;
  const KNN_K = 6;

  const connectGroup = (group, weight, groupType) => {
    if (group.length <= 1) return;
    if (group.length <= FULL_CONNECT_LIMIT) {
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++) addEdge(group[i], group[j], weight, groupType);
    } else {
      for (let i = 0; i < group.length; i++) {
        const tokensI = tokenCache.get(group[i].id);
        const scored = [];
        for (let j = 0; j < group.length; j++) {
          if (i === j) continue;
          const sim = jaccardSimilarity(tokensI, tokenCache.get(group[j].id));
          if (sim > 0) scored.push({ node: group[j], sim });
        }
        scored.sort((a, b) => b.sim - a.sim);
        const k = Math.min(KNN_K, scored.length);
        for (let m = 0; m < k; m++) addEdge(group[i], scored[m].node, weight * (0.5 + scored[m].sim * 0.5), groupType);
      }
    }
  };

  if (linkByDomain) for (const [, group] of domainGroups) connectGroup(group, 3, 'domain');
  if (linkByTag) for (const [, group] of tagGroups) connectGroup(group, 2, 'tag');

  if (linkBySimilar) {
    const invertedIndex = new Map();
    for (const node of nodeIndex.values()) {
      const tokens = tokenCache.get(node.id);
      for (const token of tokens) {
        if (!invertedIndex.has(token)) invertedIndex.set(token, []);
        invertedIndex.get(token).push(node);
      }
    }
    const candidatePairs = new Set();
    for (const [, list] of invertedIndex) {
      if (list.length > 100) continue;
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const key = list[i].id < list[j].id ? `${list[i].id}|${list[j].id}` : `${list[j].id}|${list[i].id}`;
          candidatePairs.add(key);
        }
    }
    for (const key of candidatePairs) {
      const [idA, idB] = key.split('|');
      const nodeA = nodeIndex.get(idA);
      const nodeB = nodeIndex.get(idB);
      if (!nodeA || !nodeB) continue;
      const jaccard = jaccardSimilarity(tokenCache.get(idA), tokenCache.get(idB));
      const cosine = cosineSimilarity(tokenCache.get(idA), tokenCache.get(idB));
      const sim = Math.max(jaccard, cosine);
      if (sim >= 0.2) {
        const pathSim = urlPathSimilarity(nodeA.url, nodeB.url);
        addEdge(nodeA, nodeB, sim * 5 + pathSim * 2, 'similar');
      }
    }
  }

  // 转为 Cytoscape 边元素，权重归一化到 [1, 10]
  const edgeWeights = [];
  for (const [, info] of edgeMap) edgeWeights.push(info.weight);
  const maxEdgeWeight = Math.max(1, ...edgeWeights);
  const minEdgeWeight = Math.min(...edgeWeights);
  const edgeWeightRange = Math.max(1, maxEdgeWeight - minEdgeWeight);

  let edgeIdx = 0;
  for (const [key, info] of edgeMap) {
    const [a, b] = key.split('|');
    // 归一化到 [1, 10]
    const normalizedWeight = 1 + Math.round((info.weight - minEdgeWeight) / edgeWeightRange * 9);
    // 确定主分组（权重贡献最大的分组）
    const primaryGroup = info.groups.values().next().value || 'similar';
    elements.push({
      data: {
        id: `e${edgeIdx++}`,
        source: a,
        target: b,
        weight: normalizedWeight,
        group: primaryGroup
      }
    });
  }

  // 计算节点权重（度数 + 聚类内中心度）
  const nodeDegree = new Map();
  const nodeWeightedDegree = new Map();
  for (const [key, info] of edgeMap) {
    const [a, b] = key.split('|');
    nodeDegree.set(a, (nodeDegree.get(a) || 0) + 1);
    nodeDegree.set(b, (nodeDegree.get(b) || 0) + 1);
    nodeWeightedDegree.set(a, (nodeWeightedDegree.get(a) || 0) + info.weight);
    nodeWeightedDegree.set(b, (nodeWeightedDegree.get(b) || 0) + info.weight);
  }
  const maxWeightedDeg = Math.max(1, ...nodeWeightedDegree.values());
  for (const el of elements) {
    if (!el.data.source) { // 只处理节点
      const deg = nodeDegree.get(el.data.id) || 0;
      const wDeg = nodeWeightedDegree.get(el.data.id) || 0;
      // 综合权重：度数占比 40% + 加权度数占比 60%
      const score = deg > 0 ? (deg / Math.max(1, ...nodeDegree.values())) * 0.4 + (wDeg / maxWeightedDeg) * 0.6 : 0;
      el.data.weight = Math.max(1, Math.round(score * 10));
    }
  }

  return { elements, nodeIndex };
}

// ===== 聚类分析 =====
async function computeClusters(clusterBy, nodeIndex) {
  clusterMap.clear();
  const groups = new Map();

  for (const node of nodeIndex.values()) {
    let key = '';
    if (clusterBy === 'domain') key = node.domain || '(unknown)';
    else if (clusterBy === 'tag') key = node.tags[0] || '(untagged)';
    else if (clusterBy === 'folder') key = node.folder || '(root)';
    node.cluster = key;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(node);
  }

  const sorted = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  const TOP = 20;
  let otherCount = 0;

  if (clusterBy === 'tag') {
    for (let idx = 0; idx < sorted.length; idx++) {
      const [key, group] = sorted[idx];
      if (idx < TOP) {
        let color = '#9aa0a6';
        if (key !== '(untagged)') {
          try { color = await getTagColor(key); } catch { color = colorForCluster(key, idx); }
        }
        clusterMap.set(key, { color, label: key, count: group.length });
      } else { otherCount += group.length; }
    }
  } else {
    sorted.forEach((entry, idx) => {
      const [key, group] = entry;
      if (idx < TOP) clusterMap.set(key, { color: colorForCluster(key, idx), label: key, count: group.length });
      else otherCount += group.length;
    });
  }

  if (otherCount > 0) {
    clusterMap.set('__other__', { color: '#9aa0a6', label: 'Other', count: otherCount });
    for (const node of nodeIndex.values()) {
      if (!clusterMap.has(node.cluster)) node.cluster = '__other__';
    }
  }
}

// ===== Cytoscape 样式（参考官方 demo） =====
function getCyStyle() {
  const dark = isDarkTheme();
  return [
    // ===== 核心选择框 =====
    {
      selector: 'core',
      style: {
        'selection-box-color': '#AAD8FF',
        'selection-box-border-color': '#8BB0D0',
        'selection-box-opacity': 0.5
      }
    },
    // ===== 节点基础样式 =====
    {
      selector: 'node',
      style: {
        'label': 'data(label)',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'font-size': '9px',
        'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'color': dark ? 'rgba(228,228,239,0.9)' : 'rgba(32,33,36,0.9)',
        'text-outline-color': dark ? 'rgba(30,30,46,0.9)' : 'rgba(255,255,255,0.9)',
        'text-outline-width': 2,
        'text-wrap': 'ellipsis',
        'text-max-width': '80px',
        'width': 'mapData(weight, 1, 10, 10, 36)',
        'height': 'mapData(weight, 1, 10, 10, 36)',
        'shape': 'ellipse',
        'border-width': 1.5,
        'border-color': dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.12)',
        'border-opacity': 1,
        'background-color': 'data(color)',
        'background-opacity': 0.9,
        'text-opacity': 0,
        'overlay-padding': '6px',
        'z-index': 10,
        'transition-property': 'background-color, border-color, border-width, opacity, text-opacity',
        'transition-duration': '0.15s'
      }
    },
    {
      selector: 'node:active',
      style: { 'overlay-opacity': 0.05 }
    },
    {
      selector: 'node:grabbed',
      style: {
        'text-opacity': 1,
        'border-width': 2.5,
        'border-color': dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.3)'
      }
    },
    // ===== 悬停 =====
    {
      selector: 'node.hovered',
      style: {
        'text-opacity': 1,
        'border-width': 2.5,
        'border-color': dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.25)',
        'z-index': 999
      }
    },
    // ===== 高亮（聚类点击） =====
    {
      selector: 'node.highlighted',
      style: {
        'border-width': 3,
        'border-color': '#AAD8FF',
        'border-opacity': 0.6,
        'text-opacity': 1,
        'font-size': '10px',
        'z-index': 999
      }
    },
    // ===== 淡化 =====
    {
      selector: 'node.unhighlighted',
      style: {
        'opacity': 0.15,
        'text-opacity': 0
      }
    },
    // ===== 搜索匹配 =====
    {
      selector: 'node.search-match',
      style: {
        'border-width': 3,
        'border-color': '#f59e0b',
        'text-opacity': 1,
        'font-size': '10px',
        'z-index': 998
      }
    },
    // ===== 边基础样式（参考官方 demo haystack 曲线） =====
    {
      selector: 'edge',
      style: {
        'width': 'mapData(weight, 1, 10, 0.5, 4)',
        'line-color': dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
        'curve-style': 'haystack',
        'haystack-radius': 0.5,
        'opacity': 0.4,
        'overlay-padding': '3px',
        'transition-property': 'line-color, opacity, width',
        'transition-duration': '0.15s'
      }
    },
    // ===== 边按分组着色（参考官方 demo edge[group] 模式） =====
    {
      selector: 'edge[group="domain"]',
      style: {
        'line-color': dark ? 'rgba(160,179,220,0.5)' : 'rgba(66,99,235,0.35)'
      }
    },
    {
      selector: 'edge[group="tag"]',
      style: {
        'line-color': dark ? 'rgba(144,225,144,0.5)' : 'rgba(47,158,68,0.35)'
      }
    },
    {
      selector: 'edge[group="similar"]',
      style: {
        'line-color': dark ? 'rgba(246,195,132,0.5)' : 'rgba(232,89,12,0.35)'
      }
    },
    // ===== 边高亮 =====
    {
      selector: 'edge.highlighted',
      style: {
        'width': 'mapData(weight, 1, 10, 2, 6)',
        'opacity': 0.9,
        'z-index': 500
      }
    },
    // ===== 边淡化 =====
    {
      selector: 'edge.unhighlighted',
      style: {
        'opacity': 0.03
      }
    }
  ];
}

// ===== 初始化 Cytoscape =====
function initCytoscape(elements) {
  const container = document.getElementById('cy');

  if (cy) {
    cy.destroy();
    cy = null;
  }

  cy = cytoscape({
    container,
    elements,
    style: getCyStyle(),
    layout: {
      name: 'cose',
      animate: true,
      animationDuration: 800,
      animationEasing: 'ease-in-out-cubic',
      randomize: false,
      fit: true,
      padding: 30,
      nodeRepulsion: 400000,
      idealEdgeLength: 100,
      nodeOverlap: 20,
      refresh: 20,
      componentSpacing: 100,
      edgeElasticity: 100,
      nestingFactor: 5,
      gravity: 80,
      numIter: 1000,
      initialTemp: 200,
      coolingFactor: 0.95,
      minTemp: 1.0
    },
    minZoom: 0.2,
    maxZoom: 5,
    wheelSensitivity: 0.3,
    boxSelectionEnabled: false,
    selectionType: 'single'
  });

  // 应用聚类颜色
  applyClusterColors();

  // 事件绑定
  bindCyEvents();

  // 布局完成后限制初始缩放不超过 100%
  cy.on('layoutstop', () => {
    if (cy.zoom() > 1) {
      cy.fit(undefined, 30);
      if (cy.zoom() > 1) cy.zoom(1);
    }
    zoomLevelEl.textContent = Math.round(cy.zoom() * 100) + '%';
  });

  // 更新缩放显示
  cy.on('zoom', () => {
    zoomLevelEl.textContent = Math.round(cy.zoom() * 100) + '%';
  });
}

// ===== 应用聚类颜色到节点 =====
function hexToRgb(hex) {
  if (!hex) return [107, 114, 128];
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function applyClusterColors() {
  // 节点颜色已通过 data(color) 在样式表中绑定
  // 边颜色已通过 edge[group] 选择器在样式表中绑定
  // 无需额外手动设置
}

// ===== Cytoscape 事件绑定 =====
function bindCyEvents() {
  // 悬停：高亮当前节点 + 邻居 + 连接边
  cy.on('mouseover', 'node', (evt) => {
    const node = evt.target;
    const connected = node.connectedEdges().connectedNodes();

    cy.elements().addClass('unhighlighted');
    node.removeClass('unhighlighted').addClass('highlighted');
    connected.removeClass('unhighlighted').addClass('highlighted');
    node.connectedEdges().removeClass('unhighlighted').addClass('highlighted');

    showHoverCard(node, evt.originalEvent);
  });

  cy.on('mouseout', 'node', () => {
    cy.elements().removeClass('unhighlighted').removeClass('highlighted');
    hoverCard.style.display = 'none';
  });

  // 点击打开书签
  cy.on('tap', 'node', (evt) => {
    const url = evt.target.data('url');
    if (url) chrome.tabs.create({ url });
  });

  // 点击空白恢复
  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      cy.elements().removeClass('unhighlighted').removeClass('highlighted');
      applyClusterColors();
    }
  });

  // 缩放时显示/隐藏标签
  updateLabelVisibility();
  cy.on('zoom', updateLabelVisibility);
}

function updateLabelVisibility() {
  if (!cy) return;
  const zoom = cy.zoom();
  if (zoom > 1.5) {
    cy.nodes().style('text-opacity', 1);
  } else {
    cy.nodes().style('text-opacity', 0);
  }
}

// ===== 悬浮卡片 =====
function showHoverCard(node, event) {
  hoverTitle.textContent = node.data('fullTitle') || node.data('label') || '（无标题）';
  hoverMeta.textContent = node.data('domain') || '';

  hoverTags.innerHTML = '';
  const tags = node.data('tags') || [];
  if (tags.length > 0) {
    tags.slice(0, 5).forEach(tag => {
      const span = document.createElement('span');
      span.className = 'hover-card-tag';
      const color = tagColorCache.get(tag) || '#9aa0a6';
      span.style.background = color + '22';
      span.style.color = color;
      span.textContent = tag;
      hoverTags.appendChild(span);
    });
  }

  hoverCard.style.display = 'block';
  const container = document.getElementById('cy').getBoundingClientRect();
  const cardWidth = 280;
  const cardHeight = hoverCard.offsetHeight;
  let posX = event.clientX - container.left + 14;
  let posY = event.clientY - container.top + 14;
  if (posX + cardWidth > container.width) posX = posX - cardWidth - 28;
  if (posY + cardHeight > container.height) posY = posY - cardHeight - 28;
  hoverCard.style.left = Math.max(8, posX) + 'px';
  hoverCard.style.top = Math.max(8, posY) + 'px';
}

// ===== 节点搜索 =====
function setupSearch() {
  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(performSearch, 200);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      performSearch();
      searchInput.blur();
    }
  });
}

function performSearch() {
  if (!cy) return;
  const query = searchInput.value.trim().toLowerCase();

  cy.nodes().removeClass('search-match');

  if (!query) {
    searchCount.style.display = 'none';
    cy.elements().removeClass('unhighlighted');
    return;
  }

  const matched = cy.nodes().filter(node => {
    const title = (node.data('fullTitle') || '').toLowerCase();
    const domain = (node.data('domain') || '').toLowerCase();
    const url = (node.data('url') || '').toLowerCase();
    const tags = (node.data('tags') || []).join(' ').toLowerCase();
    return title.includes(query) || domain.includes(query) || url.includes(query) || tags.includes(query);
  });

  matched.addClass('search-match');
  cy.elements().removeClass('unhighlighted');
  if (matched.length > 0) {
    cy.elements().not(matched).not(matched.connectedEdges()).addClass('unhighlighted');
    if (matched.length <= 20) cy.fit(matched, 60);
  }

  searchCount.textContent = `${matched.length}`;
  searchCount.style.display = matched.length > 0 || query ? 'inline' : 'none';
}

// ===== 静态 HTML 图谱导出 =====
function exportStaticHTML() {
  if (!cy) return;

  const dark = isDarkTheme();
  const bgColor = dark ? '#0f1117' : '#fafbfc';
  const textColor = dark ? '#e4e6eb' : '#1a1d23';
  const edgeColor = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';

  // 获取节点位置
  const nodesData = [];
  cy.nodes().forEach(node => {
    const pos = node.position();
    const cluster = node.data('cluster');
    const info = clusterMap.get(cluster);
    nodesData.push({
      id: node.id(),
      x: pos.x,
      y: pos.y,
      label: node.data('label') || '',
      fullTitle: node.data('fullTitle') || '',
      url: node.data('url') || '',
      color: info ? info.color : '#9aa0a6',
      tags: node.data('tags') || [],
      domain: node.data('domain') || ''
    });
  });

  const edgesData = [];
  cy.edges().forEach(edge => {
    edgesData.push({
      source: edge.source().id(),
      target: edge.target().id(),
      weight: edge.data('weight') || 1
    });
  });

  // 计算边界
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodesData) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
  }
  const padding = 60;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;

  // 图例数据
  const legendData = [];
  const sorted = Array.from(clusterMap.entries()).sort((a, b) => b[1].count - a[1].count);
  for (const [key, info] of sorted) {
    legendData.push({ color: info.color, label: info.label, count: info.count });
  }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bookmark Knowledge Graph - Export</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: ${bgColor}; font-family: -apple-system, BlinkMacSystemFont, sans-serif; overflow: hidden; }
canvas { display: block; cursor: grab; }
canvas:active { cursor: grabbing; }
.legend { position: fixed; bottom: 20px; left: 20px; background: ${dark ? 'rgba(22,25,34,0.85)' : 'rgba(255,255,255,0.85)'}; backdrop-filter: blur(12px); border: 1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}; border-radius: 12px; padding: 12px 16px; font-size: 11px; max-height: 300px; overflow-y: auto; }
.legend-title { font-size: 10px; font-weight: 600; color: ${dark ? '#6b7280' : '#868e96'}; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
.legend-item { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.legend-label { color: ${dark ? '#a8b0bd' : '#495057'}; }
.legend-count { color: ${dark ? '#6b7280' : '#868e96'}; font-size: 10px; margin-left: auto; }
.tooltip { position: fixed; background: ${dark ? 'rgba(22,25,34,0.92)' : 'rgba(255,255,255,0.92)'}; backdrop-filter: blur(16px); border: 1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}; border-radius: 12px; padding: 12px 16px; font-size: 12px; pointer-events: none; z-index: 100; max-width: 280px; display: none; }
.tooltip-title { font-weight: 500; color: ${textColor}; margin-bottom: 4px; word-break: break-word; }
.tooltip-meta { color: ${dark ? '#6b7280' : '#868e96'}; font-size: 11px; font-family: monospace; }
.stats { position: fixed; top: 16px; right: 20px; color: ${dark ? '#6b7280' : '#868e96'}; font-size: 11px; font-family: monospace; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<div class="legend">
  <div class="legend-title">${clusterSelect.value === 'domain' ? 'Domains' : clusterSelect.value === 'tag' ? 'Tags' : 'Folders'}</div>
  ${legendData.map(l => `<div class="legend-item"><span class="legend-dot" style="background:${l.color}"></span><span class="legend-label">${l.label}</span><span class="legend-count">${l.count}</span></div>`).join('')}
</div>
<div class="tooltip" id="tip"><div class="tooltip-title" id="tipTitle"></div><div class="tooltip-meta" id="tipMeta"></div></div>
<div class="stats">${nodesData.length} nodes · ${edgesData.length} edges · ${clusterMap.size} clusters</div>
<script>
const nodes = ${JSON.stringify(nodesData)};
const edges = ${JSON.stringify(edgesData)};
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const tip = document.getElementById('tip');
const tipTitle = document.getElementById('tipTitle');
const tipMeta = document.getElementById('tipMeta');

let scale = 1, offX = 0, offY = 0, dragging = false, lastX = 0, lastY = 0;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  draw();
}

function fitView() {
  const sx = canvas.width / ${width};
  const sy = canvas.height / ${height};
  scale = Math.min(sx, sy) * 0.9;
  offX = (canvas.width - ${width} * scale) / 2 - ${minX - padding} * scale;
  offY = (canvas.height - ${height} * scale) / 2 - ${minY - padding} * scale;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);

  // edges
  const nodeMap = {};
  nodes.forEach(n => nodeMap[n.id] = n);
  for (const e of edges) {
    const a = nodeMap[e.source], b = nodeMap[e.target];
    if (!a || !b) continue;
    const w = e.weight;
    if (w >= 6) {
      const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      gradient.addColorStop(0, a.color + 'B3');
      gradient.addColorStop(1, b.color + 'B3');
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.6;
    } else if (w >= 3) {
      const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      gradient.addColorStop(0, a.color + '73');
      gradient.addColorStop(1, b.color + '73');
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.1;
    } else {
      ctx.strokeStyle = '${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}';
      ctx.lineWidth = 0.7;
    }
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // nodes
  for (const n of nodes) {
    const size = 5;
    ctx.beginPath();
    ctx.arc(n.x, n.y, size, 0, Math.PI * 2);
    ctx.fillStyle = n.color;
    ctx.fill();
    ctx.strokeStyle = '${dark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.8)'}';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const d = e.deltaY > 0 ? 0.9 : 1.1;
  const ns = Math.max(0.1, Math.min(10, scale * d));
  const mx = e.clientX, my = e.clientY;
  offX = mx - (mx - offX) * (ns / scale);
  offY = my - (my - offY) * (ns / scale);
  scale = ns;
  draw();
}, { passive: false });

canvas.addEventListener('mousedown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
canvas.addEventListener('mousemove', e => {
  if (dragging) { offX += e.clientX - lastX; offY += e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; draw(); }
  // hover
  const wx = (e.clientX - offX) / scale, wy = (e.clientY - offY) / scale;
  let found = null;
  for (const n of nodes) { if ((n.x - wx) ** 2 + (n.y - wy) ** 2 < 100) { found = n; break; } }
  if (found) {
    tip.style.display = 'block';
    tip.style.left = (e.clientX + 14) + 'px';
    tip.style.top = (e.clientY + 14) + 'px';
    tipTitle.textContent = found.fullTitle;
    tipMeta.textContent = found.domain;
  } else { tip.style.display = 'none'; }
});
canvas.addEventListener('mouseup', () => dragging = false);
canvas.addEventListener('mouseleave', () => { dragging = false; tip.style.display = 'none'; });

window.addEventListener('resize', resize);
resize();
fitView();
draw();
<\/script>
</body>
</html>`;

  // 下载
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bookmark-graph-${new Date().toISOString().slice(0, 10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== 工具栏交互 =====
zoomInBtn.addEventListener('click', () => {
  if (cy) cy.zoom(Math.min(5, cy.zoom() * 1.3));
});

zoomOutBtn.addEventListener('click', () => {
  if (cy) cy.zoom(Math.max(0.2, cy.zoom() / 1.3));
});

resetViewBtn.addEventListener('click', () => {
  if (cy) { cy.fit(undefined, 40); }
  zoomLevelEl.textContent = '100%';
});

reLayoutBtn.addEventListener('click', () => {
  if (!cy) return;
  cy.layout({
    name: 'cose',
    randomize: false,
    animate: true,
    animationDuration: 800,
    animationEasing: 'ease-in-out-cubic',
    fit: true,
    padding: 30,
    nodeRepulsion: 400000,
    idealEdgeLength: 100,
    nodeOverlap: 20,
    refresh: 20,
    componentSpacing: 100,
    edgeElasticity: 100,
    nestingFactor: 5,
    gravity: 80,
    numIter: 1000,
    initialTemp: 200,
    coolingFactor: 0.95,
    minTemp: 1.0
  }).run();
});

async function preloadTagColors() {
  const allTags = new Set();
  for (const b of bookmarks) { if (b.tags) b.tags.forEach(t => allTags.add(t)); }
  for (const tag of allTags) {
    if (!tagColorCache.has(tag)) {
      try { tagColorCache.set(tag, await getTagColor(tag)); } catch { tagColorCache.set(tag, '#9aa0a6'); }
    }
  }
}

async function rebuild() {
  currentClusterBy = clusterSelect.value;
  await preloadTagColors();

  const { elements, nodeIndex } = buildGraphElements(bookmarks, {
    linkByDomain: linkDomain.checked,
    linkByTag: linkTag.checked,
    linkBySimilar: linkSimilar.checked
  });

  await computeClusters(currentClusterBy, nodeIndex);

  // 将聚类信息和颜色写入元素数据
  for (const el of elements) {
    if (el.data && el.data.id && !el.data.source) {
      const node = nodeIndex.get(el.data.id);
      if (node) {
        el.data.cluster = node.cluster;
        const info = clusterMap.get(node.cluster);
        el.data.color = info ? info.color : '#9aa0a6';
      }
    }
  }

  initCytoscape(elements);
  renderLegend();
  updateStats();
}

clusterSelect.addEventListener('change', rebuild);
linkDomain.addEventListener('change', rebuild);
linkTag.addEventListener('change', rebuild);
linkSimilar.addEventListener('change', rebuild);

backBtn.addEventListener('click', () => {
  if (window.history.length > 1) history.back();
  else openExtensionPage('pages/standalone/standalone.html');
});

workspaceBtn?.addEventListener('click', () => openExtensionPage('pages/standalone/standalone.html'));
bookmarkNavBtn?.addEventListener('click', () => openExtensionPage('ai/bookmark-nav.html'));
aiClassifyBtn?.addEventListener('click', openAiClassifyPanel);
settingsBtn?.addEventListener('click', () => openExtensionPage('pages/settings/settings.html'));

// ===== 图例 =====
function renderLegend() {
  graphLegend.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'legend-title';
  title.textContent = clusterSelect.value === 'domain' ? 'Domains'
    : clusterSelect.value === 'tag' ? 'Tags' : 'Folders';
  graphLegend.appendChild(title);

  const sorted = Array.from(clusterMap.entries()).sort((a, b) => b[1].count - a[1].count);
  for (const [key, info] of sorted) {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `
      <span class="legend-dot" style="background:${info.color}"></span>
      <span class="legend-label">${escapeHtml(info.label)}</span>
      <span class="legend-count">${info.count}</span>
    `;
    // 点击图例高亮对应聚类
    item.addEventListener('click', () => {
      if (!cy) return;
      const clusterNodes = cy.nodes().filter(n => n.data('cluster') === key);
      cy.elements().removeClass('unhighlighted').removeClass('highlighted');
      if (clusterNodes.length > 0) {
        cy.elements().addClass('unhighlighted');
        clusterNodes.removeClass('unhighlighted').addClass('highlighted');
        clusterNodes.connectedEdges().removeClass('unhighlighted').addClass('highlighted');
        cy.fit(clusterNodes, 60);
      }
    });
    graphLegend.appendChild(item);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ===== 统计信息 =====
function updateStats() {
  if (!cy) return;
  graphStats.innerHTML = `
    <span>${cy.nodes().length} ${i18n('graphNodes')}</span>
    <span>${cy.edges().length} ${i18n('graphEdges')}</span>
    <span>${clusterMap.size} ${i18n('graphClusters')}</span>
  `;
}

// ===== 背景粒子系统 =====
let particles = [];

function setupParticleCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = particleCanvas.getBoundingClientRect();
  particleCanvas.width = rect.width * dpr;
  particleCanvas.height = rect.height * dpr;
  pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  initParticles(rect.width, rect.height);
}

function initParticles(w, h) {
  const count = Math.min(80, Math.max(20, Math.floor((w * h) / 12000)));
  particles = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.08,
      vy: (Math.random() - 0.5) * 0.08,
      size: Math.random() * 1.8 + 0.6,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.004 + Math.random() * 0.008,
      baseAlpha: 0.25 + Math.random() * 0.35
    });
  }
}

function animateParticles() {
  const dpr = window.devicePixelRatio || 1;
  const w = particleCanvas.width / dpr;
  const h = particleCanvas.height / dpr;
  pCtx.clearRect(0, 0, w, h);

  const dark = isDarkTheme();
  const baseColor = dark ? '180, 200, 240' : '100, 130, 200';

  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.phase += p.phaseSpeed;

    if (p.x < -10) p.x = w + 10;
    if (p.x > w + 10) p.x = -10;
    if (p.y < -10) p.y = h + 10;
    if (p.y > h + 10) p.y = -10;

    const flicker = (Math.sin(p.phase) + 1) / 2;
    const alpha = p.baseAlpha * (0.4 + flicker * 0.6);

    pCtx.beginPath();
    pCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    pCtx.fillStyle = `rgba(${baseColor}, ${alpha})`;
    pCtx.fill();

    if (p.size > 1) {
      const gradient = pCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
      gradient.addColorStop(0, `rgba(${baseColor}, ${alpha * 0.3})`);
      gradient.addColorStop(1, `rgba(${baseColor}, 0)`);
      pCtx.fillStyle = gradient;
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
      pCtx.fill();
    }
  }

  // 粒子间连线（星网效果）
  const CONNECT_DIST = 120;
  const CONNECT_DIST_SQ = CONNECT_DIST * CONNECT_DIST;
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const a = particles[i];
      const b = particles[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < CONNECT_DIST_SQ) {
        const dist = Math.sqrt(distSq);
        const alpha = (1 - dist / CONNECT_DIST) * 0.08;
        pCtx.strokeStyle = `rgba(${baseColor}, ${alpha})`;
        pCtx.lineWidth = 0.5;
        pCtx.beginPath();
        pCtx.moveTo(a.x, a.y);
        pCtx.lineTo(b.x, b.y);
        pCtx.stroke();
      }
    }
  }

  particleAnimId = requestAnimationFrame(animateParticles);
}

// ===== 数据加载 =====
async function loadData() {
  graphLoading.style.display = 'block';
  graphEmpty.style.display = 'none';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'getBookmarks' });
    if (!response || !response.success) throw new Error('Failed to load bookmarks');
    bookmarks = response.bookmarks || [];

    if (bookmarks.length === 0) {
      graphLoading.style.display = 'none';
      graphEmpty.style.display = 'block';
      return;
    }

    graphLoading.style.display = 'none';
    await rebuild();
    zoomLevelEl.textContent = '100%';
  } catch (err) {
    console.error('加载图谱数据失败:', err);
    graphLoading.style.display = 'none';
    graphEmpty.style.display = 'block';
  }
}

// ===== 窗口大小变化 =====
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (cy) cy.resize();
    setupParticleCanvas();
  }, 150);
});

// ===== 初始化 =====
async function init() {
  await detectTheme();
  setupParticleCanvas();
  animateParticles();
  setupSearch();
  exportBtn.addEventListener('click', exportStaticHTML);
  loadData();
}

if (typeof initI18n === 'function') {
  initI18n().then(init);
} else {
  init();
}
