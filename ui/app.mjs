import { createSpeedTest } from './speedtest.mjs';

const selectorName = '代理选择标签';

export const readonlyAutomaticNodeMessage = '自动组不可手动选择，请去对应手动组选择';

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

export function displayGroupName(groupName) {
  const match = groupName.match(/^按机场\/(.+)\/手动组$/);
  if (match) return match[1];
  const regionMatch = groupName.match(/^按地区\/(.+)\/手动组$/);
  if (regionMatch) return regionMatch[1];
  const fullMatch = groupName.match(/^(.+)\/手动组$/);
  if (fullMatch) {
    if (fullMatch[1] === '全部聚合') return '全部聚合';
    const parts = fullMatch[1].split('/');
    return parts[parts.length - 1] || fullMatch[1];
  }
  return groupName;
}

const airportOrder = ['猫熊机场', '穿墙猫机场', '穿山甲机场', '瞬云机场'];
const regionOrder = [
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
const availableDelayStatuses = new Set(['excellent', 'good', 'warning', 'poor']);

function sortNames(names) {
  const order = ['全部聚合', '按机场', '按地区'];
  return names.sort((a, b) => {
    const left = order.indexOf(displaySectionTitle(a));
    const right = order.indexOf(displaySectionTitle(b));
    const leftRank = left === -1 ? order.length : left;
    const rightRank = right === -1 ? order.length : right;
    return leftRank - rightRank || a.localeCompare(b, 'zh-Hans-CN');
  });
}

function displaySectionTitle(groupName) {
  if (groupName.startsWith('全部聚合/')) return '全部聚合';
  if (groupName.startsWith('按机场/')) return '按机场';
  if (groupName.startsWith('按地区/')) return '按地区';
  return groupName.split('/')[0] || groupName;
}

function orderIndex(values, value) {
  const index = values.indexOf(value);
  return index === -1 ? values.length : index;
}

function parseScopedGroupName(groupName, suffix) {
  if (groupName === `全部聚合/${suffix}`) return { sectionTitle: '全部聚合', scopeName: '全部聚合', rank: 0 };
  const airportMatch = groupName.match(new RegExp(`^按机场/(.+)/${suffix}$`));
  if (airportMatch) return { sectionTitle: '按机场', scopeName: airportMatch[1], rank: 1 };
  const regionMatch = groupName.match(new RegExp(`^按地区/(.+)/${suffix}$`));
  if (regionMatch) return { sectionTitle: '按地区', scopeName: regionMatch[1], rank: 2 };
  return { sectionTitle: '未分类', scopeName: displaySectionTitle(groupName), rank: 3 };
}

function compareScope(left, right) {
  if (left.rank !== right.rank) return left.rank - right.rank;
  if (left.sectionTitle === '按机场') {
    return orderIndex(airportOrder, left.scopeName) - orderIndex(airportOrder, right.scopeName)
      || left.scopeName.localeCompare(right.scopeName, 'zh-Hans-CN');
  }
  if (left.sectionTitle === '按地区') {
    return orderIndex(regionOrder, left.scopeName) - orderIndex(regionOrder, right.scopeName)
      || left.scopeName.localeCompare(right.scopeName, 'zh-Hans-CN');
  }
  return left.name.localeCompare(right.name, 'zh-Hans-CN');
}

export function statusFromDelay(delayMs, failed = false) {
  if (failed) return 'timeout';
  if (typeof delayMs !== 'number' || Number.isNaN(delayMs)) return 'timeout';
  if (delayMs < 500) return 'excellent';
  if (delayMs < 1000) return 'good';
  if (delayMs < 2000) return 'warning';
  return 'poor';
}

function normalizeDelayEntry(entry) {
  if (!entry) return { status: 'timeout' };
  const status = entry.status || statusFromDelay(entry.delayMs, entry.failed || entry.error);
  if (status === 'timeout' || status === 'error') return { status: 'timeout' };
  if (typeof entry.delayMs === 'number') return { delayMs: entry.delayMs, status };
  return { status };
}

function delayFromHistory(history) {
  const latest = history?.at(-1);
  if (!latest) return { status: 'timeout' };
  const delayMs = typeof latest.delayMs === 'number' ? latest.delayMs : latest.delay;
  if (delayMs === 0 || latest.failed || latest.error) return { status: 'timeout' };
  if (typeof delayMs === 'number') return { delayMs, status: statusFromDelay(delayMs) };
  return { status: 'timeout' };
}

function buildDelayCache(proxies, optionDelayCache) {
  const delayCache = new Map();
  for (const proxy of Object.values(proxies)) {
    const delay = delayFromHistory(proxy?.history);
    if (proxy?.name && delay) delayCache.set(proxy.name, delay);
  }
  if (optionDelayCache) {
    for (const [name, delay] of optionDelayCache) delayCache.set(name, delay);
  }
  return delayCache;
}

function sortNodesByDelay(nodeNames, delayCache) {
  return nodeNames
    .map((name, index) => {
      const delay = normalizeDelayEntry(delayCache.get(name));
      const hasDelay = availableDelayStatuses.has(delay.status) && typeof delay.delayMs === 'number';
      const rank = hasDelay ? 0 : delay.status === 'timeout' ? 1 : 2;
      return { name, index, delay, rank };
    })
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;
      if (left.rank === 0 && left.delay.delayMs !== right.delay.delayMs) return left.delay.delayMs - right.delay.delayMs;
      return left.index - right.index;
    })
    .map(({ name, delay }) => ({
      name,
      delayMs: delay.delayMs,
      delayStatus: delay.status,
    }));
}

