// AF Parts — المساعد (Supabase Edge Function اسمها ai)
// بتاخد الكلام من الابلكيشن، تتأكد إن اللي بيكلمها داخل بحسابه، وتبعته لـ Gemini بالمفتاح السري.
// المفتاح محطوط في Supabase (Edge Functions ← Secrets) باسم GEMINI_API_KEY، ومش موجود في الابلكيشن.
// v27: لو مفتاح Claude (ANTHROPIC_API_KEY) موجود في Secrets، المدير بيشتغل بـ Claude بدل Gemini.
// v25: الخطوات المستنية اللي قبلها مش بتتبعت لحد ما دورها ييجي، و«دورك» بيوصل بإشعار (notify turn_job).
// v20: كمان بتصحى كل ساعة (action: tick) تبعت لكل موظف شغله، وتسأله خلص إيه، وتبعت للإدارة ملخص.
//      وبتجيب مين حاضر النهارده من ابلكيشن الحضور (action: present).
import webpush from 'npm:web-push@3.6.7';
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';

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
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad_body' }, 400); }
  if (body.action === 'tick') return await tick(body);

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
  if (body.action === 'present') {
    const S = await secrets();
    return json(await present(S, body.date));
  }
  if (body.action === 'notify') return json(await notify(body, await who.json()));
  if (body.action === 'vapid') { const S = await secrets(); await vapid(S); return json({ key: S.vapid_public }); }

  // 2) Claude لو مفتاحه موجود، وإلا Gemini
  const CKEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (CKEY) return await askClaude(CKEY, body);
  const KEY = Deno.env.get('GEMINI_API_KEY');
  if (!KEY) return json({ error: 'no_key' }, 500);
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

// =====================================================================
// v27: Claude — الابلكيشن بيبعت الكلام بشكل Gemini (contents/parts)، وإحنا بنحوّله لـ Claude ونرجّعه بنفس الشكل
// =====================================================================
const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
function toClaude(contents: any[]) {
  const out: any[] = [];
  let pending: string[] = []; // ids الأدوات اللي لسه مستنية نتيجتها (للكلام القديم اللي من غير id)
  let n = 0;
  for (const m of contents || []) {
    const role = m.role === 'model' ? 'assistant' : 'user';
    const blocks: any[] = [];
    if (role === 'assistant') pending = [];
    for (const p of m.parts || []) {
      if (p.thought) { if (p.cb) blocks.push(p.cb); continue; }
      if (p.functionCall) {
        const id = p.functionCall.id || ('toolu_af' + (n++));
        pending.push(id);
        blocks.push({ type: 'tool_use', id, name: p.functionCall.name, input: p.functionCall.args || {} });
      } else if (p.functionResponse) {
        const r = p.functionResponse;
        let id = r.id;
        if (id) pending = pending.filter((x) => x !== id); else id = pending.shift() || ('toolu_af' + (n++));
        const res = r.response && 'result' in r.response ? r.response.result : r.response;
        blocks.push({ type: 'tool_result', tool_use_id: id, content: JSON.stringify(res ?? null).slice(0, 60000) });
      } else if (p.inlineData) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: p.inlineData.mimeType || 'image/jpeg', data: p.inlineData.data } });
      } else if (typeof p.text === 'string' && p.text.trim()) {
        blocks.push({ type: 'text', text: p.text });
      }
    }
    if (!blocks.length) blocks.push({ type: 'text', text: '...' });
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(...blocks); else out.push({ role, content: blocks });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}
function fromClaude(r: any) {
  const parts: any[] = [];
  for (const b of r.content || []) {
    if (b.type === 'text') parts.push({ text: b.text });
    else if (b.type === 'tool_use') parts.push({ functionCall: { id: b.id, name: b.name, args: b.input || {} } });
    else parts.push({ thought: true, cb: b }); // thinking وغيره: بيرجع زي ما هو في الطلب الجاي
  }
  if (r.stop_reason === 'refusal') parts.push({ text: 'معلش، مش هقدر أرد على ده.' });
  return { role: 'model', parts };
}
async function askClaude(key: string, body: any): Promise<Response> {
  const client = new Anthropic({ apiKey: key, timeout: 100000, maxRetries: 1 });
  const want = Array.isArray(body.models) ? body.models.find((m: unknown) => typeof m === 'string' && CLAUDE_MODELS.includes(m)) : null;
  const model = want || Deno.env.get('CLAUDE_MODEL') || CLAUDE_MODELS[0];
  const tools = (body.tools || []).map((t: any) => ({
    name: t.name, description: String(t.description || '').slice(0, 4000),
    input_schema: t.parameters && t.parameters.type === 'object' ? t.parameters : { type: 'object', properties: {} },
  }));
  if (tools.length) tools[tools.length - 1].cache_control = { type: 'ephemeral' }; // الأدوات ثابتة: تتخزن وتبقى أرخص
  try {
    const r: any = await client.beta.messages.create({
      model, max_tokens: 16000,
      system: body.system ? String(body.system) : undefined,
      messages: toClaude(body.contents || []),
      tools: tools.length ? tools : undefined,
      thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
      output_config: { effort: model === 'claude-opus-5-5' ? 'medium' : 'low' },
      ...(model === 'claude-haiku-5-5' ? {} : { fallbacks: 'default' }),
      betas: ['thinking-binding-controls-2026-08-01', ...(model === 'claude-haiku-5-5' ? [] : ['server-side-fallback-2026-07-01'])],
    } as any);
    return json({ model: r.model || model, content: fromClaude(r), finish: r.stop_reason });
  } catch (e: any) {
    const st = e && e.status;
    const detail = (st ? st + ' ' : '') + String((e && e.message) || e).slice(0, 300);
    return json({ error: st === 429 ? 'quota' : st === 401 ? 'bad_key' : /credit|billing/i.test(detail) ? 'no_credit' : 'ai_failed', detail }, 502);
  }
}

