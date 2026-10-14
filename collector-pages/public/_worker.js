import visitorLog from '../../worker/src/index.js';

// 浏览器直接连接 Pages，在这一跳读取 Cloudflare 边缘 IP；复用同一业务实现。
export default {
  fetch(request, env) {
    return visitorLog.fetch(request, env);
  },
};
