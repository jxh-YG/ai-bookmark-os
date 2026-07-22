import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/timeline/content/content-extractor.js', 'utf8');
const marker = 'chrome.runtime.onMessage.addListener';
assert.ok(source.includes(marker), 'content extractor listener should exist');

const makeNode = (tagName, innerText) => ({ tagName, innerText, textContent: innerText });
const root = {
  nodes: [],
  querySelectorAll() {
    return this.nodes;
  },
};
const context = {
  Array,
  Date,
  JSON,
  Promise,
  Set,
  String,
  chrome: { runtime: { onMessage: { addListener() {} } } },
  document: {
    body: root,
    querySelector() { return root; },
    querySelectorAll() { return []; },
  },
  location: { href: 'https://example.test' },
  setTimeout,
};
vm.createContext(context);
vm.runInContext(source.replace(marker, 'globalThis.__contentExtractorHelpers = { extractLeadExcerpt };\n  ' + marker), context);

const { extractLeadExcerpt } = context.__contentExtractorHelpers;
root.nodes = [
  makeNode('H1', 'GGgrok 公益站'),
  makeNode('P', '一个不盈利的公益站，免费开放全系模型，让每个人都能平等使用。'),
  makeNode('H2', '一个接口，接入所有模型'),
  makeNode('P', '后续功能说明不应覆盖首屏导语。'),
];
assert.equal(
  extractLeadExcerpt(root),
  '一个不盈利的公益站，免费开放全系模型，让每个人都能平等使用。',
  '应提取首个主标题后的有效说明段',
);

root.nodes = [
  makeNode('P', '短句'),
  makeNode('P', '没有标题时仍应选择第一个长度足够的正文说明段。'),
];
assert.equal(extractLeadExcerpt(root), '没有标题时仍应选择第一个长度足够的正文说明段。');

console.log('content extractor tests passed');
