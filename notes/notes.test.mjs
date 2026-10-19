// Tests for notes/lib.js (pure client logic). Run:  node notes/notes.test.mjs
import * as L from './lib.js';

let passes = 0, failures = 0;
const check = (name, ok, detail) => { if (ok) { passes++; console.log('  ok  ', name); } else { failures++; console.log('  FAIL', name, detail === undefined ? '' : JSON.stringify(detail).slice(0, 400)); } };
const toks = (lang, line, st = '') => L.tokenizeLine(lang, line, st);
const has = (r, cls, text) => r.t.some(([c, t]) => c === cls && t === text);
const joined = (r) => r.t.map(([, t]) => t).join('');

console.log('tokenizer: text is never lost or changed');
const samples = {
  javascript: ['const a = "x\\"y" + `t${1}` // hi', 'function f(x) { return x /* c */ + 1.5e3; }', '  if (a) { b() } else { 0xFF }'],
  python: ['def foo(a, b=2):  # c', '    return "s" + \'t\'', '@decorator', 'x = """open'],
  json: ['{"a": [1, 2.5, true, null], "b": "c"}', '  "k": "v",'],
  html: ['<div class="a" id=\'b\'>text &amp; more</div>', '<!-- c --> <br/>'],
  css: ['.a:hover > #b { color: #fff; margin: 0 -2px 1.5em }', '/* c */ @media (max-width: 10px) {'],
  shell: ['sudo apt install -y foo --bar "$HOME/x" # c', 'echo ${VAR:-x} | grep -i y'],
  sql: ["SELECT a, count(*) FROM t WHERE x = 'y' -- c", 'insert into t (a) values (1);'],
  yaml: ['key: value # c', '- name: "x"', '  list: [1, 2]'],
  markdown: ['# Title', '- [ ] todo **bold** `code` [l](http://x.y)', '> quote *it*'],
  diff: ['+added', '-removed', '@@ -1 +1 @@'],
  log: ['2026-01-01 10:00:00 ERROR failed "x" [main]'],
  c: ['#include <stdio.h>', 'int main(void) { return 0; } // c'],
  rust: ['fn main() { let mut x = 1; println!("{}", x); }'],
  go: ['func (s *S) Do(x int) error { return nil }'],
  php: ['<?php $a = "b"; echo $a; // c'],
  ruby: ['def hello(name) puts "hi #{name}" end # c'],
  plain: ['anything <b> goes'],
  typescript: ['interface A { x: string } const y: number = 1;'],
  java: ['@Override public static void main(String[] a) { }'],
  xml: ['<?xml version="1.0"?><a b="c">d</a>'],
};
for (const [lang, lines] of Object.entries(samples)) {
  let st = '', allOk = true;
  for (const l of lines) { const r = toks(lang, l, st); if (joined(r) !== l) allOk = false; st = r.s; }
  check(`${lang}: tokens re-join to the exact input`, allOk);
}
console.log('tokenizer: classes');
check('js keyword/string/comment/number', (() => { const r = toks('javascript', 'const a = "x" + 12 // hi'); return has(r, 'k', 'const') && has(r, 's', '"x"') && has(r, 'n', '12') && has(r, 'c', '// hi'); })());
check('js function call + type', (() => { const r = toks('javascript', 'new Foo(); bar(1)'); return has(r, 't', 'Foo') && has(r, 'f', 'bar'); })());
check('js escaped quote stays in the string', has(toks('javascript', 'x = "a\\"b" + 1'), 's', '"a\\"b"'));
check('js block comment spans lines', (() => { let r = toks('javascript', 'a /* open'); const s1 = r.s; r = toks('javascript', 'still comment', s1); const s2 = r.s; r = toks('javascript', 'end */ b', s2); return s1 === 'b:*/' && has(toks('javascript', 'still comment', s1), 'c', 'still comment') && s2 === 'b:*/' && has(r, 'c', 'end */') && r.s === ''; })());
check('js template literal spans lines', (() => { const a = toks('javascript', 'const t = `abc'); const b = toks('javascript', 'def`; x', a.s); return a.s === 's:`' && b.s === '' && has(b, 's', 'def`'); })());
check('python triple string spans lines + def name', (() => { const a = toks('python', 'x = """doc'); const b = toks('python', 'end""" + y', a.s); const d = toks('python', 'def foo(a):'); return a.s === 's:"""' && b.s === '' && has(d, 'k', 'def') && has(d, 'f', 'foo'); })());
check('json keys vs string values', (() => { const r = toks('json', '{"a": "b", "c": true, "d": null, "e": -1.5e2}'); return has(r, 'a', '"a"') && has(r, 's', '"b"') && has(r, 'n', 'true') && has(r, 'n', 'null') && has(r, 'n', '-1.5e2') === false || has(r, 'n', '1.5e2'); })());
check('html tag/attr/string', (() => { const r = toks('html', '<a href="x">t</a>'); return has(r, 't', '<a') && has(r, 'a', 'href') && has(r, 's', '"x"') && r.t.some(([c, t]) => c === 't' && t.startsWith('</a')); })());
check('html comment spans lines', (() => { const a = toks('html', '<!-- x'); const b = toks('html', 'y -->'); const c = toks('html', 'y -->', a.s); return a.s === 'cm' && b.s === '' && c.s === '' && has(c, 'c', 'y -->'); })());
check('html tag spanning lines keeps attribute state', (() => { const a = toks('html', '<div'); const b = toks('html', '  class="x"', a.s); const c = toks('html', '>', b.s); return a.s === 'tg' && has(b, 'a', 'class') && c.s === '' ; })());
check('css property / hex / selector', (() => { const a = toks('css', 'color: #fff;'); const b = toks('css', '.box:hover {'); return has(a, 'a', 'color') && has(a, 'n', '#fff') && has(b, 't', '.box'); })());
check('shell var + flag + comment', (() => { const r = toks('shell', 'ls -la $HOME # x'); return has(r, 't', '-la') && has(r, 'a', '$HOME') && has(r, 'c', '# x'); })());
check('shell # inside a word is not a comment', !toks('shell', 'echo a#b').t.some(([c]) => c === 'c'));
check('sql keywords are case-insensitive', has(toks('sql', 'Select * From t'), 'k', 'Select') && has(toks('sql', 'Select * From t'), 'k', 'From'));
check('yaml key', has(toks('yaml', 'name: x'), 'a', 'name') && has(toks('yaml', '  - id: 3'), 'a', 'id'));
check('markdown heading / checkbox / code fence state', (() => { const h = toks('markdown', '## T'); const c = toks('markdown', '- [x] done'); const f = toks('markdown', '```js'); const inside = toks('markdown', 'code', f.s); const end = toks('markdown', '```', f.s); return has(h, 'k', '## T') && has(c, 'i', '[x]') && f.s.startsWith('f:') && has(inside, 's', 'code') && end.s === ''; })());
check('diff lines', has(toks('diff', '+a'), 'i', '+a') && has(toks('diff', '-a'), 'd', '-a') && has(toks('diff', '@@ x'), 'k', '@@ x'));
check('log levels', (() => { const r = toks('log', '2026-01-01 10:00:00 ERROR boom'); return has(r, 'd', 'ERROR') && has(r, 'c', '2026-01-01 10:00:00'); })());
check('plain never colours', toks('plain', 'const x = 1').t.length === 1 && toks('plain', 'const x = 1').t[0][0] === '');
check('very long lines stay plain (smooth on phones)', toks('javascript', 'a'.repeat(5000)).t.length === 1 && toks('javascript', 'a'.repeat(5000)).t[0][0] === '');
check('empty line keeps the multi-line state', toks('javascript', '', 'b:*/').s === 'b:*/' && toks('javascript', '').s === '');
check('lineHtml escapes everything', L.lineHtml(toks('html', '<script>alert("x")</script>').t).includes('&lt;script') && !L.lineHtml(toks('html', '<img onerror=x>').t).includes('<img'));
check('tokenizing 3000 lines is fast', (() => { const t0 = Date.now(); let st = ''; for (let i = 0; i < 3000; i++) st = toks('javascript', `const value${i} = compute("str${i}", ${i}) // note`, st).s; return Date.now() - t0 < 600; })());

