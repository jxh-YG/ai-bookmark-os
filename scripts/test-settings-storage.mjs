import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

function storageArea(state, shouldFailSet = () => false) {
  return {
    async get(keys) {
      const requested = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requested.filter((key) => key in state).map((key) => [key, structuredClone(state[key])]));
    },
    async set(patch) {
      if (shouldFailSet()) throw new Error('simulated sync quota failure');
      Object.assign(state, structuredClone(patch));
    },
  };
}

const localState = {};
const syncState = {};
let failSyncSet = false;
globalThis.chrome = {
  storage: {
    local: storageArea(localState),
    sync: storageArea(syncState, () => failSyncSet),
  },
};

const { DEFAULT_SETTINGS } = await importTypeScript('src/types.ts');
const { loadSettings, saveSettings } = await importTypeScript('src/core/settings.ts');
const localSettings = {
  ...DEFAULT_SETTINGS,
  apiKey: 'local-secret',
  baseUrl: 'https://internal.example.test/v1',
  classifyPrompts: { label: 'private label prompt', buildTree: 'private tree prompt', assign: 'private assign prompt' },
  preservedFolderIds: ['folder-secret-id'],
  preservedFolderPaths: ['Clients/Confidential'],
};

await saveSettings(localSettings);
assert.equal(localState.settings.apiKey, 'local-secret');
assert.equal(localState.settings.baseUrl, 'https://internal.example.test/v1');
assert.equal(localState.settings.classifyPrompts.label, 'private label prompt');
assert.deepEqual(localState.settings.preservedFolderIds, ['folder-secret-id']);
for (const key of ['apiKey', 'baseUrl', 'classifyPrompts', 'preservedFolderIds', 'preservedFolderPaths']) {
  assert.equal(Object.prototype.hasOwnProperty.call(syncState.settings, key), false, `${key} must remain local-only`);
}

syncState.settings = {
  ...syncState.settings,
  apiKey: 'legacy-secret',
  baseUrl: 'https://legacy.internal.test',
  classifyPrompts: { label: 'legacy private prompt' },
  preservedFolderIds: ['legacy-folder'],
  preservedFolderPaths: ['Legacy/Private'],
};
const loaded = await loadSettings();
assert.equal(loaded.apiKey, 'local-secret');
assert.equal(loaded.classifyPrompts.label, 'private label prompt');
for (const key of ['apiKey', 'baseUrl', 'classifyPrompts', 'preservedFolderIds', 'preservedFolderPaths']) {
  assert.equal(Object.prototype.hasOwnProperty.call(syncState.settings, key), false, `legacy ${key} should be removed after local persistence`);
}

syncState.settings = { ...syncState.settings, classifyPrompts: { label: 'legacy retry value' } };
failSyncSet = true;
await loadSettings();
assert.equal(syncState.settings.classifyPrompts.label, 'legacy retry value');
assert.equal(localState.settingsMigrationDiagnostic.code, 'sync_cleanup_failed');
assert.match(localState.settingsMigrationDiagnostic.message, /quota failure/);

const legacyPageSource = readFileSync('src/timeline/pages/settings/settings.js', 'utf8');
assert.equal((legacyPageSource.match(/saveTreeSyncSettings\(/g) || []).length >= 3, true);
assert.doesNotMatch(legacyPageSource, /const \{ apiKey, \.\.\.safe \} = (next|settings)/);

console.log('settings storage boundary checks passed');
