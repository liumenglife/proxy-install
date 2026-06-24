import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function readMixedConfig() {
  return JSON.parse(await readFile(new URL('../configs/sing-box/mixed.json', import.meta.url), 'utf8'));
}

test('geosite-cn 远程规则集通过全部聚合自动组下载', async () => {
  const config = await readMixedConfig();

  assert.ok(Array.isArray(config.route?.rule_set), 'mixed.json 必须包含 route.rule_set 数组');
  const geositeCn = config.route.rule_set.find((ruleSet) => ruleSet.tag === 'geosite-cn');

  assert.ok(geositeCn, 'mixed.json 必须包含 tag=geosite-cn 的 rule_set');
  assert.match(geositeCn.url, /^https:\/\/raw\.githubusercontent\.com\//, 'geosite-cn 必须从 raw.githubusercontent.com 下载');
  assert.equal(geositeCn.download_detour, '全部聚合/自动组', 'geosite-cn download_detour 必须固定使用自动代理组');
  assert.ok(
    config.outbounds?.some((outbound) => outbound.tag === '全部聚合/自动组'),
    'mixed.json 必须包含 tag=全部聚合/自动组 的 outbound',
  );
});

test('代理选择标签默认选择全部聚合自动组而不是 direct', async () => {
  const config = await readMixedConfig();
  const selector = config.outbounds?.find((outbound) => outbound.tag === '代理选择标签');

  assert.ok(selector, 'mixed.json 必须包含 tag=代理选择标签 的 selector');
  assert.equal(selector.type, 'selector');
  assert.equal(selector.default, '全部聚合/自动组', '代理选择标签默认必须是全部聚合/自动组');
  assert.equal(selector.outbounds?.[0], '全部聚合/自动组', '代理选择标签第一候选不能是 direct');
  assert.ok(selector.outbounds?.includes('direct'), '代理选择标签仍需保留 direct 作为关闭代理选项');
});
