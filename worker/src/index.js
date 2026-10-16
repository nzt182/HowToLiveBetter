import { adminPage } from './admin.js';

const MAX_BODY_BYTES = 4096;
const MAX_PAGE_LENGTH = 1024;
const DEFAULT_SITE = 'https://nzt182.github.io/HowToLiveBetter/';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

function siteUrl(env) {
  const url = new URL(env.PUBLIC_SITE_URL || DEFAULT_SITE);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new HttpError(503, '站点配置无效');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

function allowedOrigins(env) {
  const origins = (env.ALLOWED_ORIGINS || siteUrl(env).origin).split(',').map((value) => value.trim());
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) {
      throw new HttpError(503, '来源配置无效');
    }
  }
  return origins;
}

function retentionDays(env) {
  const value = Number(env.RETENTION_DAYS || 30);
  if (!Number.isInteger(value) || value < 1 || value > 365) {
    throw new HttpError(503, '保存期限配置无效');
  }
  return value;
}

function cutoffDate(env, now = Date.now()) {
  return beijingTime(now - retentionDays(env) * 86400000);
}

// 先解析真实时刻，再只调整表示时区；已有 +08:00 字符串不会被重复加 8 小时。
export function beijingTime(value = Date.now()) {
  return new Date(new Date(value).getTime() + 8 * 3600000).toISOString().replace('Z', '+08:00');
}

// 升级期间兼容旧 Z 数据；保留原 visited_at 索引及直接列范围比较。
function addTimeCondition(conditions, values, operator, time) {
  conditions.push('((visited_at ' + operator + " ? AND substr(visited_at, -6) = '+08:00') OR (visited_at " + operator + " ? AND substr(visited_at, -1) = 'Z'))");
  values.push(time, new Date(time).toISOString());
}

// 仅接受本站真实页面及受控的虚拟页；查询参数从不入库。
export function normalizePage(value, env) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.length > MAX_PAGE_LENGTH || /[\s\\\u0000-\u001f\u007f]/u.test(value)) {
    throw new HttpError(400, '访问页面无效');
  }
  const site = siteUrl(env);
  const page = new URL(value, site.origin);
  const base = site.pathname;
  if (page.origin !== site.origin || ![base, base.slice(0, -1), base + 'index.html'].includes(page.pathname)) {
    throw new HttpError(400, '访问页面不属于本站');
  }
  const hash = page.hash.slice(1);
  if (hash && !/^e-\d+-\d+$/.test(hash) && !/^sec-\d+$/.test(hash)) {
    if (!hash.startsWith('docs/')) throw new HttpError(400, '页面锚点无效');
    let filename;
    try {
      filename = decodeURIComponent(hash.slice(5));
    } catch {
      throw new HttpError(400, '文档页面无效');
    }
    if (!filename.endsWith('.md') || filename.length <= 3 || /[/\\\u0000-\u001f\u007f]/u.test(filename)) {
      throw new HttpError(400, '文档页面无效');
    }
    return base + '#docs/' + encodeURIComponent(filename);
  }
  return base + (hash ? '#' + hash : '');
}

async function readBody(request) {
  const contentType = (request.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
  if (!['text/plain', 'application/json'].includes(contentType)) {
    throw new HttpError(415, '请求应使用 text/plain 或 application/json');
  }
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) throw new HttpError(413, '请求内容过大');
  if (!request.body) throw new HttpError(400, '请求内容为空');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new HttpError(413, '请求内容过大');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, '请求不是有效 JSON');
  }
}

function visitorIp(request) {
  // Cloudflare 边缘会设置该头；不使用 body.ip、X-Forwarded-For 或客户端时间。
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || ip.length > 45) throw new HttpError(400, '缺少可信的访客 IP');
  if (ip.includes(':')) {
    try {
      new URL('http://[' + ip + ']/');
      return ip;
    } catch {
      throw new HttpError(400, '访客 IP 无效');
    }
  }
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ip.split('.').some((part) => Number(part) > 255)) {
    throw new HttpError(400, '访客 IP 无效');
  }
  return ip;
}

