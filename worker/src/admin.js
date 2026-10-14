// 管理页只包含空壳；真实记录由同源接口在管理员认证后返回。
export function adminPage(nonce) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>网站访问记录</title>
  <style nonce="${nonce}">
    :root { font-family: system-ui, sans-serif; color: #172033; background: #f4f6fa; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px 20px; }
    main { max-width: 1150px; margin: auto; }
    h1 { margin: 0 0 10px; font-size: 28px; }
    p { color: #586174; line-height: 1.6; }
    .panel { background: white; border: 1px solid #e0e5ec; border-radius: 12px; padding: 20px; margin-top: 20px; }
    form, .actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; }
    label { display: grid; gap: 6px; font-size: 14px; }
    input, select, button { font: inherit; border: 1px solid #ccd3df; border-radius: 6px; padding: 10px 12px; }
    input { max-width: 100%; }
    #token { width: min(380px, 100%); }
    #page { width: 280px; }
    button { cursor: pointer; color: white; background: #245bc8; border-color: #245bc8; }
    button.secondary { color: #172033; background: white; border-color: #ccd3df; }
    button:disabled { opacity: .5; cursor: default; }
    .table-wrap { overflow: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 12px 10px; text-align: left; border-bottom: 1px solid #e8ebf0; vertical-align: top; }
    th { white-space: nowrap; }
    td { overflow-wrap: anywhere; }
    td:nth-child(2) { min-width: 190px; }
    td:nth-child(3) { min-width: 250px; }
    #status { min-height: 24px; margin-bottom: 0; }
    .actions { margin-top: 16px; }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
<main>
  <h1>网站访问记录</h1>
  <p>查看访客 IP、访问时间和访问页面。时间统一显示为北京时间；管理员密钥只在当前页面内存中使用。</p>
  <section class="panel" id="login-panel">
    <form id="login-form">
      <label>管理员密钥 <input id="token" type="password" autocomplete="off" required></label>
      <button type="submit">查看记录</button>
    </form>
  </section>
  <section class="panel" id="records-panel" hidden>
    <form id="filter-form">
      <label>访客 IP（完整匹配）<input id="ip" placeholder="留空查看全部"></label>
      <label>页面（完整匹配）<input id="page" placeholder="/HowToLiveBetter/#e-1-1"></label>
      <label>开始日期（北京时间）<input id="since" type="date"></label>
      <label>结束日期（北京时间）<input id="until" type="date"></label>
      <label>每次条数 <select id="limit"><option>100</option><option>200</option><option>500</option></select></label>
      <button type="submit">查询</button>
    </form>
    <p id="count"></p>
    <div class="table-wrap">
      <table><thead><tr><th>访客 IP</th><th>访问时间（北京时间）</th><th>访问页面</th></tr></thead><tbody id="rows"></tbody></table>
    </div>
    <div class="actions">
      <button id="more" type="button" hidden>加载更早记录</button>
      <button id="export" type="button" class="secondary" disabled>导出已加载记录 CSV</button>
      <button id="logout" type="button" class="secondary">退出</button>
    </div>
  </section>
  <p id="status" role="status" aria-live="polite">请输入管理员密钥。</p>
</main>
<script nonce="${nonce}">
  const byId = (id) => document.getElementById(id);
  let token = '';
  let records = [];
  let nextBeforeId = null;
  let activeParams = new URLSearchParams();
  let loading = false;
  let requestGeneration = 0;
  const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });

  function render(retentionDays) {
    const fragment = document.createDocumentFragment();
    for (const record of records) {
      const row = document.createElement('tr');
      for (const value of [record.ip, dateFormatter.format(new Date(record.visited_at)), record.page]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      }
      fragment.appendChild(row);
    }
    byId('rows').replaceChildren(fragment);
    byId('count').textContent = '已加载 ' + records.length + ' 条。保存期限 ' + retentionDays + ' 天。';
    byId('more').hidden = nextBeforeId === null;
    byId('export').disabled = records.length === 0;
  }

  function filters() {
    const params = new URLSearchParams({ limit: byId('limit').value });
    for (const name of ['ip', 'page']) {
      const value = byId(name).value.trim();
      if (value) params.set(name, value);
    }
    if (byId('since').value) params.set('since', new Date(byId('since').value + 'T00:00:00+08:00').toISOString());
    if (byId('until').value) params.set('until', new Date(byId('until').value + 'T23:59:59.999+08:00').toISOString());
    return params;
  }

  async function load(more = false) {
    if (loading || !token) return;
    loading = true;
    const generation = requestGeneration;
    byId('more').disabled = true;
    byId('status').textContent = '正在读取记录…';
    try {
      if (!more) activeParams = filters();
      const params = new URLSearchParams(activeParams);
      if (more && nextBeforeId !== null) params.set('before_id', String(nextBeforeId));
      const response = await fetch('/api/visits?' + params, {
        headers: { Authorization: 'Bearer ' + token }, cache: 'no-store'
      });
      const data = await response.json();
      if (generation !== requestGeneration) return;
      if (!response.ok) throw new Error(data.error || '读取失败');
      records = more ? records.concat(data.visits) : data.visits;
      nextBeforeId = data.next_before_id;
      byId('login-panel').hidden = true;
      byId('records-panel').hidden = false;
      render(data.retention_days);
      byId('status').textContent = records.length ? '记录已更新。' : '当前条件下没有访问记录。';
    } catch (error) {
      if (generation === requestGeneration) byId('status').textContent = error.message;
    } finally {
      loading = false;
      byId('more').disabled = false;
    }
  }

  byId('login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    token = byId('token').value.trim();
    byId('token').value = '';
    load();
  });
  byId('filter-form').addEventListener('submit', (event) => { event.preventDefault(); load(); });
  byId('more').addEventListener('click', () => load(true));
  byId('logout').addEventListener('click', () => {
    requestGeneration++;
    token = '';
    records = [];
    nextBeforeId = null;
    byId('rows').replaceChildren();
    byId('records-panel').hidden = true;
    byId('login-panel').hidden = false;
    byId('status').textContent = '已退出，页面中的密钥和记录已清除。';
  });
  byId('export').addEventListener('click', () => {
    const quote = (value) => '"' + String(value).replaceAll('"', '""') + '"';
    const lines = [['访客 IP', '访问时间（北京时间）', '访问页面']].concat(
      records.map((record) => [record.ip, dateFormatter.format(new Date(record.visited_at)), record.page])
    );
    const blob = new Blob(['\\uFEFF' + lines.map((row) => row.map(quote).join(',')).join('\\r\\n')], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = '访问记录-' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  });
</script>
</body>
</html>`;
}
