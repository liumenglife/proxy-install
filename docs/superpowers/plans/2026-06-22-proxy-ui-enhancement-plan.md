# Proxy UI Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 `proxy-ui` 增强为可日常使用的现代深色代理控制台，覆盖实时刷新、测速、分组重排、代理启动/关闭、受限内核重启与完整验收。

**Execution Status:** 当前计划仅完成文档修订；用户明确确认前不得执行实现任务、不得写实现代码、不得提交。

**Architecture:** 前端继续使用同源 `/api`，在 `ui/app.mjs` 内建立纯函数数据模型、API 客户端和 DOM 渲染边界；服务端 `server/proxy-ui.mjs` 只增加受限 control-agent 白名单转发和同源代理能力。测试分为 `node:test` 纯函数/服务端测试、Playwright CLI 端到端测试、桌面与移动端截图验收，所有实现任务按 coding -> UT -> review -> QA -> Spec 满足度审查闭环推进。

**Tech Stack:** Bun, Node `node:test`, 原生 ES Modules, 原生 DOM, CSS, Playwright CLI, Docker Compose, sing-box Clash API

---

## 文件结构与职责

- Modify: `ui/app.mjs`：前端核心模块；负责 API 客户端、delay cache、分组分类、机场排序、地区排序、自动组代理选择器排序、手动组分组排序、节点列表按刷新后延时升序稳定排序、统计派生、实时刷新调度、测速批次、启动/关闭代理、重启交互和 DOM 渲染。
- Modify: `ui/index.html`：页面语义结构；负责顶部控制区、状态卡区、操作工具条、手动组/自动组容器、无阻断错误提示和截图可定位的 `data-testid`。
- Modify: `ui/styles.css`：现代深色控制台视觉；负责深色背景、卡片层级、状态色、响应式布局、长节点名展示、按钮状态、移动端不横向溢出。
- Modify: `server/proxy-ui.mjs`：同源服务端；负责保留 `/api/*` 转发，新增 `POST /api/control/actions/restart-sing-box` 到固定 control-agent 白名单动作，禁止任意命令输入。
- Modify: `tests/proxy-ui-unit.test.mjs`：前端纯函数和行为单元测试；覆盖分组分类、机场排序、地区映射与排序、自动组代理选择器下拉排序、手动组分组排序、节点列表刷新后延时升序稳定排序、同延时/同状态保留订阅导出顺序、统计、深绿色/浅绿色/黄色/紫色/红色/灰色颜色、速度 `--`、测速批次去重并发、启动/关闭代理选择目标。
- Modify: `tests/proxy-ui-server.test.mjs`：服务端单元测试；覆盖同源代理 URL、测速代理 URL、安全 header、control-agent 白名单路径、拒绝非白名单动作和敏感返回过滤。
- Modify: `e2e/proxy-ui.e2e.js`：Playwright CLI 全量端到端测试；覆盖页面加载、自动刷新、手动同步、全部测速、按组测速、定位当前节点、全部展开/收起、启动/关闭代理、重启确认态、无弹窗只读提示、自动组代理选择器下拉顺序、手动组分组顺序、节点列表刷新后延时升序稳定排序、延时颜色分级、视觉截图。
- Modify: `playwright.config.js`：Playwright 配置；保留 Chromium 默认全量测试，增加截图输出稳定参数，不缩小默认测试范围。
- Optional Modify: `docker-compose.yml`：仅当 control-agent 服务或环境变量当前缺失时修改；负责提供固定 `CONTROL_AGENT_BASE`，不得增加任意命令执行入口。

## 执行顺序与并行关系

- Task 0 必须最先执行，建立测试基线和现状截图。
- Task 1、Task 2、Task 3 串行执行；Task 2 依赖 Task 1 的模型，Task 3 依赖 Task 2 的统计和延时状态。
- Task 4、Task 5 可并行；Task 4 只改服务端 control-agent，Task 5 只改前端实时刷新和状态保持，但二者都依赖 Task 1 的 API 客户端边界。
- Task 6 依赖 Task 3、Task 4、Task 5；整合启动/关闭代理、重启恢复检测和页面状态。
- Task 7 依赖 Task 6；完成视觉优化与响应式验收。
- Task 8 必须最后执行；运行 Playwright CLI 默认全量测试、截图验收、QA 出口 IP 检查、Code Review、QA 审核、Spec 满足度审查。

## 每个任务的固定闭环

- coding：使用 TDD；先写失败测试，运行 RED，再写最小实现，运行 GREEN。
- UT：运行任务指定的 `bun test ...` 或 `bunx playwright test ...` 命令，输出必须明确通过。
- review：只读审核本任务变更，发现任何问题则回到 coding。
- QA：只读审核交互、安全、错误态和移动端风险，发现任何问题则回到 coding。
- Spec 满足度审查：逐条对照本计划列出的 spec 要求，结论只能是“通过”或“不通过”；不通过则回到 coding。
- commit：仅在 coding、UT、review、QA、Spec 满足度审查全部通过后执行；提交作者使用 `liumenglife <liumeng@163.com>`。

---

### Task 0：基线验证与现状记录（串行，最先执行）

**Files:**
- Inspect: `ui/app.mjs`
- Inspect: `ui/index.html`
- Inspect: `ui/styles.css`
- Inspect: `server/proxy-ui.mjs`
- Inspect: `tests/proxy-ui-unit.test.mjs`
- Inspect: `tests/proxy-ui-server.test.mjs`
- Inspect: `e2e/proxy-ui.e2e.js`

- [ ] **Step 1: 运行现有单元测试建立基线**

Run: `bun test tests/proxy-ui-unit.test.mjs tests/proxy-ui-server.test.mjs`

Expected: 现有测试全部通过；如失败，记录失败用例名称、错误信息和相关文件，先修复基线再进入 Task 1。

