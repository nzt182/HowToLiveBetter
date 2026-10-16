import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import worker, { beijingTime, deleteExpiredVisits } from '../src/index.js';

const ORIGIN = 'https://nzt182.github.io';
const BASE_ENV = {
  PUBLIC_SITE_URL: ORIGIN + '/HowToLiveBetter/',
  ALLOWED_ORIGINS: ORIGIN,
  RETENTION_DAYS: '30',
  ADMIN_TOKEN: 'a-test-only-secret-never-used-in-production',
};

function database(rows = []) {
  const statements = [];
  return {
    rows,
    statements,
    prepare(sql) {
      const statement = { sql, values: [] };
      statements.push(statement);
      return {
        bind(...values) { statement.values = values; return this; },
        async run() { return { success: true }; },
        async all() { return { success: true, results: rows }; },
      };
    },
  };
}

function collect(page, headers = {}, body = {}) {
  return new Request('https://visitor-log.example/collect', {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'text/plain;charset=UTF-8', 'CF-Connecting-IP': '203.0.113.21', ...headers },
    body: JSON.stringify({ page, ...body }),
  });
}

function api(query = '', headers = {}) {
  return new Request('https://visitor-log.example/api/visits' + query, {
    headers: { Authorization: 'Bearer ' + BASE_ENV.ADMIN_TOKEN, ...headers },
  });
}

test('记录边缘 IP 和服务端时间，去掉 query；不回显私人字段', async () => {
  const DB = database();
  const before = Date.now();
  const response = await worker.fetch(collect('/HowToLiveBetter/?q=private#e-1-1', {}, { ip: '1.1.1.1', visited_at: '1900-01-01' }), { ...BASE_ENV, DB });
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const statement = DB.statements[0];
  assert.equal(statement.sql, 'INSERT INTO visits (ip, visited_at, page, device_id) VALUES (?, ?, ?, ?)');
  assert.equal(statement.values[0], '203.0.113.21');
  assert.equal(statement.values[2], '/HowToLiveBetter/#e-1-1');
  assert.equal(statement.values[3], null);
  assert.ok(Date.parse(statement.values[1]) >= before);
  assert.ok(Date.parse(statement.values[1]) <= Date.now());
  assert.match(statement.values[1], /\.\d{3}\+08:00$/);
});

test('没有边缘 IP 时拒绝，不用 body.ip 或 X-Forwarded-For 代替', async () => {
  const DB = database();
  const request = collect('/HowToLiveBetter/', { 'X-Forwarded-For': '198.51.100.11' }, { ip: '1.1.1.1' });
  request.headers.delete('CF-Connecting-IP');
  assert.equal((await worker.fetch(request, { ...BASE_ENV, DB })).status, 400);
  assert.equal(DB.statements.length, 0);
});

test('接受 IPv6 和 application/json，中文文档 hash 规范编码', async () => {
  const DB = database();
  const response = await worker.fetch(collect('/HowToLiveBetter/#docs/' + encodeURIComponent('如何选工作.md'), {
    'CF-Connecting-IP': '2001:db8::9', 'Content-Type': 'application/json',
  }), { ...BASE_ENV, DB });
  assert.equal(response.status, 204);
  assert.equal(DB.statements[0].values[0], '2001:db8::9');
  assert.equal(DB.statements[0].values[2], '/HowToLiveBetter/#docs/' + encodeURIComponent('如何选工作.md'));
});

test('index.html 入口和不带末尾斜线入口规范化成同一页面', async () => {
  const DB = database();
  for (const page of ['/HowToLiveBetter/index.html#sec-1', '/HowToLiveBetter#sec-1']) {
    assert.equal((await worker.fetch(collect(page), { ...BASE_ENV, DB })).status, 204);
  }
  assert.deepEqual(DB.statements.map((statement) => statement.values[2]), [
    '/HowToLiveBetter/#sec-1', '/HowToLiveBetter/#sec-1',
  ]);
});

test('拒绝其他来源、本站以外路径及非法文档，不写数据库', async () => {
  const DB = database();
  const requests = [
    [collect('/HowToLiveBetter/', { Origin: 'https://evil.example' }), 403],
    [collect('/HowToLiveBetter/', { Origin: 'null' }), 403],
    [collect('/different/'), 400],
    [collect('//evil.example/HowToLiveBetter/'), 400],
    [collect('/HowToLiveBetter/#unexpected'), 400],
    [collect('/HowToLiveBetter/#docs/%2Fsecret.md'), 400],
    [collect('/HowToLiveBetter/#docs/..%2Fsecret.md'), 400],
    [collect('/HowToLiveBetter/#docs/%zz.md'), 400],
    [collect('/HowToLiveBetter/#docs/%0A.md'), 400],
  ];
  for (const [request, status] of requests) assert.equal((await worker.fetch(request, { ...BASE_ENV, DB })).status, status);
  assert.equal(DB.statements.length, 0);
});

test('实际读取 body 时也限制大小，不能靠省略 Content-Length 绕过', async () => {
  const DB = database();
  const request = collect('/HowToLiveBetter/', {}, { large: 'x'.repeat(5000) });
  assert.equal((await worker.fetch(request, { ...BASE_ENV, DB })).status, 413);
  assert.equal((await worker.fetch(collect('/HowToLiveBetter/#' + 'x'.repeat(1024)), { ...BASE_ENV, DB })).status, 400);
  assert.equal(DB.statements.length, 0);
});

