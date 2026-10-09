const test = require('node:test');
const assert = require('node:assert/strict');
const { complete, PROVIDERS } = require('../extension/providers.js');

const prompt = { system: 'sys', user: 'usr' };
const fake = (body, status = 200) => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: status < 400, status, json: async () => body };
  };
  fn.calls = calls;
  return fn;
};

test('Ollama needs no key and uses the local OpenAI-compatible endpoint', async () => {
  const f = fake({ choices: [{ message: { content: '{"verdicts":[]}' } }] });
  const out = await complete({ provider: 'ollama' }, prompt, f);
  assert.equal(out, '{"verdicts":[]}');
  assert.equal(f.calls[0].url, PROVIDERS.ollama.url);
  assert.equal(f.calls[0].init.headers.authorization, undefined);
  assert.equal(f.calls[0].body.model, PROVIDERS.ollama.model);
});

test('a key is sent only as that provider expects', async () => {
  const g = fake({ choices: [{ message: { content: 'ok' } }] });
  await complete({ provider: 'groq', apiKey: 'gsk_test' }, prompt, g);
  assert.equal(g.calls[0].init.headers.authorization, 'Bearer gsk_test');
  assert.ok(g.calls[0].url.startsWith('https://api.groq.com/'));

  const a = fake({ content: [{ type: 'text', text: 'ok' }] });
  await complete({ provider: 'anthropic', apiKey: 'sk-ant-test' }, prompt, a);
  assert.equal(a.calls[0].init.headers['x-api-key'], 'sk-ant-test');
  assert.equal(a.calls[0].init.headers.authorization, undefined);
  assert.equal(a.calls[0].body.system, 'sys');

  const m = fake({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
  await complete({ provider: 'gemini', apiKey: 'AIza-test', model: 'gemini-2.5-flash' }, prompt, m);
  assert.equal(m.calls[0].init.headers['x-goog-api-key'], 'AIza-test');
  assert.ok(!m.calls[0].url.includes('AIza-test'), 'key never goes in the URL');
});

test('missing key and rejected key give plain errors', async () => {
  await assert.rejects(complete({ provider: 'openai' }, prompt, fake({})), /Add your API key/);
  await assert.rejects(complete({ provider: 'openai', apiKey: 'bad' }, prompt, fake({ error: { message: 'nope' } }, 401)), /rejected/);
});

test('an unreachable model says so', async () => {
  const down = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(complete({ provider: 'ollama' }, prompt, down), /Could not reach the model/);
});

test('normalizeUrl formats OpenAI-compatible endpoints correctly', () => {
  const { normalizeUrl } = require('../extension/providers.js');
  assert.equal(normalizeUrl('https://openrouter.ai/api/v1'), 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(normalizeUrl('https://openrouter.ai/api/v1/'), 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(normalizeUrl('http://localhost:1234/v1'), 'http://localhost:1234/v1/chat/completions');
  assert.equal(normalizeUrl('http://127.0.0.1:11434'), 'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(normalizeUrl('http://localhost:8000/v1/chat/completions'), 'http://localhost:8000/v1/chat/completions');
  assert.equal(normalizeUrl(''), '');
});

test('custom OpenAI-compatible provider requires baseUrl and sends key if provided', async () => {
  await assert.rejects(complete({ provider: 'custom' }, prompt, fake({})), /Add a Base URL/);

  const c1 = fake({ choices: [{ message: { content: 'ok' } }] });
  await complete({ provider: 'custom', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'sk-or-test', model: 'meta-llama/llama-3' }, prompt, c1);
  assert.equal(c1.calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(c1.calls[0].init.headers.authorization, 'Bearer sk-or-test');
  assert.equal(c1.calls[0].body.model, 'meta-llama/llama-3');

  // Key is optional for local LM Studio
  const c2 = fake({ choices: [{ message: { content: 'ok' } }] });
  await complete({ provider: 'custom', baseUrl: 'http://localhost:1234/v1' }, prompt, c2);
  assert.equal(c2.calls[0].url, 'http://localhost:1234/v1/chat/completions');
  assert.equal(c2.calls[0].init.headers.authorization, undefined);
});

test('custom baseUrl can override default provider url', async () => {
  const f = fake({ choices: [{ message: { content: 'ok' } }] });
  await complete({ provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' }, prompt, f);
  assert.equal(f.calls[0].url, 'http://127.0.0.1:11434/v1/chat/completions');
});

test('retries without response_format if provider rejects it with 400', async () => {
  let callCount = 0;
  const retryFake = async (url, init) => {
    callCount++;
    const body = JSON.parse(init.body);
    if (body.response_format) {
      return { ok: false, status: 400, json: async () => ({ error: { message: "response_format 'json_object' is not supported" } }) };
    }
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"verdicts":[]}' } }] }) };
  };
  const res = await complete({ provider: 'custom', baseUrl: 'http://localhost:1234/v1' }, prompt, retryFake);
  assert.equal(res, '{"verdicts":[]}');
  assert.equal(callCount, 2);
});
