# 高性价比人生指南 · 个人静态镜像

网站：[nzt182.github.io/HowToLiveBetter](https://nzt182.github.io/HowToLiveBetter/)

指定条目：[第 34 节，第 11 条](https://nzt182.github.io/HowToLiveBetter/?sec=34#e-34-11)

## 来源与授权

原作者：[eternity4719](https://github.com/eternity4719)。原项目：[HowToLiveBetter](https://github.com/eternity4719/HowToLiveBetter)。原网站：[高性价比人生指南](https://eternity4719.github.io/HowToLiveBetter/)。

此镜像使用提供的独立 HTML 快照，生成时间为 2026-10-05 17:34（北京时间），页面标注的正文版本为 `fa92004`。正文、原作者署名和正文来源链接保持原样；顶部文档与 GitHub 图标已替换为两张个人照片，另增加托管配置和本说明。镜像不会自动同步上游。

正文采用 [CC BY 4.0](LICENSE)，网页代码采用 [MIT](LICENSE-CODE)。保留上游的完整许可文件。

## 本地预览与更新

可编辑网页源文件为 `dist/index.html`，正文和原有图片已内嵌，顶部照片位于 `dist/assets/`，静态网页无需安装依赖或构建。

```bash
python3 -m http.server 8766 --bind 127.0.0.1 --directory dist
```

打开 <http://127.0.0.1:8766/?sec=34#e-34-11>。

更新时替换 `dist/index.html`，验证页面后提交到 `main`；GitHub Actions 会将 `dist/` 发布到 GitHub Pages。

## 访问记录

`collector-pages/` 使用 Cloudflare Pages 接收访问记录，D1 保存访客 IP、服务器北京时间和访问页面；数据库时间统一带 `+08:00`，管理页可筛选和导出记录。网站继续使用原来的 GitHub Pages 网址，无需改域名。

本站采用稳定的 `https://how-to-live-better-visitor-log.pages.dev/collect`，接入方式见 [采集入口说明](collector-pages/README.md)。`dist/assets/visitor-log-config.js` 的 `endpoint` 保存这个公开地址。配置为空时不发送记录，也不显示访问记录说明。管理员密钥只配置在 Cloudflare secret 中，不写入前端或仓库。

管理员入口为 [访问记录管理页](https://how-to-live-better-visitor-log.pages.dev/admin)，输入管理员密钥后才能查看记录。默认保存最近 30 天，原 `worker/` 对同一数据库在每天北京时间 03:00 清理过期数据；Pages 入口直接接收访客请求，无需经过旧域名。只能记录启用之后的访问，无法补回历史访问。

页面进入、明确条目导航、长文打开与关闭、浏览器前进/后退会记录；普通滚动、搜索和筛选操作不会额外记录，查询字符串也不会保存。长文以 `#docs/<文件名.md>` 标识。这是浏览器上报：禁用 JavaScript 或拦截上报的访问可能漏记，IP 可能是共享网络或 VPN 的出口地址。

网页端代码位于 `dist/assets/visitor-log.js`。网站启用上报时，会在页脚显示记录三项数据、保存 30 天且仅站长可查看的说明。停用时将 `endpoint` 设为空字符串并重新发布；已保存数据仍按期限清理。
