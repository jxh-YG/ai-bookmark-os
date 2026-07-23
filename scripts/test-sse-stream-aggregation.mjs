import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// 从 background.js 源码中抽取 aggregateSseText 函数体做隔离测试。
// 该函数是 SW 内部函数（不导出），背景脚本顶部依赖 self/importScripts 无法整体加载，
// 因此按函数边界提取后在受控上下文中求值。
const source = readFileSync('src/timeline/background/background.js', 'utf8');
const startMarker = 'function aggregateSseText(';
const start = source.indexOf(startMarker);
assert.ok(start >= 0, 'aggregateSseText 必须存在于 background.js');

// 从函数起点向后按大括号配平截取完整函数体
let depth = 0;
let end = -1;
let started = false;
for (let i = start; i < source.length; i++) {
  const ch = source[i];
  if (ch === '{') { depth++; started = true; }
  else if (ch === '}') { depth--; if (started && depth === 0) { end = i + 1; break; } }
}
assert.ok(end > start, '必须能截取到完整的 aggregateSseText 函数体');

const fnSource = source.slice(start, end);
const context = { JSON, String, Array, RegExp };
vm.createContext(context);
vm.runInContext(`${fnSource}; this.aggregateSseText = aggregateSseText;`, context);
const aggregateSseText = context.aggregateSseText;

// OpenAI 流式：choices[].delta.content
const openaiText = aggregateSseText(
  'data: {"choices":[{"delta":{"content":"Hel"}}]}\n' +
  'data: {"choices":[{"delta":{"content":"lo"}}]}\n' +
  'data: [DONE]\n',
);
assert.equal(openaiText, 'Hello', 'OpenAI 流式增量应聚合为完整文本');

// Anthropic 流式：content_block_delta.delta.text
const anthropicText = aggregateSseText(
  'event: content_block_delta\n' +
  'data: {"type":"content_block_delta","delta":{"text":"Hi"}}\n' +
  'data: {"type":"content_block_delta","delta":{"text":" there"}}\n',
);
assert.equal(anthropicText, 'Hi there', 'Anthropic 流式增量应聚合为完整文本');

// Gemini 流式：candidates[].content.parts[].text
const geminiText = aggregateSseText(
  'data: {"candidates":[{"content":{"parts":[{"text":"AB"}]}}]}\n' +
  'data: {"candidates":[{"content":{"parts":[{"text":"CD"}]}}]}\n',
);
assert.equal(geminiText, 'ABCD', 'Gemini 流式增量应聚合为完整文本');

// [DONE] 帧与空行不产生内容
assert.equal(aggregateSseText('data: [DONE]'), '', '[DONE] 帧不产生内容');
assert.equal(aggregateSseText(''), '', '空输入返回空字符串');

console.log('SSE aggregation tests passed');