console.log('language detection');
const det = L.detectLang;
check('json', det('{"a":1,"b":[1,2]}') === 'json' && det('[1,2,3]') === 'json' && det('{\n  "name": "x",\n  "v": 1\n}') === 'json');
check('broken json still json-ish', det('{"a": 1,\n "b": }') === 'json');
check('html', det('<!doctype html><html><body></body></html>') === 'html' && det('<div class="a"><p>x</p></div>') === 'html');
check('markdown', det('# Title\n\n- item one\n- item two\n\n[link](http://x.y)') === 'markdown' && det('- [ ] a\n- [x] b') === 'markdown');
check('python', det('def foo(x):\n    return x\n\nprint(foo(1))') === 'python' && det('import os\nclass A:\n    pass') === 'python');
check('javascript', det('const a = 1;\nfunction f() { return a; }\nconsole.log(f());') === 'javascript');
check('typescript', det('interface A { x: string }\nconst a: number = 1;') === 'typescript');
check('shell', det('#!/bin/bash\necho hi') === 'shell' && det('$ git status\n$ npm install') === 'shell' && det('sudo apt install foo\ncd /tmp') === 'shell');
check('css', det('.a { color: red; margin: 0; }\n.b { padding: 1px; }') === 'css');
check('sql', det('SELECT id, name FROM users WHERE id = 1;') === 'sql' && det('create table t (id int);\ninsert into t values (1);') === 'sql');
check('yaml', det('name: app\nversion: 1\nitems:\n  - a') === 'yaml' && det('---\nkey: v\nother: w') === 'yaml');
check('diff', det('diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b') === 'diff');
check('log', det('2026-01-01 10:00:00 INFO start\n2026-01-01 10:00:01 WARN slow\n2026-01-01 10:00:02 ERROR boom') === 'log');
check('xml', det('<?xml version="1.0"?><root><a/></root>') === 'xml');
check('plain', det('Buy milk and eggs') === 'plain' && det('') === 'plain' && det('hello') === 'plain');
check('filename -> lang', L.langFromFilename('a.JSON') === 'json' && L.langFromFilename('x.py') === 'python' && L.langFromFilename('Makefile') === null && L.langFromFilename('n.md') === 'markdown');
check('ext for download', L.langExt('python') === 'py' && L.langExt('markdown') === 'md' && L.langExt('plain') === 'txt' && L.langExt('nope') === 'txt');

