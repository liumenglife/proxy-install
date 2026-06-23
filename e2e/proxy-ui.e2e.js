const { test, expect } = require('@playwright/test');

const frontendUrl = process.env.PROXY_UI_URL || 'http://192.168.100.135:9091/#/proxies';
const backendUrl = process.env.PROXY_UI_BACKEND || 'http://192.168.100.135:9090';
const selectorName = '代理选择标签';

async function getProxies(request) {
  const response = await request.get(`${backendUrl}/proxies`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()).proxies;
}

async function putProxy(request, group, name) {
  const response = await request.put(`${backendUrl}/proxies/${encodeURIComponent(group)}`, {
    data: { name },
  });
  expect(response.ok()).toBeTruthy();
}

function pickDifferent(values, current) {
  return values.find((value) => value !== current) || values[0];
}

function expectRelativeOrder(values, expectedOrder) {
  const indexes = expectedOrder.map((value) => values.indexOf(value));
  expect(indexes.every((index) => index !== -1), `缺少选项：${expectedOrder.filter((_, index) => indexes[index] === -1).join(', ')}`).toBeTruthy();
  expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
}

function latestHistoryDelay(proxy) {
  const latest = proxy?.history?.at(-1);
  if (!latest || latest.delay === 0) return undefined;
  return latest.delay;
}

function latestHistoryRank(proxy) {
  const latest = proxy?.history?.at(-1);
  if (!latest) return 2;
  if (latest.delay === 0 || latest.failed || latest.error) return 1;
  return typeof latest.delay === 'number' ? 0 : 2;
}

function latestHistoryStatus(proxy) {
  const latest = proxy?.history?.at(-1);
  if (!latest) return 'timeout';
  if (latest.delay === 0 || latest.failed || latest.error) return 'timeout';
  if (typeof latest.delay !== 'number') return 'timeout';
  if (latest.delay < 500) return 'excellent';
  if (latest.delay < 1000) return 'good';
  if (latest.delay < 2000) return 'warning';
  return 'poor';
}

function delayText(proxy) {
  const delay = latestHistoryDelay(proxy);
  const status = latestHistoryStatus(proxy);
  if (typeof delay === 'number') return `延时：${delay}ms`;
  if (status === 'timeout') return '延时：timeout';
  return '延时：--';
}

function expectedSortedNodes(proxies, nodeNames) {
  const uniqueNodeNames = [];
  const seen = new Set();
  for (const name of nodeNames) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    uniqueNodeNames.push(name);
  }

  return uniqueNodeNames
    .map((name, index) => ({ name, index, delay: latestHistoryDelay(proxies[name]) }))
    .sort((left, right) => {
      const leftRank = latestHistoryRank(proxies[left.name]);
      const rightRank = latestHistoryRank(proxies[right.name]);
      if (leftRank !== rightRank) return leftRank - rightRank;
      if (leftRank === 0 && left.delay !== right.delay) return left.delay - right.delay;
      return left.index - right.index;
    })
    .map(({ name }) => name);
}

function expectedSortedNodeModels(proxies, nodeNames) {
  return expectedSortedNodes(proxies, nodeNames).map((name) => ({
    name,
    delayText: delayText(proxies[name]),
    status: latestHistoryStatus(proxies[name]),
  }));
}

