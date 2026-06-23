# proxy-ui 局部重组 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `proxy-ui` 重组为层级清晰、状态准确、无速度噪音、支持三段式路由与快捷键的代理控制台。

**Architecture:** 保持 vanilla HTML/CSS/JS 结构，不引入新框架。先扩展 `ui/app.mjs` 的纯函数模型与渲染辅助，再调整 `ui/index.html` DOM 骨架，最后用 `ui/styles.css` 完成视觉层级、地域徽章、健康指标和右对齐操作组。

**Tech Stack:** Bun test runner、Playwright、vanilla ES modules、CSS、Docker Compose。

---

## 文件职责

- `ui/app.mjs`：数据模型、路由三段解析、地区旗帜映射、延时归一化、渲染和交互事件。
- `ui/index.html`：顶部按钮组、自动组区域、状态横幅、实际路由、手动区域容器的基础骨架。
- `ui/styles.css`：区域标题、地域徽章、健康指标、路由轨道、节点卡片、右侧操作组、快捷键可见反馈。
- `tests/proxy-ui-unit.test.mjs`：纯函数、DOM 渲染、快捷键和状态逻辑单元测试。
- `e2e/proxy-ui.e2e.js`：真实页面行为、布局语义和后台同步 E2E。

## 执行顺序

- Task 1 必须先执行：建立纯函数和模型契约。
- Task 2 依赖 Task 1：顶部控制区和快捷键需要模型/状态函数。
- Task 3 依赖 Task 1：路由三段式依赖解析函数。
- Task 4 依赖 Task 1：手动区域渲染依赖选中态和延时模型。
- Task 5 依赖 Task 4：调研跨机场/跨地区错误节点信息的根因，确认是缓存污染、后端状态还是前端逻辑误用。
- Task 6 依赖 Task 2、Task 3、Task 4、Task 5：整合视觉样式。
- Task 7 依赖 Task 6：E2E 和真实 9091 验证。
- Task 2、Task 3、Task 4 在 Task 1 后可并行执行。

## Task 1: 模型纯函数与单元契约

**依赖:** 无。

**可并行:** 否，后续任务依赖它。

**Files:**
- Modify: `ui/app.mjs`
- Modify: `tests/proxy-ui-unit.test.mjs`

- [ ] **Step 1: 写失败测试**

在 `tests/proxy-ui-unit.test.mjs` 追加以下测试，要求后续实现导出对应函数：

```js
test('延时无有效 ms 时统一归入 timeout', () => {
  assert.equal(proxyUi.statusFromDelay(undefined), 'timeout');
  assert.equal(proxyUi.statusFromDelay(null), 'timeout');
  assert.equal(proxyUi.statusFromDelay(Number.NaN), 'timeout');
  assert.equal(proxyUi.statusFromDelay(0, true), 'timeout');
  assert.equal(proxyUi.statusFromDelay(238), 'excellent');
});

test('解析实际路由为分类、机场、具体节点三段', () => {
  const route = proxyUi.parseRouteSegments(
    '按地区/美国/自动组',
    '美国-猫熊机场-🇺🇸 直连-V350-美国-1x-NF&HBO&Disney*',
  );

  assert.deepEqual(route, {
    selector: '按地区 / 美国 / 自动组',
    provider: '🇺🇸 美国 · 猫熊机场',
    node: '🇺🇸 直连-V350-美国-1x-NF&HBO&Disney*',
    fallback: false,
  });
});

test('路由拆分失败时保守回退到完整节点名', () => {
  const route = proxyUi.parseRouteSegments('全部聚合/自动组', '无法拆分节点');

  assert.deepEqual(route, {
    selector: '全部聚合 / 自动组',
    provider: '',
    node: '无法拆分节点',
    fallback: true,
  });
});

test('地区旗帜映射和地域徽章标签', () => {
  assert.equal(proxyUi.regionFlag('香港'), '🇭🇰');
  assert.equal(proxyUi.regionFlag('澳门'), '🇲🇴');
  assert.equal(proxyUi.regionFlag('新加坡'), '🇸🇬');
  assert.equal(proxyUi.regionFlag('美国'), '🇺🇸');
  assert.equal(proxyUi.regionFlag('未知地区'), '📍');
  assert.equal(proxyUi.regionBadgeLabel('香港'), '🇭🇰 香港');
});

test('只有代理选择标签指向的手动组显示选中态', () => {
  const proxySet = {
    '代理选择标签': { name: '代理选择标签', type: 'Selector', now: '按地区/香港/手动组', all: [] },
    '按地区/香港/手动组': { name: '按地区/香港/手动组', type: 'Selector', now: '香港-猫熊机场-A', all: ['香港-猫熊机场-A'] },
    '按机场/猫熊机场/手动组': { name: '按机场/猫熊机场/手动组', type: 'Selector', now: '香港-猫熊机场-A', all: ['香港-猫熊机场-A'] },
    '全部聚合/手动组': { name: '全部聚合/手动组', type: 'Selector', now: '香港-猫熊机场-A', all: ['香港-猫熊机场-A'] },
  };
  const model = buildProxyUiModel(proxySet);
  const regionGroup = model.manualSections.find((s) => s.title === '按地区').groups[0];
  const airportGroup = model.manualSections.find((s) => s.title === '按机场').groups[0];
  const aggregateGroup = model.manualSections.find((s) => s.title === '全部聚合').groups[0];

  assert.equal(regionGroup.activeNodeName, '香港-猫熊机场-A');
  assert.equal(airportGroup.activeNodeName, '');
  assert.equal(aggregateGroup.activeNodeName, '');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: FAIL，至少包含 `parseRouteSegments is not a function` 或断言失败。

- [ ] **Step 3: 实现最小模型函数**

在 `ui/app.mjs` 中实现并导出：

```js
const regionFlags = new Map([
  ['香港', '🇭🇰'], ['澳门', '🇲🇴'], ['新加坡', '🇸🇬'], ['美国', '🇺🇸'],
  ['日本', '🇯🇵'], ['台湾', '🇹🇼'], ['英国', '🇬🇧'], ['法国', '🇫🇷'],
  ['德国', '🇩🇪'], ['加拿大', '🇨🇦'], ['澳大利亚', '🇦🇺'], ['泰国', '🇹🇭'],
  ['菲律宾', '🇵🇭'], ['马来西亚', '🇲🇾'], ['印尼', '🇮🇩'], ['越南', '🇻🇳'],
  ['印度', '🇮🇳'], ['土耳其', '🇹🇷'], ['俄罗斯', '🇷🇺'], ['荷兰', '🇳🇱'],
  ['巴西', '🇧🇷'], ['乌克兰', '🇺🇦'], ['沙特', '🇸🇦'], ['卡塔尔', '🇶🇦'],
]);