console.log('JSON validate / format');
check('valid json passes', L.jsonError('{"a":[1,2,{"b":null}],"c":"\\u00e9\\n"}') === null && L.jsonError('  [ ]  ') === null && L.jsonError('"s"') === null && L.jsonError('-1.5e+3') === null);
const loc = (s) => { const f = L.formatJson(s); return f.ok ? 'ok' : `${f.line}:${f.col}`; };
check('trailing comma located', loc('{\n  "a": 1,\n}') === '3:1' || loc('{\n  "a": 1,\n}') === '2:10', loc('{\n  "a": 1,\n}'));
check('missing comma located on the right line', loc('{\n  "a": 1\n  "b": 2\n}') === '3:3', loc('{\n  "a": 1\n  "b": 2\n}'));
check('single quotes reported', !L.formatJson("{'a': 1}").ok && /double quotes/i.test(L.formatJson("{'a': 1}").message));
check('unclosed string, unclosed object, extra text, empty', !L.formatJson('{"a": "x').ok && !L.formatJson('{"a": 1').ok && !L.formatJson('{"a":1} x').ok && !L.formatJson('').ok);
check('error message names line and column', /^Line 2, column \d+:/.test(L.formatJson('{\n  a: 1\n}').message), L.formatJson('{\n  a: 1\n}'));
check('pretty prints 2 spaces', L.formatJson('{"a":[1,2,{"b":null}],"c":{}}').text === '{\n  "a": [\n    1,\n    2,\n    {\n      "b": null\n    }\n  ],\n  "c": {}\n}');
check('formatting keeps big numbers exactly', L.formatJson('{"id":12345678901234567890}').text.includes('12345678901234567890'));
check('formatting keeps strings with brackets/commas/escapes', L.formatJson('{"a":"x,{[}]:\\"y"}').text === '{\n  "a": "x,{[}]:\\"y"\n}');
check('format is idempotent', (() => { const a = L.formatJson('{"a":[1,{"b":2}],"c":"d"}').text; return L.formatJson(a).text === a; })());
check('deep nesting does not crash', !L.formatJson('['.repeat(500) + ']'.repeat(500)).ok);
check('posToLineCol', JSON.stringify(L.posToLineCol('ab\ncd\nef', 4)) === '{"line":2,"col":2}' && JSON.stringify(L.posToLineCol('abc', 0)) === '{"line":1,"col":1}');

