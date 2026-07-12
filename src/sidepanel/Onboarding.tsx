// 首次使用引导：侧边栏内联完成供应商选择 + API Key 配置 + 试分类
import { useState } from 'react';
import { PROVIDERS, getProvider, type Settings } from '../types';
import { saveSettings } from '../core/settings';
import type { Dict } from '../core/i18n';

interface OnboardingProps {
  d: Dict;
  settings: Settings;
  bookmarkCount: number;
  /** limit 为 undefined 表示全量 */
  onStart: (limit?: number) => void;
  /** 跳过引导，直接进入主界面 */
  onSkip: () => void;
}

export function Onboarding({ d, settings, bookmarkCount, onStart, onSkip }: OnboardingProps) {
  const [providerId, setProviderId] = useState(settings.provider);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [saving, setSaving] = useState(false);
  const provider = getProvider(providerId);

  const start = async (limit?: number) => {
    if (!apiKey.trim()) return;
    setSaving(true);
    await saveSettings({
      ...settings,
      provider: provider.id,
      apiKey: apiKey.trim(),
      baseUrl: provider.id === 'custom' ? (settings.baseUrl || provider.baseUrl) : provider.baseUrl,
      model: provider.id === 'custom' ? (settings.model || provider.defaultModel) : provider.defaultModel,
      customApiStyle: provider.id === 'custom' ? (settings.customApiStyle || 'openai') : settings.customApiStyle,
    });
    setSaving(false);
    onStart(limit);
  };

  return (
    <div className="onboarding">
      <header className="topbar">
        <div className="topbar-left">
          <svg className="logo-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
            <path d="M12 12l8-4.5" />
            <path d="M12 12v9" />
            <path d="M12 12L4 7.5" />
          </svg>
          <span className="app-name">AI Bookmark OS</span>
        </div>
      </header>

      <div className="onboarding-body">
        <div className="ob-hero">
          <div className="ob-logo" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
              <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
            </svg>
          </div>
          <h2>{d.obTitle}</h2>
          <p>{d.obDesc(bookmarkCount)}</p>
        </div>

        <div className="ob-step">
          <div className="ob-step-label">{d.obStep1}</div>
          <div className="ob-pills">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`pill ${providerId === p.id ? 'active' : ''}`}
                onClick={() => setProviderId(p.id)}
              >
                {p.label}
                {p.id === 'agnes' && <span className="pill-badge">{d.freeBadge}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="ob-step">
          <div className="ob-step-label">{d.obStep2}</div>
          <input
            className="ob-key-input"
            type="password"
            placeholder={d.obKeyPlaceholder}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <a className="ob-key-link" href={provider.keyUrl} target="_blank" rel="noreferrer">
            {d.getApiKey}
          </a>
        </div>

        <div className="ob-step">
          <div className="ob-step-label">{d.obStep3}</div>
          <div className="ob-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!apiKey.trim() || saving}
              onClick={() => start(20)}
            >
              {d.obTryFirst20}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!apiKey.trim() || saving}
              onClick={() => start()}
            >
              {d.obClassifyAll}
            </button>
          </div>
          <p className="ob-hint">{d.obTryHint}</p>
        </div>

        <button type="button" className="ob-skip" onClick={onSkip}>
          {d.obSkip}
        </button>
      </div>
    </div>
  );
}
