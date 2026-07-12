import { useEffect, useState } from 'react';
import { DEFAULT_CLASSIFY_PROMPTS, DEFAULT_SETTINGS, FONT_OPTIONS, PROVIDERS, fontCss, getProvider, type ApiStyle, type Settings } from '../types';
import { loadSettings, saveSettings } from '../core/settings';
import { testConnection, listModels } from '../core/llm';
import { clearCache } from '../core/cache';
import { downloadExport, importBundle } from '../core/transfer';
import { applyColorMode, resolveLang, t, LANGUAGE_OPTIONS } from '../core/i18n';
import { DonateTab } from './Donate';
import './pilot-options.css';

const PRESET_COLORS = ['#0A84FF', '#5E5CE6', '#30D158', '#FF9F0A', '#FF453A', '#64D2FF'];
const ROOT_FOLDER_ALIASES = new Set([
  '书签栏',
  '书签菜单',
  '其他书签',
  '移动设备书签',
  'bookmarks bar',
  'bookmarks menu',
  'other bookmarks',
  'mobile bookmarks',
  '收藏夹栏',
  '其他收藏夹',
]);

type Tab = 'api' | 'appearance' | 'donate';
type FolderOption = { path: string; count: number };

function normalizeFolderPath(path: string[]): string {
  return path
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !ROOT_FOLDER_ALIASES.has(p.toLowerCase()) && !ROOT_FOLDER_ALIASES.has(p))
    .join('/');
}

function countBookmarkLeaves(node: chrome.bookmarks.BookmarkTreeNode): number {
  if (node.url) return /^(https?|ftp):/.test(node.url) ? 1 : 0;
  return (node.children ?? []).reduce((sum, child) => sum + countBookmarkLeaves(child), 0);
}

async function loadFolderOptions(): Promise<FolderOption[]> {
  const tree = await chrome.bookmarks.getTree();
  const options: FolderOption[] = [];
  const walk = (nodes: chrome.bookmarks.BookmarkTreeNode[], path: string[]) => {
    for (const node of nodes) {
      if (node.url) continue;
      const nextPath = node.title ? [...path, node.title] : path;
      const normalized = normalizeFolderPath(nextPath);
      const count = countBookmarkLeaves(node);
      if (normalized && count > 0) options.push({ path: normalized, count });
      if (node.children) walk(node.children, nextPath);
    }
  };
  walk(tree, []);
  return options.sort((a, b) => a.path.localeCompare(b.path, 'zh'));
}

