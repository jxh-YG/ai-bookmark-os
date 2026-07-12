from pathlib import Path
import re

# ---------- popup.html: add embedded AI workspace ----------
html_path = Path("src/timeline/pages/popup/popup.html")
html = html_path.read_text(encoding="utf-8")
if 'id="aiWorkspace"' not in html:
    inject = """
  <!-- ?? AI ???????????????????? -->
  <div id="aiWorkspace" class="ai-workspace" hidden>
    <div class="ai-workspace__bar">
      <button type="button" id="aiWorkspaceBack" class="ai-workspace__back" title="?????">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        <span>???</span>
      </button>
      <div class="ai-workspace__title">
        <strong>AI ?????</strong>
        <span>????????</span>
      </div>
      <div class="ai-workspace__actions">
        <button type="button" id="aiWorkspaceSettings" class="ai-workspace__btn">??????</button>
      </div>
    </div>
    <iframe id="aiWorkspaceFrame" class="ai-workspace__frame" title="AI ??" allow="clipboard-read; clipboard-write"></iframe>
  </div>

"""
    html = html.replace("  <script src=\"../../shared/i18n.js\"></script>", inject + "  <script src=\"../../shared/i18n.js\"></script>")
    html_path.write_text(html, encoding="utf-8")
    print("popup.html workspace injected")
else:
    print("popup.html already has workspace")

# ---------- popup.css: workspace + unified accent ----------
css_path = Path("src/timeline/pages/popup/popup.css")
css = css_path.read_text(encoding="utf-8")
# unify accent toward apple blue if still google blue
css = css.replace("--accent: #1a73e8;", "--accent: #0A84FF;")
css = css.replace("--accent-hover: #1765cc;", "--accent-hover: #0077ED;")
css = css.replace("--accent-light: #e8f0fe;", "--accent-light: rgba(10,132,255,0.12);")
block = """

/* ===== Embedded AI workspace (unified product shell) ===== */
body.ai-mode {
  width: 420px;
  min-width: 420px;
  height: 640px;
  max-height: 640px;
  overflow: hidden;
}
.ai-workspace {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  background: #F2F2F7;
  color: #1C1C1E;
}
.ai-workspace[hidden] { display: none !important; }
.ai-workspace__bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(60,60,67,.12);
  background: rgba(255,255,255,.82);
  backdrop-filter: saturate(180%) blur(16px);
  -webkit-backdrop-filter: saturate(180%) blur(16px);
}
.ai-workspace__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: rgba(120,120,128,.12);
  color: #0A84FF;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.ai-workspace__back:hover { background: rgba(10,132,255,.12); }
.ai-workspace__title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.ai-workspace__title strong {
  font-size: 13px;
  font-weight: 700;
  color: #1C1C1E;
}
.ai-workspace__title span {
  font-size: 11px;
  color: #8E8E93;
}
.ai-workspace__btn {
  border: none;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 650;
  color: #fff;
  background: #0A84FF;
  cursor: pointer;
}
.ai-workspace__btn:hover { filter: brightness(0.96); }
.ai-workspace__frame {
  flex: 1;
  width: 100%;
  border: 0;
  background: #F2F2F7;
}
.ai-entry-banner {
  border-color: rgba(10,132,255,.22) !important;
}
"""
if "Embedded AI workspace" not in css:
    css = css.rstrip() + block + "\n"
    css_path.write_text(css, encoding="utf-8")
    print("popup.css workspace styles added")
else:
    css_path.write_text(css, encoding="utf-8")
    print("popup.css accent updated")

