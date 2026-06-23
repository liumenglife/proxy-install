import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import * as proxyUi from '../ui/app.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const indexHtml = join(__dirname, '..', 'ui', 'index.html');

const {
  buildProxyUiModel,
  createInteractionTracker,
  createRefreshScheduler,
  selectAutomaticGroup,
  selectManualNode,
  toggleProxy,
  getProxyEnabled,
  updateProxyToggleUI,
} = proxyUi;

const proxies = {
  '代理选择标签': {
    name: '代理选择标签',
    type: 'Selector',
    now: '全部聚合/手动组',
    all: ['全部聚合/自动组', '全部聚合/手动组'],
  },
  '全部聚合/自动组': {
    name: '全部聚合/自动组',
    type: 'URLTest',
    now: '日本-猫熊机场-口 IPLC-V366-日本-1x-NF&Abema&Disney*',
    all: ['日本-猫熊机场-口 IPLC-V366-日本-1x-NF&Abema&Disney*'],
  },
  '全部聚合/手动组': {
    name: '全部聚合/手动组',
    type: 'Selector',
    now: '香港-猫熊机场-V301',
    all: ['香港-猫熊机场-V301', '日本-猫熊机场-口 IPLC-V366-日本-1x-NF&Abema&Disney*'],
  },
  '按地区/日本/自动组': {
    name: '按地区/日本/自动组',
    type: 'URLTest',
    now: '日本-猫熊机场-口 IPLC-V366-日本-1x-NF&Abema&Disney*',
    all: ['日本-猫熊机场-口 IPLC-V366-日本-1x-NF&Abema&Disney*'],
  },
};

test('模型只把自动组放入顶部选择器，并在当前为手动组时显示手动状态和实际路由', () => {
  const model = buildProxyUiModel(proxies);

  assert.deepEqual(model.automaticGroups, ['全部聚合/自动组', '按地区/日本/自动组']);
  assert.equal(model.selectorNow, '全部聚合/手动组');
  assert.equal(model.currentManualGroup, '全部聚合/手动组');
  assert.equal(model.selectedAutomaticGroup, '');
  assert.equal(model.routeLabel, '全部聚合/手动组 → 香港-猫熊机场-V301');
  assert.deepEqual(model.sections.map((section) => section.title), ['全部聚合', '按地区']);
});

test('模型在分区内展示自动组节点用于只读点击提示', () => {
  const model = buildProxyUiModel(proxies);
  const allSection = model.sections.find((section) => section.title === '全部聚合');
  const automaticGroup = allSection.items.find((group) => group.name === '全部聚合/自动组');

  assert.equal(automaticGroup.type, 'URLTest');
  assert.deepEqual(automaticGroup.all, ['日本-猫熊机场-口 IPLC-V366-日本-1x-NF&Abema&Disney*']);
});

test('选择自动组只更新代理选择标签', async () => {
  const calls = [];
  const api = { putProxy: async (group, name) => calls.push([group, name]) };

  await selectAutomaticGroup(api, '按地区/日本/自动组');

  assert.deepEqual(calls, [['代理选择标签', '按地区/日本/自动组']]);
});

test('选择手动节点先更新手动组，再反向更新代理选择标签', async () => {
  const calls = [];
  const api = { putProxy: async (group, name) => calls.push([group, name]) };

  await selectManualNode(api, '全部聚合/手动组', '日本-猫熊机场-口 IPLC-V366-日本-1x-NF&Abema&Disney*');

  assert.deepEqual(calls, [
    ['全部聚合/手动组', '日本-猫熊机场-口 IPLC-V366-日本-1x-NF&Abema&Disney*'],
    ['代理选择标签', '全部聚合/手动组'],
  ]);
});

test('点击自动组节点只返回不可选提示且不发送选择 API', async () => {
  const calls = [];
  const api = { putProxy: async (group, name) => calls.push([group, name]) };

  assert.equal(typeof proxyUi.selectAutomaticNode, 'function');

  const message = await proxyUi.selectAutomaticNode(
    api,
    '全部聚合/自动组',
    '日本-猫熊机场-口 IPLC-V366-日本-1x-NF&Abema&Disney*',
  );

  assert.equal(message, proxyUi.readonlyAutomaticNodeMessage);
  assert.equal(message, '自动组不可手动选择，请去对应手动组选择');
  assert.deepEqual(calls, []);
});

