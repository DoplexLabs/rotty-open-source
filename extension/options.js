// Settings: pick a model, add a key if it needs one, choose how much to hide, and test it.
(() => {
  'use strict';
  const { PROVIDERS } = RottyProviders;
  const $ = (id) => document.getElementById(id);
  const form = $('form'), provider = $('provider'), apiKey = $('apiKey'), model = $('model'), msg = $('msg');
  const say = (text, kind) => { msg.textContent = text; msg.className = `msg ${kind || ''}`; };

  for (const [id, p] of Object.entries(PROVIDERS)) provider.add(new Option(p.label, id));

  // Keys are kept per provider, so switching back and forth doesn't lose them.
  let keys = {};
  const sync = () => {
    const p = PROVIDERS[provider.value];
    $('key-field').hidden = !p.needsKey;
    $('ollama-help').hidden = provider.value !== 'ollama';
    model.placeholder = p.model;
    apiKey.value = keys[provider.value] || '';
  };

  chrome.storage.local.get({ provider: 'ollama', model: '', apiKey: '', keys: {}, strictness: 'balanced' }).then((s) => {
    keys = s.keys || {};
    provider.value = s.provider;
    model.value = s.model;
    form.querySelector(`input[name=strictness][value="${s.strictness}"]`).checked = true;
    sync();
  });

  provider.addEventListener('change', () => { model.value = ''; sync(); say(''); });
  apiKey.addEventListener('input', () => { keys[provider.value] = apiKey.value.trim(); });

  async function save() {
    keys[provider.value] = apiKey.value.trim();
    await chrome.storage.local.set({
      provider: provider.value,
      model: model.value.trim(),
      apiKey: PROVIDERS[provider.value].needsKey ? keys[provider.value] : '',
      keys,
      strictness: form.strictness.value,
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