// =====================================================================
// v20: المدير بيتابع لوحده
// =====================================================================
const SB_URL = () => Deno.env.get('SUPABASE_URL')!;
const SRK = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
async function sb(path: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(SB_URL() + '/rest/v1/' + path, {
    ...init,
    headers: { apikey: SRK(), Authorization: 'Bearer ' + SRK(), 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error('db ' + r.status + ' ' + t.slice(0, 200));
  return t ? JSON.parse(t) : null;
}
async function secrets(): Promise<Record<string, string>> {
  const rows = await sb('app_secrets?select=k,v');
  const o: Record<string, string> = {};
  for (const r of rows || []) o[r.k] = r.v;
  return o;
}

// تاريخ وساعة القاهرة
function cairo(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, wd };
}
const norm = (s: string) => String(s || '').trim().toLowerCase();

// مين حاضر النهارده (من ابلكيشن الحضور، قراءة بس)
async function present(S: Record<string, string>, date?: string) {
  if (!S.att_url || !S.att_key) return { error: 'att_not_linked' };
  try {
    const r = await fetch(S.att_url.replace(/\/$/, '') + '/rest/v1/rpc/af_present', {
      method: 'POST',
      headers: { apikey: S.att_key, Authorization: 'Bearer ' + S.att_key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_date: date || null }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { error: 'att_failed', detail: (await r.text()).slice(0, 200) };
    const j = await r.json();
    // أسماء مختلفة بين الابلكيشنين (مثلاً Gamal في الحضور = Gamy هنا)
    let alias: Record<string, string> = {};
    try { alias = JSON.parse(S.att_alias || '{}'); } catch { /* */ }
    const fix = (n: string) => alias[norm(n)] || n;
    return {
      date: j.date,
      present: (j.present || []).map((x: any) => ({ ...x, name: fix(x.name) })),
      on_leave: (j.on_leave || []).map(fix),
      all: (j.all || []).map(fix),
      shift_hours: Number(j.shift_hours) || 12,
      shifts: (j.shifts || []).map((x: any) => ({ name: fix(x.name), start: x.start || '09:00' })),
    };
  } catch (e) { return { error: 'att_failed', detail: String(e).slice(0, 200) }; }
}

function taskLine(l: any) {
  const j = l.jobs || {};
  const car = (j.cars && j.cars.name) || (j.drivers && j.drivers.name) || '';
  return `• ${l.title}${car ? ' — ' + car : ''} (${j.ref || ''})`;
}

// يبعت إشعار لأجهزة ناس معينة، ويمسح الأجهزة اللي اتشالت
async function pushTo(S: Record<string, string>, subs: any[], to: (s: any) => boolean, msg: any, dead: string[]) {
  let n = 0;
  for (const s of subs || []) {
    if (!to(s)) continue;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 3600 * 6 });
      n++;
    } catch (e: any) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) dead.push(s.endpoint);
    }
  }
  return n;
}
// مفاتيح الإشعارات: بتتعمل هنا أول مرة وتتحفظ في app_secrets (محدش بيشوف السري)
async function vapid(S: Record<string, string>) {
  if (!S.vapid_public || !S.vapid_private) {
    const k = webpush.generateVAPIDKeys();
    await sb('app_secrets?on_conflict=k', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify([{ k: 'vapid_public', v: k.publicKey }, { k: 'vapid_private', v: k.privateKey }]) });
    Object.assign(S, await secrets());
  }
  if (!S.vapid_public || !S.vapid_private) return false;
  webpush.setVapidDetails(S.vapid_subject || 'mailto:admin@affabworks.com', S.vapid_public, S.vapid_private);
  return true;
}
async function saveMsgs(rows: any[]) {
  if (rows.length) await sb('staff_msgs', { method: 'POST', body: JSON.stringify(rows), headers: { Prefer: 'return=minimal' } });
}

