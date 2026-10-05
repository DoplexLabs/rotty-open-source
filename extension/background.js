/*
 * Service worker: the only part that talks to a model. Content scripts send it batches of post text;
 * it answers with a verdict per post. Settings and keys stay here and never reach web pages.
 */
importScripts('prompt.js', 'providers.js');

const DEFAULTS = { enabled: true, provider: 'ollama', model: '', apiKey: '', strictness: 'balanced' };
const CACHE_LIMIT = 2000; // verdicts kept in memory, by text, so scrolling back doesn't re-ask

const cache = new Map();
const cacheKey = (s, it) => `${s.provider}|${s.model}|${s.strictness}|${it.site}|${it.text}`;

async function settings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

async function classify(items) {
  const s = await settings();
  if (!s.enabled) return { verdicts: {} };
  const verdicts = {};
  const todo = [];
  for (const it of items) {
    const hit = cache.get(cacheKey(s, it));
    if (hit) verdicts[it.id] = hit;
    else todo.push(it);
  }
  if (todo.length) {
    const prompt = RottyPrompt.build(todo, s.strictness);
    const text = await RottyProviders.complete(s, prompt);
    const fresh = RottyPrompt.parse(text, todo);
    for (const it of todo) {
      const v = fresh[it.id] || { hide: false, category: null, label: null };
      verdicts[it.id] = v;
      cache.set(cacheKey(s, it), v);
      if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    }
  }
  return { verdicts };
}

// Only this extension's own pages and content scripts may ask; never web pages.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !msg || typeof msg.type !== 'string') return false;

  if (msg.type === 'classify' && Array.isArray(msg.items)) {
    const items = msg.items.slice(0, 20).map((it) => ({
      id: String(it.id).slice(0, 40),
      site: String(it.site).slice(0, 20),
      kind: it.kind === 'reply' ? 'reply' : 'post',
      text: String(it.text || '').slice(0, 4000),
    }));
    classify(items).then(reply, (err) => reply({ error: err.message || 'Something went wrong.' }));
    return true;
  }

  if (msg.type === 'test') {
    // From the options page: one obvious slop reply and one useful one.
    const items = [
      { id: 'a', site: 'reddit', kind: 'reply', text: 'Great question! This really resonates 🙌🔥' },
      { id: 'b', site: 'reddit', kind: 'reply', text: 'Pay the 3% mortgage early only if the guaranteed return beats your savings rate after tax. Right now a 4.5% HYSA wins.' },
    ];
    cache.clear();
    classify(items).then(
      ({ verdicts }) => reply({ ok: true, slop: verdicts.a, useful: verdicts.b }),
      (err) => reply({ ok: false, error: err.message || 'Something went wrong.' }),
    );
    return true;
  }
  return false;
});

// Changing the model or strictness should re-judge posts with the new settings.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.provider || changes.model || changes.strictness) cache.clear();
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