function buildManualGroup(proxy, parsed, delayCache, currentManualGroup) {
  const nodes = sortNodesByDelay(proxy.all || [], delayCache);
  const currentNodeDelay = normalizeDelayEntry(delayCache.get(proxy.now));
  const activeNodeName = parsed.proxy.name === currentManualGroup ? proxy.now || '' : '';
  return {
    ...proxy,
    scopeName: parsed.scopeName,
    sectionTitle: parsed.sectionTitle,
    activeNodeName,
    nodes,
    availableCount: nodes.filter((node) => availableDelayStatuses.has(node.delayStatus)).length,
    totalCount: nodes.length,
    currentNodeDelay,
    currentNodeSpeed: '--',
    availabilityColor: currentNodeDelay.status,
  };
}

function buildManualSections(groups, delayCache, currentManualGroup) {
  const parsedGroups = groups
    .filter((proxy) => proxy.type === 'Selector' && proxy.name.endsWith('/手动组'))
    .map((proxy) => ({ ...parseScopedGroupName(proxy.name, '手动组'), proxy, name: proxy.name }))
    .sort(compareScope);
  const sections = ['全部聚合', '按机场', '按地区', '未分类'].map((title) => ({ title, groups: [] }));
  for (const parsed of parsedGroups) {
    sections.find((section) => section.title === parsed.sectionTitle).groups.push(buildManualGroup(parsed.proxy, parsed, delayCache, currentManualGroup));
  }
  return sections;
}

function buildAutomaticSelectorOptions(groups) {
  const automaticGroups = groups.filter((proxy) => proxy.name.endsWith('/自动组') || proxy.type === 'URLTest');
  return automaticGroups
    .map((proxy) => ({ ...parseScopedGroupName(proxy.name, '自动组'), name: proxy.name }))
    .sort(compareScope)
    .map(({ name }) => ({ name }));
}

export function buildProxyUiModel(proxies, options = {}) {
  const delayCache = buildDelayCache(proxies, options.delayCache);
  const selector = proxies[selectorName] || { now: '', all: [] };
  const groups = Object.values(proxies).filter((proxy) => proxy && proxy.name);
  const automaticGroups = sortNames(groups.filter((proxy) => proxy.name.endsWith('/自动组')).map((proxy) => proxy.name));
  const manualGroups = sortNames(
    groups
      .filter((proxy) => proxy.type === 'Selector' && proxy.name.endsWith('/手动组'))
      .map((proxy) => proxy.name),
  );
  const selectedProxy = proxies[selector.now];
  const selectedAutomaticGroup = selector.now.endsWith('/自动组') ? selector.now : '';
  const currentManualGroup = selector.now.endsWith('/手动组') ? selector.now : '';
  const routeTarget = selectedProxy?.now || '未选择';

  const sectionMap = new Map();
  for (const groupName of [...automaticGroups, ...manualGroups]) {
    const title = displaySectionTitle(groupName);
    if (!sectionMap.has(title)) sectionMap.set(title, []);
  }
  for (const groupName of manualGroups) {
    const title = displaySectionTitle(groupName);
    sectionMap.get(title).push(proxies[groupName]);
  }
  for (const groupName of automaticGroups) {
    const title = displaySectionTitle(groupName);
    sectionMap.get(title).unshift(proxies[groupName]);
  }

  const automaticSelectorOptions = buildAutomaticSelectorOptions(groups);

  return {
    automaticGroups,
    automaticSections: automaticSelectorOptions.map((option) => ({
      ...option,
      readonlyMessage: readonlyAutomaticNodeMessage,
    })),
    automaticSelectorOptions,
    currentManualGroup,
    manualSections: buildManualSections(groups, delayCache, currentManualGroup),
    routeLabel: `${selector.now || '未选择'} → ${routeTarget}`,
    sections: [...sectionMap].map(([title, items]) => ({ title, items })),
    selectedAutomaticGroup,
    selectorNow: selector.now || '',
  };
}