- [ ] **Step 2: 运行 Playwright CLI 默认全量测试建立端到端基线**

Run: `bunx playwright test`

Expected: `e2e/proxy-ui.e2e.js` 中现有测试全部通过；如真实后端不可达，记录 `PROXY_UI_URL`、`PROXY_UI_BACKEND` 和网络错误，并在 Task 8 再次执行。

- [ ] **Step 3: 记录现状截图用于视觉对比**

Run: `bunx playwright test e2e/proxy-ui.e2e.js --project=chromium --update-snapshots=none`

Expected: 不更新快照；若当前测试没有截图断言，只确认页面可加载并在 Task 7 新增截图断言。

- [ ] **Step 4: Review 闭环**

Review: 只读确认 Task 0 没有修改项目文件。

Expected: 通过。

- [ ] **Step 5: QA 闭环**

QA: 只读确认基线问题已记录到任务执行日志，未把后端不可达误判为功能完成。

Expected: 通过。

- [ ] **Step 6: Spec 满足度审查**

Check: 本任务只建立基线，不实现 spec 功能。

Expected: 通过。

---

### Task 1：前端数据模型、分组重排与统计派生（串行，依赖 Task 0）

**Files:**
- Modify: `ui/app.mjs`
- Test: `tests/proxy-ui-unit.test.mjs`

- [ ] **Step 1: Write failing tests**

在 `tests/proxy-ui-unit.test.mjs` 增加测试，断言：`buildProxyUiModel` 输出 `manualSections` 顶层顺序为 `全部聚合`、`按机场`、`按地区`、`未分类`；机场顺序为 `猫熊机场`、`穿墙猫机场`、`穿山甲机场`、`瞬云机场`，未知机场排在已知机场之后并按中文名称排序；地区顺序严格为 `香港`、`台湾`、`澳门`、`美国`、`日本`、`英国`、`法国`、`德国`、`泰国`、`菲律宾`、`马来西亚`、`印尼`、`新加坡`、`越南`、`巴基斯坦`、`印度`、`土耳其`、`沙特`、`阿曼`、`巴林`、`卡塔尔`、`伊拉克`、`俄罗斯`、`乌克兰`、`荷兰`、`加拿大`、`澳大利亚`、`巴西`、`其他`；自动组进入 `automaticSections` 且只读；自动组代理选择器下拉顺序为 `全部聚合/自动组`，然后按机场顺序列 `按机场/<机场>/自动组`，再按地区顺序列 `按地区/<地区>/自动组`，最后未知自动组按中文名称排序；节点列表在每次刷新后按最近一次延时稳定排序，顺序为有延时节点升序、timeout/接口错误红色节点、无测速灰色节点，相同状态或相同延时保留订阅导出顺序；机场/地区分组顺序不受测速影响；每个手动组统计 `availableCount`、`totalCount`、`currentNodeDelay`、`currentNodeSpeed`、`availabilityColor`。

状态断言必须覆盖：

- `<500ms` 为 `excellent` 深绿色可用且延时优秀。
- `500ms <= delay < 1000ms` 为 `good` 浅绿色可用且延时良好。
- `1000ms <= delay < 2000ms` 为 `warning` 黄色可用但延时偏高。
- `>=2000ms` 为 `poor` 紫色可用但体验差。
- timeout/接口错误为 `timeout` 红色不可用。
- 无测速数据为 `unknown` 灰色未知。
- 可用节点数必须计入 `excellent`、`good`、`warning`、`poor`，不计入 `timeout`、接口错误和 `unknown`。

排序测试数据必须覆盖全部已知机场、全部已知地区、`其他` 和至少两个未知机场/未知自动组；断言必须比较完整序列，不允许只断言前缀或只抽样断言。

```js
test('模型按固定结构输出手动组、自动组和组统计', () => {
  const model = buildProxyUiModel(proxiesWithDelayAndTraffic);

  assert.deepEqual(model.manualSections.map((section) => section.title), ['全部聚合', '按机场', '按地区', '未分类']);
  assert.deepEqual(model.manualSections[1].groups.map((group) => group.scopeName), ['猫熊机场', '穿墙猫机场', '穿山甲机场', '瞬云机场', '未知甲机场', '未知乙机场']);
  assert.deepEqual(model.manualSections[2].groups.map((group) => group.scopeName), ['香港', '台湾', '澳门', '美国', '日本', '英国', '法国', '德国', '泰国', '菲律宾', '马来西亚', '印尼', '新加坡', '越南', '巴基斯坦', '印度', '土耳其', '沙特', '阿曼', '巴林', '卡塔尔', '伊拉克', '俄罗斯', '乌克兰', '荷兰', '加拿大', '澳大利亚', '巴西', '其他']);
  assert.deepEqual(model.automaticSelectorOptions.map((option) => option.name), ['全部聚合/自动组', '按机场/猫熊机场/自动组', '按机场/穿墙猫机场/自动组', '按机场/穿山甲机场/自动组', '按机场/瞬云机场/自动组', '按地区/香港/自动组', '按地区/台湾/自动组', '按地区/澳门/自动组', '按地区/美国/自动组', '按地区/日本/自动组', '按地区/英国/自动组', '按地区/法国/自动组', '按地区/德国/自动组']);
  assert.deepEqual(model.manualSections[0].groups[0].nodes.map((node) => node.name), ['订阅节点B', '订阅节点A', '订阅节点F', '订阅节点C', '订阅节点D', '订阅节点E']);
  assert.equal(model.manualSections[0].groups[0].availableCount, 4);
  assert.equal(model.manualSections[0].groups[0].totalCount, 6);
  assert.equal(model.manualSections[0].groups[0].currentNodeDelay.delayMs, 850);
  assert.equal(model.manualSections[0].groups[0].currentNodeSpeed, '--');
  assert.equal(model.manualSections[0].groups[0].availabilityColor, 'good');
  assert.equal(model.automaticSections[0].readonlyMessage, readonlyAutomaticNodeMessage);
});
```

