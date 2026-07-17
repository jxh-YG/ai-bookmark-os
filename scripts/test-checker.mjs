import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { build } from 'esbuild';

const coreSource = readFileSync('src/bridge/probe-core.js', 'utf8');

function response(status, contentType = 'text/html', body = '<title>Normal page</title>', url = 'https://example.test/page') {
  return {
    status,
    url,
    headers: { get: (name) => name.toLowerCase() === 'content-type' ? contentType : null },
    text: async () => body,
  };
}

function loadCore(fetchImpl) {
  const context = {
    self: {},
    fetch: fetchImpl,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    Math,
    Date,
    String,
    Number,
    RegExp,
    Error,
    Promise,
    Set,
  };
  vm.runInNewContext(coreSource, context, { filename: 'probe-core.js' });
  return context.self.AiProbeCore;
}

function queuedFetch(items, calls) {
  return async (url, options) => {
    calls.push({ url, options });
    const next = items.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error('unexpected fetch');
    return next;
  };
}

async function testHeadFallsBackToGet() {
  for (const status of [405, 403, 501, 404]) {
    const calls = [];
    const core = loadCore(queuedFetch([response(status), response(200)], calls));
    const result = await core.checkUrl('https://example.test/page', { retries: 0 });
    assert.equal(result.state, 'reachable', `HEAD ${status} must defer to GET`);
    assert.deepEqual(calls.map(({ options }) => options.method), ['HEAD', 'GET']);
  }

  const calls = [];
  const abort = Object.assign(new Error('head timeout'), { name: 'AbortError' });
  const core = loadCore(queuedFetch([abort, response(200)], calls));
  const result = await core.checkUrl('https://example.test/page', { retries: 0 });
  assert.equal(result.state, 'reachable');
  assert.deepEqual(calls.map(({ options }) => options.method), ['HEAD', 'GET']);
}

async function testAnonymousClassification() {
  const missingCalls = [];
  const missingCore = loadCore(queuedFetch([response(200), response(404)], missingCalls));
  const missing = await missingCore.checkUrl('https://private.test/article', { retries: 0 });
  assert.equal(missing.state, 'content_suspect');
  assert.equal(missing.reason, 'anonymous-not-found');
  assert.equal(missing.statusCode, 404);
  assert.equal(missingCalls[1].options.credentials, 'omit');

  const accessCore = loadCore(queuedFetch([response(200), response(403)], []));
  const access = await accessCore.checkUrl('https://example.test/private', { retries: 0 });
  assert.equal(access.state, 'access_limited');

  const binaryCalls = [];
  const binaryCore = loadCore(queuedFetch([response(200, 'application/pdf')], binaryCalls));
  const binary = await binaryCore.checkUrl('https://example.test/book.pdf', { retries: 0 });
  assert.equal(binary.state, 'reachable');
  assert.equal(binary.reason, 'non-html-resource');
  assert.equal(binaryCalls.length, 1);

  const redirectCore = loadCore(queuedFetch([
    response(200),
    response(200, 'text/html', '<title>Welcome</title>', 'https://example.test/'),
  ], []));
  const redirect = await redirectCore.checkUrl('https://example.test/article/42', { retries: 0 });
  assert.equal(redirect.state, 'content_suspect');
  assert.equal(redirect.reason, 'redirect-home');

  const titleCore = loadCore(queuedFetch([response(200), response(200, 'text/html', '<title>Page Not Found</title>')], []));
  assert.equal((await titleCore.checkUrl('https://example.test/soft', { retries: 0 })).reason, 'title-missing');

  const shortCore = loadCore(queuedFetch([response(200), response(200, 'text/html', '<title>Hi</title><p>x</p>')], []));
  assert.equal((await shortCore.checkUrl('https://example.test/short', { retries: 0 })).state, 'reachable');

  const spaCore = loadCore(queuedFetch([response(200), response(200, 'text/html', '<title>Application</title><div id="root"></div><script>boot()</script>')], []));
  assert.equal((await spaCore.checkUrl('https://example.test/app', { retries: 0 })).state, 'reachable');

  const scriptTitleCore = loadCore(queuedFetch([
    response(200),
    response(200, 'text/html', '<script>const template = "<title>Page Not Found</title>";</script><title>Article</title>'),
  ], []));
  assert.equal((await scriptTitleCore.checkUrl('https://example.test/script-title', { retries: 0 })).state, 'reachable');
}

async function testRetryAndSessionRecheck() {
  const retryCalls = [];
  const retryCore = loadCore(queuedFetch([response(200), response(429), response(200)], retryCalls));
  const retry = await retryCore.checkUrl('https://example.test/retry', { retries: 1, baseDelayMs: 0, maxDelayMs: 0 });
  assert.equal(retry.state, 'reachable');
  assert.equal(retryCalls.length, 3);

  const exhaustedCore = loadCore(queuedFetch([response(200), response(503), response(503)], []));
  const exhausted = await exhaustedCore.checkUrl('https://example.test/outage', { retries: 1, baseDelayMs: 0, maxDelayMs: 0 });
  assert.equal(exhausted.state, 'transient_failure');
  assert.equal(exhausted.reason, 'server-error');

  const sessionCalls = [];
  const sessionCore = loadCore(queuedFetch([response(200)], sessionCalls));
  const reachable = await sessionCore.checkUrl('https://example.test/session', { probeMode: 'authenticated', retries: 0 });
  assert.equal(reachable.state, 'reachable');
  assert.deepEqual(sessionCalls.map(({ options }) => options.method), ['GET']);
  assert.equal(sessionCalls[0].options.credentials, 'include');

  const sessionMissingCore = loadCore(queuedFetch([response(404)], []));
  const sessionMissing = await sessionMissingCore.checkUrl('https://example.test/session-missing', { probeMode: 'authenticated', retries: 0 });
  assert.equal(sessionMissing.reason, 'authenticated-not-found');
  assert.equal(sessionMissingCore.resolveSessionRecheck(sessionMissing, { url: sessionMissing.finalUrl, missingSignal: true, challengeSignal: false }).state, 'confirmed_missing');
  assert.equal(sessionMissingCore.resolveSessionRecheck(sessionMissing, { url: sessionMissing.finalUrl, missingSignal: false, challengeSignal: false }).state, 'content_suspect');
  assert.equal(sessionMissingCore.resolveSessionRecheck(sessionMissing, { url: sessionMissing.finalUrl, missingSignal: true, challengeSignal: true }).state, 'content_suspect');
}