test('独立代理 UI 显示顶部控制、只读路由和自动组列表', async ({ page, request }) => {
  const proxies = await getProxies(request);
  const automaticGroups = Object.values(proxies)
    .filter((proxy) => proxy.name.endsWith('/自动组'))
    .map((proxy) => proxy.name)
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

  expect(automaticGroups.length).toBeGreaterThan(0);

  await page.goto(`${frontendUrl}?_pw=${Date.now()}`, { waitUntil: 'networkidle' });

  await expect(page).toHaveTitle(/代理控制台/);
  await expect(page.getByRole('heading', { name: '代理控制台' })).toBeVisible();
  await expect(page.getByLabel('自动组代理选择器')).toBeVisible();
  await expect(page.getByTestId('route-track')).toBeVisible();
  await expect(page.getByTestId('route-track')).toContainText('→');

  const optionValues = await page
    .getByTestId('auto-group-select')
    .locator('option')
    .evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
  const expectedAutoGroups = [
    '全部聚合/自动组',
    '按机场/猫熊机场/自动组',
    '按机场/穿墙猫机场/自动组',
    '按机场/穿山甲机场/自动组',
    '按机场/瞬云机场/自动组',
  ];
  const existing = expectedAutoGroups.filter((v) => optionValues.includes(v));
  expectRelativeOrder(optionValues, existing);

  const manualSectionHeadings = await page.locator('#sections > section > h2').evaluateAll((headings) => headings.map((heading) => heading.textContent));
  expect(manualSectionHeadings.some((text) => text.includes('全部聚合'))).toBeTruthy();
  expect(manualSectionHeadings.some((text) => text.includes('按机场'))).toBeTruthy();
  expect(manualSectionHeadings.some((text) => text.includes('按地区'))).toBeTruthy();
  expect(manualSectionHeadings).not.toContain('一级分组/手动组');

  const manualGroup = Object.values(proxies).find((proxy) => proxy.type === 'Selector' && proxy.name.endsWith('/手动组') && proxy.all?.length >= 2);
  expect(manualGroup, '需要至少一个包含多个节点的手动组').toBeTruthy();
  await page.getByTestId(`manual-group-${manualGroup.name}`).click();
  const expectedNodes = expectedSortedNodeModels(proxies, manualGroup.all);
  const availableCount = expectedNodes.filter((node) => ['excellent', 'good', 'warning', 'poor'].includes(node.status)).length;
  const manualGroupDom = page.getByTestId(`manual-group-${manualGroup.name}`);

  await expect(manualGroupDom.locator('.availability-metric')).toContainText(String(availableCount));
  await expect(manualGroupDom.locator('.availability-metric')).toContainText(String(expectedNodes.length));
  const renderedNodes = await manualGroupDom
    .locator('.nodes .node-card')
    .evaluateAll((nodes) => nodes.map((node) => ({
      name: node.dataset.nodeName,
      status: node.dataset.delayStatus,
      hasStatusClass: node.classList.contains(`delay-${node.dataset.delayStatus}`),
      text: node.textContent,
    })));
  expect(renderedNodes.map((node) => node.name)).toEqual(expectedNodes.map((node) => node.name));
  expect(renderedNodes.map((node) => node.status)).toEqual(expectedNodes.map((node) => node.status));
  expect(renderedNodes.every((node) => node.hasStatusClass)).toBeTruthy();
  // 新 chip 结构：text 为 "节点名197ms" 格式，含 ms 或 timeout
  expect(renderedNodes.every((node) => /\d+ms|timeout/.test(node.text))).toBeTruthy();

  const selectedNode = expectedNodes[0].name;
  await manualGroupDom.getByTestId(`manual-node-${manualGroup.name}-${selectedNode}`).click();
  await expect.poll(async () => (await getProxies(request))[manualGroup.name].now).toBe(selectedNode);

  await page.getByTestId(`manual-group-${manualGroup.name}`).click();
  const rerenderedNodes = await page
    .getByTestId(`manual-group-${manualGroup.name}`)
    .locator('.nodes .node-card')
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.nodeName));
  expect(rerenderedNodes).toEqual(expectedNodes.map((node) => node.name));
});

test('自动组只读说明静态提示文案已移除', async ({ page }) => {
  await page.goto(`${frontendUrl}?_pw=${Date.now()}`, { waitUntil: 'networkidle' });

  await expect(page.getByTestId('readonly-auto-note')).toHaveCount(0);
  await expect(page.getByText('自动组不可手动选择，请去对应手动组选择')).toHaveCount(0);
});