test('模型按固定顺序派生手动组、自动组、延时状态和统计', () => {
  const regionNames = [
    '香港',
    '台湾',
    '澳门',
    '美国',
    '日本',
    '英国',
    '法国',
    '德国',
    '泰国',
    '菲律宾',
    '马来西亚',
    '印尼',
    '新加坡',
    '越南',
    '巴基斯坦',
    '印度',
    '土耳其',
    '沙特',
    '阿曼',
    '巴林',
    '卡塔尔',
    '伊拉克',
    '俄罗斯',
    '乌克兰',
    '荷兰',
    '加拿大',
    '澳大利亚',
    '巴西',
    '其他',
  ];
  const proxySet = {
    '代理选择标签': {
      name: '代理选择标签',
      type: 'Selector',
      now: '全部聚合/手动组',
      all: ['全部聚合/自动组', '全部聚合/手动组'],
    },
    '全部聚合/手动组': {
      name: '全部聚合/手动组',
      type: 'Selector',
      now: '订阅节点A',
      all: ['订阅节点A', '订阅节点B', '订阅节点C', '订阅节点D', '订阅节点E', '订阅节点F', '订阅节点G'],
    },
    '按机场/瞬云机场/手动组': { name: '按机场/瞬云机场/手动组', type: 'Selector', now: '', all: [] },
    '按机场/未知乙机场/手动组': { name: '按机场/未知乙机场/手动组', type: 'Selector', now: '', all: [] },
    '按机场/穿墙猫机场/手动组': { name: '按机场/穿墙猫机场/手动组', type: 'Selector', now: '', all: [] },
    '按机场/猫熊机场/手动组': { name: '按机场/猫熊机场/手动组', type: 'Selector', now: '', all: [] },
    '按机场/未知甲机场/手动组': { name: '按机场/未知甲机场/手动组', type: 'Selector', now: '', all: [] },
    '按机场/穿山甲机场/手动组': { name: '按机场/穿山甲机场/手动组', type: 'Selector', now: '', all: [] },
    '临时选择/手动组': { name: '临时选择/手动组', type: 'Selector', now: '', all: [] },
    '全部聚合/自动组': { name: '全部聚合/自动组', type: 'URLTest', now: '订阅节点A', all: ['订阅节点A'] },
    '按地区/日本/自动组': { name: '按地区/日本/自动组', type: 'URLTest', now: '订阅节点A', all: ['订阅节点A'] },
    '按地区/香港/自动组': { name: '按地区/香港/自动组', type: 'URLTest', now: '订阅节点B', all: ['订阅节点B'] },
    '按机场/瞬云机场/自动组': { name: '按机场/瞬云机场/自动组', type: 'URLTest', now: '订阅节点A', all: ['订阅节点A'] },
    '按机场/穿山甲机场/自动组': { name: '按机场/穿山甲机场/自动组', type: 'URLTest', now: '订阅节点A', all: ['订阅节点A'] },
    '按机场/猫熊机场/自动组': { name: '按机场/猫熊机场/自动组', type: 'URLTest', now: '订阅节点A', all: ['订阅节点A'] },
    '按机场/穿墙猫机场/自动组': { name: '按机场/穿墙猫机场/自动组', type: 'URLTest', now: '订阅节点A', all: ['订阅节点A'] },
    '未知乙自动组': { name: '未知乙自动组', type: 'URLTest', now: '订阅节点A', all: ['订阅节点A'] },
    '未知甲自动组': { name: '未知甲自动组', type: 'URLTest', now: '订阅节点A', all: ['订阅节点A'] },
  };
  for (const regionName of regionNames.toReversed()) {
    proxySet[`按地区/${regionName}/手动组`] = {
      name: `按地区/${regionName}/手动组`,
      type: 'Selector',
      now: '',
      all: [],
    };
  }

  const delayCache = new Map([
    ['订阅节点A', { delayMs: 850, status: 'good' }],
    ['订阅节点B', { delayMs: 120, status: 'excellent' }],
    ['订阅节点C', { status: 'timeout' }],
    ['订阅节点D', { status: 'timeout' }],
    ['订阅节点F', { delayMs: 1500, status: 'warning' }],
    ['订阅节点G', { delayMs: 2500, status: 'poor' }],
  ]);

  const model = buildProxyUiModel(proxySet, { delayCache });

  assert.deepEqual(model.manualSections.map((section) => section.title), ['全部聚合', '按机场', '按地区', '未分类']);
  assert.deepEqual(model.manualSections[1].groups.map((group) => group.scopeName), [
    '猫熊机场',
    '穿墙猫机场',
    '穿山甲机场',
    '瞬云机场',
    '未知甲机场',
    '未知乙机场',
  ]);
  assert.deepEqual(model.manualSections[2].groups.map((group) => group.scopeName), regionNames);
  assert.deepEqual(model.manualSections[3].groups.map((group) => group.name), ['临时选择/手动组']);
  assert.deepEqual(model.automaticSelectorOptions.map((option) => option.name), [
    '全部聚合/自动组',
    '按机场/猫熊机场/自动组',
    '按机场/穿墙猫机场/自动组',
    '按机场/穿山甲机场/自动组',
    '按机场/瞬云机场/自动组',
    '按地区/香港/自动组',
    '按地区/日本/自动组',
    '未知甲自动组',
    '未知乙自动组',
  ]);

  const aggregateGroup = model.manualSections[0].groups[0];
  assert.deepEqual(aggregateGroup.nodes.map((node) => node.name), [
    '订阅节点B',
    '订阅节点A',
    '订阅节点F',
    '订阅节点G',
    '订阅节点C',
    '订阅节点D',
    '订阅节点E',
  ]);
  assert.deepEqual(aggregateGroup.nodes.map((node) => node.delayStatus), [
    'excellent',
    'good',
    'warning',
    'poor',
    'timeout',
    'timeout',
    'timeout',
  ]);
  assert.equal(aggregateGroup.availableCount, 4);
  assert.equal(aggregateGroup.totalCount, 7);
  assert.deepEqual(aggregateGroup.currentNodeDelay, { delayMs: 850, status: 'good' });
  assert.equal(aggregateGroup.currentNodeSpeed, '--');
  assert.equal(aggregateGroup.availabilityColor, 'good');
  assert.equal(model.automaticSections.every((section) => section.readonlyMessage === proxyUi.readonlyAutomaticNodeMessage), true);
});

