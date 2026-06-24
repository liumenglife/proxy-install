import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function readTunInbound() {
  const config = JSON.parse(await readFile(new URL('../configs/sing-box/tun-inbound.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(config.inbounds_add), 'tun-inbound.json 必须包含 inbounds_add 数组');
  const inbound = config.inbounds_add.find((item) => item.type === 'tun');
  assert.ok(inbound, 'tun-inbound.json 必须包含 type=tun 的入站配置');
  return inbound;
}

test('TUN 入站启用严格透明代理路由保护', async () => {
  const inbound = await readTunInbound();

  assert.equal(inbound.auto_route, true, 'auto_route 必须开启');
  assert.equal(inbound.auto_redirect, true, 'auto_redirect 必须开启');
  assert.equal(inbound.strict_route, true, 'strict_route 必须开启，避免系统 DNS 与路由泄漏');
});

test('TUN 入站配置默认分流与局域网排除地址', async () => {
  const inbound = await readTunInbound();

  assert.deepEqual(inbound.route_address, ['0.0.0.0/1', '128.0.0.0/1', '::/1', '8000::/1']);
  assert.ok(inbound.route_exclude_address.includes('192.168.0.0/16'));
  assert.ok(inbound.route_exclude_address.includes('fc00::/7'));
});

test('TUN 入站不使用 sing-box 1.13 已移除的 legacy 字段', async () => {
  const inbound = await readTunInbound();

  assert.equal(Object.hasOwn(inbound, 'sniff'), false, 'sing-box 1.13 已移除 inbound.sniff');
  assert.equal(Object.hasOwn(inbound, 'sniff_override_destination'), false, 'sing-box 1.13 已移除 inbound.sniff_override_destination');
});