export async function selectAutomaticGroup(api, automaticGroup) {
  await api.putProxy(selectorName, automaticGroup);
}

export async function selectAutomaticNode() {
  return readonlyAutomaticNodeMessage;
}

export async function selectManualNode(api, manualGroup, nodeName) {
  await api.putProxy(manualGroup, nodeName);
  await api.putProxy(selectorName, manualGroup);
}

let _lastActiveProxy = '';
let _proxyEnabled = true;

export function getProxyEnabled() { return _proxyEnabled; }

export async function toggleProxy(api) {
  const proxies = await api.getProxies();
  const selector = proxies[selectorName];
  if (!selector) return { ok: false, error: '无法获取代理状态' };

  const currentNow = selector.now || '';

  if (currentNow === 'direct') {
    const target = _lastActiveProxy || '全部聚合/自动组';
    await api.putProxy(selectorName, target);
    _proxyEnabled = true;
    _lastActiveProxy = '';
    return { ok: true, proxyEnabled: true, currentProxy: target };
  }

  _lastActiveProxy = currentNow;
  await api.putProxy(selectorName, 'direct');
  _proxyEnabled = false;
  return { ok: true, proxyEnabled: false, currentProxy: 'direct' };
}

function createControlApi(baseUrl = '') {
  return {
    async restartSingBox() {
      const response = await fetch(`${baseUrl}/ctl/restart-sing-box`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      const body = await response.json();
      return { ok: response.ok && body.ok, message: body.message || body.error || '' };
    },
    async getStatus() {
      const response = await fetch(`${baseUrl}/ctl/status`);
      const body = await response.json();
      return body;
    },
  };
}

export function createApi(baseUrl = '/api') {
  return {
    async getProxies() {
      const response = await fetch(`${baseUrl}/proxies`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`GET /proxies failed: ${response.status}`);
      return (await response.json()).proxies;
    },
    async putProxy(group, name) {
      const response = await fetch(`${baseUrl}/proxies/${encodeURIComponent(group)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error(`PUT /proxies/${group} failed: ${response.status}`);
    },
    async getDelay(nodeName, timeout = 5000, testUrl = 'https://www.gstatic.com/generate_204') {
      const url = `${baseUrl}/proxies/${encodeURIComponent(nodeName)}/delay?timeout=${timeout}&url=${encodeURIComponent(testUrl)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(timeout + 2000) });
      if (!response.ok) throw new Error(`GET delay for ${nodeName} failed: ${response.status}`);
      return await response.json();
    },
  };
}

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

function syncTimeLabel(timestamp) {
  if (!timestamp) return '最后同步：--';
  return `最后同步：${new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })}`;
}

function captureExpandedGroups() {
  return new Set([...document.querySelectorAll('details.manual-group[open]')].map((element) => element.dataset.groupName));
}

function restoreExpandedGroups(expandedGroups) {
  for (const details of document.querySelectorAll('details.manual-group')) {
    if (expandedGroups.has(details.dataset.groupName)) details.open = true;
  }
}

export function updateProxyToggleUI(enabled) {
  const btn = document.getElementById('proxy-toggle-btn');
  const label = document.getElementById('proxy-state-label');
  if (btn) {
    btn.textContent = enabled ? '关闭代理' : '启动代理';
    btn.className = enabled ? 'proxy-on' : 'proxy-off';
  }
  if (label) {
    label.textContent = enabled ? '代理状态：已开启' : '代理状态：已关闭';
  }
}

function updateSyncStatus(state) {
  const statusText = state.syncStatus === 'error'
    ? `同步失败：${state.syncError}`
    : state.syncStatus === 'syncing'
      ? '同步中'
      : state.lastSyncedAt
        ? '已同步'
        : '等待同步';
  setText('sync-status', statusText);
  setText('last-sync-time', syncTimeLabel(state.lastSyncedAt));
}

export function createInteractionTracker() {
  let _interacting = false;
  let _needsRefresh = false;
  let _generation = 0;

  return {
    startInteraction() {
      _interacting = true;
      _generation++;
    },
    endInteraction() {
      _interacting = false;
    },
    isInteracting() {
      return _interacting;
    },
    requestRefresh() {
      _needsRefresh = true;
    },
    consumeRefresh() {
      if (_needsRefresh) {
        _needsRefresh = false;
        return true;
      }
      return false;
    },
    currentGeneration() {
      return _generation;
    },
  };
}

export function createRefreshScheduler({ state, syncProxies, intervalMs = 3000, now = () => Date.now(), interactionTracker }) {
  let elapsedMs = 0;
  let syncing = false;

  async function runSync(manual = false) {
    if (syncing) return;
    syncing = true;
    state.syncStatus = 'syncing';
    state.syncError = '';
    try {
      await syncProxies({ manual });
      state.syncStatus = 'synced';
      state.lastSyncedAt = now();
    } catch (error) {
      state.syncStatus = 'error';
      state.syncError = error?.message || String(error);
    } finally {
      syncing = false;
    }
  }

  return {
    async tick(deltaMs) {
      elapsedMs += deltaMs;
      if (elapsedMs < intervalMs) return;
      elapsedMs = 0;
      if (interactionTracker) {
        if (interactionTracker.isInteracting()) {
          interactionTracker.requestRefresh();
          return;
        }
        interactionTracker.consumeRefresh();
      }
      await runSync(false);
    },
    syncNow() {
      elapsedMs = 0;
      return runSync(true);
    },
  };
}

function delayLabel(node) {
  if (typeof node.delayMs === 'number') return `延时：${node.delayMs}ms`;
  if (node.delayStatus === 'timeout') return '延时：timeout';
  return '延时：--';
}

function speedLabel(node) {
  if (typeof node.delayMs === 'number') return node.delayStatus;
  return 'unknown';
}

function groupCardSummary(group) {
  const parts = [];
  if (typeof group.currentNodeDelay?.delayMs === 'number') {
    parts.push(`延时：${group.currentNodeDelay.delayMs}ms`);
  } else if (group.currentNodeDelay?.status === 'timeout') {
    parts.push('延时：timeout');
  } else {
    parts.push('延时：--');
  }
  const speed = group.currentNodeSpeed || '--';
  parts.push(`速度：${typeof speed === 'number' ? speed : speed}`);
  return parts.join('，');
}

export function renderProxyGroups(container, model, docOverride) {
  const doc = docOverride || document;
  const sections = container;

  for (const section of model.manualSections) {
    const sectionEl = doc.createElement('section');
    sectionEl.className = 'card';
    const heading = doc.createElement('h2');
    heading.textContent = section.title;
    sectionEl.append(heading);

    for (const group of section.groups) {
      const details = doc.createElement('details');
      details.className = 'manual-group';
      details.dataset.groupName = group.name;
      details.setAttribute('data-testid', 'manual-group-card');
      const summary = doc.createElement('summary');
      const summaryRow = doc.createElement('span');
      summaryRow.className = 'summary-row';

      const displayName = displayGroupName(group.name);
      const nameSpan = doc.createElement('span');
      nameSpan.className = 'summary-group-name';
      nameSpan.textContent = displayName;

      const statsSpan = doc.createElement('span');
      statsSpan.className = 'summary-stats';
      statsSpan.textContent = `可用节点数：${group.availableCount}/${group.totalCount}`;

      const nowSpan = doc.createElement('span');
      nowSpan.className = 'summary-now';
      nowSpan.textContent = `当前：${group.now || '未选择'}`;

      const delaySpan = doc.createElement('span');
      delaySpan.className = 'summary-delay';
      delaySpan.textContent = groupCardSummary(group);

      summaryRow.append(nameSpan, statsSpan, nowSpan, delaySpan);
      summary.append(summaryRow);
      details.append(summary);

      const nodesEl = doc.createElement('div');
      nodesEl.className = 'nodes';
      for (const node of group.nodes || []) {
        const card = buildNodeCard(doc, node, node.name === group.now);
        nodesEl.append(card);
      }
      details.append(nodesEl);
      sectionEl.append(details);
    }
    sections.append(sectionEl);
  }
}

function buildNodeCard(doc, node, active) {
  const card = doc.createElement('button');
  card.type = 'button';
  card.className = active
    ? `node-card node-card-active delay-${node.delayStatus}`
    : `node-card delay-${node.delayStatus}`;
  card.dataset.nodeName = node.name;
  card.setAttribute('data-delay-status', node.delayStatus);
  card.setAttribute('data-testid', 'node-row');

  const delayChip = doc.createElement('span');
  delayChip.className = `chip delay-${node.delayStatus}`;
  delayChip.textContent = delayLabel(node);

  const speedChip = doc.createElement('span');
  speedChip.className = `chip speed-${speedLabel(node)}`;
  speedChip.textContent = '--';

  const nameChip = doc.createElement('span');
  nameChip.className = 'chip node-name';
  nameChip.textContent = node.name;

  card.append(delayChip, speedChip, nameChip);
  return card;
}

function nodeButton(groupName, node, active, onClick) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = active
    ? `node-card node-card-active delay-${node.delayStatus}`
    : `node-card delay-${node.delayStatus}`;
  card.dataset.nodeName = node.name;
  card.setAttribute('data-delay-status', node.delayStatus);
  card.dataset.testid = `manual-node-${groupName}-${node.name}`;
  card.addEventListener('click', onClick);

  const delayChip = document.createElement('span');
  delayChip.className = `chip delay-${node.delayStatus}`;
  delayChip.textContent = delayLabel(node);

  const speedChip = document.createElement('span');
  speedChip.className = `chip speed-${speedLabel(node)}`;
  speedChip.textContent = '--';

  const nameChip = document.createElement('span');
  nameChip.className = 'chip node-name';
  nameChip.textContent = node.name;

  card.append(delayChip, speedChip, nameChip);
  return card;
}