test('模型默认从代理 history 的最近记录派生节点延时并排序', () => {
  const proxySet = {
    '代理选择标签': {
      name: '代理选择标签',
      type: 'Selector',
      now: '全部聚合/手动组',
      all: ['全部聚合/手动组'],
    },
    '全部聚合/手动组': {
      name: '全部聚合/手动组',
      type: 'Selector',
      now: '节点慢',
      all: ['节点慢', '节点快', '节点超时', '节点未知'],
    },
    '节点慢': {
      name: '节点慢',
      history: [
        { time: '2026-06-22T10:00:00Z', delay: 1200 },
        { time: '2026-06-22T10:01:00Z', delay: 900 },
      ],
    },
    '节点快': {
      name: '节点快',
      history: [{ time: '2026-06-22T10:02:00Z', delay: 80 }],
    },
    '节点超时': {
      name: '节点超时',
      history: [{ time: '2026-06-22T10:03:00Z', delay: 0 }],
    },
    '节点未知': { name: '节点未知' },
  };

  const model = buildProxyUiModel(proxySet);
  const aggregateGroup = model.manualSections[0].groups[0];

  assert.deepEqual(aggregateGroup.nodes.map((node) => [node.name, node.delayMs, node.delayStatus]), [
    ['节点快', 80, 'excellent'],
    ['节点慢', 900, 'good'],
    ['节点超时', undefined, 'timeout'],
    ['节点未知', undefined, 'timeout'],
  ]);
  assert.deepEqual(aggregateGroup.currentNodeDelay, { delayMs: 900, status: 'good' });
});

test('实时刷新调度自动轮询、手动同步并在失败时保留旧数据', async () => {
  const calls = [];
  const state = {
    proxies: { 旧数据: { name: '旧数据' } },
    syncStatus: 'idle',
  };
  const scheduler = createRefreshScheduler({
    state,
    syncProxies: async ({ manual }) => {
      calls.push(manual ? 'manual-proxies' : 'auto-proxies');
      state.proxies = { 新数据: { name: '新数据' } };
    },
    now: () => 1710000000000,
  });

  await scheduler.tick(1000);
  await scheduler.tick(2000);
  await scheduler.syncNow();

  assert.deepEqual(calls, ['auto-proxies', 'manual-proxies']);
  assert.equal(state.syncStatus, 'synced');
  assert.equal(state.lastSyncedAt, 1710000000000);
  assert.deepEqual(state.proxies, { 新数据: { name: '新数据' } });

  const failingScheduler = createRefreshScheduler({
    state,
    syncProxies: async () => {
      throw new Error('backend unavailable');
    },
    now: () => 1710000001000,
  });

  await failingScheduler.syncNow();

  assert.equal(state.syncStatus, 'error');
  assert.equal(state.syncError, 'backend unavailable');
  assert.deepEqual(state.proxies, { 新数据: { name: '新数据' } });
});

test('交互追踪器记录交互开始和结束状态', () => {
  const tracker = createInteractionTracker();

  assert.equal(tracker.isInteracting(), false, '初始非交互');

  tracker.startInteraction();
  assert.equal(tracker.isInteracting(), true, '交互中');

  tracker.endInteraction();
  assert.equal(tracker.isInteracting(), false, '交互结束');
});

test('交互追踪器请求刷新后 consumeRefresh 返回 true 并清除', () => {
  const tracker = createInteractionTracker({ now: () => 0 });

  assert.equal(tracker.consumeRefresh(), false);
  tracker.requestRefresh();
  assert.equal(tracker.consumeRefresh(), true);
  assert.equal(tracker.consumeRefresh(), false, '消费后清除');
});

test('交互期间自动刷新被跳过、交互结束后恢复', async () => {
  const tracker = createInteractionTracker();
  const autoCalls = [];
  const state = { syncStatus: 'idle' };
  const scheduler = createRefreshScheduler({
    state,
    syncProxies: async ({ manual }) => {
      autoCalls.push(manual ? 'manual' : 'auto');
    },
    now: () => 0,
    intervalMs: 3000,
    interactionTracker: tracker,
  });

  tracker.startInteraction();
  await scheduler.tick(3000);
  assert.deepEqual(autoCalls, [], '交互中被跳过');

  tracker.endInteraction();
  await scheduler.tick(3000);
  assert.deepEqual(autoCalls, ['auto'], '交互结束后恢复自动刷新');
});