console.log('line diff');
const d = (a, b) => L.diffLines(a, b).map((o) => o.op + o.text).join('|');
check('identical', d('a\nb', 'a\nb') === '=a|=b');
check('add / remove / change', d('a\nb\nc', 'a\nc') === '=a|-b|=c' && d('a\nc', 'a\nb\nc') === '=a|+b|=c' && d('a\nb\nc', 'a\nX\nc') === '=a|-b|+X|=c');
check('from / to empty', d('', 'a') === '-|+a' || d('', 'a') === '+a|-', d('', 'a'));
check('multi-hunk', d('1\n2\n3\n4\n5\n6', '1\nTWO\n3\n4\n5\nSIX') === '=1|-2|+TWO|=3|=4|=5|-6|+SIX');
check('applying the diff rebuilds b', (() => {
  const rnd = (n, seed) => { let s = seed; return Array.from({ length: n }, () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return 'line' + (s % 12); }).join('\n'); };
  for (let i = 1; i <= 40; i++) {
    const a = rnd(5 + i, i), b = rnd(4 + i * 2, i * 7);
    const ops = L.diffLines(a, b);
    const rebuiltA = ops.filter((o) => o.op !== '+').map((o) => o.text).join('\n'), rebuiltB = ops.filter((o) => o.op !== '-').map((o) => o.text).join('\n');
    if (rebuiltA !== a || rebuiltB !== b) return false;
  }
  return true;
})());
check('large diff finishes fast (coarse fallback)', (() => { const a = Array.from({ length: 4000 }, (_, i) => 'a' + i).join('\n'), b = Array.from({ length: 4000 }, (_, i) => 'b' + i).join('\n'); const t0 = Date.now(); const ops = L.diffLines(a, b); return Date.now() - t0 < 1500 && ops.length === 8000; })());
check('diffRows collapses long unchanged runs', (() => { const rows = L.diffRows(L.diffLines(Array.from({ length: 30 }, (_, i) => 'l' + i).join('\n'), Array.from({ length: 30 }, (_, i) => (i === 15 ? 'X' : 'l' + i)).join('\n')), 2); return rows.some((r) => r.op === 'skip') && rows.length < 14 && L.diffStats(L.diffLines('a\nb', 'a\nc')).added === 1; })());

console.log('checklists');
const T = '- [ ] one\n- [x] two\n* [X] three\n1. [ ] four\nplain [ ] no\n  - [ ] nested';
check('items + stats', L.checklistItems(T).length === 5 && JSON.stringify(L.checklistStats(T)) === '{"done":2,"total":5}');
check('toggle by line (check)', L.toggleChecklistLine(T, 0).split('\n')[0] === '- [x] one');
check('toggle by line (uncheck, X too)', L.toggleChecklistLine(T, 1).split('\n')[1] === '- [ ] two' && L.toggleChecklistLine(T, 2).split('\n')[2] === '* [ ] three');
check('toggle ordered + nested lines', L.toggleChecklistLine(T, 3).split('\n')[3] === '1. [x] four' && L.toggleChecklistLine(T, 5).split('\n')[5] === '  - [x] nested');
check('toggle ignores non-task lines / bad index', L.toggleChecklistLine(T, 4) === null && L.toggleChecklistLine(T, 99) === null && L.toggleChecklistLine(T, -1) === null);
check('toggle only changes that line', (() => { const n = L.toggleChecklistLine(T, 0); return n.split('\n').slice(1).join('\n') === T.split('\n').slice(1).join('\n'); })());
check('toggle twice = original', L.toggleChecklistLine(L.toggleChecklistLine(T, 0), 0) === T);
check('toggle by tapped offset: on the box', L.toggleChecklistAt('- [ ] a', 3) === '- [x] a' && L.toggleChecklistAt('- [ ] a', 2) === '- [x] a' && L.toggleChecklistAt('- [ ] a', 5) === '- [x] a');
check('toggle by offset: text and other lines untouched', L.toggleChecklistAt('- [ ] abc', 8) === null && L.toggleChecklistAt('- [ ] a\nb [ ] c', 12) === null && L.toggleChecklistAt('hi', 1) === null);
check('toggle by offset on a later line', L.toggleChecklistAt('x\n- [x] a', 5) === 'x\n- [ ] a');
check('brackets inside text are not tasks', L.checklistItems('see [ ] here\n-[ ] nospace\n- [] x').length === 0);

console.log('Enter key helper');
check('keeps indent', JSON.stringify(L.enterEdit('  foo', 5)) === '{"from":5,"to":5,"text":"\\n  "}');
check('no indent -> native behaviour', L.enterEdit('foo', 3) === null);
check('continues bullets and numbers', L.enterEdit('- a', 3).text === '\n- ' && L.enterEdit('9. a', 4).text === '\n10. ' && L.enterEdit('  * a', 5).text === '\n  * ');
check('continues a checklist with an empty box', L.enterEdit('- [x] done', 10).text === '\n- [ ] ');
check('empty item ends the list', (() => { const e = L.enterEdit('- a\n- ', 6); return e.from === 4 && e.to === 6 && e.text === ''; })());
check('adds a level after { [ ( :', L.enterEdit('if (x) {', 8).text === '\n  ' && L.enterEdit('def f():', 8).text === '\n  ' && L.enterEdit('  a: [', 6).text === '\n    ');
check('mid-line Enter only copies indent', L.enterEdit('  ab', 3).text === '\n  ');