export function regionFlag(regionName) {
  return regionFlags.get(regionName) || '📍';
}

export function regionBadgeLabel(regionName) {
  return `${regionFlag(regionName)} ${regionName}`;
}

export function formatSelectorSegment(selector) {
  return (selector || '未选择').split('/').filter(Boolean).join(' / ');
}

export function parseRouteSegments(selector, nodeName) {
  const selectorText = formatSelectorSegment(selector);
  const parts = String(nodeName || '').split('-');
  if (parts.length < 3) return { selector: selectorText, provider: '', node: nodeName || '未选择', fallback: true };
  const [region, airport, ...nodeParts] = parts;
  return {
    selector: selectorText,
    provider: `${regionFlag(region)} ${region} · ${airport}`,
    node: nodeParts.join('-'),
    fallback: false,
  };
}
```

同时调整 `statusFromDelay()`、`normalizeDelayEntry()`、`delayFromHistory()`，确保没有有效数字时返回 `timeout`，不再返回 `unknown`。

在 `buildManualGroup()` 中新增：

```js
const activeNodeName = parsed.proxy.name === options.currentManualGroup ? proxy.now || '' : '';
```

实际实现时把 `currentManualGroup` 从 `buildProxyUiModel()` 传入 `buildManualSections()` / `buildManualGroup()`。

- [ ] **Step 4: 运行单元测试确认通过**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: PASS。

## Task 2: 顶部按钮重组、单一展开切换和快捷键

**依赖:** Task 1。

**可并行:** 可与 Task 3、Task 4 并行。

**Files:**
- Modify: `ui/index.html`
- Modify: `ui/app.mjs`
- Modify: `tests/proxy-ui-unit.test.mjs`

- [ ] **Step 1: 写失败测试**

在 `tests/proxy-ui-unit.test.mjs` 追加：

```js
test('页面只保留一个展开收起切换控件并移除全局定位', async () => {
  const html = await readFile(indexHtml, 'utf8');
  assert.match(html, /data-testid="expand-toggle"/);
  assert.doesNotMatch(html, /data-testid="expand-all"/);
  assert.doesNotMatch(html, /data-testid="collapse-all"/);
  assert.doesNotMatch(html, /data-testid="locate-current-node"/);
  assert.match(html, /data-testid="test-all-delay"/);
});

test('展开状态文案根据 details open 数量计算', () => {
  assert.equal(proxyUi.expandToggleLabel(0, 3), '全部展开');
  assert.equal(proxyUi.expandToggleLabel(2, 3), '全部展开');
  assert.equal(proxyUi.expandToggleLabel(3, 3), '全部收起');
});

