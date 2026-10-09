const test = require('node:test');
const assert = require('node:assert/strict');
const { forHost } = require('../extension/sites.js');

test('forHost matches reddit domains', () => {
  assert.equal(forHost('reddit.com')?.name, 'reddit');
  assert.equal(forHost('www.reddit.com')?.name, 'reddit');
  assert.equal(forHost('old.reddit.com')?.name, 'reddit');
  assert.equal(forHost('new.reddit.com')?.name, 'reddit');
});

test('forHost matches x and twitter domains', () => {
  assert.equal(forHost('x.com')?.name, 'x');
  assert.equal(forHost('www.x.com')?.name, 'x');
  assert.equal(forHost('twitter.com')?.name, 'x');
  assert.equal(forHost('www.twitter.com')?.name, 'x');
});

test('forHost matches linkedin domains', () => {
  assert.equal(forHost('linkedin.com')?.name, 'linkedin');
  assert.equal(forHost('www.linkedin.com')?.name, 'linkedin');
});

test('forHost returns null for unsupported domains', () => {
  assert.equal(forHost('google.com'), null);
  assert.equal(forHost('example.com'), null);
});
