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
