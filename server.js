import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const envFile = await readFile(join(root, '.env'), 'utf8').catch(() => '');
for (const line of envFile.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (!match || process.env[match[1]] !== undefined) continue;
  process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
}
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.CLAUDE_API_KEY;
const bitrixUrl = process.env.BITRIX24_API_URL;
const MODEL = 'claude-haiku-4-5-20251001';

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 32_000) throw new Error('So‘rov hajmi juda katta.');
  }
  return JSON.parse(raw || '{}');
}

function bitrixMethod(url) {
  try {
    const pathname = new URL(url).pathname;
    return pathname.match(/\/([^/]+)\.json\/?$/)?.[1] || 'crm.lead.list';
  } catch {
    return 'crm.lead.list';
  }
}

function intentFor(text) {
  const q = text.toLocaleLowerCase('uz');
  const methods = [
    { method: 'crm.lead.list', terms: ['lid', 'lead', 'potensial', 'murojaat', 'so‘rov', 'sorov'] },
    { method: 'crm.deal.list', terms: ['bitim', 'deal', 'savdo', 'shartnoma'] },
    { method: 'crm.contact.list', terms: ['kontakt', 'aloqa', 'telefon raqam'] },
    { method: 'crm.company.list', terms: ['kompaniya', 'tashkilot', 'korxona', 'firma'] },
    { method: 'crm.activity.list', terms: ['faoliyat', 'vazifa', 'aktivlik', 'qo‘ng‘iroq', 'uchrashuv'] },
    { method: 'user.get', terms: ['xodim', 'foydalanuvchi', 'user', 'hamkasb'] },
  ];
  return methods.find(({ terms }) => terms.some((term) => q.includes(term)))?.method || null;
}

async function callBitrix(text) {
  if (!bitrixUrl) throw new Error('BITRIX24_API_URL sozlanmagan.');
  const endpoint = new URL(bitrixUrl);
  const method = intentFor(text) || bitrixMethod(bitrixUrl);
  const methodPath = `${method}.json`;
  // Incoming webhooks may be saved either as /rest/user/token/ or as a full
  // method URL. Always replace only the method after the webhook token.
  const restIndex = endpoint.pathname.indexOf('/rest/');
  if (restIndex < 0) throw new Error('BITRIX24_API_URL webhook URL ko‘rinishida emas. /rest/USER_ID/WEBHOOK_TOKEN/ formatini tekshiring.');
  const webhookBase = endpoint.pathname.slice(0, restIndex) + endpoint.pathname.slice(restIndex).replace(/^\/rest\/[^/]+\/[^/]+(?:\/[^/]*)?\/?$/, (match) => {
    const parts = match.split('/').filter(Boolean);
    return `/rest/${parts[1]}/${parts[2]}`;
  });
  if (webhookBase === endpoint.pathname && /\/[^/]+\.json\/?$/.test(endpoint.pathname)) {
    endpoint.pathname = endpoint.pathname.replace(/\/[^/]+\.json\/?$/, `/${methodPath}`);
  } else {
    endpoint.pathname = `${webhookBase.replace(/\/$/, '')}/${methodPath}`;
  }
  const response = await fetch(endpoint, { method: 'GET', signal: AbortSignal.timeout(20_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const detail = data.error_description || data.error || `HTTP ${response.status}`;
    console.error(`Bitrix ${method} (${response.status}): ${detail}`);
    if (/higher privileges|insufficient permissions|access denied/i.test(detail)) {
      throw new Error('Bitrix webhook’da CRM ma’lumotlarini o‘qish huquqi yo‘q. Bitrix24’da administrator sifatida CRM o‘qish ruxsatiga ega yangi incoming webhook yarating va BITRIX24_API_URL ni yangi URL bilan yangilang.');
    }
    throw new Error(`Bitrix ${method}: ${detail}`);
  }
  return { method, data };
}

async function askClaude(text, context = '') {
  if (!apiKey) throw new Error('CLAUDE_API_KEY sozlanmagan.');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 900,
      system: context
        ? 'Siz o‘zbek tilida javob beradigan Bitrix24 yordamchisiz. Bitrixdan olingan JSON ma’lumotni tahlil qiling, faqat undagi dalillarga tayaning. Natijani qisqa, tushunarli qilib bayon qiling. Ma’lumot topilmasa, buni ochiq ayting.'
        : 'Siz o‘zbek tilida javob beradigan yordamchisiz. Oddiy savollarga aniq va ixcham javob bering. Bitrix ma’lumotiga muhtoj bo‘lgan savol bo‘lsa, foydalanuvchidan qaysi obyekt (lid, bitim, kontakt yoki kompaniya) kerakligini aniqlashtiring.',
      messages: [{ role: 'user', content: context ? `Savol: ${text}\n\nBitrix ma’lumoti:\n${context}` : text }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = result.error?.message || `Claude so‘rovi bajarilmadi (${response.status}).`;
    console.error(`Anthropic API ${response.status}: ${detail}`);
    throw new Error(response.status === 401 || response.status === 403
      ? 'Claude API kaliti yaroqsiz yoki bu model uchun ruxsat yo‘q. .env dagi CLAUDE_API_KEY ni tekshiring.'
      : response.status === 404
        ? `Claude API modelni topmadi (${MODEL}). Serverni qayta ishga tushiring va model sozlamasini tekshiring.`
        : detail);
  }
  return result.content?.filter((part) => part.type === 'text').map((part) => part.text).join('\n') || 'Javob bo‘sh qaytdi.';
}

async function handleChat(req, res) {
  try {
    const { message } = await body(req);
    if (typeof message !== 'string' || !message.trim()) return json(res, 400, { error: 'Savol matnini kiriting.' });
    if (message.length > 4000) return json(res, 400, { error: 'Savol 4000 belgidan oshmasin.' });
    const query = message.trim();
    const method = intentFor(query);
    if (method) {
      const { data } = await callBitrix(query);
      const rows = Array.isArray(data.result) ? data.result : data.result ? [data.result] : [];
      const clipped = JSON.stringify(rows.slice(0, 30)).slice(0, 18_000);
      const answer = await askClaude(query, clipped || 'Natija topilmadi.');
      return json(res, 200, { answer, source: 'Bitrix24', method, count: rows.length });
    }
    const answer = await askClaude(query);
    return json(res, 200, { answer, source: 'Claude Haiku' });
  } catch (error) {
    const message = error.name === 'TimeoutError' ? 'Ulanish vaqti tugadi. Qayta urinib ko‘ring.' : error.message || 'Kutilmagan xatolik yuz berdi.';
    return json(res, 500, { error: message });
  }
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/chat') return handleChat(req, res);
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const path = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  const file = normalize(join(root, 'public', path));
  if (!file.startsWith(join(root, 'public'))) return json(res, 403, { error: 'Forbidden' });
  try {
    const content = await readFile(file);
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
    res.end(content);
  } catch {
    json(res, 404, { error: 'Not found' });
  }
});

server.listen(port, () => console.log(`Bitrix AI chat: http://localhost:${port}`));
