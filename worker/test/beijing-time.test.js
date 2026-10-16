import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Script, createContext } from 'node:vm';
import worker, { beijingTime, deleteExpiredVisits } from '../src/index.js';
import { adminPage } from '../src/admin.js';

const ENV = {
  PUBLIC_SITE_URL: 'https://nzt182.github.io/HowToLiveBetter/',
  ALLOWED_ORIGINS: 'https://nzt182.github.io',
  ADMIN_TOKEN: 'beijing-time-test-only',
  RETENTION_DAYS: '30',
};

function sqlite() {
  const connection = new DatabaseSync(':memory:');
  connection.exec(readFileSync(new URL('../migrations/0001_visits.sql', import.meta.url), 'utf8'));
  connection.exec(readFileSync(new URL('../migrations/0003_device_identity.sql', import.meta.url), 'utf8'));
  return {
    connection,
    prepare(sql) {
      const statement = connection.prepare(sql);
      let parameters = [];
      return {
        bind(...values) { parameters = values; return this; },
        async all() { return { results: statement.all(...parameters) }; },
        async run() { return statement.run(...parameters); },
      };
    },
  };
}

function insert(DB, time, page = '/HowToLiveBetter/') {
  DB.connection.prepare('INSERT INTO visits (ip, visited_at, page) VALUES (?, ?, ?)').run('203.0.113.24', time, page);
}

async function query(DB, parameters) {
  const request = new Request('https://visitor-log.example/api/visits?' + new URLSearchParams(parameters), {
    headers: { Authorization: 'Bearer ' + ENV.ADMIN_TOKEN },
  });
  const response = await worker.fetch(request, { ...ENV, DB });
  return { status: response.status, data: await response.json() };
}

test('真实 SQLite：旧 Z 迁移保留毫秒、ID、索引和真实时刻，重复迁移不再加 8 小时', () => {
  const DB = sqlite();
  try {
    for (const time of [
      '2026-10-14T15:59:59.999Z',
      '2026-10-14T16:00:00.001Z',
      '2026-12-31T16:00:00.123Z',
      '2026-10-15T00:00:00.123+08:00',
    ]) insert(DB, time);
    const before = DB.connection.prepare('SELECT * FROM visits ORDER BY id').all();
    const migration = readFileSync(new URL('../migrations/0002_beijing_time.sql', import.meta.url), 'utf8');
    DB.connection.exec(migration);
    const after = DB.connection.prepare('SELECT * FROM visits ORDER BY id').all();
    for (let i = 0; i < after.length; i++) {
      assert.equal(after[i].visited_at, beijingTime(before[i].visited_at));
      assert.equal(Date.parse(after[i].visited_at), Date.parse(before[i].visited_at));
      assert.equal(after[i].id, before[i].id);
      assert.equal(after[i].ip, before[i].ip);
      assert.equal(after[i].page, before[i].page);
    }
    DB.connection.exec(migration);
    assert.deepEqual(DB.connection.prepare('SELECT * FROM visits ORDER BY id').all(), after);
    assert.ok(DB.connection.prepare('PRAGMA index_list(visits)').all().some((index) => index.name === 'visits_visited_at_idx'));
  } finally { DB.connection.close(); }
});

test('真实 SQLite：混合格式的北京时间整日筛选不会混入前后一天，UTC 参数等价', async () => {
  const DB = sqlite();
  try {
    const day = beijingTime().slice(0, 10);
    const start = Date.parse(day + 'T00:00:00.000+08:00');
    for (const [offset, legacy] of [[-1, false], [0, true], [1, false], [86400000 - 1, true], [86400000, false]]) {
      insert(DB, legacy ? new Date(start + offset).toISOString() : beijingTime(start + offset));
    }
    const parameters = { since: day + 'T00:00:00.000+08:00', until: day + 'T23:59:59.999+08:00' };
    const result = await query(DB, parameters);
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.visits.map((row) => row.id), [4, 3, 2]);
    assert.ok(result.data.visits.every((row) => row.visited_at.startsWith(day) && row.visited_at.endsWith('+08:00')));
    const utcResult = await query(DB, {
      since: new Date(start).toISOString(), until: new Date(start + 86400000 - 1).toISOString(),
    });
    assert.deepEqual(utcResult.data, result.data);
    DB.connection.exec(readFileSync(new URL('../migrations/0002_beijing_time.sql', import.meta.url), 'utf8'));
    assert.deepEqual((await query(DB, parameters)).data, result.data);
  } finally { DB.connection.close(); }
});

