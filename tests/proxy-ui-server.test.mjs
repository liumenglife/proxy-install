import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';

import { apiTargetUrl, contentType, serveStatic, isAllowedControlAction, controlActionTargetUrl, sanitizeControlResponse } from '../server/proxy-ui.mjs';

const DEPLOY_URL = process.env.PROXY_UI_DEPLOY_URL || 'http://192.168.100.135:9091';

test('服务端把同源 /api 代理到 Clash API 根路径', () => {
  assert.equal(
    apiTargetUrl('/api/proxies/%E4%BB%A3%E7%90%86%E9%80%89%E6%8B%A9%E6%A0%87%E7%AD%BE', '', 'http://127.0.0.1:9090'),
    'http://127.0.0.1:9090/proxies/%E4%BB%A3%E7%90%86%E9%80%89%E6%8B%A9%E6%A0%87%E7%AD%BE',
  );
});

test('服务端为 mjs 静态资源返回 JavaScript 类型，支持 /#/proxies 页面加载', () => {
  assert.equal(contentType('/app/ui/app.mjs'), 'text/javascript; charset=utf-8');
});

test('HTML 引用 /styles.css 且对应样式文件存在', async () => {
  const html = await readFile(new URL('../ui/index.html', import.meta.url), 'utf8');

  assert.match(html, /href="\/styles\.css"/);
  await access(new URL('../ui/styles.css', import.meta.url), constants.R_OK);
});

test('poor 延时状态使用紫色深底背景色', async () => {
  const css = await readFile(new URL('../ui/styles.css', import.meta.url), 'utf8');

  assert.match(css, /\.delay-poor\s*\{[^}]*background-color:\s*#2e1065/s);
  assert.match(css, /\.delay-poor\s*\{[^}]*color:\s*#c4b5fd/s);
  assert.doesNotMatch(css, /\.delay-poor\s*\{[^}]*border-left/);
});

test('应用脚本输出 data-delay-status 属性，便于运行态验收延时状态', async () => {
  const script = await readFile(new URL('../ui/app.mjs', import.meta.url), 'utf8');

  assert.match(script, /data-delay-status/);
});

test('静态服务 /app.mjs 返回当前 ui/app.mjs 的延时状态标记', async () => {
  const script = await readFile(new URL('../ui/app.mjs', import.meta.url), 'utf8');
  const response = await serveStatic(new URL('http://proxy-ui.local/app.mjs'));
  const body = await response.text();

  assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(body, script);
  assert.match(body, /data-delay-status/);
});

test('本地 ui/app.mjs 包含同步状态 UI 元素引用 sync-status、last-sync-time', async () => {
  const script = await readFile(new URL('../ui/app.mjs', import.meta.url), 'utf8');

  assert.match(script, /sync-status/);
  assert.match(script, /last-sync-time/);
  assert.match(script, /updateSyncStatus/);
  assert.match(script, /createRefreshScheduler/);
  assert.match(script, /syncNow/);
});

test('本地 ui/index.html 包含同步状态 DOM 元素 sync-status、last-sync-time、sync-now', async () => {
  const html = await readFile(new URL('../ui/index.html', import.meta.url), 'utf8');

  assert.match(html, /id="sync-status"/);
  assert.match(html, /id="last-sync-time"/);
  assert.match(html, /data-testid="sync-now"/);
});

test('部署端 9091 /app.mjs 哈希等于本地 ui/app.mjs 哈希', { skip: !process.env.CI && !process.env.TEST_DEPLOY }, async () => {
  const localScript = await readFile(new URL('../ui/app.mjs', import.meta.url));
  const localHash = createHash('sha256').update(localScript).digest('hex');

  let response;
  try {
    response = await fetch(`${DEPLOY_URL}/app.mjs`, { signal: AbortSignal.timeout(5000) });
  } catch {
    assert.fail(`无法连接部署端 ${DEPLOY_URL}/app.mjs，服务可能未启动`);
  }
  assert.equal(response.status, 200, `部署端 ${DEPLOY_URL}/app.mjs 返回状态 ${response.status}`);
  const remoteBody = await response.arrayBuffer();
  const remoteHash = createHash('sha256').update(Buffer.from(remoteBody)).digest('hex');

  assert.equal(remoteHash, localHash,
    `部署端 app.mjs 哈希 ${remoteHash} 不等于本地 ${localHash}，部署资源已过期需重建`);
});

test('control-agent 只允许 restart-sing-box 白名单动作', () => {
  assert.equal(isAllowedControlAction('restart-sing-box'), true);
  assert.equal(isAllowedControlAction('rm -rf /'), false);
  assert.equal(isAllowedControlAction('restart-docker'), false);
  assert.equal(controlActionTargetUrl('restart-sing-box', 'http://control-agent:8080'), 'http://control-agent:8080/actions/restart-sing-box');
});

test('control-agent 响应过滤敏感字段', () => {
  assert.deepEqual(sanitizeControlResponse({
    ok: true,
    command: 'docker restart sing-box',
    env: { SECRET: 'x' },
    summary: 'submitted',
    timestamp: '2026-06-22T00:00:00.000Z',
  }), {
    ok: true,
    summary: 'submitted',
    timestamp: '2026-06-22T00:00:00.000Z',
  });
});

test('controlActionTargetUrl 使用默认 BASE 环境变量', () => {
  assert.equal(
    controlActionTargetUrl('restart-sing-box'),
    'http://control-agent:8080/actions/restart-sing-box',
  );
});

test('sanitizeControlResponse 只保留 ok、summary、timestamp', () => {
  assert.deepEqual(sanitizeControlResponse({
    ok: false,
    summary: '失败',
    timestamp: '2026-06-22T00:00:00.000Z',
    output: 'secret log',
    cmd: 'rm -rf /',
  }), {
    ok: false,
    summary: '失败',
    timestamp: '2026-06-22T00:00:00.000Z',
  });
});

test('部署端 9091 页面包含 sync-status 同步元素', { skip: !process.env.CI && !process.env.TEST_DEPLOY }, async () => {
  let response;
  try {
    response = await fetch(`${DEPLOY_URL}/`, { signal: AbortSignal.timeout(5000) });
  } catch {
    assert.fail(`无法连接部署端 ${DEPLOY_URL}/，服务可能未启动`);
  }
  assert.equal(response.status, 200, `部署端 ${DEPLOY_URL}/ 返回状态 ${response.status}`);
  const html = await response.text();

  assert.match(html, /id="sync-status"/, '部署端 HTML 缺少 sync-status 元素');
  assert.match(html, /id="last-sync-time"/, '部署端 HTML 缺少 last-sync-time 元素');
  assert.match(html, /data-testid="sync-now"/, '部署端 HTML 缺少 sync-now 按钮');
});