async function importTypeScript(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    define: { chrome: 'globalThis.chrome' },
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

async function testHealthConcurrencyAndSettings() {
  const storage = {
    checkerTimeout: '10000',
    checkerRetries: '2',
    checkerBackoffBase: '0',
    checkerBackoffMax: '0',
  };
  let active = 0;
  let maxActive = 0;
  const activeByDomain = new Map();
  const maxByDomain = new Map();
  const messages = [];
  globalThis.chrome = {
    storage: {
      local: {
        get: async (keys) => Object.fromEntries(keys.map((key) => [key, storage[key]])),
        set: async (values) => Object.assign(storage, values),
        remove: async () => {},
      },
    },
    runtime: {
      sendMessage: async (message) => {
        messages.push(message);
        if (message.type === 'cancelLinkCheckRun') return { cancelled: true };
        const domain = new URL(message.url).hostname;
        active += 1;
        activeByDomain.set(domain, (activeByDomain.get(domain) || 0) + 1);
        maxActive = Math.max(maxActive, active);
        maxByDomain.set(domain, Math.max(maxByDomain.get(domain) || 0, activeByDomain.get(domain)));
        await new Promise((resolve) => setTimeout(resolve, 4));
        active -= 1;
        activeByDomain.set(domain, activeByDomain.get(domain) - 1);
        return { result: { state: 'reachable', reason: 'http-success', statusCode: 200, finalUrl: message.url, checkedAt: Date.now(), probeMode: 'anonymous' } };
      },
    },
    permissions: { contains: async () => true, request: async () => true },
    bookmarks: {},
  };
  const { findDeadLinks } = await importTypeScript('src/core/health.ts');
  const bookmarks = Array.from({ length: 12 }, (_, index) => ({
    id: String(index),
    title: String(index),
    url: `https://${index % 2 ? 'a.example.test' : 'b.example.test'}/p/${index}`,
    folderPath: '',
  }));
  const issues = await findDeadLinks(bookmarks, () => {}, new AbortController().signal);
  assert.equal(issues.length, 0);
  assert.ok(maxActive <= 5, `global concurrency was ${maxActive}`);
  assert.ok([...maxByDomain.values()].every((count) => count <= 2), 'per-domain concurrency exceeded 2');
  assert.ok(messages.filter((message) => message.type === 'checkUrl').every((message) => typeof message.options.timeoutMs === 'number'));
}

function testCheckerSurface() {
  const checker = readFileSync('src/timeline/pages/checker/checker.js', 'utf8');
  const background = readFileSync('src/timeline/background/background.js', 'utf8');
  assert.match(checker, /version: RESULT_VERSION/);
  assert.match(checker, /legacy-unverified/);
  assert.match(checker, /requestProbe\('recheckUrlWithSession'/);
  assert.match(checker, /\btype,\s*\n\s*url,/);
  assert.match(checker, /type: 'cancelLinkCheckRun'/);
  assert.match(checker, /manualConfirmCheckbox/);
  assert.match(checker, /ok: `<svg/);
  assert.match(checker, /selectReviewBtn/);
  assert.match(checker, /recheckSelectedItems/);
  assert.match(checker, /BATCH_RECHECK_CONCURRENCY = 2/);
  const adapter = background.slice(
    background.indexOf('async function checkUrlFromBackground'),
    background.indexOf('function checkerNumber'),
  );
  assert.match(adapter, /probeCore\.checkUrl/);
  assert.doesNotMatch(adapter, /fetch\(/);
  assert.doesNotMatch(background, /case 'checkUrl':/);
}

function testCheckerI18nCoverage() {
  const context = {
    chrome: { storage: { onChanged: { addListener() {} } } },
    document: { querySelectorAll: () => [] },
    navigator: { language: 'en' },
  };
  vm.runInNewContext(
    `${readFileSync('src/timeline/shared/i18n.js', 'utf8')}; globalThis.messages = I18N_MESSAGES;`,
    context,
    { filename: 'i18n.js' },
  );
  const checkerKeys = Object.keys(context.messages.en).filter((key) => key.startsWith('checker'));
  for (const [language, messages] of Object.entries(context.messages)) {
    const missing = checkerKeys.filter((key) => !(key in messages));
    assert.deepEqual(missing, [], `${language} is missing checker translations`);
  }
}

await testHeadFallsBackToGet();
await testAnonymousClassification();
await testRetryAndSessionRecheck();
await testHealthConcurrencyAndSettings();
testCheckerSurface();
testCheckerI18nCoverage();
console.log('checker behavior tests passed');