test('Command+K 和 Command+L 不区分大小写', () => {
  assert.equal(proxyUi.expandShortcutAction({ metaKey: true, key: 'k', target: { tagName: 'BODY' } }), 'expand');
  assert.equal(proxyUi.expandShortcutAction({ metaKey: true, key: 'K', target: { tagName: 'BODY' } }), 'expand');
  assert.equal(proxyUi.expandShortcutAction({ metaKey: true, key: 'l', target: { tagName: 'BODY' } }), 'collapse');
  assert.equal(proxyUi.expandShortcutAction({ metaKey: true, key: 'L', target: { tagName: 'BODY' } }), 'collapse');
  assert.equal(proxyUi.expandShortcutAction({ metaKey: true, key: 'k', target: { tagName: 'SELECT' } }), 'ignore');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: FAIL，缺少 `expandToggleLabel` / `expandShortcutAction` 或 HTML 断言失败。

- [ ] **Step 3: 修改 HTML 骨架**

在 `ui/index.html` 中：

- 把 `全部测速` 移到 `header.hero` 右侧按钮组。
- 删除旧 `.toolbar` 容器。
- 删除全局 `locate-current-btn`。
- 删除 `expand-all-btn` 和 `collapse-all-btn`。
- 新增单一按钮：

```html
<div class="hero-actions" aria-label="顶部操作">
  <button id="refresh" data-testid="sync-now" type="button">立即同步</button>
  <button id="test-all-btn" data-testid="test-all-delay" type="button">全部测速</button>
  <button id="expand-toggle-btn" data-testid="expand-toggle" type="button">全部展开</button>
  <span id="speedtest-progress" class="speedtest-progress"></span>
</div>
```

- [ ] **Step 4: 实现交互函数和事件**

在 `ui/app.mjs` 导出：

```js
export function expandToggleLabel(openCount, totalCount) {
  return totalCount > 0 && openCount === totalCount ? '全部收起' : '全部展开';
}

export function expandShortcutAction(event) {
  const tagName = event.target?.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) return 'ignore';
  if (!event.metaKey) return 'ignore';
  const key = String(event.key || '').toLowerCase();
  if (key === 'k') return 'expand';
  if (key === 'l') return 'collapse';
  return 'ignore';
}
```

在 `startProxyUi()` 中新增内部函数：

```js
function updateExpandToggleLabel() {
  const details = [...document.querySelectorAll('details.manual-group')];
  const openCount = details.filter((item) => item.open).length;
  const btn = document.getElementById('expand-toggle-btn');
  if (btn) btn.textContent = expandToggleLabel(openCount, details.length);
}

function setAllGroupsOpen(open) {
  for (const details of document.querySelectorAll('details.manual-group')) {
    details.open = open;
    if (open) state.expandedGroups.add(details.dataset.groupName);
  }
  if (!open) state.expandedGroups.clear();
  updateExpandToggleLabel();
}
```

替换旧展开/收起事件：

```js
document.getElementById('expand-toggle-btn').addEventListener('click', () => {
  const details = [...document.querySelectorAll('details.manual-group')];
  const shouldExpand = details.some((item) => !item.open);
  setAllGroupsOpen(shouldExpand);
});

document.addEventListener('keydown', (event) => {
  const action = expandShortcutAction(event);
  if (action === 'ignore') return;
  event.preventDefault();
  setAllGroupsOpen(action === 'expand');
  setText('status', action === 'expand' ? '已展开全部节点' : '已收起全部节点');
});
```

在 `render()` 末尾和每个 `details` 的 `toggle` 事件中调用 `updateExpandToggleLabel()`。

- [ ] **Step 5: 运行单元测试**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: PASS。

## Task 3: 实际路由三段式轨道和状态横幅

**依赖:** Task 1。

**可并行:** 可与 Task 2、Task 4 并行。

**Files:**
- Modify: `ui/index.html`
- Modify: `ui/app.mjs`
- Modify: `tests/proxy-ui-unit.test.mjs`

- [ ] **Step 1: 写失败测试**

在 `tests/proxy-ui-unit.test.mjs` 追加 DOM 渲染测试：

```js
test('模型包含三段式路由和醒目模式状态', () => {
  const model = buildProxyUiModel({
    '代理选择标签': { name: '代理选择标签', type: 'Selector', now: '按地区/美国/自动组', all: [] },
    '按地区/美国/自动组': { name: '按地区/美国/自动组', type: 'URLTest', now: '美国-猫熊机场-🇺🇸 直连-V350-美国-1x-NF&HBO&Disney*', all: [] },
  });

  assert.equal(model.mode.type, 'automatic');
  assert.equal(model.mode.label, '当前模式：自动组');
  assert.deepEqual(model.routeSegments, {
    selector: '按地区 / 美国 / 自动组',
    provider: '🇺🇸 美国 · 猫熊机场',
    node: '🇺🇸 直连-V350-美国-1x-NF&HBO&Disney*',
    fallback: false,
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: FAIL，`model.mode` 或 `model.routeSegments` 不存在。

- [ ] **Step 3: 扩展模型**

在 `buildProxyUiModel()` 返回对象中加入：

```js
const isAutomaticMode = selector.now.endsWith('/自动组');
const isManualMode = selector.now.endsWith('/手动组');
const mode = {
  type: isAutomaticMode ? 'automatic' : isManualMode ? 'manual' : selector.now === 'direct' ? 'direct' : 'unknown',
  label: isAutomaticMode
    ? '当前模式：自动组'
    : isManualMode
      ? `当前模式：手动组 · ${formatSelectorSegment(selector.now)}`
      : selector.now === 'direct'
        ? '当前模式：直连'
        : '当前模式：未选择',
};
const routeSegments = parseRouteSegments(selector.now, routeTarget);
```

并在返回值中加入 `mode`、`routeSegments`。

- [ ] **Step 4: 修改 DOM 渲染**

在 `ui/index.html` 中给模式状态和路由轨道准备容器：

```html
<div id="mode-banner" class="mode-banner" data-testid="mode-banner" aria-live="polite"></div>
<div id="route-track" class="route-track" data-testid="route-track" aria-label="实际路由标签"></div>
```

在 `render()` 中替换旧 `route-label` 文本写入，新增：

```js
renderModeBanner(document.getElementById('mode-banner'), model.mode);
renderRouteTrack(document.getElementById('route-track'), model.routeSegments);
setText('route-label', model.routeLabel);
```

实现 `renderRouteTrack(container, segments)`：创建三个 `.route-chip`，分别设置 `data-testid="route-segment-selector"`、`route-segment-provider`、`route-segment-node`，中间插入 `.route-arrow`。

实现 `renderModeBanner(container, mode)`：根据 `mode.type` 添加 `mode-automatic` / `mode-manual` / `mode-direct` class，并写入图标和 `mode.label`。

- [ ] **Step 5: 运行测试**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: PASS。

## Task 4: 手动区域、地域徽章、分组摘要和节点卡片

**依赖:** Task 1。

**可并行:** 可与 Task 2、Task 3 并行。

**Files:**
- Modify: `ui/app.mjs`
- Modify: `tests/proxy-ui-unit.test.mjs`

- [ ] **Step 1: 写失败测试**

追加测试：

```js
test('分组摘要不显示显式标签并包含右侧操作组', () => {
  const doc = new DOMParser().parseFromString('<div id="root"></div>', 'text/html');
  const root = doc.getElementById('root');
  const model = buildProxyUiModel({
    '代理选择标签': { name: '代理选择标签', type: 'Selector', now: '按地区/香港/手动组', all: [] },
    '按地区/香港/手动组': { name: '按地区/香港/手动组', type: 'Selector', now: '香港-猫熊机场-A', all: ['香港-猫熊机场-A'] },
    '香港-猫熊机场-A': { name: '香港-猫熊机场-A', history: [{ delay: 238 }] },
  });

  proxyUi.renderProxyGroups(root, model, doc);
  const text = root.textContent;
  assert.match(text, /🇭🇰 香港/);
  assert.match(text, /1\s*\/\s*1/);
  assert.match(text, /238ms/);
  assert.doesNotMatch(text, /当前：|延时：|可用节点数：|速度：/);
  assert.equal(root.querySelectorAll('.summary-actions').length, 1);
  assert.equal(root.querySelector('.summary-actions').textContent.includes('定位📌'), true);
});

test('节点卡片不显示速度并把延时放入右下角 badge', () => {
  const doc = new DOMParser().parseFromString('<div id="root"></div>', 'text/html');
  const root = doc.getElementById('root');
  const model = buildProxyUiModel({
    '代理选择标签': { name: '代理选择标签', type: 'Selector', now: '按地区/香港/手动组', all: [] },
    '按地区/香港/手动组': { name: '按地区/香港/手动组', type: 'Selector', now: '香港-猫熊机场-A', all: ['香港-猫熊机场-A'] },
    '香港-猫熊机场-A': { name: '香港-猫熊机场-A', history: [{ delay: 238 }] },
  });

  proxyUi.renderProxyGroups(root, model, doc);
  const card = root.querySelector('.node-card');
  assert.equal(card.querySelector('.speed-unknown'), null);
  assert.equal(card.querySelector('.node-delay-badge').textContent.trim(), '238ms');
  assert.doesNotMatch(card.textContent, /速度|--/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: FAIL，当前仍包含 `可用节点数：`、`延时：`、速度 chip 或缺少 `.summary-actions`。

- [ ] **Step 3: 修改摘要渲染**

在 `renderProxyGroups()` 和 `render()` 的手动分组循环中统一渲染：

- `.section-heading`：带图标的 `全部聚合` / `按机场` / `按地区`。
- `.region-badge`：地区组显示 `regionBadgeLabel(scopeName)`。
- `.health-metrics`：包含 `.availability-metric` 和 `.delay-metric`，二者上下错位。
- `.summary-node`：仅显示节点名称，不带 `当前：`。
- `.summary-actions`：包含 `测速` 和 `定位📌`。

保留 `group-speedtest-btn` 测速逻辑，新增 `group-locate-btn` 点击逻辑：打开当前分组并滚动到当前分组内 active node。如果当前分组无 active node，则滚动到分组本身并提示 `当前分组未选中节点`。

节点 active 判断必须使用：

```js
node.name === group.activeNodeName
```

不能使用：

```js
node.name === group.now
```

- [ ] **Step 4: 修改节点卡片**

`buildNodeCard()` 和 `nodeButton()` 删除 speed chip，只保留：

```js
const nameChip = doc.createElement('span');
nameChip.className = 'node-name';
nameChip.textContent = node.name;

const delayBadge = doc.createElement('span');
delayBadge.className = `node-delay-badge delay-${node.delayStatus}`;
delayBadge.textContent = delayValueLabel(node);

card.append(nameChip, delayBadge);
```

新增 `delayValueLabel(node)`：有 `delayMs` 返回 `${delayMs}ms`，其他全部返回 `timeout`。

- [ ] **Step 5: 运行单元测试**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: PASS。

## Task 5: 错误节点信息根因调研与定向修复

**依赖:** Task 4。

**可并行:** 否。

**Files:**
- Modify: `ui/app.mjs`
- Modify: `tests/proxy-ui-unit.test.mjs`

- [ ] **Step 1: 写根因调研脚本测试**

在 `tests/proxy-ui-unit.test.mjs` 追加一个只描述现象的测试，先不要假设根因是缓存：

```js
test('复现自动组模式下手动区不应显示机场或地区旧节点信息', () => {
  const model = buildProxyUiModel({
    '代理选择标签': { name: '代理选择标签', type: 'Selector', now: '按地区/香港/自动组', all: [] },
    '按地区/香港/自动组': { name: '按地区/香港/自动组', type: 'URLTest', now: '香港-猫熊机场-A', all: ['香港-猫熊机场-A'] },
    '按机场/猫熊机场/手动组': { name: '按机场/猫熊机场/手动组', type: 'Selector', now: '日本-猫熊机场-旧节点', all: ['香港-猫熊机场-A', '日本-猫熊机场-旧节点'] },
    '按地区/香港/手动组': { name: '按地区/香港/手动组', type: 'Selector', now: '香港-猫熊机场-A', all: ['香港-猫熊机场-A'] },
    '按地区/日本/手动组': { name: '按地区/日本/手动组', type: 'Selector', now: '日本-猫熊机场-旧节点', all: ['日本-猫熊机场-旧节点'] },
  });

  const groups = model.manualSections.flatMap((section) => section.groups);
  assert.equal(groups.every((group) => group.activeNodeName === ''), true);
  assert.equal(groups.every((group) => group.summaryNodeName === ''), true);
});
```

- [ ] **Step 2: 运行测试确认是否复现**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: FAIL。记录失败字段：是 `activeNodeName`、`summaryNodeName`、旧 `group.now` 渲染，还是延时 `delayCache` 污染。

- [ ] **Step 3: 只读调研当前数据流**

阅读并记录 `ui/app.mjs` 中这些位置：

- `buildProxyUiModel()` 如何计算 `selector.now`、`selectedAutomaticGroup`、`currentManualGroup`、`routeTarget`。
- `buildManualSections()` 是否把当前活跃手动组传入手动分组模型。
- `buildManualGroup()` 是否无条件使用每个手动组自己的 `proxy.now`。
- `render()` 的摘要行是否使用 `group.now`。
- `nodeButton()` active 判断是否使用 `node.name === group.now`。
- `state.delayCache` 是否只影响延时排序和延时状态，还是影响节点摘要/选中态。

输出根因分类，必须选择以下之一或多个：

- `FRONTEND_SELECTION_LOGIC`：前端无条件使用非活跃手动组的 `group.now`，属于选择态逻辑错误。
- `FRONTEND_DELAY_CACHE`：`state.delayCache` 污染了节点摘要或选中态。
- `BACKEND_STATE`：sing-box Clash API 自身在多个手动组中保存旧 `now`，但前端不应把非活跃组旧值当作当前选择展示。
- `MIXED`：多个原因叠加。

必须把诊断结论写入本任务最终报告，不能跳过。

- [ ] **Step 4: 根据诊断写定向失败测试**

如果根因是 `FRONTEND_SELECTION_LOGIC` 或 `BACKEND_STATE`，追加以下测试：

在 `tests/proxy-ui-unit.test.mjs` 追加：

```js
test('自动组模式下机场和地区手动组都不显示旧选中节点摘要', () => {
  const model = buildProxyUiModel({
    '代理选择标签': { name: '代理选择标签', type: 'Selector', now: '按地区/香港/自动组', all: [] },
    '按地区/香港/自动组': { name: '按地区/香港/自动组', type: 'URLTest', now: '香港-猫熊机场-A', all: ['香港-猫熊机场-A'] },
    '按机场/猫熊机场/手动组': { name: '按机场/猫熊机场/手动组', type: 'Selector', now: '日本-猫熊机场-旧节点', all: ['香港-猫熊机场-A', '日本-猫熊机场-旧节点'] },
    '按地区/香港/手动组': { name: '按地区/香港/手动组', type: 'Selector', now: '香港-猫熊机场-A', all: ['香港-猫熊机场-A'] },
    '按地区/日本/手动组': { name: '按地区/日本/手动组', type: 'Selector', now: '日本-猫熊机场-旧节点', all: ['日本-猫熊机场-旧节点'] },
  });

  const groups = model.manualSections.flatMap((section) => section.groups);
  assert.equal(groups.every((group) => group.activeNodeName === ''), true);
  assert.equal(groups.every((group) => group.summaryNodeName === ''), true);
});

test('手动机场选择只允许对应机场显示摘要和选中态', () => {
  const model = buildProxyUiModel({
    '代理选择标签': { name: '代理选择标签', type: 'Selector', now: '按机场/猫熊机场/手动组', all: [] },
    '按机场/猫熊机场/手动组': { name: '按机场/猫熊机场/手动组', type: 'Selector', now: '香港-猫熊机场-A', all: ['香港-猫熊机场-A'] },
    '按地区/香港/手动组': { name: '按地区/香港/手动组', type: 'Selector', now: '香港-猫熊机场-A', all: ['香港-猫熊机场-A'] },
    '全部聚合/手动组': { name: '全部聚合/手动组', type: 'Selector', now: '香港-猫熊机场-A', all: ['香港-猫熊机场-A'] },
  });

  const airportGroup = model.manualSections.find((s) => s.title === '按机场').groups[0];
  const regionGroup = model.manualSections.find((s) => s.title === '按地区').groups[0];
  const aggregateGroup = model.manualSections.find((s) => s.title === '全部聚合').groups[0];

  assert.equal(airportGroup.activeNodeName, '香港-猫熊机场-A');
  assert.equal(airportGroup.summaryNodeName, '香港-猫熊机场-A');
  assert.equal(regionGroup.activeNodeName, '');
  assert.equal(regionGroup.summaryNodeName, '');
  assert.equal(aggregateGroup.activeNodeName, '');
  assert.equal(aggregateGroup.summaryNodeName, '');
});

test('手动地区选择只允许对应地区显示摘要和选中态', () => {
  const model = buildProxyUiModel({
    '代理选择标签': { name: '代理选择标签', type: 'Selector', now: '按地区/香港/手动组', all: [] },
    '按地区/香港/手动组': { name: '按地区/香港/手动组', type: 'Selector', now: '香港-猫熊机场-A', all: ['香港-猫熊机场-A'] },
    '按机场/猫熊机场/手动组': { name: '按机场/猫熊机场/手动组', type: 'Selector', now: '香港-猫熊机场-A', all: ['香港-猫熊机场-A'] },
    '全部聚合/手动组': { name: '全部聚合/手动组', type: 'Selector', now: '香港-猫熊机场-A', all: ['香港-猫熊机场-A'] },
  });

  const regionGroup = model.manualSections.find((s) => s.title === '按地区').groups[0];
  const airportGroup = model.manualSections.find((s) => s.title === '按机场').groups[0];
  const aggregateGroup = model.manualSections.find((s) => s.title === '全部聚合').groups[0];

  assert.equal(regionGroup.activeNodeName, '香港-猫熊机场-A');
  assert.equal(regionGroup.summaryNodeName, '香港-猫熊机场-A');
  assert.equal(airportGroup.activeNodeName, '');
  assert.equal(airportGroup.summaryNodeName, '');
  assert.equal(aggregateGroup.activeNodeName, '');
  assert.equal(aggregateGroup.summaryNodeName, '');
});
```

如果根因是 `FRONTEND_DELAY_CACHE`，追加以下测试，确保延时缓存只影响延时，不影响摘要/选中态：

```js
test('delayCache 只影响延时状态不影响手动组摘要和选中态', () => {
  const model = buildProxyUiModel({
    '代理选择标签': { name: '代理选择标签', type: 'Selector', now: '按地区/香港/自动组', all: [] },
    '按地区/香港/自动组': { name: '按地区/香港/自动组', type: 'URLTest', now: '香港-猫熊机场-A', all: ['香港-猫熊机场-A'] },
    '按机场/猫熊机场/手动组': { name: '按机场/猫熊机场/手动组', type: 'Selector', now: '日本-猫熊机场-旧节点', all: ['日本-猫熊机场-旧节点'] },
  }, {
    delayCache: new Map([['日本-猫熊机场-旧节点', { delayMs: 88, status: 'excellent' }]]),
  });

  const airportGroup = model.manualSections.find((section) => section.title === '按机场').groups[0];
  assert.equal(airportGroup.activeNodeName, '');
  assert.equal(airportGroup.summaryNodeName, '');
});
```

- [ ] **Step 5: 运行定向测试确认失败**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: FAIL，失败点与 Step 3 诊断结论一致。

- [ ] **Step 6: 根据根因做最小修复**

如果根因是 `FRONTEND_SELECTION_LOGIC` 或 `BACKEND_STATE`，在 `ui/app.mjs` 中明确区分三个值：


- `group.now`：后端该手动组自身保存的旧值，只作为原始数据保留。
- `group.activeNodeName`：只有当 `selector.now === group.name` 时才等于 `group.now`，否则为空字符串。
- `group.summaryNodeName`：只展示当前活跃手动组的节点摘要；自动组模式或非活跃手动组必须为空字符串。

实现方式：

```js
function buildManualGroup(proxy, parsed, delayCache, currentManualGroup) {
  const nodes = sortNodesByDelay(proxy.all || [], delayCache);
  const isActiveManualGroup = proxy.name === currentManualGroup;
  const activeNodeName = isActiveManualGroup ? proxy.now || '' : '';
  const currentNodeDelay = normalizeDelayEntry(activeNodeName ? delayCache.get(activeNodeName) : undefined);
  return {
    ...proxy,
    scopeName: parsed.scopeName,
    sectionTitle: parsed.sectionTitle,
    nodes,
    availableCount: nodes.filter((node) => availableDelayStatuses.has(node.delayStatus)).length,
    totalCount: nodes.length,
    activeNodeName,
    summaryNodeName: activeNodeName,
    currentNodeDelay,
    availabilityColor: currentNodeDelay.status,
  };
}
```

`buildManualSections(groups, delayCache, currentManualGroup)` 必须把 `currentManualGroup` 传入 `buildManualGroup()`。

`buildProxyUiModel()` 中：

```js
const currentManualGroup = selector.now.endsWith('/手动组') ? selector.now : '';
```

自动组模式下 `currentManualGroup` 为空，因此所有手动组 `activeNodeName` 和 `summaryNodeName` 为空。

如果根因是 `FRONTEND_DELAY_CACHE`，修复要求是：

- `state.delayCache` 只能用于 `delayMs`、`delayStatus`、排序和 `currentNodeDelay`。
- 不能用 `delayCache` 推导 `summaryNodeName`、`activeNodeName` 或当前分组摘要。
- 自动组模式下即使 delayCache 中有某机场/地区旧节点延时，也不能显示该节点摘要或选中态。

- [ ] **Step 7: 修改渲染只使用诊断后确定的安全字段**

在摘要行中只使用 `group.summaryNodeName`，不能使用 `group.now`。

在节点 active 判断中只使用：

```js
node.name === group.activeNodeName
```

不能使用：

```js
node.name === group.now
```

定位按钮只定位 `group.activeNodeName`。如果为空，显示 `当前分组未选中节点`，不根据 `group.now` 定位。

- [ ] **Step 8: 运行单元测试**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: PASS。任务报告必须包含 Step 3 根因分类和修复依据。

## Task 6: 视觉系统整合

**依赖:** Task 2、Task 3、Task 4、Task 5。

**可并行:** 否。

**Files:**
- Modify: `ui/styles.css`
- Modify: `tests/proxy-ui-unit.test.mjs`

- [ ] **Step 1: 写 CSS 结构测试**

追加：

```js
test('CSS 包含区域标题、地域徽章、路由轨道和健康指标样式', async () => {
  const css = await readFile(join(__dirname, '..', 'ui', 'styles.css'), 'utf8');
  for (const selector of [
    '.hero-actions', '.capability-title', '.mode-banner', '.route-track', '.route-chip',
    '.section-heading', '.region-badge', '.health-metrics', '.availability-metric',
    '.delay-metric', '.summary-actions', '.node-delay-badge',
  ]) {
    assert.match(css, new RegExp(selector.replace('.', '\\.')));
  }
  assert.doesNotMatch(css, /\.toolbar\s*\{/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: FAIL，CSS 选择器缺失。

- [ ] **Step 3: 实现 CSS**

在 `ui/styles.css` 中：

- 新增 `.hero-actions` 替代 `.toolbar`。
- 新增 `.capability-title`，用于自动组和手动区域一级标题。
- 新增 `.mode-banner.mode-automatic` / `.mode-manual` / `.mode-direct`。
- 新增 `.route-track` / `.route-chip` / `.route-arrow`，实现三段式航线轨道。
- 新增 `.section-heading` 和 `.section-icon`，强化 `全部聚合` / `按机场` / `按地区`。
- 新增 `.region-badge`，低饱和背景、细边框、内阴影、hover/focus 微动效。
- 新增 `.summary-content` / `.summary-main` / `.summary-actions`，实现左右布局。
- 新增 `.health-metrics`，用 CSS grid 或 flex column 做轻微错位双层排版。
- 新增 `.availability-metric .available-count` 和 `.total-count` 的权重差异。
- 新增 `.node-delay-badge`，定位到 `.node-card` 右下角。
- 删除或废弃 `.chip.speed-*` 的使用样式。
- warning 色改为明确琥珀/黄色，例如 `#facc15` 文字配 `#422006` 或更明显黄色边框。

- [ ] **Step 4: 运行测试**

Run: `bun test tests/proxy-ui-unit.test.mjs`

Expected: PASS。

## Task 7: E2E、部署和真实 QA

**依赖:** Task 6。

**可并行:** 否。

**Files:**
- Modify: `e2e/proxy-ui.e2e.js`
- Runtime: Docker Compose

- [ ] **Step 1: 更新 E2E 断言**

在 `e2e/proxy-ui.e2e.js` 更新或新增测试，覆盖：

```js
await expect(page.getByTestId('test-all-delay')).toBeVisible();
await expect(page.getByTestId('expand-toggle')).toBeVisible();
await expect(page.getByTestId('locate-current-node')).toHaveCount(0);
await expect(page.getByTestId('mode-banner')).toContainText(/当前模式/);
await expect(page.getByTestId('route-track')).toBeVisible();
await expect(page.getByTestId('route-segment-selector')).toBeVisible();
await expect(page.getByTestId('route-segment-node')).toBeVisible();
await expect(page.getByText('手动代理选择区域')).toBeVisible();
await expect(page.locator('.section-heading')).toContainText(['全部聚合', '按机场', '按地区']);
await expect(page.locator('.summary-actions').first()).toBeVisible();
await expect(page.locator('.summary-actions').first()).toContainText('定位📌');
await expect(page.locator('.node-card').first()).not.toContainText(/速度|延时：|--/);
```

新增快捷键测试：

```js
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Meta+K');
await expect(page.locator('details.manual-group[open]').first()).toBeVisible();
await expect(page.getByTestId('expand-toggle')).toHaveText('全部收起');
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+L' : 'Meta+L');
await expect(page.getByTestId('expand-toggle')).toHaveText('全部展开');
```

- [ ] **Step 2: 运行完整本地测试**

Run: `bun test`

Expected: PASS，允许既有 2 个部署依赖 skip。

Run: `bunx playwright test --reporter=line`

Expected: 9/9 或更新后的全部 E2E PASS。

- [ ] **Step 3: 部署 9091**

Run: `docker compose up -d --build proxy-ui`

Expected: `proxy-ui` 容器重建并运行。

- [ ] **Step 4: 真实页面 QA**

访问 `http://192.168.100.135:9091/#/proxies`，验证：

- 顶部只有一个展开/收起切换控件。
- 无全局 `定位当前节点`。
- 自动/手动区域明显同级。
- 地区分组为地域徽章，例如 `🇭🇰 香港`、`🇲🇴 澳门`、`🇸🇬 新加坡`、`🇺🇸 美国`。
- 具体分组右侧有 `测速` + `定位📌` 背景操作组。
- 摘要行不出现 `当前：`、`延时：`、`可用节点数：`、`速度：`。
- 节点卡片不出现速度和速度 `--`。
- 无有效延时显示 `timeout`。
- 实际路由标签三段式清晰。
- `Command+K` 展开全部，`Command+L` 收起全部。
- 自动组模式下，机场、地区、全部聚合手动区域都不显示旧节点摘要或旧选中态。
- 手动选择机场节点后，地区和全部聚合不显示同名节点旧摘要。
- 手动选择地区节点后，机场和全部聚合不显示同名节点旧摘要。

Run: `curl -I http://127.0.0.1:9091/`

Expected: HTTP 200。

## 自审结果

- Spec 覆盖：顶部重组、单一展开控件、快捷键、自动/手动区域、状态横幅、三段式实际路由、地域徽章、右侧操作组、健康指标、速度移除、timeout 归一化、选中态互斥、跨机场/跨地区旧摘要清理均有任务覆盖。
- 占位扫描：无 `TBD`、`TODO`、`待定`。
- 类型一致性：计划中新增导出函数为 `regionFlag`、`regionBadgeLabel`、`formatSelectorSegment`、`parseRouteSegments`、`expandToggleLabel`、`expandShortcutAction`；后续任务均使用这些名称。
- Commit：本仓库当前按用户流程在子代理全绿后再提交；未得到明确提交请求前不执行 git commit。