console.log('markdown renderer is safe');
const md = L.renderMarkdown;
check('escapes raw html', !md('<script>alert(1)</script>').includes('<script') && md('<img src=x onerror=alert(1)>').includes('&lt;img'));
check('blocks javascript: and data: links', !/href="javascript/i.test(md('[x](javascript:alert(1))')) && !/href="data:/i.test(md('[x](data:text/html,hi)')) && !/href="vbscript/i.test(md('[x](vbscript:x)')));
check('only http(s)/mailto/#/relative links become anchors', /href="https:\/\/a\.b"/.test(md('[ok](https://a.b)')) && /href="mailto:a@b\.c"/.test(md('[m](mailto:a@b.c)')) && !/<a /.test(md('[p](//evil.com)')));
check('link attributes cannot break out', !/onmouseover/i.test(md('[x](https://a.b/"onmouseover="x)').replace(/&quot;/g, '')) || !/<a [^>]*" onmouseover/.test(md('[x](https://a.b/"onmouseover="x)')));
check('autolinks open safely', /rel="noopener noreferrer nofollow"/.test(md('see https://a.b/c.')) && /target="_blank"/.test(md('https://a.b')));
check('code spans keep their content literal', md('`<b>**x**</b>`') === '<p><code>&lt;b&gt;**x**&lt;/b&gt;</code></p>');
check('headings, emphasis, rules, quotes', md('# T').startsWith('<h1>T</h1>') && md('**b** _i_ ~~s~~').includes('<strong>b</strong> <em>i</em> <del>s</del>') && md('---') === '<hr>' && md('> q') === '<blockquote><p>q</p></blockquote>');
check('lists + tasks carry the source line number', (() => { const h = md('intro\n\n- [ ] a\n- [x] b\n- c'); return h.includes('data-line="2"') && h.includes('data-line="3"') && /class="task done"/.test(h) && h.includes('<li>c</li>'); })());
check('fenced code is highlighted and escaped', (() => { const h = md('```js\nconst a = "<x>";\n```'); return h.includes('t-k') && h.includes('&lt;x&gt;') && !h.includes('<x>'); })());
check('unknown fence language is plain but escaped', md('```zzz\n<b>\n```').includes('&lt;b&gt;'));
check('tables', md('| a | b |\n|---|---|\n| 1 | <i> |').includes('<th>a</th>') && md('| a | b |\n|---|---|\n| 1 | <i> |').includes('&lt;i&gt;'));
check('paragraph line breaks kept', md('a\nb') === '<p>a<br>b</p>');
check('nested lists', md('- a\n  - b\n- c').includes('<li>a<ul><li>b</li></ul></li>'));
check('huge input renders fast', (() => { const t0 = Date.now(); md(Array.from({ length: 5000 }, (_, i) => `- [ ] item ${i} **b** \`c\``).join('\n')); return Date.now() - t0 < 1500; })());

console.log('helpers');
const NOW = Date.parse('2026-10-19T12:00:00Z');
check('relTime', L.relTime(NOW - 10000, NOW) === 'just now' && L.relTime(NOW - 5 * 60000, NOW) === '5 min ago' && L.relTime(NOW - 3 * 3600000, NOW) === '3 h ago' && L.relTime(NOW - 86400000, NOW) === '1 day ago' && L.relTime('x', NOW) === '');
check('timeLeft', L.timeLeft(null, NOW) === 'Kept' && L.timeLeft(new Date(NOW + 29.4 * 86400000).toISOString(), NOW) === '29 days left' && L.timeLeft(new Date(NOW + 5 * 3600000).toISOString(), NOW) === '5 h left' && L.timeLeft(new Date(NOW + 20 * 60000).toISOString(), NOW) === '20 min left' && L.timeLeft(new Date(NOW - 1000).toISOString(), NOW) === 'Expired');
check('fmtBytes / byteLen', L.fmtBytes(500) === '500 B' && L.fmtBytes(2048) === '2.0 KB' && L.fmtBytes(300 * 1024) === '300 KB' && L.byteLen('é') === 2);
check('slug', L.slug('Hello, World! 2') === 'hello-world-2' && L.slug('') === 'note' && L.slug('日本語') === 'note' && L.slug('a'.repeat(100)).length === 40);
check('deriveTitle', L.deriveTitle('Mine', 'x') === 'Mine' && L.deriveTitle('', '\n## Heading here\nmore') === 'Heading here' && L.deriveTitle('', '- [ ] buy milk') === 'buy milk' && L.deriveTitle('', '   \n  ') === '');
check('esc', L.esc('<a href="x" onclick=\'y\'>&</a>') === '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
