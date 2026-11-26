// POST /api/chat  -> calls the configured AI provider. Keys stay server-side.
const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const IMG = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const BASE =
  'You are Atlas, a capable personal assistant. Follow the user\'s instructions exactly and completely. ' +
  'Use Markdown. Put code in fenced blocks with a language tag. Work through multi-step requests in order. ' +
  'If a request is ambiguous in a way that changes the result, ask one short clarifying question; otherwise make a reasonable assumption and state it. ' +
  'If you cannot do something (for example browse the web or open links), say so plainly and offer the closest alternative.';

function validate(b) {
  if (!b || !Array.isArray(b.messages) || !b.messages.length || b.messages.length > 80) return 'messages must be a list of 1-80 items.';
  for (const m of b.messages) {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 200000)
      return 'Each message needs a role (user/assistant) and non-empty text under 200,000 characters.';
    if (m.images !== undefined) {
      if (m.role !== 'user' || !Array.isArray(m.images) || m.images.length > 3) return 'Up to 3 images per user message.';
      for (const i of m.images) if (!i || !IMG.includes(i.mediaType) || typeof i.data !== 'string' || i.data.length > 2200000) return 'Unsupported or oversized image.';
    }
  }
  if (b.messages[0].role !== 'user' || b.messages[b.messages.length - 1].role !== 'user') return 'Conversation must start and end with a user message.';
  if (b.instructions !== undefined && (typeof b.instructions !== 'string' || b.instructions.length > 2000)) return 'Custom instructions must be under 2,000 characters.';
  return null;
}

async function callAnthropic(key, model, max, system, msgs) {
  const messages = msgs.map((m) => ({
    role: m.role,
    content: m.images && m.images.length
      ? [...m.images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } })), { type: 'text', text: m.content }]
      : m.content,
  }));
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: max, system, messages }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d.error && d.error.message) || `Provider returned ${r.status}`);
  const text = (d.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  if (!text) throw new Error('The provider returned an empty reply.');
  return text;
}

async function callOpenAI(key, model, max, system, msgs) {
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const messages = [{ role: 'system', content: system }].concat(
    msgs.map((m) => ({
      role: m.role,
      content: m.images && m.images.length
        ? [{ type: 'text', text: m.content }, ...m.images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mediaType};base64,${i.data}` } }))]
        : m.content,
    }))
  );
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, max_tokens: max, messages }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d.error && d.error.message) || `Provider returned ${r.status}`);
  const text = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
  if (!text) throw new Error('The provider returned an empty reply.');
  return text;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });
  const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  if (!['anthropic', 'openai'].includes(provider)) return json(500, { code: 'bad_config', error: 'AI_PROVIDER must be "anthropic" or "openai".' });
  const keyName = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
  const key = process.env[keyName];
  if (!key) return json(503, { code: 'missing_key', error: `Setup needed: add the ${keyName} environment variable (see README), then redeploy.` });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Request body is not valid JSON.' }); }
  const problem = validate(body);
  if (problem) return json(400, { error: problem });

  const max = Math.min(Math.max(parseInt(process.env.AI_MAX_TOKENS, 10) || 2048, 64), 8000);
  const model = process.env.AI_MODEL || (provider === 'openai' ? 'gpt-4o-mini' : 'claude-sonnet-5-5');
  let system = `${BASE}\nToday's date: ${new Date().toISOString().slice(0, 10)}.`;
  if (body.instructions && body.instructions.trim()) system += `\nThe user's standing instructions:\n${body.instructions.trim()}`;

  try {
    const reply = await (provider === 'openai' ? callOpenAI : callAnthropic)(key, model, max, system, body.messages);
    return json(200, { reply, model });
  } catch (e) {
    return json(502, { code: 'provider_error', error: `The AI provider reported an error: ${e.message}` });
  }
};