export function OptionsPage() {
  const isEmbed =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('embed') === '1';
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<Tab>('api');
  const [status, setStatus] = useState('');
  const [testing, setTesting] = useState(false);
  const [liveModels, setLiveModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [folderOptions, setFolderOptions] = useState<FolderOption[]>([]);
  const d = t(settings.language);

  useEffect(() => {
    loadSettings().then(setSettings);
    loadFolderOptions().then(setFolderOptions).catch(() => setFolderOptions([]));
  }, []);

  // 主题色实时作用于设置页自身
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', settings.themeColor);
  }, [settings.themeColor]);

  // 颜色模式：system 时跟随系统变化
  useEffect(() => {
    applyColorMode(settings.colorMode);
    if (settings.colorMode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyColorMode('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [settings.colorMode]);

  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  const togglePreservedFolder = (path: string) => {
    setSettings((s) => {
      const current = new Set(s.preservedFolderPaths ?? []);
      if (current.has(path)) current.delete(path);
      else current.add(path);
      return { ...s, preservedFolderPaths: [...current].sort((a, b) => a.localeCompare(b, 'zh')) };
    });
  };

  /** 外观设置：变更后立即持久化，侧边栏通过 storage.onChanged 实时同源切换 */
  const updateAppearance = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      void saveSettings(next);
      return next;
    });

  const save = async () => {
    await saveSettings(settings);
    setStatus(d.statusSaved);
    setTimeout(() => setStatus(''), 2000);
  };

  const doImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const r = await importBundle(await file.text());
        setSettings(await loadSettings());
        setStatus(d.importOk(r.cacheEntries));
      } catch {
        setStatus(d.importFail);
      }
      setTimeout(() => setStatus(''), 4000);
    };
    input.click();
  };

  const test = async () => {
    setTesting(true);
    setStatus(d.statusTesting);
    try {
      await saveSettings(settings);
      await testConnection(settings);
      setStatus(d.statusConnOk);
    } catch (e) {
      setStatus(`${d.statusConnFail}: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  const resetCache = async () => {
    await clearCache();
    setStatus(d.statusCacheCleared);
  };

  const fetchModels = async () => {
    setFetchingModels(true);
    setStatus(d.fetchingModels);
    try {
      const models = await listModels(settings);
      setLiveModels(models);
      setStatus(d.fetchModelsOk(models.length));
    } catch (e) {
      setStatus(`${d.fetchModelsFail}: ${(e as Error).message}`);
    } finally {
      setFetchingModels(false);
    }
  };

  return (
    <div className={`page${isEmbed ? ' embed' : ''}`}>
      {isEmbed && (
        <div className="embed-back-bar">
          <button
            type="button"
            className="btn"
            onClick={() => {
              window.location.href = chrome.runtime.getURL('ai/sidepanel.html') + '?embed=1';
            }}
          >
            ← 返回 AI 分类
          </button>
          <span>模型、自定义提供商与分类提示词</span>
        </div>
      )}
      <div className="unified-settings-banner">
        <div>
          <strong>设置已统一</strong>
          <span>AI 辅助标签与 AI 金字塔分类请在主设置页一并管理。</span>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings/settings.html#ai') });
          }}
        >
          打开统一设置
        </button>
      </div>
      <header className="header topbar-like">
        <div className="header-left">
          <svg className="logo-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
            <path d="M12 12l8-4.5" />
            <path d="M12 12v9" />
            <path d="M12 12L4 7.5" />
          </svg>
          <div className="header-text">
            <h1>AI Bookmark OS</h1>
            <span className="sub">{d.optionsSub}</span>
          </div>
        </div>
      </header>
      <div className="body">
        <nav className="sidebar">
          <button className={`nav-item ${tab === 'api' ? 'active' : ''}`} onClick={() => setTab('api')}>
            {d.navApi}
          </button>
          <button
            className={`nav-item ${tab === 'appearance' ? 'active' : ''}`}
            onClick={() => setTab('appearance')}
          >
            {d.navAppearance}
          </button>
          <button
            className={`nav-item ${tab === 'donate' ? 'active' : ''}`}
            onClick={() => setTab('donate')}
          >
            {d.navDonate}
          </button>
        </nav>

        <main className="content">
          {tab === 'donate' ? (
            <DonateTab d={d} isZh={resolveLang(settings.language) === 'zh'} />
          ) : tab === 'api' ? (
            <>
              <h2>{d.apiTitle}</h2>
              <p className="desc">{d.apiDesc}</p>

              <div className="section-label">{d.sectionProvider}</div>
              <div className="card">
                <h3>{d.providerTitle}</h3>
                <p className="hint">{d.providerHint}</p>
                <div className="pills">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      className={`pill ${settings.provider === p.id ? 'active' : ''}`}
                      onClick={() =>
                        update({ provider: p.id, baseUrl: p.baseUrl, model: p.defaultModel })
                      }
                      onClickCapture={() => setLiveModels([])}
                    >
                      {p.label}{p.id === 'agnes' && <span className="pill-badge">{d.freeBadge}</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="section-label">{d.sectionConnection}</div>
              <div className="card">
                <h3>{d.apiKeyTitle}</h3>
                <p className="hint">{d.apiKeyHint}</p>
                <input
                  type="password"
                  value={settings.apiKey}
                  onChange={(e) => update({ apiKey: e.target.value.trim() })}
                  placeholder="sk-..."
                />
                <p className="key-links">
                  <a href={getProvider(settings.provider).keyUrl} target="_blank" rel="noreferrer">
                    {d.getApiKey}
                  </a>
                  {' · '}
                  <a href={getProvider(settings.provider).homeUrl} target="_blank" rel="noreferrer">
                    {d.visitHome}
                  </a>
                </p>
                <label className="field">{d.apiUrl}</label>
                <input
                  type="text"
                  value={settings.baseUrl}
                  onChange={(e) => update({ baseUrl: e.target.value.trim() })}
                />
                <label className="field">{d.model}</label>
                {(() => {
                  const models = liveModels.length
                    ? liveModels
                    : getProvider(settings.provider).models;
                  const isPreset = models.includes(settings.model);
                  return (
                    <>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <select
                          style={{ flex: 1 }}
                          value={isPreset ? settings.model : '__custom__'}
                          onChange={(e) =>
                            update({ model: e.target.value === '__custom__' ? '' : e.target.value })
                          }
                        >
                          {models.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                          <option value="__custom__">{d.customModel}</option>
                        </select>
                        <button
                          className="btn"
                          onClick={fetchModels}
                          disabled={fetchingModels || !settings.apiKey}
                          title={d.fetchModels}
                        >
                          {fetchingModels ? d.fetchingModels : d.fetchModels}
                        </button>
                      </div>
                      {!isPreset && (
                        <input
                          type="text"
                          style={{ marginTop: 8 }}
                          value={settings.model}
                          autoFocus
                          placeholder={d.customModelPlaceholder}
                          onChange={(e) => update({ model: e.target.value.trim() })}
                        />
                      )}
                    </>
                  );
                })()}
                <p className="hint" style={{ marginTop: 6 }}>{d.modelHint}</p>
              </div>

              <div className="section-label">连接稳定性</div>
              <div className="card">
                <h3>失败重连与超时</h3>
                <p className="hint">分类、测试连接等 AI 请求都会使用这里的设置。重连次数不包含首次请求。</p>
                <div className="row number-grid">
                  <div>
                    <label className="field">失败重连次数</label>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      step={1}
                      value={settings.aiRetryCount ?? DEFAULT_SETTINGS.aiRetryCount}
                      onChange={(e) =>
                        update({ aiRetryCount: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                      }
                    />
                    <p className="hint compact-hint">默认 5 次；设为 0 表示失败后不重连。</p>
                  </div>
                  <div>
                    <label className="field">请求超时（秒）</label>
                    <input
                      type="number"
                      min={5}
                      max={600}
                      step={5}
                      value={settings.aiRequestTimeoutSeconds ?? DEFAULT_SETTINGS.aiRequestTimeoutSeconds}
                      onChange={(e) =>
                        update({ aiRequestTimeoutSeconds: Math.max(5, Math.floor(Number(e.target.value) || 5)) })
                      }
                    />
                    <p className="hint compact-hint">默认 90 秒；较慢模型可适当调高。</p>
                  </div>
                </div>
              </div>

              {settings.provider === 'custom' && (
                <>
                  <div className="section-label">自定义提供商</div>
                  <div className="card">
                    <h3>API 协议</h3>
                    <p className="hint">兼容 OpenAI / Anthropic / Gemini 三种请求格式。填写完整 chat 接口地址。</p>
                    <div className="pills">
                      {([
                        ['openai', 'OpenAI 兼容'],
                        ['anthropic', 'Anthropic'],
                        ['gemini', 'Gemini'],
                      ] as const).map(([v, label]) => (
                        <button
                          key={v}
                          className={`pill ${(settings.customApiStyle || 'openai') === v ? 'active' : ''}`}
                          onClick={() => update({ customApiStyle: v as ApiStyle })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="field">接口地址 (Base URL)</label>
                    <input
                      type="text"
                      value={settings.baseUrl}
                      onChange={(e) => update({ baseUrl: e.target.value.trim() })}
                      placeholder="https://your-api.example.com/v1/chat/completions"
                    />
                    <label className="field">模型名</label>
                    <input
                      type="text"
                      value={settings.model}
                      onChange={(e) => update({ model: e.target.value.trim() })}
                      placeholder="your-model-id"
                    />
                  </div>
                </>
              )}

              <div className="section-label">分类规则控制</div>
              <div className="card">
                <h3>参考来源与系统规则</h3>
                <p className="hint">这些开关会影响 AI 请求实际携带的信息。需要完全按当前提示词重建时，可关闭不需要的参考项。</p>
                <div className="switch-list">
                  <label className="switch-row">
                    <span>
                      <strong>参照原有书签夹</strong>
                      <small>开启后把原书签夹作为优化参考；默认不会把整棵原树当最终标准。</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.respectExistingFolders !== false}
                      onChange={(e) => update({ respectExistingFolders: e.target.checked })}
                    />
                  </label>
                  <label className="switch-row">
                    <span>
                      <strong>沿用上一次 AI 分类树</strong>
                      <small>开启后重分类会参考上一次 AI 树；关闭后旧树不会影响新的分类树创建。</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.reusePreviousAiTree === true}
                      onChange={(e) => update({ reusePreviousAiTree: e.target.checked })}
                    />
                  </label>
                  <label className="switch-row">
                    <span>
                      <strong>启用内置分类规则增强</strong>
                      <small>开启后系统会追加公司聚合、语义分配等保护规则；关闭后主要按用户提示词执行。</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.useBuiltInClassificationRules !== false}
                      onChange={(e) => update({ useBuiltInClassificationRules: e.target.checked })}
                    />
                  </label>
                  <label className="switch-row">
                    <span>
                      <strong>使用分类缓存</strong>
                      <small>开启后同 URL 复用历史打标结果；关闭后会重新请求 AI，适合验证新提示词。</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.useClassificationCache !== false}
                      onChange={(e) => update({ useClassificationCache: e.target.checked })}
                    />
                  </label>
                  <label className="switch-row">
                    <span>
                      <strong>抓取页面描述增强</strong>
                      <small>开启后低信息标题会尝试读取页面标题/描述；关闭后仅使用书签标题与域名。</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.usePageMetadata !== false}
                      onChange={(e) => update({ usePageMetadata: e.target.checked })}
                    />
                  </label>
                </div>
                {settings.respectExistingFolders !== false && (
                  <div className="folder-preserve-panel">
                    <div className="folder-preserve-head">
                      <div>
                        <strong>保持原样的书签夹</strong>
                        <small>被选中的原书签夹不会参与 AI 优化，分类结果会直接按原路径展示。</small>
                      </div>
                      {(settings.preservedFolderPaths?.length ?? 0) > 0 && (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => update({ preservedFolderPaths: [] })}
                        >
                          清空选择
                        </button>
                      )}
                    </div>
                    <div className="folder-preserve-list">
                      {folderOptions.length ? folderOptions.map((folder) => (
                        <label key={folder.path} className="folder-preserve-item">
                          <input
                            type="checkbox"
                            checked={(settings.preservedFolderPaths ?? []).includes(folder.path)}
                            onChange={() => togglePreservedFolder(folder.path)}
                          />
                          <span>{folder.path}</span>
                          <em>{folder.count}</em>
                        </label>
                      )) : (
                        <div className="folder-preserve-empty">未读取到可选择的书签夹</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="section-label">分类提示词</div>
              <div className="card">
                <h3>自定义分类提示词</h3>
                <p className="hint">系统已提供默认提示词。可按阶段替换，留空保存时会回退默认。</p>
                <label className="field">① 打标提示词</label>
                <textarea
                  className="prompt-editor"
                  rows={5}
                  value={settings.classifyPrompts?.label ?? DEFAULT_CLASSIFY_PROMPTS.label}
                  onChange={(e) =>
                    update({
                      classifyPrompts: {
                        ...(settings.classifyPrompts ?? DEFAULT_CLASSIFY_PROMPTS),
                        label: e.target.value,
                      },
                    })
                  }
                />
                <label className="field">② 构建分类树提示词</label>
                <textarea
                  className="prompt-editor"
                  rows={5}
                  value={settings.classifyPrompts?.buildTree ?? DEFAULT_CLASSIFY_PROMPTS.buildTree}
                  onChange={(e) =>
                    update({
                      classifyPrompts: {
                        ...(settings.classifyPrompts ?? DEFAULT_CLASSIFY_PROMPTS),
                        buildTree: e.target.value,
                      },
                    })
                  }
                />
                <label className="field">③ 分配分类提示词</label>
                <textarea
                  className="prompt-editor"
                  rows={4}
                  value={settings.classifyPrompts?.assign ?? DEFAULT_CLASSIFY_PROMPTS.assign}
                  onChange={(e) =>
                    update({
                      classifyPrompts: {
                        ...(settings.classifyPrompts ?? DEFAULT_CLASSIFY_PROMPTS),
                        assign: e.target.value,
                      },
                    })
                  }
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    className="btn"
                    onClick={() => update({ classifyPrompts: { ...DEFAULT_CLASSIFY_PROMPTS } })}
                  >
                    恢复默认提示词
                  </button>
                </div>
              </div>


              <div className="section-label">{d.sectionData}</div>
              <div className="card">
                <h3>{d.cacheTitle}</h3>
                <p className="hint">{d.cacheHint}</p>
                <button className="btn" onClick={resetCache}>{d.clearCache}</button>
              </div>

              <div className="card">
                <h3>{d.transferTitle}</h3>
                <p className="hint">{d.transferHint}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={() => downloadExport()}>{d.exportData}</button>
                  <button className="btn" onClick={doImport}>{d.importData}</button>
                </div>
              </div>

              <div className="actions">
                <button className="btn btn-primary" onClick={save}>{d.save}</button>
                <button className="btn" onClick={test} disabled={testing || !settings.apiKey}>
                  {d.testConn}
                </button>
              </div>
              <div className="status">{status}</div>
            </>
          ) : (
            <>
              <h2>{d.appearanceTitle}</h2>
              <p className="desc">{d.appearanceDesc}</p>

              <div className="section-label">{d.sectionLanguage}</div>
              <div className="card">
                <h3>{d.languageTitle}</h3>
                <p className="hint">{d.languageHint}</p>
                <select
                  value={settings.language}
                  onChange={(e) =>
                    updateAppearance({ language: e.target.value as Settings['language'] })
                  }
                >
                  <option value="auto">{d.langAuto}</option>
                  {LANGUAGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="section-label">{d.sectionColorMode}</div>
              <div className="card">
                <h3>{d.colorModeTitle}</h3>
                <div className="pills">
                  {(
                    [
                      ['system', d.modeSystem],
                      ['light', d.modeLight],
                      ['dark', d.modeDark],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      className={`pill ${settings.colorMode === v ? 'active' : ''}`}
                      onClick={() => updateAppearance({ colorMode: v })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="section-label">{d.sectionText}</div>
              <div className="card">
                <h3>{d.fontTitle}</h3>
                <p className="hint">{d.fontHint}</p>
                <select
                  value={settings.fontFamily}
                  onChange={(e) => updateAppearance({ fontFamily: e.target.value })}
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>

                <label className="field">{d.fontSize(settings.fontSize)}</label>
                <div className="row">
                  <input
                    type="range"
                    min={12}
                    max={20}
                    step={1}
                    value={settings.fontSize}
                    onChange={(e) => updateAppearance({ fontSize: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="section-label">{d.sectionColor}</div>
              <div className="card">
                <h3>{d.themeTitle}</h3>
                <p className="hint">{d.themeHint}</p>
                <div className="swatches">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`swatch ${settings.themeColor === c ? 'selected' : ''}`}
                      style={{ background: c }}
                      title={c}
                      onClick={() => updateAppearance({ themeColor: c })}
                    />
                  ))}
                  <input
                    type="color"
                    value={settings.themeColor}
                    onChange={(e) => updateAppearance({ themeColor: e.target.value })}
                    title={d.customColor}
                  />
                </div>
              </div>

              <div className="section-label">{d.sectionPreview}</div>
              <div
                className="preview"
                style={{ fontFamily: fontCss(settings.fontFamily), fontSize: settings.fontSize }}
              >
                <div className="pv-folder">📂 前端开发 <span className="pv-accent">12</span></div>
                <div className="pv-item">🔖 MDN Web Docs — Web 开发权威文档</div>
                <div className="pv-item pv-accent">🔖 React 官方文档（悬停高亮效果）</div>
              </div>

              <div className="actions">
                <button className="btn btn-primary" onClick={save}>{d.save}</button>
              </div>
              <div className="status">{status}</div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
