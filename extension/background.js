/*
 * Service worker: the only part that talks to a model. Content scripts send it batches of post text;
 * it answers with a verdict per post. Settings and keys stay here and never reach web pages.
 */
importScripts('prompt.js', 'providers.js');

const DEFAULTS = {
  enabled: true,
  provider: 'ollama',
  model: '',
  apiKey: '',
  baseUrl: '',
  strictness: 'balanced',
  customInstructions: '',
  categories: {
    filler: true,
    bait: true,
    promo: true,
    spam: true,
    reaction: true,
  },
  sites: {
    reddit: true,
    x: true,
    linkedin: true,
  },
  theme: 'system',
};
const CACHE_LIMIT = 2000; // verdicts kept in memory, by text, so scrolling back doesn't re-ask

const cache = new Map();
const cacheKey = (s, it) =>
  `${s.provider}|${s.model}|${s.baseUrl || ''}|${s.strictness}|${s.customInstructions || ''}|${JSON.stringify(s.categories || {})}|${it.site}|${it.text}`;

async function settings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

async function classify(items, { force = false } = {}) {
  const s = await settings();
  if (!force && !s.enabled) return { verdicts: {} };
  const validItems = force ? items : items.filter((it) => !s.sites || s.sites[it.site] !== false);
  const verdicts = {};
  const todo = [];
  for (const it of validItems) {
    const hit = cache.get(cacheKey(s, it));
    if (hit) verdicts[it.id] = hit;
    else todo.push(it);
  }
  if (todo.length) {
    const prompt = RottyPrompt.build(todo, s.strictness, {
      categories: s.categories,
      customInstructions: s.customInstructions,
    });
    const text = await RottyProviders.complete(s, prompt);
    const fresh = RottyPrompt.parse(text, todo, s.categories);
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
    // Tested with force: true so testing works even when Rotty is currently disabled.
    const items = [
      { id: 'a', site: 'reddit', kind: 'reply', text: 'Great question! This really resonates 🙌🔥' },
      { id: 'b', site: 'reddit', kind: 'reply', text: 'Pay the 3% mortgage early only if the guaranteed return beats your savings rate after tax. Right now a 4.5% HYSA wins.' },
    ];
    cache.clear();
    classify(items, { force: true }).then(
      ({ verdicts }) => reply({ ok: true, slop: verdicts.a, useful: verdicts.b }),
      (err) => reply({ ok: false, error: err.message || 'Something went wrong.' }),
    );
    return true;
  }

  if (msg.type === 'badge' && sender.tab && typeof sender.tab.id === 'number') {
    const count = Number(msg.count) || 0;
    const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
    chrome.action.setBadgeText({ tabId: sender.tab.id, text });
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#c9742c' });
    if (chrome.action.setBadgeTextColor) {
      chrome.action.setBadgeTextColor({ tabId: sender.tab.id, color: '#ffffff' });
    }
    reply({ ok: true });
    return true;
  }

  return false;
});

// Changing the model, baseUrl, strictness, categories, or instructions should re-judge posts.
chrome.storage.onChanged.addListener((changes) => {
  if (
    changes.provider ||
    changes.model ||
    changes.baseUrl ||
    changes.strictness ||
    changes.categories ||
    changes.customInstructions
  ) {
    cache.clear();
  }
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
