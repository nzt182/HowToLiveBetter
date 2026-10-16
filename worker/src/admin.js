// 管理页只包含空壳；真实记录及本人设备由同源接口在管理员认证后返回。
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
    main { max-width: 1320px; margin: auto; }
    h1 { margin: 0 0 10px; font-size: 28px; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    p { color: #586174; line-height: 1.6; }
    .panel { background: white; border: 1px solid #e0e5ec; border-radius: 12px; padding: 20px; margin-top: 20px; }
    form, .actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; }
    label { display: grid; gap: 6px; font-size: 14px; }
    input, select, button { font: inherit; border: 1px solid #ccd3df; border-radius: 6px; padding: 10px 12px; }
    input { max-width: 100%; }
    #token { width: min(380px, 100%); }
    #page { width: 250px; }
    button { cursor: pointer; color: white; background: #245bc8; border-color: #245bc8; }
    button.secondary { color: #172033; background: white; border-color: #ccd3df; }
    button:disabled { opacity: .5; cursor: default; }
    .table-wrap { overflow: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 12px 10px; text-align: left; border-bottom: 1px solid #e8ebf0; vertical-align: top; }
    th { white-space: nowrap; }
    td { overflow-wrap: anywhere; }
    td:nth-child(3) { min-width: 170px; }
    td:nth-child(4) { min-width: 185px; }
    td:nth-child(5) { min-width: 230px; }
    .badge { display: inline-block; white-space: nowrap; padding: 3px 8px; border-radius: 5px; background: #edf0f5; }
    .badge.self { color: #186239; background: #e6f5eb; }
    .badge.other { color: #214fa8; background: #eaf0ff; }
    small { color: #687386; display: block; margin-top: 5px; }
    #devices { display: grid; gap: 10px; padding: 0; list-style: none; }
    #devices li { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    #devices button { padding: 5px 10px; font-size: 13px; }
    #status { min-height: 24px; margin-bottom: 0; }
    .actions { margin-top: 16px; }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
<main>
  <h1>网站访问记录</h1>
  <p>时间统一显示为北京时间；管理员密钥只在当前页面内存中使用。</p>
  <section class="panel" id="login-panel">
    <form id="login-form">
      <label>管理员密钥 <input id="token" type="password" autocomplete="off" required></label>
      <button type="submit">查看记录</button>
    </form>
  </section>
  <section class="panel" id="device-panel" hidden>
    <h2>本人设备</h2>
    <p>在自己的浏览器中点下方按钮，完成一次标记。标记按浏览器保存，换网络仍可识别；换浏览器、无痕模式或清除网站存储后需要重新标记。</p>
    <div class="actions">
      <label>设备名称 <input id="device-label" value="我的电脑" maxlength="60"></label>
      <button id="pair-device" type="button">将本浏览器标记为本人设备</button>
    </div>
    <ul id="devices"></ul>
  </section>
  <section class="panel" id="records-panel" hidden>
    <form id="filter-form">
      <label>访客筛选 <select id="visitor_type"><option value="all">全部访问</option><option value="other">只看其他访客（未标记设备）</option><option value="self">只看本人设备</option><option value="unknown">只看未知设备</option></select></label>
      <label>访客 IP（完整匹配）<input id="ip" placeholder="留空查看全部"></label>
      <label>页面（完整匹配）<input id="page" placeholder="/HowToLiveBetter/#e-1-1"></label>
      <label>开始日期（北京时间）<input id="since" type="date"></label>
      <label>结束日期（北京时间）<input id="until" type="date"></label>
      <label>每次条数 <select id="limit"><option>100</option><option>200</option><option>500</option></select></label>
      <button id="query" type="submit">查询</button>
    </form>
    <p>“其他访客”表示尚未标记为本人的浏览器，可能包含自己的其他设备。没有设备标识的历史或受限访问显示为“未知设备”，不会归入其他访客。</p>
    <p id="count"></p>
    <div class="table-wrap">
      <table><thead><tr><th>访客类型</th><th>设备</th><th>访客 IP</th><th>访问时间（北京时间）</th><th>访问页面</th></tr></thead><tbody id="rows"></tbody></table>
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
  let deviceSetupUrl = null;
  let pairing = null;
  const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  const visitorTypeLabel = (type) => ({ self: '本人设备', other: '其他访客', unknown: '未知设备' })[type] || '未知设备';

  function controls() {
    byId('pair-device').disabled = loading || !!pairing || !deviceSetupUrl;
    byId('query').disabled = loading || !!pairing;
    byId('more').disabled = loading || !!pairing;
  }

  function render(retentionDays) {
    const fragment = document.createDocumentFragment();
    for (const record of records) {
      const row = document.createElement('tr');
      const type = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'badge ' + (['self', 'other'].includes(record.visitor_type) ? record.visitor_type : 'unknown');
      badge.textContent = visitorTypeLabel(record.visitor_type);
      type.appendChild(badge);
      row.appendChild(type);
      const device = document.createElement('td');
      device.textContent = record.device_label || (record.device_id ? '未标记设备' : '没有设备标识');
      if (record.device_id) {
        const id = document.createElement('small');
        id.textContent = record.device_id.slice(0, 8);
        id.title = record.device_id;
        device.appendChild(id);
      }
      row.appendChild(device);
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

  function renderDevices(devices) {
    const fragment = document.createDocumentFragment();
    for (const device of devices) {
      const item = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = device.label + ' · ' + device.device_id.slice(0, 8);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary';
      remove.textContent = '取消本人标记';
      remove.addEventListener('click', () => removeDevice(device.device_id, remove));
      item.append(label, remove);
      fragment.appendChild(item);
    }
    if (!devices.length) {
      const item = document.createElement('li');
      item.textContent = '还没有标记本人设备。';
      fragment.appendChild(item);
    }
    byId('devices').replaceChildren(fragment);
  }

  function filters() {
    const params = new URLSearchParams({ limit: byId('limit').value });
    const type = byId('visitor_type').value;
    if (type && type !== 'all') params.set('visitor_type', type);
    for (const name of ['ip', 'page']) {
      const value = byId(name).value.trim();
      if (value) params.set(name, value);
    }
    if (byId('since').value) params.set('since', byId('since').value + 'T00:00:00.000+08:00');
    if (byId('until').value) params.set('until', byId('until').value + 'T23:59:59.999+08:00');
    return params;
  }

  async function adminRequest(path, options = {}) {
    const response = await fetch(path, {
      ...options, headers: { ...options.headers, Authorization: 'Bearer ' + token }, cache: 'no-store'
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '请求失败');
    return data;
  }

  async function load(more = false) {
    if (loading || !token || pairing) return;
    loading = true;
    const generation = requestGeneration;
    controls();
    byId('status').textContent = '正在读取记录…';
    try {
      if (!more) activeParams = filters();
      const params = new URLSearchParams(activeParams);
      if (more && nextBeforeId !== null) params.set('before_id', String(nextBeforeId));
      const [data, deviceData] = await Promise.all([
        adminRequest('/api/visits?' + params), more ? Promise.resolve(null) : adminRequest('/api/devices')
      ]);
      if (generation !== requestGeneration) return;
      if (deviceData) {
        deviceSetupUrl = new URL(deviceData.setup_url);
        if (deviceSetupUrl.protocol !== 'https:' && !(deviceSetupUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(deviceSetupUrl.hostname))) throw new Error('设备标记地址无效');
        renderDevices(deviceData.devices);
      }
      records = more ? records.concat(data.visits) : data.visits;
      nextBeforeId = data.next_before_id;
      byId('login-panel').hidden = true;
      byId('device-panel').hidden = false;
      byId('records-panel').hidden = false;
      render(data.retention_days);
      byId('status').textContent = records.length ? '记录已更新。' : '当前条件下没有访问记录。';
    } catch (error) {
      if (generation === requestGeneration) byId('status').textContent = error.message;
    } finally {
      if (generation === requestGeneration) { loading = false; controls(); }
    }
  }

  function clearPairing() {
    if (pairing) clearTimeout(pairing.timeout);
    pairing = null;
    controls();
  }

  async function removeDevice(deviceId, button) {
    if (loading || pairing || !token) return;
    const generation = requestGeneration;
    button.disabled = true;
    try {
      await adminRequest('/api/devices', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: deviceId })
      });
      if (generation !== requestGeneration) return;
      await load();
      byId('status').textContent = '已取消本人标记，相关记录将显示为其他访客（未标记设备）。';
    } catch (error) {
      if (generation === requestGeneration) { button.disabled = false; byId('status').textContent = error.message; }
    }
  }

  byId('pair-device').addEventListener('click', () => {
    if (!token || !deviceSetupUrl || loading || pairing) return;
    const label = byId('device-label').value.trim();
    if (!label) { byId('status').textContent = '请填写设备名称。'; return; }
    const id = crypto.randomUUID();
    const url = new URL(deviceSetupUrl);
    url.hash = 'pair=' + id;
    const popup = window.open(url.href, '_blank');
    if (!popup) { byId('status').textContent = '浏览器阻止了新窗口，请允许后重试。'; return; }
    pairing = { id, popup, label, generation: requestGeneration, timeout: setTimeout(() => {
      clearPairing();
      byId('status').textContent = '设备标记未完成，请重新点击按钮。';
    }, 60000) };
    controls();
    byId('status').textContent = '正在读取本站浏览器标识并登记本人设备…';
  });

  window.addEventListener('message', async (event) => {
    if (!token || !pairing || !deviceSetupUrl || event.origin !== deviceSetupUrl.origin
      || event.source !== pairing.popup || event.data?.type !== 'visitor-log:device'
      || event.data.pairing_id !== pairing.id || pairing.processing) return;
    const current = pairing;
    // 防止重复提交；失败时允许帮助页在配对期限内重试，密钥不离开管理页。
    current.processing = true;
    loading = true;
    controls();
    try {
      await adminRequest('/api/devices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: event.data.device_id, label: current.label })
      });
      if (current.generation !== requestGeneration) return;
      clearPairing();
      current.popup.postMessage({ type: 'visitor-log:device-result', pairing_id: current.id, ok: true }, deviceSetupUrl.origin);
      loading = false;
      await load();
      byId('status').textContent = '本浏览器已标记为本人设备。此前没有设备标识的记录仍保留为未知设备。';
    } catch (error) {
      if (current.generation === requestGeneration) {
        current.processing = false;
        current.popup.postMessage({ type: 'visitor-log:device-result', pairing_id: current.id, ok: false, error: error.message }, deviceSetupUrl.origin);
        byId('status').textContent = error.message;
      }
    } finally {
      if (current.generation === requestGeneration) { loading = false; controls(); }
    }
  });

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
    deviceSetupUrl = null;
    loading = false;
    clearPairing();
    byId('rows').replaceChildren();
    byId('devices').replaceChildren();
    byId('device-panel').hidden = true;
    byId('records-panel').hidden = true;
    byId('login-panel').hidden = false;
    byId('status').textContent = '已退出，页面中的密钥和记录已清除。';
  });
  byId('export').addEventListener('click', () => {
    const quote = (value) => {
      const text = String(value ?? '');
      return '"' + (/^[=+@\\-\\t\\r]/.test(text) ? "'" + text : text).replaceAll('"', '""') + '"';
    };
    const lines = [['访客类型', '设备名称', '设备标识', '访客 IP', '访问时间（北京时间）', '访问页面']].concat(
      records.map((record) => [visitorTypeLabel(record.visitor_type), record.device_label || '', record.device_id || '', record.ip, dateFormatter.format(new Date(record.visited_at)), record.page])
    );
    const blob = new Blob(['\\uFEFF' + lines.map((row) => row.map(quote).join(',')).join('\\r\\n')], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    const exportDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
    link.download = '访问记录-' + exportDate + '.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  });
</script>
</body>
</html>`;
}
