// Settings: pick a model, add a key if it needs one, choose how much to hide, and test it.
(() => {
  'use strict';
  const { PROVIDERS } = RottyProviders;
  const $ = (id) => document.getElementById(id);
  const form = $('form'), provider = $('provider'), apiKey = $('apiKey'), model = $('model'), baseUrl = $('baseUrl'), customInstructions = $('customInstructions'), msg = $('msg');
  const say = (text, kind) => { msg.textContent = text; msg.className = `msg ${kind || ''}`; };

  for (const [id, p] of Object.entries(PROVIDERS)) provider.add(new Option(p.label, id));

  // Settings are kept per provider, so switching back and forth doesn't lose them.
  let keys = {}, models = {}, baseUrls = {};

  function applyTheme(theme) {
    if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
    else if (theme === 'light') document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
  }

  const categoryKeys = ['filler', 'bait', 'promo', 'spam', 'reaction'];
  function getCategories() {
    const cats = {};
    for (const k of categoryKeys) cats[k] = $(`cat-${k}`).checked;
    return cats;
  }
  function setCategories(cats = {}) {
    for (const k of categoryKeys) $(`cat-${k}`).checked = cats[k] !== false;
  }

  const siteKeys = ['reddit', 'x', 'linkedin'];
  function getSites() {
    const sites = {};
    for (const k of siteKeys) sites[k] = $(`site-${k}`).checked;
    return sites;
  }
  function setSites(sites = {}) {
    for (const k of siteKeys) $(`site-${k}`).checked = sites[k] !== false;
  }

  const sync = () => {
    const p = PROVIDERS[provider.value];
    const isCustom = provider.value === 'custom';
    const isOllama = provider.value === 'ollama';

    $('base-url-field').hidden = !isCustom && !isOllama;
    if (isOllama) {
      baseUrl.placeholder = 'http://localhost:11434/v1';
      $('base-url-hint').textContent = 'Default is http://localhost:11434/v1. Change if using 127.0.0.1 or a remote Ollama server.';
    } else if (isCustom) {
      baseUrl.placeholder = 'https://openrouter.ai/api/v1 or http://localhost:1234/v1';
      $('base-url-hint').textContent = 'OpenRouter, LM Studio, custom Ollama server, etc.';
    }

    $('key-field').hidden = !p.needsKey && !isCustom;
    $('key-hint').textContent = isCustom
      ? 'Optional for local servers (LM Studio, LocalAI) or your API key for OpenRouter/cloud endpoints.'
      : 'Stored only in this browser and sent only to this provider.';

    $('ollama-help').hidden = !isOllama;
    model.placeholder = p.model || 'e.g. gpt-4o-mini';

    apiKey.value = keys[provider.value] || '';
    model.value = models[provider.value] || '';
    baseUrl.value = baseUrls[provider.value] || '';
  };

  chrome.storage.local.get({
    provider: 'ollama',
    model: '',
    apiKey: '',
    baseUrl: '',
    keys: {},
    models: {},
    baseUrls: {},
    strictness: 'balanced',
    customInstructions: '',
    categories: { filler: true, bait: true, promo: true, spam: true, reaction: true },
    sites: { reddit: true, x: true, linkedin: true },
    theme: 'system',
  }).then((s) => {
    keys = s.keys || {};
    models = s.models || {};
    baseUrls = s.baseUrls || {};
    if (s.model && !models[s.provider]) models[s.provider] = s.model;
    if (s.apiKey && !keys[s.provider]) keys[s.provider] = s.apiKey;
    if (s.baseUrl && !baseUrls[s.provider]) baseUrls[s.provider] = s.baseUrl;

    provider.value = s.provider;
    const strictRadio = form.querySelector(`input[name=strictness][value="${s.strictness}"]`);
    if (strictRadio) strictRadio.checked = true;

    const themeRadio = form.querySelector(`input[name=theme][value="${s.theme}"]`);
    if (themeRadio) themeRadio.checked = true;
    applyTheme(s.theme);

    setCategories(s.categories);
    setSites(s.sites);
    customInstructions.value = s.customInstructions || '';

    sync();
  });

  provider.addEventListener('change', () => {
    sync();
    say('');
  });

  apiKey.addEventListener('input', () => { keys[provider.value] = apiKey.value.trim(); });
  model.addEventListener('input', () => { models[provider.value] = model.value.trim(); });
  baseUrl.addEventListener('input', () => { baseUrls[provider.value] = baseUrl.value.trim(); });

  form.querySelectorAll('input[name=theme]').forEach((r) => {
    r.addEventListener('change', () => applyTheme(form.theme.value));
  });

  async function save() {
    const curProvider = provider.value;
    keys[curProvider] = apiKey.value.trim();
    models[curProvider] = model.value.trim();
    baseUrls[curProvider] = baseUrl.value.trim();

    await chrome.storage.local.set({
      provider: curProvider,
      model: models[curProvider],
      apiKey: PROVIDERS[curProvider].needsKey || curProvider === 'custom' ? keys[curProvider] : '',
      baseUrl: baseUrls[curProvider],
      keys,
      models,
      baseUrls,
      strictness: form.strictness.value,
      customInstructions: customInstructions.value.trim(),
      categories: getCategories(),
      sites: getSites(),
      theme: form.theme.value,
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await save();
    say('Saved.', 'ok');
  });

  $('test').addEventListener('click', async () => {
    await save();
    say('Testing…');
    const res = await chrome.runtime.sendMessage({ type: 'test' });
    if (!res || !res.ok) return say((res && res.error) || 'No answer.', 'err');
    if (res.slop?.hide && !res.useful?.hide) say('Works: it hid the slop and kept the useful reply.', 'ok');
    else if (!res.slop?.hide) say('Connected, but it kept an obvious slop reply. Try a larger model.', 'err');
    else say('Connected, but it hid a useful reply. Try Relaxed or a larger model.', 'err');
  });
})();
