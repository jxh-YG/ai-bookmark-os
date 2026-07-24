import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const aiSource = readFileSync('src/timeline/shared/ai-tagger.js', 'utf8');
const aiStart = aiSource.indexOf('const API_FORMATS =');
const aiEnd = aiSource.indexOf('// ===== 并发控制', aiStart);
assert.ok(aiStart >= 0 && aiEnd > aiStart, 'AI provider resolver should be present');

const aiContext = { String, encodeURIComponent };
vm.createContext(aiContext);
vm.runInContext(`${aiSource.slice(aiStart, aiEnd)}; this.helpers = { API_FORMATS, resolveProvider };`, aiContext);
const { API_FORMATS, resolveProvider } = aiContext.helpers;

const anthropic = resolveProvider({
  provider: 'custom', customFormat: 'anthropic', customEndpoint: 'https://api.anthropic.com/v1', model: 'claude-test',
});
assert.equal(anthropic.endpoint, 'https://api.anthropic.com/v1/messages');
assert.deepEqual({ ...anthropic.buildHeaders('key') }, {
  'x-api-key': 'key',
  'anthropic-version': '2023-06-01',
});
assert.deepEqual(JSON.parse(JSON.stringify(anthropic.buildBody('hello', 'claude-test'))), {
  model: 'claude-test', max_tokens: 1024, messages: [{ role: 'user', content: 'hello' }],
});
assert.equal(anthropic.parseResponse({ content: [{ text: 'OK' }] }), 'OK');

const gemini = resolveProvider({
  provider: 'custom', customFormat: 'gemini', customEndpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash',
});
assert.equal(gemini.endpoint, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent');
assert.deepEqual(JSON.parse(JSON.stringify(gemini.buildBody('hello'))), {
  contents: [{ parts: [{ text: 'hello' }] }],
});
assert.equal(gemini.parseResponse({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }), 'OK');

const fullGemini = resolveProvider({
  provider: 'custom', customFormat: 'gemini', customFullUrl: true,
  customEndpoint: 'https://api.example.test/v1/models/custom:generateContent?key=ignored', model: 'custom',
});
assert.equal(fullGemini.endpoint, 'https://api.example.test/v1/models/custom:generateContent?key=ignored');
assert.equal(resolveProvider({
  provider: 'custom', customFormat: 'openai', customEndpoint: 'https://api.example.test/v1', model: 'model',
}).endpoint, 'https://api.example.test/v1/chat/completions');
assert.equal(API_FORMATS.openai.parseResponse({ choices: [{ message: { content: 'OK' } }] }), 'OK');

const settingsSource = readFileSync('src/timeline/pages/settings/settings.js', 'utf8');
const treeStart = settingsSource.indexOf('const TREE_PROVIDERS =');
const treeEnd = settingsSource.indexOf('function toggleTreeCustomFields()', treeStart);
const treeRequestStart = settingsSource.indexOf('function buildTreeChatRequest(', treeEnd);
const treeRequestEnd = settingsSource.indexOf('function treeTestRetryDelayMs(', treeRequestStart);
assert.ok(treeStart >= 0 && treeEnd > treeStart && treeRequestStart > treeEnd && treeRequestEnd > treeRequestStart, 'tree request helpers should be present');

const treeContext = {
  String,
  Number,
  Math,
  JSON,
  encodeURIComponent,
  document: { getElementById: () => null },
};
vm.createContext(treeContext);
vm.runInContext(settingsSource.slice(treeStart, treeEnd), treeContext);
vm.runInContext(`${settingsSource.slice(treeRequestStart, treeRequestEnd)}; this.helpers = { resolveTreeRequestUrl, buildTreeChatRequest, parseTreeTestResponse };`, treeContext);
const { resolveTreeRequestUrl, buildTreeChatRequest, parseTreeTestResponse } = treeContext.helpers;

function customTreeSettings(customApiStyle, baseUrl, customFullUrl = false) {
  return {
    provider: 'custom', customApiStyle, baseUrl, customFullUrl,
    apiKey: 'test-key', model: customApiStyle === 'gemini' ? 'gemini-2.0-flash' : 'test-model',
  };
}

const treeOpenAI = buildTreeChatRequest(customTreeSettings('openai', 'https://api.example.test/v1'), 'reply OK');
assert.equal(treeOpenAI.url, 'https://api.example.test/v1/chat/completions');
assert.deepEqual(JSON.parse(JSON.stringify(treeOpenAI.headers)), {
  'content-type': 'application/json', Authorization: 'Bearer test-key',
});
assert.deepEqual(JSON.parse(JSON.stringify(treeOpenAI.body)), {
  model: 'test-model', max_tokens: 32, messages: [{ role: 'user', content: 'reply OK' }],
});

const treeAnthropic = buildTreeChatRequest(customTreeSettings('anthropic', 'https://api.anthropic.com/v1'), 'reply OK');
assert.equal(treeAnthropic.url, 'https://api.anthropic.com/v1/messages');
assert.deepEqual(JSON.parse(JSON.stringify(treeAnthropic.headers)), {
  'content-type': 'application/json', 'x-api-key': 'test-key', 'anthropic-version': '2023-06-01',
});
assert.deepEqual(JSON.parse(JSON.stringify(treeAnthropic.body)), {
  model: 'test-model', max_tokens: 32, messages: [{ role: 'user', content: 'reply OK' }],
});

const treeGemini = buildTreeChatRequest(customTreeSettings('gemini', 'https://generativelanguage.googleapis.com/v1beta'), 'reply OK');
assert.equal(treeGemini.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent');
assert.deepEqual(JSON.parse(JSON.stringify(treeGemini.headers)), {
  'content-type': 'application/json', 'x-goog-api-key': 'test-key',
});
assert.deepEqual(JSON.parse(JSON.stringify(treeGemini.body)), {
  contents: [{ role: 'user', parts: [{ text: 'reply OK' }] }], generationConfig: { maxOutputTokens: 32 },
});

assert.equal(resolveTreeRequestUrl(customTreeSettings('openai', 'https://api.example.test/v1/chat/completions?version=1', true)), 'https://api.example.test/v1/chat/completions?version=1');
assert.equal(resolveTreeRequestUrl(customTreeSettings('anthropic', 'https://api.example.test/v1/messages', true)), 'https://api.example.test/v1/messages');
assert.equal(resolveTreeRequestUrl(customTreeSettings('gemini', 'https://api.example.test/v1/models/custom:generateContent', true)), 'https://api.example.test/v1/models/custom:generateContent');

assert.deepEqual(JSON.parse(JSON.stringify(parseTreeTestResponse('openai', JSON.stringify({ choices: [{ message: { content: 'OK' } }] })))), { ok: true, sample: 'OK' });
assert.deepEqual(JSON.parse(JSON.stringify(parseTreeTestResponse('anthropic', JSON.stringify({ content: [{ text: 'OK' }] })))), { ok: true, sample: 'OK' });
assert.deepEqual(JSON.parse(JSON.stringify(parseTreeTestResponse('gemini', JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] })))), { ok: true, sample: 'OK' });
assert.equal(parseTreeTestResponse('openai', JSON.stringify({ error: { message: 'bad key' } })).ok, false);
assert.equal(parseTreeTestResponse('openai', 'not json').ok, false);

console.log('AI connection protocol tests passed');