- [ ] **Step 2: Run RED**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: FAIL，失败原因包含 `manualSections` 或统计字段尚不存在。

- [ ] **Step 3: Implement minimal model functions**

在 `ui/app.mjs` 中新增或调整纯函数：`classifyManualGroups(proxies)`、`classifyAutomaticGroups(proxies)`、`sortAirportGroups(groups)`、`sortRegionGroups(groups)`、`buildAutomaticSelectorOptions(groups)`、`mapRegion(groupName, nodeName)`、`statusFromDelay(delayMs, failed)`、`sortNodesByDelay(nodes, delayCache)`、`buildDelayCache(proxies, existingCache)`、`buildGroupStats(group, delayCache, trafficSummary)`、`buildProxyUiModel(proxies, options)`。实现规则：真实名称作为主文本；手动组顶层固定为 `全部聚合`、`按机场`、`按地区`、`未分类`；机场固定顺序为 `猫熊机场`、`穿墙猫机场`、`穿山甲机场`、`瞬云机场`，未知机场排在已知机场之后并按中文名称排序；地区固定顺序为 `香港`、`台湾`、`澳门`、`美国`、`日本`、`英国`、`法国`、`德国`、`泰国`、`菲律宾`、`马来西亚`、`印尼`、`新加坡`、`越南`、`巴基斯坦`、`印度`、`土耳其`、`沙特`、`阿曼`、`巴林`、`卡塔尔`、`伊拉克`、`俄罗斯`、`乌克兰`、`荷兰`、`加拿大`、`澳大利亚`、`巴西`、`其他`；自动组只读并按同一规则生成下拉选项；节点列表每次刷新后按最近一次延时升序稳定排序，timeout/接口错误排在有延时节点后，无测速灰色节点最后，同延时/同状态保留订阅导出顺序；未知速度返回 `--`；颜色严格为 `excellent`、`good`、`warning`、`poor`、`timeout`、`unknown`，其中 `excellent` 表示 `<500ms` 的深绿色状态，`good` 表示 `500ms <= delay < 1000ms` 的浅绿色状态，`poor` 表示 `>=2000ms` 的紫色可用但体验差状态。

- [ ] **Step 4: Run GREEN**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: PASS。

- [ ] **Step 5: Review 闭环**

Review: 只读检查模型没有伪造速度，没有用截断别名替代真实节点名，没有把自动组变成可写 selector，机场/地区/自动组下拉/手动组分组排序没有依赖接口返回顺序或测速结果。

Expected: 通过；发现问题回到 Step 3。

- [ ] **Step 6: QA 闭环**

QA: 只读检查地区映射、机场映射、自动组代理选择器排序、手动组分组排序、节点列表刷新后延时升序稳定排序、同延时/同状态订阅导出顺序 tie-breaker、未分类兜底、可用节点计数和颜色语义覆盖 spec，确认 `>=2000ms` 紫色节点仍按真实延时参与升序并计入可用节点数，只有 timeout、接口错误和灰色未知不计入。

Expected: 通过；发现问题回到 Step 3。

- [ ] **Step 7: Spec 满足度审查**

Check: 覆盖 spec 4、6、7 的数据模型、分组展示规则、固定排序规则、延时状态规则。

Expected: 通过；不通过回到 Step 1 或 Step 3。

- [ ] **Step 8: Commit**

Run: `git add ui/app.mjs tests/proxy-ui-unit.test.mjs && git -c user.name="liumenglife" -c user.email="liumeng@163.com" commit -m "feat: derive proxy ui groups and stats"`

Expected: 提交成功。

---

### Task 2：测速 API、delay cache 与并发批次（串行，依赖 Task 1）

**Files:**
- Modify: `ui/app.mjs`
- Test: `tests/proxy-ui-unit.test.mjs`

- [ ] **Step 1: Write failing tests**

新增测试断言：`testNodesWithLimit` 并发上限为 6；同一批次同名节点只测速一次；成功写入 `manual-test`、`group-test`、`all-test` 来源；`<500ms` 成功结果写入 `excellent` 深绿色且视为可用；`500ms <= delay < 1000ms` 写入 `good` 浅绿色且视为可用；`1000ms <= delay < 2000ms` 写入 `warning` 黄色且视为可用；`>=2000ms` 成功结果写入 `poor` 紫色且仍视为可用；超时和接口错误写入 `timeout` 且不计入可用；进度按 `completed/total` 更新；部分失败不终止批次。

```js
test('测速批次限制并发、去重并写入 delay cache', async () => {
  const calls = [];
  const api = { testDelay: async (name) => { calls.push(name); return name === '节点C' ? { ok: false } : { delay: name === '节点D' ? 320 : name === '节点B' ? 2200 : 900 }; } };
  const progress = [];

  const cache = await testNodesWithLimit(api, ['节点A', '节点B', '节点A', '节点C', '节点D'], {
    limit: 6,
    source: 'all-test',
    onProgress: (value) => progress.push(value),
  });

  assert.deepEqual(calls, ['节点A', '节点B', '节点C', '节点D']);
  assert.equal(cache.get('节点A').status, 'good');
  assert.equal(cache.get('节点A').source, 'all-test');
  assert.equal(cache.get('节点B').status, 'poor');
  assert.equal(cache.get('节点C').status, 'timeout');
  assert.equal(cache.get('节点D').status, 'excellent');
  assert.deepEqual(progress.at(-1), { completed: 4, total: 4 });
});
```

- [ ] **Step 2: Run RED**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: FAIL，失败原因包含 `testNodesWithLimit` 或 `testDelay` 尚不存在。

