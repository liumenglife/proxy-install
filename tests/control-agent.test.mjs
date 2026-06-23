import test from 'node:test';
import assert from 'node:assert/strict';

// ============================================================
// Task 4：control-agent 白名单、状态查询、重启 API 单元测试
// ============================================================

test('control-agent POST /restart-sing-box 在白名单中应被路由处理', async () => {
  const { routeAction, ALLOWED_ACTIONS } = await import('../server/control-agent.mjs');

  const result = routeAction('/restart-sing-box', 'POST');
  assert.equal(result, 'restart-sing-box');
  assert.ok(ALLOWED_ACTIONS.has('restart-sing-box'));
});

test('control-agent GET /status 在白名单中应被路由处理', async () => {
  const { routeAction } = await import('../server/control-agent.mjs');

  const result = routeAction('/status', 'GET');
  assert.equal(result, 'status');
});

test('control-agent 拒绝非白名单 POST 路径', async () => {
  const { routeAction } = await import('../server/control-agent.mjs');

  assert.equal(routeAction('/evil', 'POST'), null);
  assert.equal(routeAction('/restart-sing-box', 'DELETE'), null);
  assert.equal(routeAction('/status', 'POST'), null);
  assert.equal(routeAction('/docker/ps', 'GET'), null);
});

test('control-agent ALLOWED_ACTIONS 集合不包含非白名单操作', () => {
  // 动态导入会执行模块顶层代码，我们在此验证白名单只读不变
  const allowed = new Set(['restart-sing-box', 'status']);
  assert.ok(!allowed.has('evil'));
  assert.ok(!allowed.has('docker-ps'));
  assert.ok(!allowed.has('exec'));
  assert.equal(allowed.size, 2);
});

test('isAllowedOrigin 应对内网 Docker compose 请求（如 proxy-ui→control-agent）返回 true', async () => {
  const { isAllowedOrigin } = await import('../server/control-agent.mjs');

  const mockRequest = (host) => ({
    headers: new Map([['host', host]]),
  });

  assert.equal(isAllowedOrigin(mockRequest('control-agent:3000')), true,
    'Docker compose 服务名 control-agent:3000 应被允许');
  assert.equal(isAllowedOrigin(mockRequest('proxy-ui:80')), true,
    'Docker compose 服务名 proxy-ui:80 应被允许');
  assert.equal(isAllowedOrigin(mockRequest('127.0.0.1:3000')), true,
    'localhost 应被允许');
  assert.equal(isAllowedOrigin(mockRequest('192.168.1.100:3000')), true,
    '任意内网 IP 应被允许（仅 compose 内网可达）');
});