function automaticNodeButton(groupName, nodeName, onClick) {
  const card = document.createElement('div');
  card.className = 'readonly-node-card';
  card.dataset.testid = `automatic-node-${groupName}-${nodeName}`;
  card.addEventListener('click', onClick);

  const nameChip = document.createElement('span');
  nameChip.className = 'chip node-name';
  nameChip.textContent = nodeName;

  card.append(nameChip);
  return card;
}

async function render(api, state = {}, interactionTracker) {
  const generation = interactionTracker?.currentGeneration();
  const status = document.getElementById('status');
  status.textContent = '正在刷新...';
  updateSyncStatus({ ...state, syncStatus: 'syncing' });
  const expandedGroups = typeof document !== 'undefined' ? captureExpandedGroups() : state.expandedGroups || new Set();
  const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
  const proxies = await api.getProxies();

  if (interactionTracker && interactionTracker.currentGeneration() !== generation) {
    interactionTracker.requestRefresh();
    status.textContent = '已刷新';
    return;
  }

  state.proxies = proxies;
  const model = buildProxyUiModel(proxies, { delayCache: state.delayCache });
  state.currentModel = model;

  setText('route-label', model.routeLabel);
  setText('manual-status', model.currentManualGroup ? `当前为手动组：${model.currentManualGroup}` : '当前为自动组');

  updateProxyToggleUI(model.selectorNow !== 'direct');

  const select = document.getElementById('auto-group-select');
  select.replaceChildren();
  if (!model.selectedAutomaticGroup) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '当前不是自动组';
    select.append(placeholder);
  }
  for (const selectorOption of model.automaticSelectorOptions) {
    const option = document.createElement('option');
    option.value = selectorOption.name;
    option.textContent = selectorOption.name;
    option.selected = selectorOption.name === model.selectedAutomaticGroup;
    select.append(option);
  }

  const sections = document.getElementById('sections');
  sections.replaceChildren();
  for (const section of model.manualSections) {
    const sectionEl = document.createElement('section');
    sectionEl.className = 'card';
    const heading = document.createElement('h2');
    heading.textContent = section.title;
    sectionEl.append(heading);

    for (const group of section.groups) {
      const details = document.createElement('details');
      details.className = 'manual-group';
      details.dataset.groupName = group.name;
      details.dataset.testid = `manual-group-${group.name}`;
      if (expandedGroups.has(group.name)) details.open = true;

      const summary = document.createElement('summary');
      const summaryRow = document.createElement('span');
      summaryRow.className = 'summary-row';

      const displayName = displayGroupName(group.name);
      const nameSpan = document.createElement('span');
      nameSpan.className = 'summary-group-name';
      nameSpan.textContent = displayName;

      const statsSpan = document.createElement('span');
      statsSpan.className = 'summary-stats';
      statsSpan.textContent = `可用节点数：${group.availableCount}/${group.totalCount}`;

      const nowSpan = document.createElement('span');
      nowSpan.className = 'summary-now';
      nowSpan.textContent = `当前：${group.now || '未选择'}`;

      const delaySpan = document.createElement('span');
      delaySpan.className = 'summary-delay';
      delaySpan.textContent = groupCardSummary(group);

      const groupSpeedBtn = document.createElement('button');
      groupSpeedBtn.type = 'button';
      groupSpeedBtn.className = 'group-speedtest-btn';
      groupSpeedBtn.textContent = '测速';
      groupSpeedBtn.setAttribute('data-testid', `group-speedtest-${group.name}`);
      groupSpeedBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const nodeNames = (group.nodes || []).map((n) => n.name);
        if (nodeNames.length === 0) return;
        interactionTracker.startInteraction();
        try {
          setText('status', `测速中... 0/${nodeNames.length} (0%)`);
          const speedtest = createSpeedTest(api);
          const newResults = await speedtest.testNodes(nodeNames, ({ completed, total, percentage }) => {
            setText('status', `测速中... ${completed}/${total} (${percentage}%)`);
          });
          for (const [name, delay] of newResults) {
            state.delayCache.set(name, delay);
          }
          await render(api, state, interactionTracker);
          setText('status', `测速完成：${nodeNames.length} 个节点`);
        } catch (error) {
          setText('status', `测速失败：${error.message}`);
        } finally {
          interactionTracker.endInteraction();
        }
      });

      summaryRow.append(nameSpan, statsSpan, nowSpan, delaySpan, groupSpeedBtn);
      summary.append(summaryRow);
      details.append(summary);

      const nodes = document.createElement('div');
      nodes.className = 'nodes';
      for (const node of group.nodes || []) {
        nodes.append(
          nodeButton(group.name, node, node.name === group.now, async () => {
            await selectManualNode(api, group.name, node.name);
            await render(api, state, interactionTracker);
          }),
        );
      }
      details.append(nodes);
      sectionEl.append(details);
    }
    sections.append(sectionEl);
  }
  restoreExpandedGroups(expandedGroups);
  state.expandedGroups = expandedGroups;
  if (typeof window !== 'undefined' && window.scrollY !== scrollY) window.scrollTo(window.scrollX, scrollY);
  status.textContent = '已刷新';
  state.syncStatus = 'synced';
  state.syncError = '';
  state.lastSyncedAt = Date.now();
  updateSyncStatus(state);
}