// الإدارة وزّعت شغل: كل موظف يجيله رسالة وإشعار بشغله على العربية دي فوراً
// أو موظف قال إن فيه مشكلة: الإدارة يجيلها إشعار
async function notify(body: any, me: any) {
  const S = await secrets();
  const ok = await vapid(S);
  const subs = ok ? await sb('push_subs?select=endpoint,staff_id,is_admin,p256dh,auth') : [];
  const dead: string[] = [];
  let sent = 0;
  if (body.problem_line && typeof body.problem_line === 'string' && /^[0-9a-f-]{36}$/.test(body.problem_line)) {
    const l = (await sb('job_lines?id=eq.' + body.problem_line + '&select=title,problem,jobs(ref,cars(name))'))[0];
    if (l && l.problem) {
      sent += await pushTo(S, subs, (s) => s.is_admin, { title: '⚠️ ' + (me.name || 'موظف') + ': مشكلة', body: `«${l.title}» (${l.jobs?.ref || ''}${l.jobs?.cars?.name ? ' · ' + l.jobs.cars.name : ''})\n${l.problem}`, url: './?ai=1', tag: 'problem-' + body.problem_line }, dead);
    }
  }
  // v25: خطوة خلصت ← اللي عليه الخطوة اللي بعدها يجيله إشعار «دورك»
  if (body.turn_job && typeof body.turn_job === 'string' && /^[0-9a-f-]{36}$/.test(body.turn_job)) {
    const since = new Date(Date.now() - 5 * 60e3).toISOString();
    const msgs = await sb('staff_msgs?kind=eq.turn&job_id=eq.' + body.turn_job + '&created_at=gte.' + encodeURIComponent(since) + '&select=id,staff_id,body');
    for (const m of msgs || []) {
      const [t, ...rest] = String(m.body).split('\n');
      sent += await pushTo(S, subs, (s) => s.staff_id === m.staff_id, { title: t.slice(0, 80), body: rest.join('\n'), url: './?ai=1', tag: 'turn-' + m.id }, dead);
    }
  }
  const jobs = (Array.isArray(body.jobs) ? body.jobs : []).filter((x: any) => typeof x === 'string' && /^[0-9a-f-]{36}$/.test(x)).slice(0, 10);
  if (jobs.length && me.kind === 'admin') {
    const only = (Array.isArray(body.staff) ? body.staff : []).filter((x: any) => typeof x === 'string');
    const lines = await sb('job_lines?kind=eq.task&done=eq.false&waiting=eq.false&staff_id=not.is.null&job_id=in.(' + jobs.join(',') + ')'
      + '&select=id,title,plan_date,staff_id,job_id,jobs(ref,cars(name),drivers(name))&order=sort.asc,created_at.asc');
    const staff = await sb('staff?active=eq.true&select=id,name');
    const today = cairo().date;
    const rows: any[] = [];
    for (const st of staff || []) {
      if (only.length && !only.includes(st.id)) continue;
      for (const jid of jobs) {
        const mine = (lines || []).filter((l: any) => l.staff_id === st.id && l.job_id === jid);
        if (!mine.length) continue;
        const j = mine[0].jobs || {};
        const car = (j.cars && j.cars.name) || '';
        const drv = (j.drivers && j.drivers.name) || '';
        const list = mine.map((l: any, i: number) => `${i + 1}) ${l.title}${l.plan_date && l.plan_date !== today ? ' (' + l.plan_date.slice(8) + '/' + l.plan_date.slice(5, 7) + ')' : ''}`).join('\n');
        const text = `يا ${st.name}، عندك على ${car ? 'عربية ' + car : j.ref}${drv ? ' بتاعة ' + drv : ''} (${j.ref}):\n${list}\nلما تخلص حاجة دوس «خلصت»، ولو فيه مشكلة أو اشتريت حاجة قولّي.`;
        rows.push({ staff_id: st.id, kind: 'task', body: text, job_id: jid, line_ids: mine.map((l: any) => l.id) });
        sent += await pushTo(S, subs, (s) => s.staff_id === st.id, { title: 'شغل جديد · ' + (car || j.ref), body: list, url: './?ai=1', tag: 'job-' + jid }, dead);
      }
    }
    await saveMsgs(rows);
  }
  for (const e of dead) await sb('push_subs?endpoint=eq.' + encodeURIComponent(e), { method: 'DELETE' });
  return { ok: true, sent };
}

