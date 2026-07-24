import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/timeline/pages/settings/settings.js', 'utf8');
const start = source.indexOf('function getApiPermissionDetails(');
const end = source.indexOf('async function testAIConnection()', start);
assert.ok(start >= 0 && end > start, 'API permission helpers should be present');

const requests = [];
const context = {
  URL,
  String,
  chrome: {
    permissions: {
      request: async (request) => {
        requests.push(request);
        return true;
      },
    },
  },
};
vm.createContext(context);
vm.runInContext(`${source.slice(start, end)}; this.helpers = { getApiPermissionDetails, getAIConnectionPermissionEndpoint, ensureApiHostPermission };`, context);
const { getApiPermissionDetails, getAIConnectionPermissionEndpoint, ensureApiHostPermission } = context.helpers;

assert.deepEqual(JSON.parse(JSON.stringify(getApiPermissionDetails('https://api.example.test:8443/v1/chat/completions'))), {
  origin: 'https://api.example.test/*', host: 'api.example.test:8443',
});
assert.equal(getApiPermissionDetails('file:///tmp/key'), null);
assert.equal(getAIConnectionPermissionEndpoint({ provider: 'openai' }), 'https://api.openai.com/');
assert.equal(getAIConnectionPermissionEndpoint({ provider: 'custom', customEndpoint: 'https://api.example.test/v1' }), 'https://api.example.test/v1');
assert.equal((await ensureApiHostPermission('https://api.example.test/v1')).granted, true);
assert.deepEqual(JSON.parse(JSON.stringify(requests)), [{ origins: ['https://api.example.test/*'] }]);

context.chrome.permissions.request = async () => false;
const denied = await ensureApiHostPermission('http://localhost:3000/v1');
assert.equal(denied.granted, false);
assert.match(denied.error, /localhost:3000/);

console.log('AI API permission tests passed');