test('真实 SQLite：30 天清理保留准确边界，兼容 Z/+08:00，午夜跨日不偏移', async () => {
  const DB = sqlite();
  try {
    const now = Date.parse('2026-10-15T00:00:00.123+08:00');
    const cutoff = now - 30 * 86400000;
    for (const legacy of [true, false]) {
      for (const offset of [-1, 0, 1]) insert(DB, legacy ? new Date(cutoff + offset).toISOString() : beijingTime(cutoff + offset));
    }
    await deleteExpiredVisits({ ...ENV, DB }, now);
    assert.deepEqual(DB.connection.prepare('SELECT id FROM visits ORDER BY id').all().map((row) => row.id), [2, 3, 5, 6]);
    DB.connection.exec(readFileSync(new URL('../migrations/0002_beijing_time.sql', import.meta.url), 'utf8'));
    await deleteExpiredVisits({ ...ENV, DB }, now);
    assert.deepEqual(DB.connection.prepare('SELECT id FROM visits ORDER BY id').all().map((row) => row.id), [2, 3, 5, 6]);
  } finally { DB.connection.close(); }
});

test('UTC 和北京时间混合参数按真实时刻判断反向范围，拒绝非法北京时间日期', async () => {
  const DB = sqlite();
  try {
    for (const parameters of [
      { since: '2026-10-14T23:00:00+08:00', until: '2026-10-14T14:00:00Z' },
      { since: '2026-02-30T00:00:00+08:00' },
      { until: '2026-10-14T24:00:00+08:00' },
      { since: '2026-10-14T00:00:00+09:00' },
    ]) assert.equal((await query(DB, parameters)).status, 400);
  } finally { DB.connection.close(); }
});

test('管理日期参数显式 +08:00，显示与实际 CSV 导出保持北京时间而不重复转换', async () => {
  const elements = new Map();
  const byId = (id) => {
    if (!elements.has(id)) elements.set(id, {
      value: '', listeners: new Map(),
      addEventListener(event, listener) { this.listeners.set(event, listener); },
    });
    return elements.get(id);
  };
  let exportedBlob;
  let exportedLink;
  // 固定在北京时间凌晨，确保 CSV 文件名不会错误采用前一天的 UTC 日期。
  class AdminDate extends Date {
    constructor(...values) { super(...(values.length ? values : ['2026-10-14T16:01:00.000Z'])); }
  }
  const context = createContext({
    window: { addEventListener() {} },
    document: { getElementById: byId, createElement() { exportedLink = { click() {} }; return exportedLink; } },
    URLSearchParams, Intl, Date: AdminDate, Blob,
    URL: { createObjectURL(blob) { exportedBlob = blob; return 'blob:test'; }, revokeObjectURL() {} },
    setTimeout(callback) { callback(); return 1; },
  });
  const script = /<script[^>]*>([\s\S]*?)<\/script>/.exec(adminPage('test-nonce'))[1];
  new Script(script).runInContext(context);
  byId('since').value = '2026-10-15';
  byId('until').value = '2026-10-15';
  byId('limit').value = '100';
  const filters = new Script('filters().toString()').runInContext(context);
  const parameters = new URLSearchParams(filters);
  assert.equal(parameters.get('since'), '2026-10-15T00:00:00.000+08:00');
  assert.equal(parameters.get('until'), '2026-10-15T23:59:59.999+08:00');
  const formatted = new Script("dateFormatter.format(new Date('2026-10-15T00:00:00.123+08:00'))").runInContext(context);
  assert.match(formatted, /2026\/10\/15.*00:00:00/);
  new Script("records = [{ ip: '203.0.113.24', visited_at: '2026-10-15T00:00:00.123+08:00', page: '/HowToLiveBetter/' }]").runInContext(context);
  byId('export').listeners.get('click')();
  const csv = await exportedBlob.text();
  assert.ok(csv.includes('访问时间（北京时间）'));
  assert.ok(csv.includes(formatted));
  assert.ok(csv.includes('/HowToLiveBetter/'));
  assert.equal(exportedLink.download, '访问记录-2026-10-15.csv');
});
