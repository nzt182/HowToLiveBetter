(() => {
  'use strict';

  const status = document.getElementById('device-setup-status');
  const retry = document.getElementById('device-setup-retry');
  const closeHint = document.getElementById('device-setup-close-hint');
  const setStatus = (text, state) => {
    status.textContent = text;
    status.dataset.state = state;
  };
  document.getElementById('device-setup-close').addEventListener('click', () => {
    closeHint.hidden = false;
    window.close();
  });

  const params = new URLSearchParams(location.hash.slice(1));
  const pairingId = params.get('pair');
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (params.getAll('pair').length !== 1 || !uuidV4.test(pairingId || '')) {
    setStatus('配对信息缺失或已损坏。请从访问记录管理页重新打开“标记本人浏览器”。', 'error');
    return;
  }

  const opener = window.opener;
  if (!opener || opener.closed) {
    setStatus('未找到打开此页的管理窗口。请保留访问记录管理页，并从那里重新发起标记。', 'error');
    return;
  }

  let collectorOrigin;
  try {
    const endpoint = new URL(window.VISITOR_LOG_CONFIG?.endpoint);
    const isLoopback = hostname => /^(?:localhost|127\.0\.0\.1|\[::1\])$/.test(hostname);
    const localHttp = endpoint.protocol === 'http:'
      && isLoopback(location.hostname) && isLoopback(endpoint.hostname);
    if ((endpoint.protocol !== 'https:' && !localHttp) || endpoint.username || endpoint.password
      || endpoint.search || endpoint.hash || !endpoint.pathname.endsWith('/collect')) throw new Error('endpoint');
    if (location.protocol !== 'https:'
      && !(location.protocol === 'http:' && isLoopback(location.hostname))) throw new Error('page');
    collectorOrigin = endpoint.origin;
  } catch (_) {
    setStatus('访问记录服务尚未正确配置，暂时不能标记。请联系站长检查接收地址。', 'error');
    return;
  }

  const deviceId = window.VisitorDevice?.getId();
  if (!deviceId) {
    setStatus('当前浏览器无法保存随机标识。请允许此网站使用本地存储，并在普通浏览窗口中重新发起标记。', 'error');
    return;
  }

  let timeout, finished = false;
  window.addEventListener('message', event => {
    if (finished) return;
    if (event.origin !== collectorOrigin || event.source !== opener) return;
    const data = event.data;
    if (!data || data.type !== 'visitor-log:device-result'
      || data.pairing_id !== pairingId || typeof data.ok !== 'boolean') return;
    clearTimeout(timeout);
    if (data.ok) {
      finished = true;
      retry.hidden = true;
      setStatus('已成功标记当前浏览器为本人设备。现在可以关闭此页，返回管理页查看。', 'success');
    } else {
      const reason = typeof data.error === 'string' ? data.error.slice(0, 200) : '';
      setStatus('标记未成功。' + (reason ? '管理页提示：' + reason : '请确认管理页仍已登录，再重新发送。'), 'error');
      retry.hidden = false;
    }
  });

  function send() {
    if (finished) return;
    retry.hidden = true;
    setStatus('已读取当前浏览器标识，正在等待管理页确认……', 'pending');
    clearTimeout(timeout);
    try {
      // 目标只取自受信的站点配置，绝不接受 URL 中指定的目标 origin。
      opener.postMessage({ type: 'visitor-log:device', pairing_id: pairingId, device_id: deviceId }, collectorOrigin);
      timeout = setTimeout(() => {
        setStatus('暂未收到管理页确认。请检查管理页是否仍打开且已登录，然后重新发送。', 'error');
        retry.hidden = false;
      }, 15000);
    } catch (_) {
      setStatus('无法联系管理页。请回到管理页，重新打开“标记本人浏览器”。', 'error');
      retry.hidden = false;
    }
  }
  retry.addEventListener('click', send);
  send();
})();
