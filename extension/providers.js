/*
 * Model providers. Each one takes { system, user } and returns the model's text.
 * Requests go straight from your browser to the provider you pick. API keys are sent only to their
 * own provider. Ollama runs on your computer, so nothing leaves it.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.RottyProviders = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PROVIDERS = {
    ollama: { label: 'Ollama (local, free)', model: 'llama3.2', needsKey: false, url: 'http://localhost:11434/v1/chat/completions' },
    groq: { label: 'Groq (free key)', model: 'llama-3.1-8b-instant', needsKey: true, url: 'https://api.groq.com/openai/v1/chat/completions' },
    openai: { label: 'OpenAI', model: 'gpt-4.1-mini', needsKey: true, url: 'https://api.openai.com/v1/chat/completions' },
    anthropic: { label: 'Anthropic', model: 'claude-haiku-4-5', needsKey: true, url: 'https://api.anthropic.com/v1/messages' },
    gemini: { label: 'Google Gemini', model: 'gemini-2.5-flash', needsKey: true, url: 'https://generativelanguage.googleapis.com/v1beta/models' },
  };

  class ProviderError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }

  async function post(fetchFn, url, headers, body) {
    let res;
    try {
      res = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    } catch (_) {
      throw new ProviderError('Could not reach the model. Is it running, and are you online?', 0);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data.error && (data.error.message || data.error)) || `HTTP ${res.status}`;
      throw new ProviderError(res.status === 401 || res.status === 403 ? 'The API key was rejected.' : String(msg).slice(0, 200), res.status);
    }
    return data;
  }

  // settings: { provider, model, apiKey }. fetchFn is injectable for tests.
  async function complete(settings, prompt, fetchFn = fetch) {
    const p = PROVIDERS[settings.provider];
    if (!p) throw new ProviderError('Pick a provider in Settings.', 0);
    if (p.needsKey && !settings.apiKey) throw new ProviderError('Add your API key in Settings.', 0);
    const model = settings.model || p.model;

    if (settings.provider === 'anthropic') {
      const data = await post(fetchFn, p.url, {
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      }, { model, max_tokens: 1024, temperature: 0, system: prompt.system, messages: [{ role: 'user', content: prompt.user }] });
      return (data.content || []).map((c) => c.text || '').join('');
    }

    if (settings.provider === 'gemini') {
      const data = await post(fetchFn, `${p.url}/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': settings.apiKey }, {
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      });
      return (((data.candidates || [])[0] || {}).content || { parts: [] }).parts.map((x) => x.text || '').join('');
    }

    // OpenAI-compatible: OpenAI, Groq, Ollama.
    const headers = settings.apiKey ? { authorization: `Bearer ${settings.apiKey}` } : {};
    const data = await post(fetchFn, p.url, headers, {
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }],
    });
    return (((data.choices || [])[0] || {}).message || {}).content || '';
  }

  return { PROVIDERS, ProviderError, complete };
});