- [ ] **Step 3: Implement minimal delay client and batch runner**

在 `createApi` 增加 `testDelay(name)`，请求同源 `/api/proxies/:name/delay?timeout=5000&url=https%3A%2F%2Fwww.gstatic.com%2Fgenerate_204`。在 `ui/app.mjs` 导出 `testNodesWithLimit`、`mergeDelayResult`，并实现 6 并发、5000ms 超时、批次内去重、失败继续、非阻断错误摘要。

- [ ] **Step 4: Run GREEN**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: PASS。

- [ ] **Step 5: Review 闭环**

Review: 只读检查测速只访问同源 `/api`，没有跨域访问 `9090`，没有用户可输入测速 URL，失败不会中断整个批次。

Expected: 通过；发现问题回到 Step 3。

- [ ] **Step 6: QA 闭环**

QA: 只读检查全部测速、按组测速、进度显示和错误摘要能支持大量节点，不打满后端。

Expected: 通过；发现问题回到 Step 3。

- [ ] **Step 7: Spec 满足度审查**

Check: 覆盖 spec 5.2、7 的测速调用、并发、超时、进度、失败处理和 delay cache。

Expected: 通过；不通过回到 Step 1 或 Step 3。

- [ ] **Step 8: Commit**

Run: `git add ui/app.mjs tests/proxy-ui-unit.test.mjs && git -c user.name="liumenglife" -c user.email="liumeng@163.com" commit -m "feat: add proxy delay testing cache"`

Expected: 提交成功。

---

### Task 3：DOM 结构、操作工具条与非阻断自动组提示（串行，依赖 Task 2）

**Files:**
- Modify: `ui/index.html`
- Modify: `ui/app.mjs`
- Test: `tests/proxy-ui-unit.test.mjs`

- [ ] **Step 1: Write failing tests**

新增 DOM 行为测试，断言页面不包含 `SING-BOX CLASH API`；手动组标题只出现一次；自动组只读提示写入页面内 `#readonly-auto-note` 或组内说明，不调用 `alert`；工具条按钮存在 `test-all-delay`、`test-group-delay-*`、`locate-current-node`、`expand-all`、`collapse-all`；渲染后的自动组代理选择器下拉顺序、手动组卡片顺序、节点列表刷新后延时升序稳定排序和延时颜色分级与 Task 1 模型一致。

DOM 排序测试必须使用包含完整机场顺序、完整地区顺序和未知项的 `orderedProxyUiModel`，断言完整 DOM 序列，不允许只断言可视区域或前几个节点。

```js
test('页面结构暴露工具条且自动组提示不使用 alert', async () => {
  const html = await readFile(new URL('../ui/index.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /SING-BOX CLASH API/i);
  assert.match(html, /data-testid="test-all-delay"/);
  assert.match(html, /data-testid="locate-current-node"/);
  assert.match(html, /data-testid="expand-all"/);
  assert.match(html, /data-testid="collapse-all"/);
  assert.match(html, /自动组不可手动选择/);
});

test('DOM 渲染保持自动组下拉、手动组和节点列表稳定排序', () => {
  renderProxyGroups(container, orderedProxyUiModel);

  assert.deepEqual([...container.querySelectorAll('[data-testid="automatic-group-option"]')].map((el) => el.textContent.trim()), ['全部聚合/自动组', '按机场/猫熊机场/自动组', '按机场/穿墙猫机场/自动组', '按机场/穿山甲机场/自动组', '按机场/瞬云机场/自动组', '按地区/香港/自动组', '按地区/台湾/自动组']);
  assert.deepEqual([...container.querySelectorAll('[data-testid="manual-group-card"]')].map((el) => el.dataset.groupName), ['全部聚合/手动组', '按机场/猫熊机场/手动组', '按机场/穿墙猫机场/手动组', '按机场/穿山甲机场/手动组', '按机场/瞬云机场/手动组', '按地区/香港/手动组', '按地区/台湾/手动组', '未分类/其他/手动组']);
  assert.deepEqual([...container.querySelectorAll('[data-testid="node-row"]')].map((el) => el.dataset.nodeName).slice(0, 6), ['订阅节点B', '订阅节点A', '订阅节点F', '订阅节点C', '订阅节点D', '订阅节点E']);
  assert.deepEqual([...container.querySelectorAll('[data-testid="node-row"]')].map((el) => el.dataset.delayStatus).slice(0, 6), ['excellent', 'good', 'warning', 'poor', 'timeout', 'unknown']);
});
```

- [ ] **Step 2: Run RED**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: FAIL，失败原因包含缺少工具条或仍存在旧文案。

- [ ] **Step 3: Implement semantic layout and actions**

修改 `ui/index.html`：顶部控制区包含产品名称、后台同步状态、最后刷新时间、启动/关闭代理按钮、重启 sing-box 内核按钮、手动同步按钮；状态卡区包含实际路由、当前组、当前节点、延时、速度、可用性、连接/流量摘要；工具条包含全部测速、定位当前节点、全部展开、全部收起。修改 `ui/app.mjs`：渲染手动组与自动组分区，自动组代理选择器、手动组卡片和节点列表使用 Task 1 已排序模型；节点列表保留真实名称，并按刷新后延时升序稳定排序，同延时/同状态使用订阅导出顺序 tie-breaker；自动组节点点击只更新页面内提示文字。

- [ ] **Step 4: Run GREEN**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: PASS。

- [ ] **Step 5: Review 闭环**

Review: 只读检查 DOM 不再使用 `alert`，不重复显示“一级分组/手动组”，按钮有稳定 `data-testid`，自动组代理选择器和手动组卡片渲染顺序没有被 DOM 层重新排序或打乱。

Expected: 通过；发现问题回到 Step 3。

- [ ] **Step 6: QA 闭环**