function deviceId(value, required = false) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    if (required) throw new HttpError(400, '设备 ID 不能为空');
    return null;
  }
  if (typeof value !== 'string') throw new HttpError(400, '设备 ID 必须为 UUID v4');
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw new HttpError(400, '设备 ID 必须为 UUID v4');
  }
  return normalized;
}

function collectHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || !allowedOrigins(env).includes(origin)) throw new HttpError(403, '不允许此来源');
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
}

function apiHeaders(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, '管理接口仅允许同源访问');
  return origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}

async function authenticate(request, env) {
  if (typeof env.ADMIN_TOKEN !== 'string' || !env.ADMIN_TOKEN.trim()) throw new HttpError(503, '管理员密钥尚未配置');
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization') || '');
  if (!match) throw new HttpError(401, '需要管理员认证');
  const encoder = new TextEncoder();
  const [given, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(match[1])),
    crypto.subtle.digest('SHA-256', encoder.encode(env.ADMIN_TOKEN)),
  ]);
  const givenBytes = new Uint8Array(given);
  const expectedBytes = new Uint8Array(expected);
  let difference = 0;
  for (let i = 0; i < expectedBytes.length; i++) difference |= expectedBytes[i] ^ givenBytes[i];
  if (difference !== 0) throw new HttpError(401, '管理员认证失败');
}

function positiveInteger(params, key, fallback, max = Number.MAX_SAFE_INTEGER) {
  if (!params.has(key)) return fallback;
  const raw = params.get(key);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > max) throw new HttpError(400, key + ' 参数无效');
  return value;
}

function isoDate(raw, name) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|\+08:00)$/.test(raw)) throw new HttpError(400, name + ' 必须为带 Z 或 +08:00 的 ISO 时间');
  const value = new Date(raw);
  if (!Number.isFinite(value.getTime())) throw new HttpError(400, name + ' 时间无效');
  const canonical = raw.endsWith('Z') ? value.toISOString() : beijingTime(value);
  if (canonical.replace('.000', '') !== raw.replace('.000', '')) {
    throw new HttpError(400, name + ' 时间无效');
  }
  return beijingTime(value);
}

async function listVisits(request, env) {
  const params = new URL(request.url).searchParams;
  const limit = positiveInteger(params, 'limit', 100, 500);
  const beforeId = positiveInteger(params, 'before_id', undefined);
  const conditions = [];
  const values = [];
  addTimeCondition(conditions, values, '>=', cutoffDate(env));
  if (beforeId !== undefined) {
    conditions.push('id < ?');
    values.push(beforeId);
  }
  const since = params.has('since') ? isoDate(params.get('since'), 'since') : undefined;
  const until = params.has('until') ? isoDate(params.get('until'), 'until') : undefined;
  if (since && until && since > until) throw new HttpError(400, '开始时间不能晚于结束时间');
  if (since) addTimeCondition(conditions, values, '>=', since);
  if (until) addTimeCondition(conditions, values, '<=', until);
  if (params.has('ip')) {
    const ip = params.get('ip');
    visitorIp(new Request(request.url, { headers: { 'CF-Connecting-IP': ip } }));
    conditions.push('ip = ?');
    values.push(ip);
  }
  if (params.has('page')) {
    conditions.push('page = ?');
    values.push(normalizePage(params.get('page'), env));
  }
  const visitorType = params.get('visitor_type') ?? 'all';
  if (!['all', 'self', 'other', 'unknown'].includes(visitorType)) throw new HttpError(400, '访客类型无效');
  if (visitorType === 'self') conditions.push('owner_devices.device_id IS NOT NULL');
  if (visitorType === 'other') conditions.push('(visits.device_id IS NOT NULL AND owner_devices.device_id IS NULL)');
  if (visitorType === 'unknown') conditions.push('visits.device_id IS NULL');
  const result = await env.DB.prepare(
    "SELECT visits.id, visits.ip, visits.visited_at, visits.page, visits.device_id, CASE WHEN visits.device_id IS NULL THEN 'unknown' WHEN owner_devices.device_id IS NOT NULL THEN 'self' ELSE 'other' END AS visitor_type, owner_devices.label AS device_label FROM visits LEFT JOIN owner_devices ON visits.device_id = owner_devices.device_id WHERE " + conditions.join(' AND ') + ' ORDER BY visits.id DESC LIMIT ?',
  ).bind(...values, limit + 1).all();
  const visits = result.results.slice(0, limit).map((row) => ({ ...row, visited_at: beijingTime(row.visited_at) }));
  const nextBeforeId = result.results.length > limit ? visits.at(-1).id : null;
  return { visits, next_before_id: nextBeforeId, retention_days: retentionDays(env) };
}

