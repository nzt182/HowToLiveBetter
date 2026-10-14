# 网站访问记录后端

GitHub Pages 继续提供网站；这个独立 Cloudflare Worker 接收浏览器上报，将访客 IP、服务端 UTC 时间和访问页面保存到 D1。无需更换网站域名或把 GitHub Pages 代理到 Cloudflare。

## 接口与记录口径

- `POST /collect`：接收 `text/plain` 或 `application/json` 的 `{"page":"/HowToLiveBetter/#e-1-1"}`，成功返回空的 `204`。仅接受配置中的网站 Origin；不会返回访客 IP。
- 页面只接受 `/HowToLiveBetter/`（含不带末尾斜线及 `index.html` 的等价入口）、`#e-N-N`、`#sec-N`、`#docs/<URL 编码文件名.md>`。服务端移除查询字符串，限制请求为 4 KiB、页面为 1024 字符，不存储搜索词或查询参数。
- IP 只取 Cloudflare 边缘设置的 `CF-Connecting-IP`；不采信请求体的 IP、`X-Forwarded-For` 或客户端时间。没有此头就拒绝记录。生产必须通过 Cloudflare Worker 入口接收请求。
- `GET /admin`：中文管理页。在页面输入管理员密钥后查看记录、按 IP / 页面 / 北京时间日期筛选、翻页和导出已加载记录的 CSV。密钥只保存在当前页面内存中，刷新需重新输入。
- `GET /api/visits`：需要 `Authorization: Bearer <ADMIN_TOKEN>`。默认最近 100 条，`limit` 上限 500。分页参数 `before_id`，可选筛选 `ip`、`page`、`since`、`until`，时间采用 UTC ISO 格式。返回 `visits`、`next_before_id`、`retention_days`。只允许 Worker 同源浏览器查询；CLI 不带 Origin 也必须认证。查询响应禁止缓存。
- 默认保存 30 天。每天北京时间 03:00 执行删除；查询同时排除超过期限的记录。表只有 `id`、`ip`、`visited_at`、`page`，并有时间索引。

这是浏览器访问记录，不是每一个静态资源请求的服务器日志。关闭 JavaScript、拦截上报或机器人请求可能不会记入；公开上报接口也无法证明每条记录都是正常访客。IP 可能是共享网络或 VPN 地址，不能据此确认个人身份。启用前应同步站点访问记录说明。

## 本地运行

需要 Node.js 22 或更新版本。配置中的 D1 ID 对应本站正式数据库；`--local` 使用本地独立数据，不会改动正式记录。新账户接入时需替换为自己的数据库 ID；`npm run deploy` 会阻止部署全零占位 ID。

```bash
cd worker
npm ci
npm test
npm run db:local
cp .dev.vars.example .dev.vars
# 在 .dev.vars 设置仅用于本地的 ADMIN_TOKEN；此文件已被忽略。
npm run dev
```

管理页为 `http://127.0.0.1:8787/admin`。本地网站使用 `http://127.0.0.1:8768` 时，启动 Worker 需额外允许其 Origin：

```bash
npm run dev -- --ip 127.0.0.1 --port 8787 --var ALLOWED_ORIGINS:https://nzt182.github.io,http://127.0.0.1:8768
```

另开终端，在仓库根目录准备临时预览。将 `dist` 挂到 `/HowToLiveBetter/` 路径，并只给预览副本填写本地接收地址：

```bash
visitor_preview_dir="$(mktemp -d)"
cp -R dist "$visitor_preview_dir/HowToLiveBetter"
cat > "$visitor_preview_dir/HowToLiveBetter/assets/visitor-log-config.js" <<'JS'
window.VISITOR_LOG_CONFIG = Object.freeze({ endpoint: 'http://127.0.0.1:8787/collect' });
JS
python3 -m http.server 8768 --bind 127.0.0.1 --directory "$visitor_preview_dir"
```

打开 `http://127.0.0.1:8768/HowToLiveBetter/`，然后查看 Worker 的 `/admin`。不要直接以 `dist` 为根打开 `/`，因为它与生产站点路径不同，会被后端拒绝。上述预览只修改临时副本；仓库的公开配置保留为空或真实生产地址。前端仅为本机 loopback 地址允许 HTTP，生产接收地址必须使用 HTTPS。

本地 Wrangler 的 IP 可能是 `127.0.0.1`。生产才是 Cloudflare 边缘看到的访客公网 IP，不把本地模拟 IP 当成生产结果。

## 接入生产

先在已有 Cloudflare 账户中创建 D1，再填入 `wrangler.jsonc` 返回的真实 ID。`ALLOWED_ORIGINS` 支持逗号分隔的精确 Origin（不可使用 `*`），默认仅 `https://nzt182.github.io`。`PUBLIC_SITE_URL` 确定唯一站点路径，`RETENTION_DAYS` 可设为 1–365。

```bash
npx wrangler d1 create visitor_logs
# 将返回的 database_id 填入 wrangler.jsonc。
npm run db:remote
npx wrangler secret put ADMIN_TOKEN
# 输入足够长的随机管理员密钥，不放到网站前端或仓库中。
npm run deploy
```

将发布得到的 `https://<worker>.<账户>.workers.dev/collect` 填入网站公开访问记录配置。管理员打开同一 Worker 的 `/admin`。仅部署 Worker 不会自动启用网站上报，前端必须配置该真实地址。

CLI 查询示例（先在当前会话设置 `VISIT_LOG_ADMIN_TOKEN`，避免把密钥写入命令历史）：

```bash
curl --fail --header "Authorization: Bearer $VISIT_LOG_ADMIN_TOKEN" \
  'https://<worker>.<账户>.workers.dev/api/visits?limit=100'
```

使用 D1 官方 CLI 查询和清理时同样需要该账户权限，不应将 D1 或管理员接口开放给网站访客。

参考：[Cloudflare D1 参数化语句](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)、[Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[Cloudflare 请求头](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#cf-connecting-ip)。