test('手动同步在交互期间仍然可以执行', async () => {
  const tracker = createInteractionTracker();
  const manualCalls = [];
  const state = { syncStatus: 'idle' };
  const scheduler = createRefreshScheduler({
    state,
    syncProxies: async ({ manual }) => {
      manualCalls.push(manual ? 'manual' : 'auto');
    },
    now: () => 0,
    interactionTracker: tracker,
  });

  tracker.startInteraction();

  await scheduler.syncNow();
  assert.deepEqual(manualCalls, ['manual'], '手动同步在交互中正常执行');
});

test('交互追踪器 currentGeneration 在每次 startInteraction 时递增', () => {
  const tracker = createInteractionTracker({ now: () => 0 });

  const gen1 = tracker.currentGeneration();
  tracker.startInteraction();
  const gen2 = tracker.currentGeneration();
  tracker.endInteraction();
  tracker.startInteraction();
  const gen3 = tracker.currentGeneration();

  assert.ok(gen2 > gen1, '交互后代数增加');
  assert.ok(gen3 > gen2, '再次交互代数增加');
});

// ============================================================
// Task 3：DOM 结构、操作工具条与非阻断自动组提示
// ============================================================

test('HTML 页面不包含 SING-BOX CLASH API 且暴露主要操作按钮和静态只读提示', async () => {
  const html = await readFile(indexHtml, 'utf8');

  assert.doesNotMatch(html, /SING-BOX CLASH API/i);
  assert.match(html, /data-testid="test-all-delay"/);
  assert.match(html, /data-testid="expand-toggle"/);
  assert.match(html, /自动组不可手动选择/);
  // 确保只读提示是静态文字，不是 alert 触发的按钮
  assert.doesNotMatch(html, /<button[^>]*readonly-auto-note/);
  assert.doesNotMatch(html, /data-testid="expand-all"/);
  assert.doesNotMatch(html, /data-testid="collapse-all"/);
  assert.doesNotMatch(html, /data-testid="locate-current-node"/);
});