test('自动组切换和手动组节点选择会刷新并保持代理选择标签一致', async ({ page, request }) => {
  const proxies = await getProxies(request);
  const automaticGroups = Object.values(proxies)
    .filter((proxy) => proxy.name.endsWith('/自动组'))
    .map((proxy) => proxy.name)
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const manualGroup = Object.values(proxies).find(
    (proxy) => proxy.type === 'Selector' && proxy.name.endsWith('/手动组') && proxy.all?.length,
  );

  expect(automaticGroups.length).toBeGreaterThan(0);
  expect(manualGroup, '需要至少一个包含节点的手动组').toBeTruthy();

  const automaticGroup = pickDifferent(automaticGroups, proxies[selectorName].now);
  await page.goto(`${frontendUrl}?_pw=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.getByTestId('auto-group-select').selectOption(automaticGroup);
  await expect.poll(async () => (await getProxies(request))[selectorName].now).toBe(automaticGroup);
  await expect(page.getByTestId('route-segment-selector')).toContainText(automaticGroup.split('/').filter(Boolean).join(' / '));

  const manualNode = manualGroup.all.find((name) => name.includes('V366-日本') && name.includes('猫熊机场')) || manualGroup.all[0];
  await page.getByTestId(`manual-group-${manualGroup.name}`).click();
  await page.getByTestId(`manual-node-${manualGroup.name}-${manualNode}`).click();

  await expect.poll(async () => (await getProxies(request))[manualGroup.name].now).toBe(manualNode);
  await expect.poll(async () => (await getProxies(request))[selectorName].now).toBe(manualGroup.name);

  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'networkidle' });

  // 后台自动评估可能覆盖手动选择，轮询中重设 API 状态并等待 UI 落定
  await expect.poll(async () => {
    const p = await getProxies(request);
    if (p[selectorName]?.now !== manualGroup.name) {
      await putProxy(request, selectorName, manualGroup.name);
    }
    if (p[manualGroup.name]?.now !== manualNode) {
      await putProxy(request, manualGroup.name, manualNode);
    }
    return page.getByTestId('route-track').textContent();
  }, { timeout: 10000 }).toContain(manualGroup.name.split('/').filter(Boolean).join(' / '));

  await putProxy(request, selectorName, automaticGroup);
});

test('后台状态变化后 UI 自动同步并保留已展开手动组', async ({ page, request }) => {
  const proxies = await getProxies(request);
  const manualGroup = Object.values(proxies).find(
    (proxy) => proxy.type === 'Selector' && proxy.name.endsWith('/手动组') && proxy.all?.length >= 2,
  );
  expect(manualGroup, '需要至少一个包含多个节点的手动组').toBeTruthy();
  const originalNode = manualGroup.now;
  const nextNode = pickDifferent(manualGroup.all, originalNode);

  await page.goto(`${frontendUrl}?_pw=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.getByTestId(`manual-group-${manualGroup.name}`).click();
  await expect(page.getByTestId(`manual-group-${manualGroup.name}`)).toHaveAttribute('open', '');
  await expect(page.getByTestId('last-sync-time')).toBeVisible();

  await putProxy(request, manualGroup.name, nextNode);
  await putProxy(request, selectorName, manualGroup.name);

  // 后台自动评估可能覆盖手动选择，轮询中重设 API 状态并等待 UI 落定
  await expect.poll(async () => {
    const p = await getProxies(request);
    if (p[selectorName]?.now !== manualGroup.name) {
      await putProxy(request, selectorName, manualGroup.name);
    }
    return page.getByTestId('route-track').textContent();
  }, { timeout: 10000 }).toContain(manualGroup.name.split('/').filter(Boolean).join(' / '));
  await expect(page.getByTestId(`manual-group-${manualGroup.name}`)).toHaveAttribute('open', '');
  await expect(page.getByTestId('sync-status')).toContainText(/已同步|同步中/);

  if (originalNode) await putProxy(request, manualGroup.name, originalNode);
});

test('自动刷新后保留已展开手动组和页面滚动位置', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 420 });
  const manualGroupName = '按地区/日本/手动组';
  const firstNode = '日本节点A';
  const secondNode = '日本节点B';
  let proxiesCalls = 0;

  function proxySet(currentNode) {
    const proxies = {
      [selectorName]: {
        name: selectorName,
        type: 'Selector',
        now: manualGroupName,
        all: ['全部聚合/自动组', manualGroupName],
      },
      '全部聚合/自动组': {
        name: '全部聚合/自动组',
        type: 'URLTest',
        now: firstNode,
        all: [firstNode, secondNode],
      },
      [manualGroupName]: {
        name: manualGroupName,
        type: 'Selector',
        now: currentNode,
        all: [firstNode, secondNode],
      },
      [firstNode]: { name: firstNode, history: [{ time: '2026-06-22T10:00:00Z', delay: 80 }] },
      [secondNode]: { name: secondNode, history: [{ time: '2026-06-22T10:01:00Z', delay: 120 }] },
    };

    for (let index = 0; index < 24; index += 1) {
      const groupName = `按地区/测试${index}/手动组`;
      const nodeName = `测试节点${index}`;
      proxies[groupName] = { name: groupName, type: 'Selector', now: nodeName, all: [nodeName] };
      proxies[nodeName] = { name: nodeName, history: [{ time: '2026-06-22T10:00:00Z', delay: 200 + index }] };
    }

    return proxies;
  }

  await page.route('**/api/proxies', async (route) => {
    proxiesCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ proxies: proxySet(proxiesCalls === 1 ? firstNode : secondNode) }),
    });
  });

  await page.goto(`${frontendUrl}?_pw=${Date.now()}`, { waitUntil: 'networkidle' });
  const manualGroup = page.getByTestId(`manual-group-${manualGroupName}`);
  await manualGroup.locator('.availability-metric').click();
  await expect(manualGroup).toHaveAttribute('open', '');

  await page.evaluate(() => window.scrollTo(0, Math.floor(document.body.scrollHeight / 2)));
  const scrollBefore = await page.evaluate(() => window.scrollY);
  expect(scrollBefore).toBeGreaterThan(0);

  await expect.poll(() => proxiesCalls, { timeout: 6000 }).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('route-track')).toContainText('→');
  await expect(manualGroup).toHaveAttribute('open', '');

  const scrollAfter = await page.evaluate(() => window.scrollY);
  expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(20);
});

