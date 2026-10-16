(() => {
  'use strict';

  const storageKey = 'howtolivebetter.visitor-device-id.v1';
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  function getId() {
    try {
      const crypto = window.crypto;
      if (!crypto || (typeof crypto.randomUUID !== 'function'
        && typeof crypto.getRandomValues !== 'function')) return null;
      const storage = window.localStorage;
      const existing = storage.getItem(storageKey);
      if (typeof existing === 'string' && uuidV4.test(existing)) return existing;

      let id;
      if (typeof crypto.randomUUID === 'function') {
        id = crypto.randomUUID().toLowerCase();
      } else {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
        id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      }
      if (!uuidV4.test(id)) return null;
      storage.setItem(storageKey, id);
      // 浏览器拒绝或未实际写入存储时，不把临时 ID 当成持久设备标记。
      return storage.getItem(storageKey) === id ? id : null;
    } catch (_) { return null; }
  }

  window.VisitorDevice = Object.freeze({ getId });
})();