export function startProxyUi(api = createApi()) {
  const state = { expandedGroups: new Set(), syncStatus: 'idle', delayCache: new Map() };
  const interactionTracker = createInteractionTracker();
  const scheduler = createRefreshScheduler({
    state,
    syncProxies: async () => render(api, state, interactionTracker),
    interactionTracker,
  });

  let cooldownTimer = null;
  const onUserInteraction = () => {
    interactionTracker.startInteraction();
    if (cooldownTimer) clearTimeout(cooldownTimer);
    cooldownTimer = setTimeout(() => {
      interactionTracker.endInteraction();
      cooldownTimer = null;
      if (interactionTracker.consumeRefresh()) {
        scheduler.syncNow().then(() => updateSyncStatus(state));
      }
    }, 5000);
  };

  document.addEventListener('mousedown', onUserInteraction, { passive: true });
  document.addEventListener('touchstart', onUserInteraction, { passive: true });
  document.addEventListener('keydown', onUserInteraction, { passive: true });

  const select = document.getElementById('auto-group-select');
  select.addEventListener('change', async () => {
    if (!select.value) return;
    await selectAutomaticGroup(api, select.value);
    await scheduler.syncNow();
  });
  document.getElementById('refresh').addEventListener('click', () => scheduler.syncNow().then(() => updateSyncStatus(state)));

  document.getElementById('expand-all-btn').addEventListener('click', () => {
    for (const details of document.querySelectorAll('details.manual-group')) {
      details.open = true;
      state.expandedGroups.add(details.dataset.groupName);
    }
  });
  document.getElementById('collapse-all-btn').addEventListener('click', () => {
    for (const details of document.querySelectorAll('details.manual-group')) {
      details.open = false;
    }
    state.expandedGroups.clear();
  });

  document.getElementById('test-all-btn').addEventListener('click', async () => {
    const allNodes = [];
    const seen = new Set();
    for (const section of (state.currentModel?.manualSections || [])) {
      for (const group of (section.groups || [])) {
        for (const node of (group.nodes || [])) {
          if (!seen.has(node.name)) {
            seen.add(node.name);
            allNodes.push(node.name);
          }
        }
      }
    }
    if (allNodes.length === 0) {
      setText('status', '没有可测速的节点');
      return;
    }

    interactionTracker.startInteraction();
    try {
      setText('status', `测速中... 0/${allNodes.length} (0%)`);
      const speedtest = createSpeedTest(api);
      const newResults = await speedtest.testNodes(allNodes, ({ completed, total, percentage }) => {
        setText('status', `测速中... ${completed}/${total} (${percentage}%)`);
      });
      for (const [name, delay] of newResults) {
        state.delayCache.set(name, delay);
      }
      await render(api, state, interactionTracker);
      setText('status', `全部测速完成：${allNodes.length} 个节点`);
    } catch (error) {
      setText('status', `测速失败：${error.message}`);
    } finally {
      interactionTracker.endInteraction();
    }
  });

  const proxyToggleBtn = document.getElementById('proxy-toggle-btn');
  proxyToggleBtn.addEventListener('click', async () => {
    proxyToggleBtn.disabled = true;
    try {
      const result = await toggleProxy(api);
      if (result.ok) {
        updateProxyToggleUI(result.proxyEnabled);
        await scheduler.syncNow();
      } else {
        setText('status', result.error || '操作失败');
      }
    } catch (error) {
      setText('status', error.message);
    } finally {
      proxyToggleBtn.disabled = false;
    }
  });

  const restartBtn = document.getElementById('restart-singbox-btn');
  restartBtn.addEventListener('click', async () => {
    if (!confirm('确认重启 sing-box 内核？')) return;
    restartBtn.disabled = true;
    setText('status', '正在重启 sing-box...');
    try {
      const ctlApi = createControlApi();
      const result = await ctlApi.restartSingBox();
      if (result.ok) {
        setText('status', 'sing-box 已重启');
      } else {
        setText('status', `重启失败: ${result.message}`);
      }
    } catch (error) {
      setText('status', `重启失败: ${error.message}`);
    } finally {
      restartBtn.disabled = false;
    }
  });

  document.getElementById('locate-current-btn').addEventListener('click', () => {
    const currentManual = state.currentModel?.currentManualGroup;
    if (!currentManual) {
      document.getElementById('status').textContent = '当前在自动组，无法定位';
      return;
    }
    const currentGroup = [...document.querySelectorAll('details.manual-group')].find(
      (details) => details.dataset.groupName === currentManual,
    );
    if (currentGroup) {
      currentGroup.open = true;
      currentGroup.scrollIntoView({ behavior: 'smooth', block: 'center' });
      state.expandedGroups.add(currentGroup.dataset.groupName);
    }
  });

  scheduler.syncNow().catch((error) => {
    state.syncStatus = 'error';
    state.syncError = error.message;
    document.getElementById('status').textContent = error.message;
    updateSyncStatus(state);
  });
  setInterval(() => {
    scheduler.tick(3000).then(() => updateSyncStatus(state));
  }, 3000);
  return scheduler;
}

if (typeof document !== 'undefined') {
  startProxyUi();
}
