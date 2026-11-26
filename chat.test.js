const assert = require('assert');
const { handler } = require('../netlify/functions/chat.js');
const post = (b) => handler({ httpMethod: 'POST', body: JSON.stringify(b) });
(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  assert.strictEqual((await handler({ httpMethod: 'GET' })).statusCode, 405);
  let r = await post({ messages: [{ role: 'user', content: 'hi' }] });
  assert.strictEqual(r.statusCode, 503);
  process.env.ANTHROPIC_API_KEY = 'test';
  r = await post({ messages: [] });
  assert.strictEqual(r.statusCode, 400);
  r = await post({ messages: [{ role: 'assistant', content: 'x' }] });
  assert.strictEqual(r.statusCode, 400);
  global.fetch = async (url, o) => {
    const b = JSON.parse(o.body);
    assert.ok(url.includes('anthropic.com') && b.system.includes('Atlas') && b.messages[0].content === 'hi');
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'hello' }] }) };
  };
  r = await post({ messages: [{ role: 'user', content: 'hi' }] });
  assert.strictEqual(JSON.parse(r.body).reply, 'hello');
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'bad key' } }) });
  r = await post({ messages: [{ role: 'user', content: 'hi' }] });
  assert.strictEqual(r.statusCode, 502);
  console.log('chat function tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
