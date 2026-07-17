import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/bridge/probe-core.js', 'utf8');

function mockResponse(status, options = {}) {
  const contentType = options.contentType ?? 'text/html; charset=utf-8';
  return {
    status,
    ok: status >= 200 && status < 300,
    url: options.url || 'https://example.test/article',
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type' ? contentType : null;
      },
    },
    text: async () => options.body || '<title>Available</title>',
  };
}

function sequenceFetch(steps) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, ...options });
    assert.ok(steps.length, 'unexpected fetch call');
    const step = steps.shift();
    if (step instanceof Error) throw step;
    return typeof step === 'function' ? step(url, options) : step;
  };
  fetch.calls = calls;
  fetch.remaining = steps;
  return fetch;
}

function loadCore(fetch) {
  const context = vm.createContext({
    self: {},
    fetch,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(source, context, { filename: 'probe-core.js' });
  return context.self.AiProbeCore;
}

function assertCanonical(result) {
  assert.ok([
    'reachable',
    'confirmed_missing',
    'content_suspect',
    'access_limited',
    'transient_failure',
    'unsupported',
  ].includes(result.state));
  assert.equal(typeof result.reason, 'string');
  assert.ok(result.statusCode === null || Number.isInteger(result.statusCode));
  assert.equal(typeof result.finalUrl, 'string');
  assert.equal(typeof result.checkedAt, 'number');
  assert.ok(['anonymous', 'authenticated', 'rendered-tab'].includes(result.probeMode));
}

const fastOptions = { retries: 2, baseDelayMs: 0, maxDelayMs: 0 };

for (const headStatus of [405, 403, 501, 404]) {
  const fetch = sequenceFetch([
    mockResponse(headStatus),
    mockResponse(200, { body: '<title>Available</title><p>ok</p>' }),
  ]);
  const result = await loadCore(fetch).checkUrl('https://example.test/article', fastOptions);
  assertCanonical(result);
  assert.equal(result.state, 'reachable', `HEAD ${headStatus} must fall back to GET`);
  assert.deepEqual(fetch.calls.map((call) => call.method), ['HEAD', 'GET']);
  assert.ok(fetch.calls.every((call) => call.credentials === 'omit'));
}

{
  const headTimeout = new Error('head timed out');
  headTimeout.name = 'AbortError';
  const fetch = sequenceFetch([
    headTimeout,
    mockResponse(200, { body: '<title>Available</title>' }),
  ]);
  const result = await loadCore(fetch).checkUrl('https://example.test/article', fastOptions);
  assert.equal(result.state, 'reachable');
  assert.deepEqual(fetch.calls.map((call) => call.method), ['HEAD', 'GET']);
}

{
  const fetch = sequenceFetch([
    mockResponse(200, { contentType: 'application/pdf', url: 'https://cdn.test/file.pdf' }),
  ]);
  const result = await loadCore(fetch).checkUrl('https://cdn.test/file.pdf', fastOptions);
  assert.equal(result.state, 'reachable');
  assert.equal(result.reason, 'non-html-resource');
  assert.equal(result.finalUrl, 'https://cdn.test/file.pdf');
  assert.equal(fetch.calls.length, 1);
}

{
  const fetch = sequenceFetch([
    mockResponse(204, { contentType: '' }),
    mockResponse(200, { contentType: '', body: '' }),
  ]);
  const result = await loadCore(fetch).checkUrl('https://example.test/no-content-type', fastOptions);
  assert.equal(result.state, 'reachable');
  assert.deepEqual(fetch.calls.map((call) => call.method), ['HEAD', 'GET']);
}

{
  const fetch = sequenceFetch([
    mockResponse(404),
    mockResponse(404, { body: '<title>Page not found</title>' }),
  ]);
  const result = await loadCore(fetch).checkUrl('https://example.test/private', fastOptions);
  assert.equal(result.state, 'content_suspect');
  assert.equal(result.reason, 'anonymous-not-found');
  assert.equal(result.statusCode, 404);
  assert.equal(fetch.calls.length, 2, 'anonymous 404 must not be promoted or repeatedly confirmed');
}

{
  const fetch = sequenceFetch([
    mockResponse(410),
  ]);
  const result = await loadCore(fetch).checkUrl('https://example.test/private', {
    ...fastOptions,
    probeMode: 'authenticated',
  });
  assert.equal(result.state, 'content_suspect');
  assert.equal(result.reason, 'authenticated-not-found');
  assert.equal(result.probeMode, 'authenticated');
  assert.ok(fetch.calls.every((call) => call.credentials === 'include'));
  assert.deepEqual(fetch.calls.map((call) => call.method), ['GET']);
}

for (const status of [401, 403, 407, 451]) {
  const fetch = sequenceFetch([mockResponse(200), mockResponse(status)]);
  const result = await loadCore(fetch).checkUrl('https://example.test/restricted', fastOptions);
  assert.equal(result.state, 'access_limited');
  assert.equal(result.reason, 'access-restricted');
  assert.equal(result.statusCode, status);
}

for (const status of [408, 425, 429, 503]) {
  const fetch = sequenceFetch([
    mockResponse(200),
    mockResponse(status),
    mockResponse(status),
    mockResponse(200, { body: '<title>Recovered</title>' }),
  ]);
  const result = await loadCore(fetch).checkUrl('https://example.test/retry', fastOptions);
  assert.equal(result.state, 'reachable', `HTTP ${status} must retry`);
  assert.equal(fetch.calls.length, 4);
}

{
  const fetch = sequenceFetch([
    mockResponse(503),
    mockResponse(503),
    mockResponse(503),
    mockResponse(503),
  ]);
  const result = await loadCore(fetch).checkUrl('https://example.test/down', fastOptions);
  assert.equal(result.state, 'transient_failure');
  assert.equal(result.reason, 'server-error');
  assert.equal(result.statusCode, 503);
}

{
  const fetch = sequenceFetch([
    mockResponse(429),
    mockResponse(429),
    mockResponse(429),
    mockResponse(429),
  ]);
  const result = await loadCore(fetch).checkUrl('https://example.test/rate-limit', fastOptions);
  assert.equal(result.state, 'transient_failure');
  assert.equal(result.reason, 'rate-limited');
  assert.equal(result.statusCode, 429);
}

{
  const fetch = sequenceFetch([
    new TypeError('Failed to fetch'),
    new TypeError('DNS failure'),
    new TypeError('TLS failure'),
    new TypeError('connection reset'),
  ]);
  const result = await loadCore(fetch).checkUrl('https://example.test/network', fastOptions);
  assert.equal(result.state, 'transient_failure');
  assert.equal(result.reason, 'network-error');
  assert.equal(fetch.calls.length, 4);
}

for (const body of [
  '<title>Hi</title>',
  '<title>How to fix 404 Not Found</title><p>Page not found is a common response.</p>',
  '<title>Application</title><script>window.text = `page not found`;</script><div id=app></div>',
]) {
  const fetch = sequenceFetch([mockResponse(200), mockResponse(200, { body })]);
  const result = await loadCore(fetch).checkUrl('https://example.test/short', fastOptions);
  assert.equal(result.state, 'reachable', 'short pages and body-only matches must remain reachable');
}

{
  const fetch = sequenceFetch([
    mockResponse(200),
    mockResponse(200, { body: '<title>404 Not Found - Example</title>' }),
  ]);
  const result = await loadCore(fetch).checkUrl('https://example.test/missing', fastOptions);
  assert.equal(result.state, 'content_suspect');
  assert.equal(result.reason, 'title-missing');
}

{
  const fetch = sequenceFetch([
    mockResponse(200),
    mockResponse(200, { url: 'https://example.test/', body: '<title>Home</title>' }),
  ]);
  const result = await loadCore(fetch).checkUrl('https://example.test/deep/article', fastOptions);
  assert.equal(result.state, 'content_suspect');
  assert.equal(result.reason, 'redirect-home');
  assert.equal(result.finalUrl, 'https://example.test/');
}

{
  const fetch = sequenceFetch([
    mockResponse(200),
    mockResponse(200, { url: 'https://example.test/login?next=article', body: '<title>Sign in</title>' }),
  ]);
  const result = await loadCore(fetch).checkUrl('https://example.test/article', fastOptions);
  assert.equal(result.state, 'reachable');
  assert.equal(result.reason, 'login-redirect');
}

{
  const fetch = sequenceFetch([]);
  const core = loadCore(fetch);
  const invalid = await core.checkUrl('not a url');
  assert.equal(invalid.state, 'unsupported');
  assert.equal(invalid.reason, 'invalid-url');
  const unsupported = await core.checkUrl('file:///tmp/bookmark');
  assert.equal(unsupported.state, 'unsupported');
  assert.equal(unsupported.reason, 'unsupported-scheme');
  assert.equal(fetch.calls.length, 0);
}

{
  const controller = new AbortController();
  controller.abort();
  const fetch = sequenceFetch([]);
  const result = await loadCore(fetch).checkUrl('https://example.test/abort', {
    ...fastOptions,
    signal: controller.signal,
  });
  assert.equal(result.state, 'transient_failure');
  assert.equal(result.reason, 'aborted');
  assert.equal(fetch.calls.length, 0);
}

{
  const fetch = sequenceFetch([mockResponse(404), mockResponse(404)]);
  const legacy = await loadCore(fetch).probeUrl('https://example.test/private', fastOptions);
  assert.equal(legacy.kind, 'suspect');
  assert.match(legacy.detail, /anonymous-not-found/);
}

{
  const core = loadCore(sequenceFetch([]));
  assert.equal(core.isConfirmedMissingText('This page is no longer available'), true);
  assert.equal(core.isConfirmedMissingText('Please sign in to continue'), false);
  const patterns = core.getConfirmedMissingPatterns();
  assert.ok(patterns.length >= 1);
  assert.ok(patterns.every((pattern) => typeof pattern.source === 'string'));

  const authenticatedMissing = {
    state: 'content_suspect',
    reason: 'authenticated-not-found',
    statusCode: 404,
    finalUrl: 'https://example.test/private',
    checkedAt: Date.now(),
    probeMode: 'authenticated',
  };
  const confirmed = core.resolveSessionRecheck(authenticatedMissing, {
    url: 'https://example.test/private',
    missingSignal: true,
    challengeSignal: false,
  });
  assertCanonical(confirmed);
  assert.equal(confirmed.state, 'confirmed_missing');

  const challenged = core.resolveSessionRecheck(authenticatedMissing, {
    missingSignal: true,
    challengeSignal: true,
  });
  assert.equal(challenged.state, 'content_suspect');

  const inconclusive = core.resolveSessionRecheck(authenticatedMissing, {
    missingSignal: false,
    challengeSignal: false,
  });
  assert.equal(inconclusive.state, 'content_suspect');
  assert.equal(inconclusive.reason, 'session-render-inconclusive');

  const injectionFailed = core.resolveSessionRecheck(authenticatedMissing, null);
  assert.equal(injectionFailed.state, 'content_suspect');

  const anonymousMissing = { ...authenticatedMissing, reason: 'anonymous-not-found', probeMode: 'anonymous' };
  const anonymousRendered = core.resolveSessionRecheck(anonymousMissing, {
    missingSignal: true,
    challengeSignal: false,
  });
  assert.equal(anonymousRendered.state, 'content_suspect');
}

{
  const bridgeSource = readFileSync('src/bridge/ai-sw-bridge.js', 'utf8');
  let messageListener;
  let probeCalls = 0;
  const context = vm.createContext({
    self: {
      AiProbeCore: {
        checkUrl: async (url, options) => {
          if (options.signal?.aborted) {
            return {
              state: 'transient_failure', reason: 'aborted', statusCode: null,
              finalUrl: url, checkedAt: Date.now(), probeMode: options.probeMode,
            };
          }
          probeCalls += 1;
          return {
            state: 'reachable', reason: 'http-success', statusCode: 200,
            finalUrl: url, checkedAt: Date.now(), probeMode: options.probeMode,
          };
        },
        probeUrl: async () => ({ kind: 'ok', detail: '' }),
        fetchPageMeta: async () => null,
        fetchPageContext: async () => null,
        resolveSessionRecheck: (result) => result,
        getConfirmedMissingPatterns: () => [],
      },
    },
    AbortController,
    Date,
    RegExp,
    String,
    setTimeout: () => 0,
    clearTimeout: () => {},
    chrome: {
      sidePanel: { setPanelBehavior: () => Promise.resolve() },
      runtime: {
        onMessage: { addListener: (listener) => { messageListener = listener; } },
        onInstalled: { addListener: () => {} },
        getManifest: () => ({ version: '1.0.1' }),
      },
      commands: { onCommand: { addListener: () => {} } },
      storage: { local: { remove: () => Promise.resolve() } },
      action: { getBadgeText: () => Promise.resolve(''), setBadgeText: () => Promise.resolve() },
      tabs: { onUpdated: { addListener: () => {}, removeListener: () => {} } },
    },
  });
  vm.runInContext(bridgeSource, context, { filename: 'ai-sw-bridge.js' });
  const dispatch = (message) => new Promise((resolve) => messageListener(message, {}, resolve));

  await dispatch({ type: 'cancelLinkCheckRun', runId: 'cancelled-run' });
  const response = await dispatch({ type: 'checkUrl', url: 'https://example.test/queued', runId: 'cancelled-run' });
  assert.equal(response.result.reason, 'aborted');
  assert.equal(probeCalls, 0);
}

{
  const bridge = readFileSync('src/bridge/ai-sw-bridge.js', 'utf8');
  assert.match(bridge, /msg\.type\s*===\s*'checkUrl'/);
  assert.match(bridge, /checkUrl\(msg\.url,\s*\{/);
  assert.match(bridge, /sendResponse\(\{ success: true, result \}\)/);
  assert.match(bridge, /msg\.type\s*===\s*'probeUrl'[\s\S]{0,120}probeUrl\(msg\.url\)/);
  assert.match(bridge, /args:\s*\[confirmedMissingPatterns\]/);
  assert.doesNotMatch(bridge, /页面不存在|page not found/);
  assert.match(bridge, /waitForTabLoad\(tab\.id, 10_000, run\?\.controller\.signal\)/);
}

console.log('link checker core behavior checks passed');
