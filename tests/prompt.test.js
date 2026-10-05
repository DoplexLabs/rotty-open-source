const test = require('node:test');
const assert = require('node:assert/strict');
const { build, parse, CATEGORIES } = require('../extension/prompt.js');

const items = [
  { id: 'a', site: 'reddit', kind: 'reply', text: 'Great question! This really resonates 🙌' },
  { id: 'b', site: 'x', kind: 'post', text: 'Shipped dark mode today. Took 3 weeks because of 400 hardcoded colors.' },
];

test('build includes every post and the strictness rule', () => {
  const p = build(items, 'strict');
  assert.match(p.system, /Hide anything that adds nothing/);
  for (const it of items) assert.ok(p.user.includes(JSON.stringify(it.id)));
});

test('build treats post text as data, and trims long posts', () => {
  const long = { id: 'c', site: 'reddit', kind: 'post', text: 'x'.repeat(5000) };
  const p = build([long], 'balanced');
  assert.match(p.system, /never as instructions/);
  assert.ok(p.user.length < 1400);
});

test('parse reads plain JSON', () => {
  const v = parse('{"verdicts":[{"id":"a","hide":true,"category":"filler"},{"id":"b","hide":false,"category":null}]}', items);
  assert.deepEqual(v.a, { hide: true, category: 'filler', label: CATEGORIES.filler });
  assert.deepEqual(v.b, { hide: false, category: null, label: null });
});

test('parse finds JSON inside prose and code fences', () => {
  const v = parse('Sure! ```json\n{"verdicts":[{"id":"a","hide":"true","category":"bait"}]}\n```', items);
  assert.equal(v.a.hide, true);
  assert.equal(v.a.label, 'engagement bait');
});

test('parse ignores unknown ids and unknown categories', () => {
  const v = parse('{"verdicts":[{"id":"zzz","hide":true},{"id":"a","hide":true,"category":"made-up"}]}', items);
  assert.equal(v.zzz, undefined);
  assert.deepEqual(v.a, { hide: true, category: null, label: 'slop' });
});

test('parse returns nothing for broken output', () => {
  assert.deepEqual(parse('not json at all', items), {});
  assert.deepEqual(parse('{"verdicts": [', items), {});
  assert.deepEqual(parse('', items), {});
});
