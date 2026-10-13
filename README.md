# 高性价比人生指南 · 个人静态镜像

网站：[nzt182.github.io/HowToLiveBetter](https://nzt182.github.io/HowToLiveBetter/)

指定条目：[第 34 节，第 11 条](https://nzt182.github.io/HowToLiveBetter/?sec=34#e-34-11)

## 来源与授权

原作者：[eternity4719](https://github.com/eternity4719)。原项目：[HowToLiveBetter](https://github.com/eternity4719/HowToLiveBetter)。原网站：[高性价比人生指南](https://eternity4719.github.io/HowToLiveBetter/)。

此镜像使用提供的独立 HTML 快照，生成时间为 2026-10-05 17:34（北京时间），页面标注的正文版本为 `fa92004`。正文、原作者署名和正文来源链接保持原样；顶部文档与 GitHub 图标已替换为两张个人照片，另增加托管配置和本说明。镜像不会自动同步上游。

正文采用 [CC BY 4.0](LICENSE)，网页代码采用 [MIT](LICENSE-CODE)。保留上游的完整许可文件。

## 本地预览与更新

可编辑网页源文件为 `dist/index.html`，正文和原有图片已内嵌，顶部照片位于 `dist/assets/`，无需安装依赖或构建。

```bash
python3 -m http.server 8766 --bind 127.0.0.1 --directory dist
```

打开 <http://127.0.0.1:8766/?sec=34#e-34-11>。

更新时替换 `dist/index.html`，验证页面后提交到 `main`；GitHub Actions 会将 `dist/` 发布到 GitHub Pages。