QA: 只读检查定位当前节点会展开并滚动到当前组，全部展开/收起不会隐藏顶部状态卡，测速更新后节点列表按延时升序稳定排序，timeout/接口错误红色节点排在有延时节点后，无测速灰色节点最后，相同状态或相同延时保留订阅导出顺序。

Expected: 通过；发现问题回到 Step 3。

- [ ] **Step 7: Spec 满足度审查**

Check: 覆盖 spec 1、3、6、7 的信息架构、只读提示、分组内容区和操作工具条。

Expected: 通过；不通过回到 Step 1 或 Step 3。

- [ ] **Step 8: Commit**

Run: `git add ui/index.html ui/app.mjs tests/proxy-ui-unit.test.mjs && git -c user.name="liumenglife" -c user.email="liumeng@163.com" commit -m "feat: restructure proxy ui controls"`

Expected: 提交成功。

---

### Task 4：control-agent 重启内核白名单接口（可并行，依赖 Task 1）

**Files:**
- Modify: `server/proxy-ui.mjs`
- Test: `tests/proxy-ui-server.test.mjs`
- Optional Modify: `docker-compose.yml`

- [ ] **Step 1: Write failing tests**

新增服务端测试，断言 `controlActionTargetUrl('restart-sing-box')` 指向固定 control-agent；`sanitizeControlResponse` 不返回环境变量、完整日志或命令内容；`isAllowedControlAction('restart-sing-box')` 为真，其他动作均为假。

```js
test('control-agent 只允许 restart-sing-box 白名单动作', () => {
  assert.equal(isAllowedControlAction('restart-sing-box'), true);
  assert.equal(isAllowedControlAction('rm -rf /'), false);
  assert.equal(isAllowedControlAction('restart-docker'), false);
  assert.equal(controlActionTargetUrl('restart-sing-box', 'http://control-agent:8080'), 'http://control-agent:8080/actions/restart-sing-box');
});

test('control-agent 响应过滤敏感字段', () => {
  assert.deepEqual(sanitizeControlResponse({ ok: true, command: 'docker restart sing-box', env: { SECRET: 'x' }, summary: 'submitted', timestamp: '2026-06-22T00:00:00.000Z' }), {
    ok: true,
    summary: 'submitted',
    timestamp: '2026-06-22T00:00:00.000Z',
  });
});
```

- [ ] **Step 2: Run RED**

Run: `bun test tests/proxy-ui-server.test.mjs`

Expected: FAIL，失败原因包含 control-agent 辅助函数尚不存在。

- [ ] **Step 3: Implement whitelist proxy**

在 `server/proxy-ui.mjs` 增加 `CONTROL_AGENT_BASE` 环境变量默认值 `http://control-agent:8080`；导出 `isAllowedControlAction`、`controlActionTargetUrl`、`sanitizeControlResponse`；在 Bun server 中只处理 `POST /api/control/actions/restart-sing-box`，请求体固定为 `{ "action": "restart-sing-box" }`，不转发用户输入命令，响应只返回 `ok`、`summary`、`timestamp`。

- [ ] **Step 4: Run GREEN**

Run: `bun test tests/proxy-ui-server.test.mjs`

Expected: PASS。

- [ ] **Step 5: Review 闭环**

Review: 只读检查没有 shell 拼接，没有通配 action 路由，没有把敏感字段返回前端。

Expected: 通过；发现问题回到 Step 3。

- [ ] **Step 6: QA 闭环**

QA: 只读检查 control-agent 不可达时返回非阻断错误摘要，前端可展示失败状态。

Expected: 通过；发现问题回到 Step 3。

- [ ] **Step 7: Spec 满足度审查**

Check: 覆盖 spec 5.3、8.2、11 的白名单接口、安全要求和最小返回信息。

Expected: 通过；不通过回到 Step 1 或 Step 3。

- [ ] **Step 8: Commit**

Run: `git add server/proxy-ui.mjs tests/proxy-ui-server.test.mjs docker-compose.yml && git -c user.name="liumenglife" -c user.email="liumeng@163.com" commit -m "feat: add restart control whitelist"`

Expected: 提交成功；如果 `docker-compose.yml` 未修改，从 `git add` 命令中移除该文件再提交。

---

### Task 5：实时刷新、连接/流量与状态保持（可并行，依赖 Task 1）

**Files:**
- Modify: `ui/app.mjs`
- Test: `tests/proxy-ui-unit.test.mjs`

- [ ] **Step 1: Write failing tests**

新增测试断言：`createRefreshScheduler` 每 3 秒同步 `/api/proxies`，每 1 秒同步 `/api/connections` 或 `/api/traffic`；手动刷新只触发一次立即同步；展开状态和滚动状态不因自动刷新清空；测速批次进行中不被刷新中断；同步失败写入错误摘要。

```js
test('实时刷新调度区分 proxies 和 traffic 频率并保留 UI 状态', async () => {
  const calls = [];
  const state = { expandedGroups: new Set(['全部聚合/手动组']), activeBatch: true };
  const scheduler = createRefreshScheduler({
    syncProxies: async () => calls.push('proxies'),
    syncTraffic: async () => calls.push('traffic'),
    state,
  });

  await scheduler.tick(1000);
  await scheduler.tick(3000);

  assert.deepEqual(calls, ['traffic', 'traffic', 'traffic', 'proxies']);
  assert.deepEqual([...state.expandedGroups], ['全部聚合/手动组']);
  assert.equal(state.activeBatch, true);
});
```

- [ ] **Step 2: Run RED**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: FAIL，失败原因包含刷新调度函数尚不存在。

- [ ] **Step 3: Implement scheduler and traffic API**

