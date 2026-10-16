(() => {
  'use strict';

  const configured = window.VISITOR_LOG_CONFIG?.endpoint;
  if (typeof configured !== 'string' || !configured.trim()) return;

  let endpoint, sitePath;
  try {
    endpoint = new URL(configured);
    const isLoopback = hostname => /^(?:localhost|127\.0\.0\.1|\[::1\])$/.test(hostname);
    const localHttp = endpoint.protocol === 'http:'
      && isLoopback(location.hostname) && isLoopback(endpoint.hostname);
    if ((endpoint.protocol !== 'https:' && !localHttp) || endpoint.username || endpoint.password
      || endpoint.search || endpoint.hash || !endpoint.pathname.endsWith('/collect')) return;
    if (location.protocol !== 'https:'
      && !(location.protocol === 'http:' && isLoopback(location.hostname))) return;
    sitePath = new URL('../', document.currentScript.src).pathname;
  } catch (_) { return; }

  // 只记录站内路径及受控导航标识，搜索词和其他查询参数不进入请求。
  function pageOf(raw) {
    try {
      const url = new URL(raw, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith(sitePath)) return null;
      let hash = '';
      const target = decodeURIComponent(url.hash.slice(1));
      if (/^(?:e-\d{1,3}-\d{1,4}|sec-\d{1,3})$/.test(target)) hash = '#' + target;
      const doc = /^docs\/([^/?#]+\.md)$/.exec(target);
      if (doc) hash = '#docs/' + encodeURIComponent(doc[1]);
      const pathname = url.pathname === sitePath + 'index.html' ? sitePath : url.pathname;
      return pathname + hash;
    } catch (_) { return null; }
  }

  let lastPage = '';
  function send(page) {
    if (!page || page === lastPage) return;
    lastPage = page;
    const payload = { page };
    try {
      const deviceId = window.VisitorDevice?.getId();
      if (deviceId) payload.device_id = deviceId;
    } catch (_) { /* 设备标识不可用时仍可记录页面。 */ }
    const body = JSON.stringify(payload);
    // IP 和北京时间由服务端获取，浏览器只提供页面及可用的随机浏览器标识。
    try {
      if (typeof navigator.sendBeacon === 'function'
        && navigator.sendBeacon(endpoint.href, new Blob([body], { type: 'text/plain' }))) return;
    } catch (_) { /* 入队失败时尝试普通请求。 */ }
    try {
      fetch(endpoint.href, {
        method: 'POST', mode: 'cors', credentials: 'omit', keepalive: true,
        headers: { 'Content-Type': 'text/plain' }, body
      }).catch(() => {});
    } catch (_) { /* 访问记录失败不影响阅读。 */ }
  }

  // 同一次点击可能先关闭长文、再跳到条目，只发送最后一个目标。
  let pendingPage = null, pending = false;
  function schedule(raw) {
    const page = pageOf(raw);
    if (!page) return;
    pendingPage = page;
    if (pending) return;
    pending = true;
    Promise.resolve().then(() => {
      const next = pendingPage;
      pendingPage = null;
      pending = false;
      send(next);
    });
  }
  const currentPage = () => location.pathname + location.hash;

  const notice = document.getElementById('visitor-log-notice');
  if (notice) notice.hidden = false;
  send(pageOf(currentPage()));
  document.addEventListener('visitor-log:navigate', event => {
    if (typeof event.detail?.page === 'string') schedule(event.detail.page);
  });
  // replaceState 会随滚动和筛选频繁执行，因此不拦截它。
  addEventListener('hashchange', () => schedule(currentPage()));
  addEventListener('popstate', () => schedule(currentPage()));
  addEventListener('pageshow', event => {
    if (!event.persisted) return;
    lastPage = '';
    schedule(currentPage());
  });
})();
