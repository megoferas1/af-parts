// AF Parts — المساعد (Supabase Edge Function اسمها ai)
// بتاخد الكلام من الابلكيشن، تتأكد إن اللي بيكلمها داخل بحسابه، وتبعته لـ Gemini بالمفتاح السري.
// المفتاح محطوط في Supabase (Edge Functions ← Secrets) باسم GEMINI_API_KEY، ومش موجود في الابلكيشن.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// موديلات Gemini المجانية (لو واحد مش متاح أو بطيء بيجرب اللي بعده).
// الأبلكيشن ممكن يبعت ترتيبه (body.models) عشان نغيّرها من غير ما نلمس السيرفر.
const DEF_MODELS = (Deno.env.get('GEMINI_MODELS') || 'gemini-3.1-flash-lite,gemini-flash-latest,gemini-flash-lite-latest')
  .split(',').map((s) => s.trim()).filter(Boolean);
const okModel = (m: unknown) => typeof m === 'string' && /^gemini-[a-z0-9.\-]{1,40}$/.test(m);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try { return await handle(req); } catch (e) { return json({ error: 'crash', detail: String(e).slice(0, 300) }, 500); }
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const KEY = Deno.env.get('GEMINI_API_KEY');
  if (!KEY) return json({ error: 'no_key' }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad_body' }, 400); }

  // 1) نتأكد إن اللي بيكلمنا موظف داخل أو الإدارة
  const url = Deno.env.get('SUPABASE_URL')!;
  const apikey = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  const auth = req.headers.get('authorization') || ('Bearer ' + apikey);
  const who = await fetch(url + '/rest/v1/rpc/ai_whoami', {
    method: 'POST',
    headers: { apikey, Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: body.token || '' }),
  });
  if (!who.ok) return json({ error: 'unauthorized' }, 401);

  // 2) نبعت لـ Gemini
  const payload = {
    systemInstruction: body.system ? { parts: [{ text: String(body.system) }] } : undefined,
    contents: body.contents || [],
    tools: body.tools ? [{ functionDeclarations: body.tools }] : undefined,
    generationConfig: { temperature: 0.2 },
  };
  let last = '';
  const MODELS = Array.isArray(body.models) && body.models.filter(okModel).length ? body.models.filter(okModel).slice(0, 4) : DEF_MODELS;
  for (const m of MODELS) {
    let r: Response, t: string;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });
      t = await r.text();
    } catch (e) { last = m + ': ' + String(e).slice(0, 200); continue; }
    if (r.ok) {
      try {
        const j = JSON.parse(t);
        const c = j.candidates && j.candidates[0];
        return json({ model: m, content: (c && c.content) || { role: 'model', parts: [] }, finish: c && c.finishReason });
      } catch { last = 'bad_json'; continue; }
    }
    last = m + ' ' + r.status + ' ' + t.slice(0, 300);
    if (r.status === 400 || r.status === 403) break; // الطلب نفسه غلط أو المفتاح غلط: مفيش لازمة نجرب موديل تاني
  }
  return json({ error: /\b429\b/.test(last) ? 'quota' : 'ai_failed', detail: last }, 502);
}