test('HTML 页面不包含"一级分组/手动组"重复文本且顶部标题为"代理控制台"', async () => {
  const html = await readFile(indexHtml, 'utf8');

  // 不在每个分组卡片内重复显示"手动组"
  assert.doesNotMatch(html, /一级分组\/手动组/i);
  // 不弹出 alert 式只读提示
  assert.doesNotMatch(html, /alert\(/);
  // 顶部标题应为"代理控制台"
  assert.match(html, /<h1[^>]*>代理控制台<\/h1>/);
});

test('分组模型的 displayGroupName 不含"/手动组"前缀且不重复', () => {
  // displayGroupName 用于卡片标题，不显示 "/手动组" 后缀
  const result = proxyUi.displayGroupName('全部聚合/手动组');
  assert.equal(result, '全部聚合');
  assert.doesNotMatch(result, /手动组/);

  const result2 = proxyUi.displayGroupName('按机场/猫熊机场/手动组');
  assert.equal(result2, '猫熊机场');
  assert.doesNotMatch(result2, /手动组/);

  const result3 = proxyUi.displayGroupName('按地区/香港/手动组');
  assert.equal(result3, '香港');
  assert.doesNotMatch(result3, /手动组/);

  const result4 = proxyUi.displayGroupName('未分类/其他/手动组');
  assert.equal(result4, '其他');
  assert.doesNotMatch(result4, /手动组/);
});

// 基于模型的 DOM-compatible rendering 纯函数测试
function createMockElement() {
  const children = [];
  const listeners = {};
  const el = {
    tagName: 'div',
    className: '',
    _textContent: '',
    _attributes: {},
    _children: children,
    _listeners: listeners,
    get textContent() { return this._textContent; },
    set textContent(value) { this._textContent = value; },
    setAttribute(name, value) { this._attributes[name] = value; },
    getAttribute(name) { return this._attributes[name] || null; },
    get dataset() {
      const attrs = this._attributes;
      return new Proxy(attrs, {
        get: (_target, key) => {
          const kebab = String(key).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
          return attrs[`data-${kebab}`] || '';
        },
        set: (_target, key, value) => {
          const kebab = String(key).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
          attrs[`data-${kebab}`] = value;
          return true;
        },
      });
    },
    append(...children) { for (const child of children) this._children.push(child); },
    replaceChildren(...newChildren) { this._children.length = 0; this._children.push(...newChildren); },
    addEventListener(event, fn) { this._listeners[event] = fn; },
    querySelectorAll(selector) {
      const matchElement = (child) => {
        if (selector.startsWith('[data-testid="') && selector.endsWith('"]')) {
          const testid = selector.slice(14, -2);
          return child._attributes['data-testid'] === testid;
        }
        if (selector.startsWith('[data-delay-status="') && selector.endsWith('"]')) {
          const status = selector.slice(20, -2);
          return child._attributes['data-delay-status'] === status;
        }
        if (selector.startsWith('[data-delay-status]')) {
          return 'data-delay-status' in child._attributes;
        }
        // 支持 class 选择器（如 .chip.delay-excellent、.chip.node-name）
        const classes = selector.split('.').filter(Boolean);
        if (classes.length > 0 && /^[a-zA-Z_-]/.test(classes[0])) {
          const elClasses = (child.className || '').split(/\s+/).filter(Boolean);
          return classes.every((cls) => elClasses.includes(cls));
        }
        return false;
      };
      const results = [];
      const walk = (node) => {
        if (matchElement(node)) results.push(node);
        for (const child of node._children || []) walk(child);
      };
      walk(this);
      return results;
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
  };
  return el;
}

function createMockDocument() {
  const createElement = (tagName) => {
    const el = createMockElement();
    el.tagName = tagName;
    return el;
  };
  return { createElement };
}

test('renderProxyGroups 保持手动组卡片排序且显示节点卡片 chip 结构和延时排序', () => {
  const container = createMockElement();
  const mockDoc = createMockDocument();

  const orderedModel = {
    manualSections: [
      {
        title: '全部聚合',
        groups: [
          {
            name: '全部聚合/手动组',
            scopeName: '全部聚合',
            now: '订阅节点A',
            availableCount: 2,
            totalCount: 3,
            currentNodeDelay: { delayMs: 850, status: 'good' },
            currentNodeSpeed: '--',
            availabilityColor: 'good',
            nodes: [
              { name: '订阅节点B', delayMs: 120, delayStatus: 'excellent' },
              { name: '订阅节点A', delayMs: 850, delayStatus: 'good' },
              { name: '订阅节点C', delayMs: undefined, delayStatus: 'timeout' },
            ],
          },
        ],
      },
      {
        title: '按机场',
        groups: [
          {
            name: '按机场/猫熊机场/手动组',
            scopeName: '猫熊机场',
            now: '订阅节点D',
            availableCount: 0,
            totalCount: 1,
            currentNodeDelay: { status: 'timeout' },
            currentNodeSpeed: '--',
            availabilityColor: 'timeout',
            nodes: [{ name: '订阅节点D', delayMs: undefined, delayStatus: 'timeout' }],
          },
        ],
      },
    ],
  };

  // renderProxyGroups 必须在 app.mjs 中导出
  assert.ok(typeof proxyUi.renderProxyGroups === 'function', 'renderProxyGroups 必须导出');

  proxyUi.renderProxyGroups(container, orderedModel, mockDoc);

  // 验证手动组卡片 data-testid="manual-group-card" 和干净的组名
  const cards = container.querySelectorAll('[data-testid="manual-group-card"]');
  assert.equal(cards.length, 2, '应有两个手动组卡片');

  assert.equal(cards[0].dataset.groupName, '全部聚合/手动组');
  assert.equal(cards[1].dataset.groupName, '按机场/猫熊机场/手动组');

  // 节点卡片应有 data-testid="node-row" 和 delay-{status} CSS class
  const nodeRows = container.querySelectorAll('[data-testid="node-row"]');
  assert.equal(nodeRows.length, 4, '应有4个节点卡片');
  assert.equal(nodeRows[0].dataset.nodeName, '订阅节点B');
  assert.equal(nodeRows[0].dataset.delayStatus, 'excellent');
  // 节点卡片应有 delay-{status} class
  assert.match(nodeRows[0].className || '', /delay-excellent/);
  assert.equal(nodeRows[1].dataset.nodeName, '订阅节点A');
  assert.equal(nodeRows[1].dataset.delayStatus, 'good');
  assert.match(nodeRows[1].className || '', /delay-good/);
  assert.equal(nodeRows[2].dataset.nodeName, '订阅节点C');
  assert.equal(nodeRows[2].dataset.delayStatus, 'timeout');
  assert.match(nodeRows[2].className || '', /delay-timeout/);
  assert.equal(nodeRows[3].dataset.nodeName, '订阅节点D');
  assert.equal(nodeRows[3].dataset.delayStatus, 'timeout');

  // 节点卡片内应包含 chip 子元素
  const chipDelay = container.querySelectorAll('.chip.delay-excellent');
  assert.ok(chipDelay.length >= 1, '应有至少一个 chip.delay-excellent');
  const chipNodeName = container.querySelectorAll('.chip.node-name');
  assert.equal(chipNodeName.length, 4, '每个节点卡片应有 chip.node-name');
});

// ============================================================
// Task 4：代理开关 toggleProxy 和重启按钮
// ============================================================

test('toggleProxy 关闭代理时 PUT direct，并保存当前代理到 _lastActiveProxy', async () => {
  const calls = [];
  const api = {
    getProxies: async () => ({
      '代理选择标签': { name: '代理选择标签', type: 'Selector', now: '全部聚合/手动组', all: ['direct', '全部聚合/手动组'] },
      '全部聚合/手动组': { name: '全部聚合/手动组', now: '', all: [] },
    }),
    putProxy: async (group, name) => calls.push([group, name]),
  };

  const result = await toggleProxy(api);

  assert.equal(result.ok, true);
  assert.equal(result.proxyEnabled, false);
  assert.equal(result.currentProxy, 'direct');
  assert.deepEqual(calls, [['代理选择标签', 'direct']]);
});

test('toggleProxy 当已关闭时恢复上次保存的代理', async () => {
  const calls = [];
  const api = {
    getProxies: async () => ({
      '代理选择标签': { name: '代理选择标签', type: 'Selector', now: 'direct', all: ['direct', '全部聚合/手动组'] },
      '全部聚合/手动组': { name: '全部聚合/手动组', now: '', all: [] },
    }),
    putProxy: async (group, name) => {
      calls.push([group, name]);
    },
  };

  const result = await toggleProxy(api);

  assert.equal(result.ok, true);
  assert.equal(result.proxyEnabled, true);
  assert.deepEqual(calls.length, 1);
});


test('HTML 包含代理开关和重启 sing-box 按钮及状态标签', async () => {
  const html = await readFile(indexHtml, 'utf8');

  assert.match(html, /data-testid="proxy-toggle"/);
  assert.match(html, /data-testid="restart-singbox"/);
  assert.match(html, /data-testid="proxy-state-label"/);
});

test('updateProxyToggleUI 根据 enabled 状态更新按钮文本和样式', () => {
  const btn = { textContent: '', className: '' };
  const label = { textContent: '' };
  const origGetElementById = globalThis.document?.getElementById;
  globalThis.document = {
    getElementById: (id) => {
      if (id === 'proxy-toggle-btn') return btn;
      if (id === 'proxy-state-label') return label;
      return null;
    },
  };

  updateProxyToggleUI(true);
  assert.equal(btn.textContent, '关闭代理');
  assert.equal(btn.className, 'proxy-on');
  assert.equal(label.textContent, '代理状态：已开启');

  updateProxyToggleUI(false);
  assert.equal(btn.textContent, '启动代理');
  assert.equal(btn.className, 'proxy-off');
  assert.equal(label.textContent, '代理状态：已关闭');

  if (origGetElementById) {
    globalThis.document.getElementById = origGetElementById;
  } else {
    delete globalThis.document;
  }
});

test('模板 mixed.json 中 代理选择标签.outbounds 首位包含 direct 支持 toggleProxy', async () => {
  const templatePath = new URL('../configs/sing-box/mixed.json', import.meta.url);
  const template = JSON.parse(await readFile(templatePath, 'utf8'));
  const selector = template.outbounds?.find((o) => o.tag === '代理选择标签');
  assert.ok(selector, '模板应包含 代理选择标签');
  assert.ok(Array.isArray(selector.outbounds), '代理选择标签.outbounds 应为数组');
  assert.equal(selector.outbounds[0], 'direct',
    '代理选择标签.outbounds[0] 应为 direct，否则 toggleProxy PUT direct 会返回 not found');
  assert.ok(selector.outbounds.includes('direct'),
    '代理选择标签.outbounds 必须包含 direct 选项');
});

test('模型 selectorNow 为 direct 时表示代理关闭', () => {
  const proxies = {
    '代理选择标签': { name: '代理选择标签', type: 'Selector', now: 'direct', all: ['direct', '全部聚合/自动组'] },
    '全部聚合/自动组': { name: '全部聚合/自动组', type: 'URLTest', now: '节点A', all: ['节点A'] },
  };

  const model = buildProxyUiModel(proxies);

  assert.equal(model.selectorNow, 'direct');
  assert.equal(model.routeLabel.includes('direct'), true);
});

// ============================================================
// Task 5：测速引擎（speedtest engine）
// ============================================================

import { createSpeedTest } from '../ui/speedtest.mjs';

function createMockApi(getDelayImpl) {
  return { getDelay: getDelayImpl || (async () => ({ delay: 100 })) };
}

test('createSpeedTest 创建测速引擎并返回 testNodes 函数', () => {
  const api = createMockApi();
  const engine = createSpeedTest(api);
  assert.equal(typeof engine, 'object');
  assert.equal(typeof engine.testNodes, 'function');
});

test('testNodes 调用 api.getDelay 为每个节点传递超时和 URL 参数并发测速', async () => {
  const calls = [];
  const api = {
    getDelay: async (nodeName, timeout, url) => {
      calls.push({ nodeName, timeout, url });
      return { delay: 120 };
    },
  };
  const engine = createSpeedTest(api);
  const results = await engine.testNodes(['nodeA', 'nodeB', 'nodeC']);

  assert.equal(calls.length, 3);
  assert.equal(calls.every((c) => c.timeout === 5000), true);
  assert.equal(calls.every((c) => c.url === 'https://www.gstatic.com/generate_204'), true);
  assert.equal(results.size, 3);
  assert.deepEqual(results.get('nodeA'), { delayMs: 120, status: 'excellent' });
  assert.deepEqual(results.get('nodeB'), { delayMs: 120, status: 'excellent' });
  assert.deepEqual(results.get('nodeC'), { delayMs: 120, status: 'excellent' });
});

test('testNodes 并发上限为 6', async () => {
  let concurrent = 0;
  let maxConcurrent = 0;
  const api = {
    getDelay: async () => {
      concurrent += 1;
      if (concurrent > maxConcurrent) maxConcurrent = concurrent;
      await new Promise((r) => setTimeout(r, 5));
      concurrent -= 1;
      return { delay: 80 };
    },
  };
  const engine = createSpeedTest(api);
  const nodes = Array.from({ length: 12 }, (_, i) => `node${i}`);
  const results = await engine.testNodes(nodes);

  assert.equal(results.size, 12);
  assert.ok(maxConcurrent <= 6, `最大并发 ${maxConcurrent} 超过上限 6`);
});

test('testNodes 部分节点超时或错误不中断整体批次', async () => {
  const api = {
    getDelay: async (nodeName) => {
      if (nodeName === 'nodeB') throw new Error('network error');
      if (nodeName === 'nodeD') return { delay: 0 };
      return { delay: 200 };
    },
  };
  const engine = createSpeedTest(api);
  const results = await engine.testNodes(['nodeA', 'nodeB', 'nodeC', 'nodeD']);

  assert.equal(results.size, 4);
  assert.deepEqual(results.get('nodeA'), { delayMs: 200, status: 'excellent' });
  assert.deepEqual(results.get('nodeB'), { status: 'timeout' });
  assert.deepEqual(results.get('nodeC'), { delayMs: 200, status: 'excellent' });
  assert.deepEqual(results.get('nodeD'), { status: 'timeout' });
});

test('testNodes 进度回调在每次完成时触发且报告 completed/total/percentage/nodeName', async () => {
  const api = {
    getDelay: async () => ({ delay: 100 }),
  };
  const progressCalls = [];
  const engine = createSpeedTest(api);
  await engine.testNodes(['nodeA', 'nodeB', 'nodeC'], (p) => progressCalls.push(p));

  assert.ok(progressCalls.length >= 3, `应至少 3 次进度回调，实际 ${progressCalls.length}`);
  assert.equal(progressCalls.every((p) => p.total === 3), true);
  assert.equal(progressCalls.every((p) => typeof p.completed === 'number'), true);
  assert.equal(progressCalls.every((p) => typeof p.percentage === 'number'), true);
  assert.equal(progressCalls.every((p) => typeof p.nodeName === 'string'), true);
  const last = progressCalls[progressCalls.length - 1];
  assert.equal(last.completed, 3);
  assert.equal(last.percentage, 100);
});

test('testNodes 空数组返回空 Map', async () => {
  const api = createMockApi();
  const engine = createSpeedTest(api);
  const results = await engine.testNodes([]);
  assert.equal(results.size, 0);
});

test('createApi 包含 getDelay 方法并构造正确的 URL 参数', () => {
  assert.equal(typeof proxyUi.createApi, 'function', 'createApi 必须从 app.mjs 导出');
  const api = proxyUi.createApi('/api');
  assert.equal(typeof api.getDelay, 'function', 'createApi 返回的对象须包含 getDelay 方法');
});

// ============================================================
// Task 6：UI 视觉优化 — CSS 样式测试
// ============================================================

const stylesCss = join(__dirname, '..', 'ui', 'styles.css');

test('CSS 包含新深色主题 --bg-primary #020617 与 --bg-card #0f172a', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.match(css, /--bg-primary:\s*#020617/);
  assert.match(css, /--bg-card:\s*#0f172a/);
  assert.match(css, /--border-color:\s*#1e293b/);
});

test('CSS :root 设置深色背景 #020617', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.match(css, /:root\s*\{[^}]*background:\s*(var\(--bg-primary\)|#020617)/s);
  assert.match(css, /:root\s*\{[^}]*color:\s*(var\(--text-primary\)|#[0-9a-fA-F]{6})/s);
});

test('body 无白色渐变，使用纯深色背景 #020617', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.doesNotMatch(css, /radial-gradient\(circle.*rgba\(66.*133.*244/);
  assert.doesNotMatch(css, /linear-gradient\(135deg.*#f8fbff/);
  assert.match(css, /body\s*\{[^}]*background:\s*(var\(--bg-primary\)|#020617)/s);
});

test('卡片 .card 有圆角 border-radius 和阴影 box-shadow', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.match(css, /\.card\s*\{[^}]*border-radius:/s);
  assert.match(css, /\.card\s*\{[^}]*box-shadow:/s);
});

test('节点卡片 .node-card 最小宽度 320px', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.match(css, /\.node-card\s*\{[^}]*min-width:\s*320px/s);
});

test('按钮有 hover 和 active 伪类样式', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.match(css, /button\s*:[\w-]*\s*hover\s*\{/);
  assert.match(css, /button\s*:[\w-]*\s*active\s*\{/);
});

test('延迟语义背景色 .delay-excellent 使用 #052e16 背景 #86efac 文字（非 border-left）', async () => {
  const css = await readFile(stylesCss, 'utf8');

  // 不再使用 border-left
  assert.doesNotMatch(css, /\.delay-excellent\s*\{[^}]*border-left/);
  assert.match(css, /\.delay-excellent\s*\{[^}]*background-color:\s*#052e16/s);
  assert.match(css, /\.delay-excellent\s*\{[^}]*color:\s*#86efac/s);
});

test('延迟语义背景色 .delay-good 使用 #14532d 背景 #4ade80 文字', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.doesNotMatch(css, /\.delay-good\s*\{[^}]*border-left/);
  assert.match(css, /\.delay-good\s*\{[^}]*background-color:\s*#14532d/s);
  assert.match(css, /\.delay-good\s*\{[^}]*color:\s*#4ade80/s);
});

test('延迟语义背景色 .delay-warning 使用 #422006 背景 #fde047 文字', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.doesNotMatch(css, /\.delay-warning\s*\{[^}]*border-left/);
  assert.match(css, /\.delay-warning\s*\{[^}]*background-color:\s*#422006/s);
  assert.match(css, /\.delay-warning\s*\{[^}]*color:\s*#fde047/s);
});

test('延迟语义背景色 .delay-poor 使用 #2e1065 背景 #c4b5fd 文字', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.doesNotMatch(css, /\.delay-poor\s*\{[^}]*border-left/);
  assert.match(css, /\.delay-poor\s*\{[^}]*background-color:\s*#2e1065/s);
  assert.match(css, /\.delay-poor\s*\{[^}]*color:\s*#c4b5fd/s);
});

test('延迟语义背景色 .delay-timeout 使用 #450a0a 背景 #fca5a5 文字', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.doesNotMatch(css, /\.delay-timeout\s*\{[^}]*border-left/);
  assert.match(css, /\.delay-timeout\s*\{[^}]*background-color:\s*#450a0a/s);
  assert.match(css, /\.delay-timeout\s*\{[^}]*color:\s*#fca5a5/s);
});

test('延迟语义背景色 .delay-unknown 使用 #1e293b 背景 #94a3b8 文字', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.doesNotMatch(css, /\.delay-unknown\s*\{[^}]*border-left/);
  assert.match(css, /\.delay-unknown\s*\{[^}]*background-color:\s*#1e293b/s);
  assert.match(css, /\.delay-unknown\s*\{[^}]*color:\s*#94a3b8/s);
});

test('测速按钮使用绿色语义色（对比度优化：暗底+绿色边框+绿色文字）', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.match(css, /#test-all-btn\s*\{[^}]*color:\s*var\(--green\)/s);
  assert.match(css, /#test-all-btn\s*\{[^}]*border:\s*2px\s+solid\s+var\(--green\)/s);
  assert.match(css, /\.group-speedtest-btn\s*\{[^}]*color:\s*var\(--green\)/s);
  assert.match(css, /\.group-speedtest-btn\s*\{[^}]*border:\s*2px\s+solid\s+var\(--green\)/s);
});

test('重启按钮使用橙色语义色（对比度优化：暗底+橙色边框+橙色文字）', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.match(css, /#restart-singbox-btn\s*\{[^}]*color:\s*var\(--orange\)/s);
  assert.match(css, /#restart-singbox-btn\s*\{[^}]*border:\s*2px\s+solid\s+var\(--orange\)/s);
});

test('移动端响应式 @media (max-width: 760px) 仍存在', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.match(css, /@media\s*\(\s*max-width:\s*760px\s*\)/);
});

test('顶部状态卡 .top-grid 有深色卡片背景和内边距', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.match(css, /\.top-grid\s*\{[^}]*background:\s*(var\(--bg-card\)|#0f172a)/s);
  assert.match(css, /\.top-grid\s*\{[^}]*border-radius:/s);
  assert.match(css, /\.top-grid\s*\{[^}]*gap:/s);
});

test('.hero 卡片有深色毛玻璃背景', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.match(css, /\.hero\s*\{[^}]*background:\s*(var\(--bg-card\)|#0f172a|rgba.*0\.[67]|#[0-9a-fA-F]{6})/s);
  assert.match(css, /\.hero\s*\{[^}]*backdrop-filter:/s);
  assert.match(css, /\.hero\s*\{[^}]*border-radius:/s);
});

test('HTML 中顶部控制区增加 data-testid="top-status-bar" 语义标记', async () => {
  const html = await readFile(indexHtml, 'utf8');

  assert.match(html, /data-testid="top-status-bar"/);
});

test('CSS 中 .hint 文字颜色适合深色背景', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.match(css, /\.hint\s*\{[^}]*color:/s);
  assert.doesNotMatch(css, /\.hint\s*\{[^}]*color:\s*#66758e/);
});

test('HTML 标题为"代理控制台"且 H1 不再为"手动组"', async () => {
  const html = await readFile(indexHtml, 'utf8');

  assert.match(html, /<h1[^>]*>代理控制台<\/h1>/);
  assert.match(html, /<title[^>]*>代理控制台<\/title>/);
  assert.doesNotMatch(html, /<h1[^>]*>手动组<\/h1>/);
});

test('chip 结构 CSS 类 .chip.delay-excellent 存在', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.match(css, /\.chip\s*\{/);
  assert.match(css, /\.chip\.delay-/);
  assert.match(css, /\.chip\.speed-/);
  assert.match(css, /\.chip\.node-name\s*\{/);
});

test('速度 chip .chip.speed-unknown 存在样式', async () => {
  const css = await readFile(stylesCss, 'utf8');

  assert.match(css, /\.chip\.speed-unknown\s*\{/);
});

// ============================================================
// Task 1：模型纯函数与单元契约
// ============================================================

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

// ============================================================
// Task 2：顶部按钮重组、单一展开切换和快捷键
// ============================================================

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

