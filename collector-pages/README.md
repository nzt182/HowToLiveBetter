# 可访问的采集入口

正式采集地址：`https://how-to-live-better-visitor-log.pages.dev/collect`

管理页：[访问记录](https://how-to-live-better-visitor-log.pages.dev/admin)。管理员密钥通过 Pages secret 单独设置，不写入公开文件。

GitHub Pages 仍提供原网站。Cloudflare Pages 高级模式直接接收浏览器请求，`public/_worker.js` 仅导入 `worker/src/index.js` 的 HTTP 处理器，读取当前连接的 `CF-Connecting-IP` 并写入同一个 `visitor_logs` D1。不通过公网请求旧采集地址，因此不会把代理 IP 当成访客 IP。

`_worker.js` 由 Wrangler 打包为服务端函数；`_routes.json` 将请求交给该函数，访问源码路径只返回 404。数据库和 API 中的 `visited_at` 使用带毫秒及 `+08:00` 的北京时间。Pages 不支持 Cron，30 天清理仍由原 `worker/` 的每日任务执行，不依赖旧域名的公网连通性。

## 本地验证

需要 Node.js 22 或更新版本，复用 `worker/` 的 Wrangler 依赖：

```bash
cd worker
npm ci
npm test
npm run db:local -- --persist-to ../collector-pages/.wrangler/state
cd ../collector-pages
../worker/node_modules/.bin/wrangler pages dev --ip 127.0.0.1 --port 8789 \
  --binding ADMIN_TOKEN=local-pages-visitor-test
```

打开 `http://127.0.0.1:8789/admin`。本地数据与正式数据库隔离；上述密钥仅用于本地测试。

## 发布

在 `collector-pages/` 目录执行：

```bash
../worker/node_modules/.bin/wrangler pages secret put ADMIN_TOKEN \
  --project-name how-to-live-better-visitor-log
../worker/node_modules/.bin/wrangler pages deploy \
  --project-name how-to-live-better-visitor-log --branch main
```

`wrangler.jsonc` 配置为生产数据绑定，不包含密钥。部署到 `main` 才会更新稳定的 `pages.dev` 地址；不要把每次部署的 hash 预览域名填入前端。迁移到其他账户时需创建自己的 Pages 项目、替换 D1 ID 和站点 Origin。若 CLI 创建返回未知错误，可通过 Cloudflare 控制台的「继续前往 Pages → 拖放文件 → 创建项目」创建，再用 CLI 发布。

共享业务代码改动后，验证 `worker/` 的测试，再部署 Pages 和负责定时清理的 Worker。时间格式升级顺序见 [数据库迁移说明](../worker/README.md)。

参考：[高级模式](https://developers.cloudflare.com/pages/functions/advanced-mode/)、[直接上传](https://developers.cloudflare.com/pages/get-started/direct-upload/)、[独立配置与 D1 绑定](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)。