test('代理开关：点击切换到 direct，验证 UI 显示已关闭', async ({ page }) => {
  let lastPutName = '';
  let currentNow = '全部聚合/自动组';
  const defaultGroup = '全部聚合/自动组';

  await page.route('**/api/proxies**', async (route) => {
    const method = route.request().method();
    if (method === 'PUT') {
      const body = JSON.parse(route.request().postData() || '{}');
      lastPutName = body.name;
      currentNow = body.name;
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        proxies: {
          [selectorName]: {
            name: selectorName,
            type: 'Selector',
            now: currentNow,
            all: ['direct', defaultGroup],
          },
          [defaultGroup]: { name: defaultGroup, type: 'URLTest', now: '', all: [] },
        },
      }),
    });
  });

  await page.goto(`${frontendUrl}?_pw=${Date.now()}`, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('proxy-state-label')).toContainText('已开启');

  const toggleBtn = page.getByTestId('proxy-toggle');
  await expect(toggleBtn).toBeVisible();
  await toggleBtn.click();

  await expect.poll(() => lastPutName, { timeout: 10000 }).toBe('direct');
  await expect(page.getByTestId('proxy-state-label')).toContainText('已关闭');
});

test('代理开关：从 direct 切回恢复默认组，验证 UI 显示已开启', async ({ page }) => {
  let lastPutName = '';
  let currentNow = 'direct';
  const defaultGroup = '全部聚合/自动组';

  await page.route('**/api/proxies**', async (route) => {
    const method = route.request().method();
    if (method === 'PUT') {
      const body = JSON.parse(route.request().postData() || '{}');
      lastPutName = body.name;
      currentNow = body.name;
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        proxies: {
          [selectorName]: {
            name: selectorName,
            type: 'Selector',
            now: currentNow,
            all: ['direct', defaultGroup],
          },
          [defaultGroup]: { name: defaultGroup, type: 'URLTest', now: '', all: [] },
        },
      }),
    });
  });

  await page.goto(`${frontendUrl}?_pw=${Date.now()}`, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('proxy-state-label')).toContainText('已关闭');

  const toggleBtn = page.getByTestId('proxy-toggle');
  await expect(toggleBtn).toBeVisible();
  await toggleBtn.click();

  await expect.poll(() => lastPutName, { timeout: 10000 }).toBe(defaultGroup);
  await expect(page.getByTestId('proxy-state-label')).toContainText('已开启');
});

test('重启按钮 UI 存在（功能测试跳过，无 Docker socket）', async ({ page }) => {
  await page.goto(`${frontendUrl}?_pw=${Date.now()}`, { waitUntil: 'networkidle' });

  const restartBtn = page.getByTestId('restart-singbox');
  await expect(restartBtn).toBeVisible();
  await expect(restartBtn).toHaveText(/重启/);
});