在 `createApi` 增加 `getConnections()`、`getTraffic()`、`getVersion()`；在 `startProxyUi` 创建刷新调度器：proxies 3 秒轮询，connections/traffic 1 秒轮询并在不可用时降级到 3 秒；重启恢复检测前 15 秒每 1 秒；手动刷新调用一次 `syncAll`；渲染时复用展开状态、焦点状态和 delay cache。

- [ ] **Step 4: Run GREEN**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: PASS。

- [ ] **Step 5: Review 闭环**

Review: 只读检查自动刷新不重建整个 DOM 导致焦点丢失，不覆盖展开状态，不把整体流量误标成节点速度。

Expected: 通过；发现问题回到 Step 3。

- [ ] **Step 6: QA 闭环**

QA: 只读检查后台失败、短暂旧 `now`、节点消失、测速进行中这四类冲突处理明确。

Expected: 通过；发现问题回到 Step 3。

- [ ] **Step 7: Spec 满足度审查**

Check: 覆盖 spec 4.4、9 的实时刷新频率、行为和数据冲突处理。

Expected: 通过；不通过回到 Step 1 或 Step 3。

- [ ] **Step 8: Commit**

Run: `git add ui/app.mjs tests/proxy-ui-unit.test.mjs && git -c user.name="liumenglife" -c user.email="liumeng@163.com" commit -m "feat: add live proxy ui refresh"`

Expected: 提交成功。

---

### Task 6：启动/关闭代理与重启按钮前端闭环（串行，依赖 Task 3、Task 4、Task 5）

**Files:**
- Modify: `ui/app.mjs`
- Modify: `ui/index.html`
- Test: `tests/proxy-ui-unit.test.mjs`

- [ ] **Step 1: Write failing tests**

新增测试断言：关闭代理将 `代理选择标签` 切换到 `direct`；启动代理恢复关闭前记录的组和节点，无记录时恢复 `全部聚合/自动组`；后台目标不存在时恢复默认；后台不可读时开关禁用；重启按钮第一次点击进入确认态，第二次提交 `restart-sing-box`，处理中禁止重复提交，成功后进入恢复检测。

```js
test('启动关闭代理按当前阶段语义切换 selector', async () => {
  const calls = [];
  const storage = new Map();
  const api = { putProxy: async (group, name) => calls.push([group, name]) };

  await turnProxyOff(api, storage, { selectorNow: '全部聚合/手动组', currentNode: '香港节点' });
  await turnProxyOn(api, storage, { groups: new Set(['全部聚合/手动组', '全部聚合/自动组']) });

  assert.deepEqual(calls, [
    ['代理选择标签', 'direct'],
    ['代理选择标签', '全部聚合/手动组'],
  ]);
});

test('重启按钮需要确认态且防重复提交', async () => {
  const calls = [];
  const api = { restartSingBox: async () => calls.push('restart') };
  const controller = createRestartController(api);

  assert.equal(await controller.click(), 'confirming');
  assert.equal(await controller.click(), 'processing');
  assert.equal(await controller.click(), 'processing');
  assert.deepEqual(calls, ['restart']);
});
```

- [ ] **Step 2: Run RED**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: FAIL，失败原因包含 `turnProxyOff`、`turnProxyOn` 或 `createRestartController` 尚不存在。

- [ ] **Step 3: Implement proxy toggle and restart client**

在 `ui/app.mjs` 增加 `turnProxyOff`、`turnProxyOn`、`createRestartController`、`api.restartSingBox()`。关闭时记录关闭前的 `selectorNow` 和 `currentNode` 到本地存储键 `proxy-ui:last-proxy-selection`；启动时恢复有效上次组，否则使用 `全部聚合/自动组`；UI 文案固定为“启动代理”和“关闭代理”；重启失败显示页面内错误摘要；成功后触发 Task 5 的恢复检测。

- [ ] **Step 4: Run GREEN**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: PASS。

- [ ] **Step 5: Review 闭环**

Review: 只读检查文案没有“切 direct”“停容器”“停 TUN”，关闭代理不停止容器，不修改系统代理。

Expected: 通过；发现问题回到 Step 3。

- [ ] **Step 6: QA 闭环**

QA: 只读检查后台无法读取、重启失败、重启恢复中、重复点击、上次组不存在五个场景。

Expected: 通过；发现问题回到 Step 3。

- [ ] **Step 7: Spec 满足度审查**

Check: 覆盖 spec 8.1、8.2 的启动/关闭代理和重启 sing-box 内核规则。

Expected: 通过；不通过回到 Step 1 或 Step 3。

- [ ] **Step 8: Commit**

Run: `git add ui/app.mjs ui/index.html tests/proxy-ui-unit.test.mjs && git -c user.name="liumenglife" -c user.email="liumeng@163.com" commit -m "feat: add proxy toggle and restart control"`

Expected: 提交成功。

---

### Task 7：现代深色视觉、移动端与截图断言（串行，依赖 Task 6）

**Files:**
- Modify: `ui/styles.css`
- Modify: `ui/index.html`
- Modify: `e2e/proxy-ui.e2e.js`
- Modify: `playwright.config.js`

- [ ] **Step 1: Write failing Playwright visual tests**

新增 Playwright 测试：桌面 `1440x1000` 和移动端 `390x844` 各截一张图；断言没有水平滚动；顶部 3 秒内显示是否代理中、实际路由、当前节点、延时或速度；页面不出现 `SING-BOX CLASH API`；自动组只读提示不触发 dialog；截图前断言自动组代理选择器下拉、手动组卡片、节点列表刷新后延时升序稳定排序和延时颜色分级符合 spec，避免视觉验收只看样式不看排序。