async function tick(body: any): Promise<Response> {
  const S = await secrets();
  if (!S.cron_key || body.key !== S.cron_key) return json({ error: 'unauthorized' }, 401);
  const now = cairo();
  const hour = Number.isInteger(body.hour) ? body.hour : now.hour;
  const off = (S.off_days || '5').split(',').map((x) => Number(x.trim()));
  if (off.includes(now.wd) && !body.force) return json({ ok: true, skipped: 'off_day' });

  await vapid(S);
  const today = now.date;
  const staff = await sb('staff?active=eq.true&select=id,name');
  const subs = await sb('push_subs?select=endpoint,staff_id,is_admin,p256dh,auth');
  const open = await sb('job_lines?kind=eq.task&done=eq.false&waiting=eq.false&staff_id=not.is.null'
    + '&select=id,title,plan_date,staff_id,problem,jobs!inner(ref,title,status,due_date,cars(name),drivers(name))'
    + '&jobs.status=not.in.(delivered,cancelled)&order=plan_date.asc.nullslast');
  const doneToday = await sb('job_lines?kind=eq.task&done=eq.true&done_at=gte.' + encodeURIComponent(today + 'T00:00:00+02:00')
    + '&select=title,done_by,jobs(ref)');
  const att: any = await present(S, today);
  // مواعيد كل موظف من ابلكيشن الحضور: أول الشيفت = شغلك النهارده، نصه = خلصت إيه، آخره = قبل ما تمشي
  const H = att.error ? 8 : Math.max(4, Math.min(14, att.shift_hours || 12));
  const startOf = (name: string) => {
    const x = !att.error && (att.shifts || []).find((z: any) => norm(z.name) === norm(name));
    return x ? Number(String(x.start).split(':')[0]) || 9 : 9;
  };
  const slotFor = (start: number) => hour === start ? 'morning' : hour === start + Math.floor(H / 2) ? 'midday' : hour === start + H - 1 ? 'evening' : '';
  const starts = (staff || []).map((s: any) => startOf(s.name));
  const first = starts.length ? Math.min(...starts) : 9, last = starts.length ? Math.max(...starts) : 9;
  const adminSlot = hour === first ? 'morning' : hour === last + H - 1 ? 'evening' : hour === first + Math.floor(H / 2) ? 'midday' : '';
  const isIn = (name: string) => !att.error && (att.present || []).some((p: any) => norm(p.name) === norm(name));
  const onLeave = (name: string) => !att.error && (att.on_leave || []).some((n: string) => norm(n) === norm(name));

  const sent: string[] = [], dead: string[] = [], rows: any[] = [];
  // كل إشعار بيتسجل كمان رسالة في شات المدير مع الشخص ده، عشان يرد عليها هناك
  async function send(to: (s: any) => boolean, msg: { title: string; body: string; url: string; tag: string }, staffId: string | null = null, kind = 'ask') {
    rows.push({ staff_id: staffId, kind, body: msg.title + '\n' + msg.body });
    const n = await pushTo(S, subs, to, msg, dead);
    for (let i = 0; i < n; i++) sent.push(msg.tag);
  }

  const alerts: string[] = [];
  for (const st of staff || []) {
    const slot = slotFor(startOf(st.name));
    if (!slot && !adminSlot) continue;
    const mine = (open || []).filter((l: any) => l.staff_id === st.id);
    const now_ = mine.filter((l: any) => !l.plan_date || l.plan_date <= today);
    const late = mine.filter((l: any) => l.plan_date && l.plan_date < today);
    if (onLeave(st.name) || (slot !== 'morning' && !att.error && !isIn(st.name))) {
      if (now_.length && slot !== 'evening') alerts.push(`${st.name} ${onLeave(st.name) ? 'أجازة' : 'مش موجود'} وعنده ${now_.length} شغلانة`);
      continue;
    }
    if (!now_.length || !slot) continue;
    const list = now_.slice(0, 6).map(taskLine).join('\n') + (now_.length > 6 ? `\n+ ${now_.length - 6} كمان` : '');
    const to = (s: any) => s.staff_id === st.id;
    if (slot === 'morning') {
      await send(to, { title: `صباح الخير يا ${st.name} 👋`, body: `شغلك النهارده (${now_.length}):\n${list}`, url: './?ai=1', tag: 'morning' }, st.id, 'task');
    } else if (slot === 'midday') {
      await send(to, { title: 'خلصت إيه لحد دلوقتي؟', body: `لسه عندك ${now_.length}${late.length ? ` (منهم ${late.length} متأخر)` : ''}:\n${list}\nقولّي خلصت إيه، ولو فيه حاجة واقفاك أو اشتريت حاجة (بكام ومنين).`, url: './?ai=1', tag: 'midday' }, st.id);
    } else {
      await send(to, { title: 'قبل ما تمشي ✅', body: `قولّي خلصت إيه النهارده، وصرفت حاجة؟ لسه مفتوح:\n${list}`, url: './?ai=1', tag: 'evening' }, st.id);
    }
  }

  const admin = (s: any) => s.is_admin;
  const slot = adminSlot;
  if (slot === 'morning') {
    const parts: string[] = [];
    if (att.error) parts.push('مش قادر أوصل لابلكيشن الحضور.');
    else {
      parts.push(`حاضر: ${(att.present || []).map((p: any) => p.name).join('، ') || 'لسه محدش'}`);
      if ((att.on_leave || []).length) parts.push(`أجازة: ${att.on_leave.join('، ')}`);
    }
    const todayN = (open || []).filter((l: any) => !l.plan_date || l.plan_date <= today).length;
    parts.push(`شغل النهارده: ${todayN} شغلانة`);
    // عربيات ميعاد تسليمها النهارده أو بكرة ولسه عليها شغل
    const tmr = new Date(Date.parse(today + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
    const risk: Record<string, number> = {};
    for (const l of open || []) if (l.jobs && l.jobs.due_date && l.jobs.due_date <= tmr) risk[l.jobs.ref + (l.jobs.cars?.name ? ' ' + l.jobs.cars.name : '')] = (risk[l.jobs.ref + (l.jobs.cars?.name ? ' ' + l.jobs.cars.name : '')] || 0) + 1;
    if (Object.keys(risk).length) parts.push('⏰ تسليم قرّب ولسه فيه شغل: ' + Object.entries(risk).map(([k, n]) => `${k} (${n})`).join('، '));
    if (alerts.length) parts.push('⚠️ ' + alerts.join(' — '));
    await send(admin, { title: 'صباح الخير — خطة النهارده', body: parts.join('\n'), url: './?my=1', tag: 'admin-morning' }, null, 'info');
  } else if (slot === 'evening') {
    const by: Record<string, number> = {};
    for (const d of doneToday || []) by[d.done_by || '؟'] = (by[d.done_by || '؟'] || 0) + 1;
    const lateN = (open || []).filter((l: any) => l.plan_date && l.plan_date <= today).length;
    const lines = [
      `اتعمل النهارده: ${(doneToday || []).length} شغلانة` + (Object.keys(by).length ? ' (' + Object.entries(by).map(([n, c]) => `${n} ${c}`).join('، ') + ')' : ''),
      `لسه مخلصش من خطة النهارده: ${lateN}`,
    ];
    const probs = (open || []).filter((l: any) => l.problem);
    if (probs.length) lines.push('🛑 واقف: ' + probs.slice(0, 5).map((l: any) => `${l.title} (${l.jobs?.ref}): ${l.problem}`).join(' — '));
    const spent = await sb('expenses?spent_on=eq.' + today + '&select=price,shop,staff_name');
    if ((spent || []).length) {
      const tot = spent.reduce((a: number, x: any) => a + Number(x.price || 0), 0);
      lines.push(`💸 اتصرف النهارده: ${Math.round(tot).toLocaleString('en')} جنيه (${spent.length} حاجة)`);
    }
    if (alerts.length) lines.push('⚠️ ' + alerts.join(' — '));
    await send(admin, { title: 'ملخص النهارده', body: lines.join('\n'), url: './?ai=1', tag: 'admin-evening' }, null, 'info');
  } else if (alerts.length) {
    await send(admin, { title: 'تنبيه', body: alerts.join('\n'), url: './?my=1', tag: 'admin-alert' }, null, 'alert');
  }
  await saveMsgs(rows);

  for (const e of dead) await sb('push_subs?endpoint=eq.' + encodeURIComponent(e), { method: 'DELETE' });
  return json({ ok: true, hour, slot, sent: sent.length, dead: dead.length });
}
