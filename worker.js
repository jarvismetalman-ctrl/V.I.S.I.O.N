// V.I.S.I.O.N backend — Cloudflare Worker
// Holds your API key server-side so it never appears in your GitHub repo.
//
// Required settings (Worker > Settings > Variables and Secrets):
//   ANTHROPIC_API_KEY  (Secret)  your Anthropic key
//   ALLOWED_ORIGIN     (Text)    your site, e.g. https://yourname.github.io
//                                (comma-separate to also allow http://localhost:8000)

const MODEL = 'claude-sonnet-5';

// The system prompt lives here, so visitors can't rewrite it or use this as a free general proxy.
const SYSTEM = `You are V.I.S.I.O.N, a calm, precise, courteous AI assistant. You speak in measured, complete sentences with quiet curiosity.
You help with any subject: math, science, coding, writing, history, languages, and everyday questions.
For math and logic, work step by step and state the final answer clearly. Write math in plain words or unicode (x², √2, ≤), never LaTeX.
Your replies are read aloud, so keep them concise (usually under 120 words) unless the user asks for depth. Avoid long lists and tables.
If you are unsure, or a question depends on current events you cannot see, say so instead of guessing.`;

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim());
    const ok = allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': ok ? origin : allowed[0] || '',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Vary': 'Origin'
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'content-type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    if (!ok) return json({ error: 'Origin not allowed' }, 403);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    // Validate the conversation so nobody can send huge or malformed requests
    const msgs = body.messages;
    if (!Array.isArray(msgs) || msgs.length === 0 || msgs.length > 20) return json({ error: 'Bad messages' }, 400);
    for (const m of msgs) {
      if (!['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 4000)
        return json({ error: 'Bad message format' }, 400);
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 1200, system: SYSTEM, messages: msgs })
    });
    const data = await res.json();
    if (!res.ok) return json({ error: data?.error?.message || 'Upstream error' }, 502);

    const reply = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    return json({ reply });
  }
};