```js
test('视觉验收：桌面和移动端现代深色控制台', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${frontendUrl}?_pw=${Date.now()}`, { waitUntil: 'networkidle' });
  await expect(page.getByText('SING-BOX CLASH API')).toHaveCount(0);
  await expect(page.getByTestId('proxy-power-state')).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId('automatic-group-select')).toContainText(/全部聚合\/自动组/);
  await expect(page.getByTestId('manual-groups')).toContainText(/全部聚合\/手动组/);
  await expect(page).toHaveScreenshot('proxy-ui-dark-desktop.png', { fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).resolves.toBe(true);
  await expect(page).toHaveScreenshot('proxy-ui-dark-mobile.png', { fullPage: true });
});
```

- [ ] **Step 2: Run RED**

Run: `bunx playwright test e2e/proxy-ui.e2e.js --grep "视觉验收"`

Expected: FAIL，失败原因包含截图不匹配或页面结构缺少视觉测试所需元素。

- [ ] **Step 3: Implement dark console styles**

修改 `ui/styles.css`：使用深色背景、半透明卡片、清晰边框、深绿色/浅绿色/黄色/紫色/红色/灰色状态色；按钮和状态卡层级清楚；节点列表真实名称为主文本，长名称单行截断并提供 `title`；移动端采用单列布局，工具条换行，节点卡不横向溢出；自动组提示为页面内说明条；不得通过 CSS order、grid placement 或视觉分栏改变 DOM 已确定的自动组、手动组和节点列表排序。

- [ ] **Step 4: Run GREEN for visual tests**

Run: `bunx playwright test e2e/proxy-ui.e2e.js --grep "视觉验收"`

Expected: PASS，生成或匹配桌面与移动端截图。

- [ ] **Step 5: Review 闭环**

Review: 只读检查视觉没有默认浏览器控件堆叠，没有重复“一级分组/手动组”，没有拥挤表格和大片未对齐按钮，没有用 CSS 视觉排序掩盖 DOM 排序错误。

Expected: 通过；发现问题回到 Step 3。

- [ ] **Step 6: QA 闭环**

QA: 只读检查桌面和移动端截图，确认 3 秒内可判断当前是否走代理，核心开关和测速按钮可点击，并确认截图中的自动组下拉、手动组分组、节点列表延时升序稳定排序和颜色分级没有错乱。

Expected: 通过；发现问题回到 Step 3。

- [ ] **Step 7: Spec 满足度审查**

Check: 覆盖 spec 3、10 的视觉优化、现代深色控制台、移动端、截图验收。

Expected: 通过；不通过回到 Step 1 或 Step 3。

- [ ] **Step 8: Commit**

Run: `git add ui/styles.css ui/index.html e2e/proxy-ui.e2e.js playwright.config.js && git -c user.name="liumenglife" -c user.email="liumeng@163.com" commit -m "style: polish proxy ui dark console"`

Expected: 提交成功。

---

### Task 8：Playwright 全量、QA 出口 IP、最终评审与 Spec 审查（串行，最后执行）

**Files:**
- Modify: `e2e/proxy-ui.e2e.js`
- Inspect: `docs/superpowers/specs/2026-06-22-proxy-ui-enhancement-spec.md`

- [ ] **Step 1: Write failing E2E coverage tests**

扩展 `e2e/proxy-ui.e2e.js`，覆盖页面加载、自动刷新、手动同步、全部测速、按组测速、定位当前节点、全部展开、全部收起、启动/关闭代理、重启按钮确认态、自动组代理选择器下拉顺序、手动组分组顺序、节点列表刷新后延时升序稳定排序和延时颜色分级。测试必须使用 Playwright CLI 默认全量执行，不用 `--grep` 作为最终验收命令。

Playwright 排序验收必须使用稳定测试数据覆盖完整机场、地区和未知项序列，并断言完整下拉选项、完整手动组卡片和每个被测分组内的完整节点排序；测速前后各断言一次节点排序，证明刷新后按延时升序稳定排序，且相同状态/相同延时使用订阅导出顺序作为 tie-breaker。

```js
test('完整交互验收：刷新、测速、定位、展开收起、开关和重启确认态', async ({ page }) => {
  await page.goto(`${frontendUrl}?_pw=${Date.now()}`, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('last-sync-time')).toBeVisible();
  const firstSync = await page.getByTestId('last-sync-time').textContent();
  await expect.poll(async () => page.getByTestId('last-sync-time').textContent(), { timeout: 5000 }).not.toBe(firstSync);

  await page.getByTestId('sync-now').click();
  await page.getByTestId('test-all-delay').click();
  await expect(page.getByTestId('delay-progress')).toContainText(/已完成 \d+\/\d+/);
  await expect.poll(async () => page.getByTestId('automatic-group-option').evaluateAll((els) => els.map((el) => el.textContent.trim()))).toEqual(['全部聚合/自动组', '按机场/猫熊机场/自动组', '按机场/穿墙猫机场/自动组', '按机场/穿山甲机场/自动组', '按机场/瞬云机场/自动组', '按地区/香港/自动组', '按地区/台湾/自动组']);
  await expect.poll(async () => page.getByTestId('manual-group-card').evaluateAll((els) => els.map((el) => el.dataset.groupName))).toEqual(['全部聚合/手动组', '按机场/猫熊机场/手动组', '按机场/穿墙猫机场/手动组', '按机场/穿山甲机场/手动组', '按机场/瞬云机场/手动组', '按地区/香港/手动组', '按地区/台湾/手动组', '未分类/其他/手动组']);
  await expect.poll(async () => page.getByTestId('node-row').evaluateAll((els) => els.slice(0, 6).map((el) => el.dataset.nodeName))).toEqual(['订阅节点B', '订阅节点A', '订阅节点F', '订阅节点C', '订阅节点D', '订阅节点E']);
  await expect.poll(async () => page.getByTestId('node-row').evaluateAll((els) => els.slice(0, 6).map((el) => el.dataset.delayStatus))).toEqual(['excellent', 'good', 'warning', 'poor', 'timeout', 'unknown']);
  await page.getByTestId('locate-current-node').click();
  await page.getByTestId('expand-all').click();
  await page.getByTestId('collapse-all').click();
  await expect(page.getByTestId('proxy-power-state')).toBeVisible();

  await page.getByTestId('restart-sing-box').click();
  await expect(page.getByTestId('restart-sing-box')).toContainText('确认重启');
});
```

- [ ] **Step 2: Run RED for new E2E tests**

Run: `bunx playwright test e2e/proxy-ui.e2e.js`

Expected: 新增覆盖先失败，原因指向尚未接线的交互或测试标识。

- [ ] **Step 3: Implement missing wiring only if tests expose gaps**

若 Step 2 暴露测试标识、排序断言或交互未接线，只修改对应最小代码路径：`ui/app.mjs`、`ui/index.html`、`ui/styles.css` 或 `server/proxy-ui.mjs`。不得引入新功能范围，不得改变 spec 非目标。排序缺陷必须回到 Task 1 或 Task 3 的模型/渲染边界修复，不得在 Playwright 测试中放宽断言。

- [ ] **Step 4: Run all unit tests**

Run: `bun test tests/proxy-ui-unit.test.mjs tests/proxy-ui-server.test.mjs`

Expected: PASS。

- [ ] **Step 5: Run Playwright CLI 默认全量测试**

Run: `bunx playwright test`

Expected: PASS；必须覆盖 `e2e/proxy-ui.e2e.js` 全部测试，不使用 `--grep` 缩小范围；测试输出必须包含自动组代理选择器下拉顺序、手动组分组顺序、节点列表延时升序稳定排序和延时颜色分级断言通过。

- [ ] **Step 6: Run desktop and mobile visual screenshot acceptance**

Run: `bunx playwright test e2e/proxy-ui.e2e.js --grep "视觉验收"`

Expected: PASS，桌面和移动端截图均满足现代深色控制台、顶部状态卡、分区卡片、清晰层级、无重复刷屏、无弹窗式只读提示，并能直观看到分组排序没有错乱。

- [ ] **Step 7: QA 出口 IP 检查**

Run: `PROXY_UI_URL=http://192.168.100.135:9091/#/proxies PROXY_UI_BACKEND=http://192.168.100.135:9090 bunx playwright test e2e/proxy-ui.e2e.js --grep "启动关闭代理"`