test('管理员密钥未设置、未认证或错误密钥时不可查询', async () => {
  const DB = database();
  assert.equal((await worker.fetch(api(), { ...BASE_ENV, DB, ADMIN_TOKEN: '' })).status, 503);
  const unauthenticated = api();
  unauthenticated.headers.delete('Authorization');
  assert.equal((await worker.fetch(unauthenticated, { ...BASE_ENV, DB })).status, 401);
  assert.equal((await worker.fetch(api('', { Authorization: 'Bearer invalid' }), { ...BASE_ENV, DB })).status, 401);
  assert.equal(DB.statements.length, 0);
});

test('认证后可同源或 CLI 查询，跨源即使有密钥也拒绝', async () => {
  const DB = database();
  const cli = await worker.fetch(api(), { ...BASE_ENV, DB });
  assert.equal(cli.status, 200);
  assert.equal(cli.headers.get('Cache-Control'), 'no-store');
  assert.equal(cli.headers.get('Access-Control-Allow-Origin'), null);
  const sameOrigin = await worker.fetch(api('', { Origin: 'https://visitor-log.example' }), { ...BASE_ENV, DB });
  assert.equal(sameOrigin.status, 200);
  assert.equal(sameOrigin.headers.get('Access-Control-Allow-Origin'), 'https://visitor-log.example');
  assert.equal((await worker.fetch(api('', { Origin: ORIGIN }), { ...BASE_ENV, DB })).status, 403);
});

test('查询参数绑定、最近 100 条和下一页游标', async () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({ id: 201 - index, ip: '203.0.113.21', visited_at: new Date().toISOString(), page: '/HowToLiveBetter/' }));
  const DB = database(rows);
  const params = new URLSearchParams({ before_id: '202', since: '2026-10-01T00:00:00Z', until: '2026-10-20T23:59:59.999Z', ip: '203.0.113.21', page: '/HowToLiveBetter/?ignored=1' });
  const response = await worker.fetch(api('?' + params), { ...BASE_ENV, DB });
  const data = await response.json();
  assert.equal(data.visits.length, 100);
  assert.equal(data.next_before_id, 102);
  assert.equal(data.retention_days, 30);
  assert.ok(data.visits.every((row) => row.visited_at.endsWith('+08:00')));
  const statement = DB.statements[0];
  assert.ok(statement.sql.includes('AND id < ?'));
  assert.ok(statement.sql.includes("substr(visited_at, -6) = '+08:00'"));
  assert.ok(statement.sql.includes("substr(visited_at, -1) = 'Z'"));
  assert.deepEqual(statement.values.slice(2), [202, '2026-10-01T08:00:00.000+08:00', '2026-10-01T00:00:00.000Z', '2026-10-21T07:59:59.999+08:00', '2026-10-20T23:59:59.999Z', '203.0.113.21', '/HowToLiveBetter/', 101]);
  assert.ok(!statement.sql.includes('203.0.113.21'));
});

test('拒绝过大的 limit、无效日期、反向日期范围和 SQL 注入参数', async () => {
  const DB = database();
  const queries = [
    '?limit=501', '?limit=0', '?limit=1.5', '?before_id=0',
    '?before_id=1%20OR%201%3D1', '?since=2026-02-30T00:00:00Z',
    '?since=2026-10-20T00:00:00Z&until=2026-10-01T00:00:00Z',
    '?ip=%27%20OR%201%3D1',
  ];
  for (const query of queries) assert.equal((await worker.fetch(api(query), { ...BASE_ENV, DB })).status, 400);
  assert.equal(DB.statements.length, 0);
});

test('每日留存任务只删除 30 天前，截止时间通过参数绑定', async () => {
  const DB = database();
  const now = Date.parse('2026-10-14T19:00:00Z');
  await deleteExpiredVisits({ ...BASE_ENV, DB }, now);
  assert.ok(DB.statements[0].sql.startsWith('DELETE FROM visits WHERE ((visited_at < ?'));
  assert.deepEqual(DB.statements[0].values, ['2026-09-15T03:00:00.000+08:00', '2026-09-14T19:00:00.000Z']);
  const pending = [];
  await worker.scheduled({ scheduledTime: now }, { ...BASE_ENV, DB }, { waitUntil(task) { pending.push(task); } });
  await Promise.all(pending);
  assert.equal(DB.statements.length, 2);
});

test('管理页无私人数据和密钥，生成的内联脚本有效且有 CSP', async () => {
  const response = await worker.fetch(new Request('https://visitor-log.example/admin'), BASE_ENV);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.ok(response.headers.get('Content-Security-Policy').includes("frame-ancestors 'none'"));
  assert.ok(!html.includes(BASE_ENV.ADMIN_TOKEN));
  assert.ok(!html.includes('localStorage'));
  assert.ok(html.includes('cell.textContent = value'));
  const script = /<script[^>]*>([\s\S]*?)<\/script>/.exec(html)[1];
  assert.doesNotThrow(() => new Script(script));
});

test('北京时间表示保留真实时刻、毫秒并跨 UTC 日期，不重复加 8 小时', () => {
  for (const [input, expected] of [
    ['2026-10-14T16:00:00.123Z', '2026-10-15T00:00:00.123+08:00'],
    ['2026-12-31T16:00:00.999Z', '2027-01-01T00:00:00.999+08:00'],
    ['2026-10-15T00:00:00.123+08:00', '2026-10-15T00:00:00.123+08:00'],
  ]) {
    assert.equal(beijingTime(input), expected);
    assert.equal(Date.parse(expected), Date.parse(input));
  }
});