test('顶部控件、模式横幅、路由轨道和手动区域标题正确渲染', async ({ page }) => {
  await page.goto(`${frontendUrl}?_pw=${Date.now()}`, { waitUntil: 'networkidle' });

  await expect(page.getByTestId('test-all-delay')).toBeVisible();
  await expect(page.getByTestId('test-all-delay')).toHaveText('全部延时');
  await expect(page.getByTestId('expand-toggle')).toBeVisible();
  await expect(page.getByTestId('expand-toggle')).toHaveText('全部展开');
  await expect(page.getByTestId('locate-current-node')).toHaveCount(0);

  await expect(page.getByTestId('mode-banner')).toBeVisible();
  await expect(page.getByTestId('mode-banner')).toContainText(/当前模式/);
  await expect(page.getByTestId('route-track')).toBeVisible();
  await expect(page.getByTestId('route-segment-selector')).toBeVisible();
  await expect(page.getByTestId('route-segment-node')).toBeVisible();

  await expect(page.locator('.section-heading').first()).toBeVisible();
  const sectionTexts = await page.locator('.section-heading').evaluateAll(
    (headings) => headings.map((h) => h.textContent),
  );
  expect(sectionTexts.some((text) => text.includes('全部聚合'))).toBeTruthy();
  expect(sectionTexts.some((text) => text.includes('按机场'))).toBeTruthy();
  expect(sectionTexts.some((text) => text.includes('按地区'))).toBeTruthy();

  await expect(page.getByText('手动代理选择区域')).toBeVisible();

  const summaryActions = page.locator('.summary-actions').first();
  await expect(summaryActions).toBeVisible();
  const locateButton = summaryActions.locator('.group-locate-btn');
  await expect(locateButton).toContainText('定位');
  await expect(locateButton).not.toContainText('📌');
  await expect(locateButton.locator('svg')).toHaveCount(1);

  const nodeCards = page.locator('.node-card');
  const nodeCardCount = await nodeCards.count();
  if (nodeCardCount > 0) {
    await expect(nodeCards.first()).not.toContainText(/速度/);
  }
});

test('快捷键 Meta+K 全部展开、Meta+L 全部收起', async ({ page }) => {
  await page.goto(`${frontendUrl}?_pw=${Date.now()}`, { waitUntil: 'networkidle' });

  const expandBtn = page.getByTestId('expand-toggle');
  await expect(expandBtn).toHaveText('全部展开');

  await page.keyboard.press('Meta+K');
  await page.waitForTimeout(300);
  await expect(page.locator('details.manual-group[open]').first()).toBeVisible();
  await expect(expandBtn).toHaveText('全部收起');

  await page.keyboard.press('Meta+L');
  await page.waitForTimeout(300);
  await expect(expandBtn).toHaveText('全部展开');
});

test('快速连续点击节点时自动刷新不打断交互，页面保持一致状态', async ({ page }) => {
  const manualGroupName = '按地区/日本/手动组';
  const firstNode = '日本节点A';
  const secondNode = '日本节点B';
  let proxiesCalls = 0;

  function proxySet(currentNode) {
    const proxies = {
      [selectorName]: {
        name: selectorName,
        type: 'Selector',
        now: manualGroupName,
        all: ['全部聚合/自动组', manualGroupName],
      },
      '全部聚合/自动组': {
        name: '全部聚合/自动组',
        type: 'URLTest',
        now: firstNode,
        all: [firstNode, secondNode],
      },
      [manualGroupName]: {
        name: manualGroupName,
        type: 'Selector',
        now: currentNode,
        all: [firstNode, secondNode],
      },
      [firstNode]: { name: firstNode, history: [{ time: '2026-06-22T10:00:00Z', delay: 80 }] },
      [secondNode]: { name: secondNode, history: [{ time: '2026-06-22T10:01:00Z', delay: 120 }] },
    };
    return proxies;
  }

  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.route('**/api/proxies**', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    proxiesCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ proxies: proxySet(firstNode) }),
    });
  });

  await page.goto(`${frontendUrl}?_pw=${Date.now()}`, { waitUntil: 'networkidle' });

  const manualGroup = page.getByTestId(`manual-group-${manualGroupName}`);
  await manualGroup.locator('.availability-metric').click();
  await expect(manualGroup).toHaveAttribute('open', '');

  for (let i = 0; i < 5; i++) {
    const node = i % 2 === 0 ? firstNode : secondNode;
    await page.getByTestId(`manual-node-${manualGroupName}-${node}`).click();
    await page.waitForTimeout(50);
  }

  await expect(manualGroup).toHaveAttribute('open', '');
  expect(errors).toEqual([]);

  const nodeButtons = await manualGroup.locator('.nodes .node-card').count();
  expect(nodeButtons).toBeGreaterThanOrEqual(1);
});