Expected: PASS；启动代理后 selector 为非 `direct` 且 proxy-ui 管理路径走恢复组，关闭代理后 selector 为 `direct`；不验证客户端系统代理关闭。

- [ ] **Step 8: Code Review 闭环**

Review: 只读审核功能正确性、安全边界和错误处理；重点检查 control-agent 白名单、速度真实来源、刷新不打断测速、DOM 不使用阻断弹窗、自动组代理选择器下拉顺序、手动组分组顺序、节点列表延时升序稳定排序和延时颜色分级。

Expected: 通过；任何问题回到对应任务 coding。

- [ ] **Step 9: QA 闭环**

QA: 只读审核页面加载、自动刷新、手动同步、全部测速、按组测速、刷新后节点按延时升序稳定排序、定位当前节点、全部展开/收起、启动/关闭代理、重启失败场景、移动端可用性、自动组代理选择器和手动组分组排序。

Expected: 通过；任何问题回到对应任务 coding。

- [ ] **Step 10: Spec 满足度审查**

Check: 逐条对照 `docs/superpowers/specs/2026-06-22-proxy-ui-enhancement-spec.md` 的目标、非目标、UI、数据模型、API、手动组规则、自动组代理选择器排序、手动组分组排序、节点列表刷新后延时升序稳定排序、测速、开关、实时刷新、测试验收、风险限制。

Expected: 通过；任何不通过回到对应任务 coding。

- [ ] **Step 11: Final commit**

Run: `git add ui/app.mjs ui/index.html ui/styles.css server/proxy-ui.mjs tests/proxy-ui-unit.test.mjs tests/proxy-ui-server.test.mjs e2e/proxy-ui.e2e.js playwright.config.js docker-compose.yml && git -c user.name="liumenglife" -c user.email="liumeng@163.com" commit -m "test: cover proxy ui enhancement acceptance"`

Expected: 提交成功；如果某些文件未修改，从 `git add` 命令中移除后再提交。

---

## Spec 覆盖矩阵

- 视觉优化：Task 3、Task 7、Task 8。
- 实时刷新：Task 5、Task 8。
- 测速：Task 2、Task 3、Task 8。
- 分组重排：Task 1、Task 3、Task 8。
- 固定排序规则：Task 1 覆盖模型排序，Task 3 覆盖 DOM 渲染排序，Task 7 覆盖截图前排序断言，Task 8 覆盖 Playwright 全量排序验收。
- 启动/关闭代理：Task 6、Task 8。
- control-agent 重启内核：Task 4、Task 6、Task 8。
- 测试与 QA：Task 0、Task 8，全任务闭环均包含 UT、review、QA、Spec 满足度审查。
- Playwright CLI 默认全量测试：Task 0、Task 8 Step 5。
- 视觉截图验收：Task 7、Task 8 Step 6。

## 自审结果

- Spec coverage: 通过；计划覆盖 spec 第 1 到第 11 节的目标、非目标、UI、数据模型、API、手动组映射、自动组代理选择器排序、手动组分组排序、节点列表刷新后延时升序稳定排序、测速、开关、实时刷新、测试验收和风险限制。
- Red-flag scan: 通过；计划没有使用未定义的实现范围，所有任务均有明确文件、命令、预期结果和回退路径。
- Type consistency: 通过；计划中函数名、测试名、状态值和 `data-testid` 在各任务之间保持一致。
- Execution gate: 通过；计划已明确当前仅修订文档，用户确认前不得执行实现任务、不得写实现代码、不得提交。