async function manageDevices(request, env) {
  if (request.method === 'GET') {
    const result = await env.DB.prepare('SELECT device_id, label, created_at FROM owner_devices ORDER BY created_at DESC, device_id').all();
    return {
      devices: result.results.map((device) => ({ ...device, created_at: beijingTime(device.created_at) })),
      setup_url: new URL('visitor-device.html', siteUrl(env)).href,
    };
  }
  const body = await readBody(request);
  const id = deviceId(body.device_id, true);
  if (request.method === 'POST') {
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    if (!label || label.length > 60) throw new HttpError(400, '设备名称不能为空且不能超过 60 个字符');
    await env.DB.prepare('INSERT INTO owner_devices (device_id, label, created_at) VALUES (?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET label = excluded.label')
      .bind(id, label, beijingTime()).run();
  } else {
    await env.DB.prepare('DELETE FROM owner_devices WHERE device_id = ?').bind(id).run();
  }
  return { ok: true };
}

export async function deleteExpiredVisits(env, now = Date.now()) {
  const conditions = [];
  const values = [];
  addTimeCondition(conditions, values, '<', cutoffDate(env, now));
  return env.DB.prepare('DELETE FROM visits WHERE ' + conditions[0]).bind(...values).run();
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    let headers = {};
    try {
      if (path === '/collect') {
        headers = collectHeaders(request, env);
        if (request.method === 'OPTIONS') {
          return new Response(null, {
            status: 204,
            headers: {
              ...headers,
              'Access-Control-Allow-Methods': 'POST',
              'Access-Control-Allow-Headers': 'Content-Type',
              'Access-Control-Max-Age': '600',
              'Cache-Control': 'no-store',
            },
          });
        }
        if (request.method !== 'POST') return json({ error: '此接口只支持 POST' }, 405, { ...headers, Allow: 'POST, OPTIONS' });
        const body = await readBody(request);
        const page = normalizePage(body.page, env);
        const ip = visitorIp(request);
        const id = deviceId(body.device_id);
        await env.DB.prepare('INSERT INTO visits (ip, visited_at, page, device_id) VALUES (?, ?, ?, ?)')
          .bind(ip, beijingTime(), page, id).run();
        return new Response(null, { status: 204, headers: { ...headers, 'Cache-Control': 'no-store' } });
      }
      if (path === '/api/visits') {
        headers = apiHeaders(request);
        await authenticate(request, env);
        if (request.method !== 'GET') return json({ error: '此接口只支持 GET' }, 405, { ...headers, Allow: 'GET' });
        return json(await listVisits(request, env), 200, headers);
      }
      if (path === '/api/devices') {
        headers = apiHeaders(request);
        await authenticate(request, env);
        if (!['GET', 'POST', 'DELETE'].includes(request.method)) {
          return json({ error: '此接口只支持 GET、POST 或 DELETE' }, 405, { ...headers, Allow: 'GET, POST, DELETE' });
        }
        return json(await manageDevices(request, env), 200, headers);
      }
      if (path === '/admin' || path === '/admin/') {
        if (request.method !== 'GET') return json({ error: '此页面只支持 GET' }, 405, { Allow: 'GET' });
        const nonce = crypto.randomUUID();
        return new Response(adminPage(nonce), {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            'X-Frame-Options': 'DENY',
            'Content-Security-Policy': "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'nonce-" + nonce + "'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          },
        });
      }
      return json({ error: '接口不存在' }, 404);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status, headers);
      // 错误日志不输出请求、IP、密钥或数据库绑定值。
      console.error('访问记录服务请求失败');
      return json({ error: '访问记录服务暂时不可用' }, 503, headers);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(deleteExpiredVisits(env, event.scheduledTime));
  },
};