# ---------- popup.js: open in-place ----------
js_path = Path("src/timeline/pages/popup/popup.js")
js = js_path.read_text(encoding="utf-8")
new_open = r'''async function openAiClassifyPanel() {
  const ws = document.getElementById('aiWorkspace');
  const frame = document.getElementById('aiWorkspaceFrame');
  if (ws && frame) {
    const target = chrome.runtime.getURL('ai/sidepanel.html');
    if (frame.getAttribute('src') !== target) {
      frame.setAttribute('src', target);
    }
    ws.hidden = false;
    document.body.classList.add('ai-mode');
    return;
  }
  // fallback: side panel, then same-extension page without raw chrome-error UX
  try {
    if (chrome.sidePanel && chrome.sidePanel.setOptions) {
      await chrome.sidePanel.setOptions({ path: 'ai/sidepanel.html', enabled: true });
    }
    const win = await chrome.windows.getCurrent();
    if (chrome.sidePanel && chrome.sidePanel.open && win && win.id != null) {
      await chrome.sidePanel.open({ windowId: win.id });
      return;
    }
  } catch (err) {
    console.warn('sidePanel open failed', err);
  }
  chrome.tabs.create({ url: chrome.runtime.getURL('ai/sidepanel.html') });
}

function closeAiWorkspace() {
  const ws = document.getElementById('aiWorkspace');
  if (ws) ws.hidden = true;
  document.body.classList.remove('ai-mode');
}

function openAiSettingsPage() {
  const ws = document.getElementById('aiWorkspace');
  const frame = document.getElementById('aiWorkspaceFrame');
  const target = chrome.runtime.getURL('pages/settings/settings.html#ai');
  if (ws && frame) {
    frame.setAttribute('src', target);
    ws.hidden = false;
    document.body.classList.add('ai-mode');
    return;
  }
  chrome.runtime.openOptionsPage?.() || chrome.tabs.create({ url: target });
}
'''
# replace old functions
js2, n1 = re.subn(
    r"async function openAiClassifyPanel\(\) \{[\s\S]*?\n\}\n\nfunction openAiSettingsPage\(\) \{[\s\S]*?\n\}",
    new_open.strip(),
    js,
    count=1,
)
if n1 == 0:
    # try looser
    js2, n1 = re.subn(
        r"async function openAiClassifyPanel\(\) \{[\s\S]*?chrome\.tabs\.create\(\{ url: chrome\.runtime\.getURL\('ai/sidepanel\.html'\) \}\);\n\}",
        new_open.split("function closeAiWorkspace")[0].strip(),
        js,
        count=1,
    )
    print("partial open replace", n1)
    if "function openAiSettingsPage" in js2:
        js2 = re.sub(
            r"function openAiSettingsPage\(\) \{[\s\S]*?\n\}",
            "function openAiSettingsPage() {\n  const ws = document.getElementById('aiWorkspace');\n  const frame = document.getElementById('aiWorkspaceFrame');\n  const target = chrome.runtime.getURL('pages/settings/settings.html#ai');\n  if (ws && frame) {\n    frame.setAttribute('src', target);\n    ws.hidden = false;\n    document.body.classList.add('ai-mode');\n    return;\n  }\n  chrome.tabs.create({ url: target });\n}",
            js2,
            count=1,
        )
else:
    print("open+settings replaced", n1)

# wire back button near existing listeners
if "aiWorkspaceBack" not in js2:
    hook = """
const aiWorkspaceBack = $('aiWorkspaceBack');
const aiWorkspaceSettings = $('aiWorkspaceSettings');
if (aiWorkspaceBack) aiWorkspaceBack.addEventListener('click', closeAiWorkspace);
if (aiWorkspaceSettings) aiWorkspaceSettings.addEventListener('click', openAiSettingsPage);
"""
    # insert after menuAiSettingsBtn wiring if present
    marker = "if (menuAiSettingsBtn) menuAiSettingsBtn.addEventListener"
    idx = js2.find(marker)
    if idx >= 0:
        # find end of that if block
        end = js2.find("\n", js2.find("\n", idx + 1) + 1)
        # better: after the next few lines of menu handlers
        pos = js2.find("if (menuAiSettingsBtn)")
        # find closing of that handler
        m = re.search(r"if \(menuAiSettingsBtn\)[^\n]*\n(?:.*\n){0,6}", js2)
        if m:
            insert_at = m.end()
            js2 = js2[:insert_at] + hook + js2[insert_at:]
            print("back hook inserted")
        else:
            js2 += "\n" + hook
            print("back hook appended")
    else:
        js2 += "\n" + hook
        print("back hook appended end")

js_path.write_text(js2, encoding="utf-8")
print("popup.js updated")
