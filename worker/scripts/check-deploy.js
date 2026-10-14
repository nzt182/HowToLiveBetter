import { readFileSync } from 'node:fs';

// 配置尚未关联真实 D1 时，阻止 npm run deploy 误部署空资源。
const configuration = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
if (configuration.includes('00000000-0000-0000-0000-000000000000')) {
  console.error('请先创建真实 D1 数据库并更新 wrangler.jsonc 中的 database_id，再部署。');
  process.exit(1);
}
