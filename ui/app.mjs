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

function sectionIconName(title) {
  if (title === '全部聚合') return 'aggregate';
  if (title === '按机场') return 'airport';
  if (title === '按地区') return 'region';
  if (title === '手动代理选择区域') return 'manual';
  return 'manual';
}

function createSvgElement(doc, tagName) {
  return typeof doc.createElementNS === 'function'
    ? doc.createElementNS('http://www.w3.org/2000/svg', tagName)
    : doc.createElement(tagName);
}

function createSectionIcon(doc, type) {
  const svg = createSvgElement(doc, 'svg');
  svg.setAttribute('class', 'section-icon');
  if (typeof svg.className === 'string') svg.className = 'section-icon';
  else if (svg.className?.baseVal !== undefined) svg.className.baseVal = 'section-icon';
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const pathsByType = {
    aggregate: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
    airport: ['M2 16l20-8-20-8 6 8-6 8z', 'M8 8h7', 'M8 16h7'],
    region: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M3.6 9h16.8', 'M3.6 15h16.8', 'M12 3a14 14 0 0 1 0 18', 'M12 3a14 14 0 0 0 0 18'],
    manual: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M2 14h4', 'M10 8h4', 'M18 16h4'],
  };

  for (const d of pathsByType[type] || pathsByType.manual) {
    const path = createSvgElement(doc, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function appendSectionHeadingContent(doc, heading, title) {
  heading.append(createSectionIcon(doc, sectionIconName(title)));
  const text = doc.createElement('span');
  text.textContent = title;
  heading.append(text);
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
  const uniqueNodeNames = [];
  const seen = new Set();
  for (const name of nodeNames) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    uniqueNodeNames.push(name);
  }

  return uniqueNodeNames
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
  const activeNodeName = parsed.proxy.name === currentManualGroup ? proxy.now || '' : '';
  const currentNodeDelay = normalizeDelayEntry(delayCache.get(proxy.now));
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
    availabilityColor: currentNodeDelay?.status || 'timeout',
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

  return {
    automaticGroups,
    automaticSections: automaticSelectorOptions.map((option) => ({
      ...option,
      readonlyMessage: readonlyAutomaticNodeMessage,
    })),
    automaticSelectorOptions,
    currentManualGroup,
    manualSections: buildManualSections(groups, delayCache, currentManualGroup),
    mode,
    routeLabel: `${selector.now || '未选择'} → ${routeTarget}`,
    routeSegments,
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

export function createModeIcon(doc, modeType) {
  const svg = createSvgElement(doc, 'svg');
  svg.setAttribute('class', 'mode-icon');
  if (typeof svg.className === 'string') svg.className = 'mode-icon';
  else if (svg.className?.baseVal !== undefined) svg.className.baseVal = 'mode-icon';
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const pathsByType = {
    automatic: ['M5 12h14', 'M12 5l7 7-7 7', 'M5 5v14'],
    manual: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M2 14h4', 'M10 8h4', 'M18 16h4'],
    direct: ['M13 2L4 14h7l-1 8 9-12h-7l1-8z'],
    unknown: ['M9.09 9a3 3 0 1 1 5.82 1c-.64 1.43-2.91 1.65-2.91 4', 'M12 17h.01'],
  };

  for (const d of pathsByType[modeType] || pathsByType.unknown) {
    const path = createSvgElement(doc, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export function renderModeBanner(container, mode, docOverride) {
  if (!container) return;
  const doc = docOverride || document;
  container.className = `mode-banner mode-${mode.type}`;
  const label = doc.createElement('span');
  label.textContent = mode.label;
  container.replaceChildren(createModeIcon(doc, mode.type), label);
}

function renderRouteTrack(container, segments) {
  if (!container) return;
  container.replaceChildren();
  const chipData = [
    { testid: 'route-segment-selector', text: segments.selector },
    { testid: 'route-segment-provider', text: segments.provider },
    { testid: 'route-segment-node', text: segments.node || '未选择' },
  ];
  const chipClasses = ['route-chip route-chip-selector', 'route-chip route-chip-provider', 'route-chip route-chip-node'];
  for (let i = 0; i < chipData.length; i++) {
    const chip = document.createElement('span');
    chip.className = chipClasses[i];
    chip.setAttribute('data-testid', chipData[i].testid);
    chip.textContent = chipData[i].text;
    container.append(chip);
    if (i < chipData.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'route-arrow';
      arrow.textContent = '→';
      container.append(arrow);
    }
  }
}

function updateExpandToggleLabel() {
  const details = [...document.querySelectorAll('details.manual-group')];
  const openCount = details.filter((item) => item.open).length;
  const btn = document.getElementById('expand-toggle-btn');
  if (btn) btn.textContent = expandToggleLabel(openCount, details.length);
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

export function collectAllNodeNames(model) {
  const allNodes = [];
  const seen = new Set();
  for (const section of (model?.manualSections || [])) {
    for (const group of (section.groups || [])) {
      for (const node of (group.nodes || [])) {
        if (!node?.name || seen.has(node.name)) continue;
        seen.add(node.name);
        allNodes.push(node.name);
      }
    }
  }
  return allNodes;
}

export function allDelayStatusText(status, { completed = 0, total = 0, percentage = 0, error = '' } = {}) {
  if (status === 'progress') return `延时测试中... ${completed}/${total} (${percentage}%)`;
  if (status === 'done') return `全部延时测试完成：${total} 个节点`;
  if (status === 'empty') return '没有可延时测试的节点';
  if (status === 'error') return `延时测试失败：${error}`;
  return '';
}

function delayValueLabel(node) {
  if (typeof node.delayMs === 'number') return `${node.delayMs}ms`;
  return 'timeout';
}

function summaryDelayText(group) {
  if (typeof group.currentNodeDelay?.delayMs === 'number') return `${group.currentNodeDelay.delayMs}ms`;
  return 'timeout';
}

function buildGroupSummaryElements(doc, group) {
  const summaryRow = doc.createElement('span');
  summaryRow.className = 'summary-row';

  const leftSpan = doc.createElement('span');
  if (group.sectionTitle === '按地区') {
    leftSpan.className = 'region-badge';
    leftSpan.textContent = regionBadgeLabel(group.scopeName);
  } else if (group.sectionTitle === '按机场') {
    leftSpan.className = 'airport-label';
    leftSpan.textContent = group.scopeName;
  } else {
    leftSpan.className = 'aggregate-label';
    leftSpan.textContent = '全部节点';
  }

  const healthMetrics = doc.createElement('span');
  healthMetrics.className = 'health-metrics';

  const availabilityMetric = doc.createElement('span');
  availabilityMetric.className = 'availability-metric';
  const availStrong = doc.createElement('strong');
  availStrong.textContent = String(group.availableCount);
  availabilityMetric.append(availStrong, doc.createTextNode(` / ${group.totalCount}`));

  const delayMetric = doc.createElement('span');
  delayMetric.className = 'delay-metric';
  if (group.activeNodeName) delayMetric.textContent = summaryDelayText(group);

  healthMetrics.append(availabilityMetric);
  if (group.activeNodeName) healthMetrics.append(delayMetric);

  const summaryNodeSpan = doc.createElement('span');
  summaryNodeSpan.className = 'summary-node-name';
  summaryNodeSpan.textContent = group.activeNodeName || '';

  const summaryActions = doc.createElement('span');
  summaryActions.className = 'summary-actions';

  const groupSpeedBtn = doc.createElement('button');
  groupSpeedBtn.type = 'button';
  groupSpeedBtn.className = 'group-speedtest-btn';
  groupSpeedBtn.textContent = '延时测试';
  groupSpeedBtn.setAttribute('data-testid', `group-speedtest-${group.name}`);

  const locateBtn = doc.createElement('button');
  locateBtn.type = 'button';
  locateBtn.className = 'group-locate-btn';
  locateBtn.textContent = '定位📌';
  locateBtn.setAttribute('data-testid', `group-locate-${group.name}`);

  summaryActions.append(groupSpeedBtn, locateBtn);
  summaryRow.append(leftSpan, healthMetrics, summaryNodeSpan, summaryActions);

  return { summaryRow, groupSpeedBtn, locateBtn };
}

export function renderProxyGroups(container, model, docOverride) {
  const doc = docOverride || document;
  const sections = container;

  const manualHeading = doc.createElement('h2');
  manualHeading.className = 'section-heading';
  appendSectionHeadingContent(doc, manualHeading, '手动代理选择区域');
  sections.append(manualHeading);

  for (const section of model.manualSections) {
    const sectionEl = doc.createElement('section');
    sectionEl.className = 'card';
    const heading = doc.createElement('h2');
    heading.className = 'section-heading';
    appendSectionHeadingContent(doc, heading, section.title);
    sectionEl.append(heading);

    for (const group of section.groups) {
      const details = doc.createElement('details');
      details.className = 'manual-group';
      details.dataset.groupName = group.name;
      details.setAttribute('data-testid', 'manual-group-card');
      const summary = doc.createElement('summary');
      const { summaryRow } = buildGroupSummaryElements(doc, group);
      summary.append(summaryRow);
      details.append(summary);

      const nodesEl = doc.createElement('div');
      nodesEl.className = 'nodes';
      for (const node of group.nodes || []) {
        const active = node.name === (group.activeNodeName || '');
        const card = buildNodeCard(doc, node, active);
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

  const nameSpan = doc.createElement('span');
  nameSpan.className = 'node-name';
  nameSpan.textContent = node.name;

  const delayBadge = doc.createElement('span');
  delayBadge.className = `node-delay-badge delay-${node.delayStatus}`;
  delayBadge.textContent = delayValueLabel(node);

  card.append(nameSpan, delayBadge);
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

  const nameSpan = document.createElement('span');
  nameSpan.className = 'node-name';
  nameSpan.textContent = node.name;

  const delayBadge = document.createElement('span');
  delayBadge.className = `node-delay-badge delay-${node.delayStatus}`;
  delayBadge.textContent = delayValueLabel(node);

  card.append(nameSpan, delayBadge);
  return card;
}

function automaticNodeButton(groupName, nodeName, onClick) {
  const card = document.createElement('div');
  card.className = 'readonly-node-card';
  card.dataset.testid = `automatic-node-${groupName}-${nodeName}`;
  card.addEventListener('click', onClick);

  const nameChip = document.createElement('span');
  nameChip.className = 'node-name';
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

  updateProxyToggleUI(model.selectorNow !== 'direct');

  renderModeBanner(document.getElementById('mode-banner'), model.mode);
  renderRouteTrack(document.getElementById('route-track'), model.routeSegments);

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

  const manualHeading = document.createElement('h2');
  manualHeading.className = 'section-heading';
  appendSectionHeadingContent(document, manualHeading, '手动代理选择区域');
  sections.append(manualHeading);

  for (const section of model.manualSections) {
    const sectionEl = document.createElement('section');
    sectionEl.className = 'card';
    const heading = document.createElement('h2');
    heading.className = 'section-heading';
    appendSectionHeadingContent(document, heading, section.title);
    sectionEl.append(heading);

    for (const group of section.groups) {
      const details = document.createElement('details');
      details.className = 'manual-group';
      details.dataset.groupName = group.name;
      details.dataset.testid = `manual-group-${group.name}`;
      if (expandedGroups.has(group.name)) details.open = true;

      const summary = document.createElement('summary');
      const { summaryRow, groupSpeedBtn, locateBtn } = buildGroupSummaryElements(document, group);
      groupSpeedBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const nodeNames = (group.nodes || []).map((n) => n.name);
        if (nodeNames.length === 0) return;
        interactionTracker.startInteraction();
        try {
          setText('status', `延时测试中... 0/${nodeNames.length} (0%)`);
          const speedtest = createSpeedTest(api);
          const newResults = await speedtest.testNodes(nodeNames, ({ completed, total, percentage }) => {
            setText('status', `延时测试中... ${completed}/${total} (${percentage}%)`);
          });
          for (const [name, delay] of newResults) {
            state.delayCache.set(name, delay);
          }
          await render(api, state, interactionTracker);
          setText('status', `延时测试完成：${nodeNames.length} 个节点`);
        } catch (error) {
          setText('status', `延时测试失败：${error.message}`);
        } finally {
          interactionTracker.endInteraction();
        }
      });
      locateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const activeNode = group.activeNodeName;
        if (activeNode && activeNode.trim()) {
          const nodeCard = document.querySelector(`button.node-card[data-node-name="${activeNode}"]`);
          if (nodeCard) {
            details.open = true;
            nodeCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            nodeCard.focus({ preventScroll: true });
          }
        } else {
          setText('status', '当前分组未选中节点');
        }
      });
      summary.append(summaryRow);
      details.append(summary);

      const nodes = document.createElement('div');
      nodes.className = 'nodes';
      for (const node of group.nodes || []) {
        nodes.append(
          nodeButton(group.name, node, node.name === (group.activeNodeName || ''), async () => {
            await selectManualNode(api, group.name, node.name);
            await render(api, state, interactionTracker);
          }),
        );
      }
      details.append(nodes);
      details.addEventListener('toggle', () => updateExpandToggleLabel());
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
  if (typeof document !== 'undefined') updateExpandToggleLabel();
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

  function setAllGroupsOpen(open) {
    for (const details of document.querySelectorAll('details.manual-group')) {
      details.open = open;
      if (open) state.expandedGroups.add(details.dataset.groupName);
    }
    if (!open) state.expandedGroups.clear();
    updateExpandToggleLabel();
  }

  document.getElementById('expand-toggle-btn').addEventListener('click', () => {
    const details = [...document.querySelectorAll('details.manual-group')];
    const shouldExpand = details.some((item) => !item.open);
    setAllGroupsOpen(shouldExpand);
  });

  document.getElementById('test-all-btn').addEventListener('click', async () => {
    const allNodes = collectAllNodeNames(state.currentModel);
    if (allNodes.length === 0) {
      setText('status', allDelayStatusText('empty'));
      return;
    }

    interactionTracker.startInteraction();
    try {
      setText('status', allDelayStatusText('progress', { completed: 0, total: allNodes.length, percentage: 0 }));
      const speedtest = createSpeedTest(api);
      const newResults = await speedtest.testNodes(allNodes, ({ completed, total, percentage }) => {
        setText('status', allDelayStatusText('progress', { completed, total, percentage }));
      });
      for (const [name, delay] of newResults) {
        state.delayCache.set(name, delay);
      }
      await render(api, state, interactionTracker);
      setText('status', allDelayStatusText('done', { total: allNodes.length }));
    } catch (error) {
      setText('status', allDelayStatusText('error', { error: error.message }));
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

  document.addEventListener('keydown', (event) => {
    const action = expandShortcutAction(event);
    if (action === 'ignore') return;
    event.preventDefault();
    setAllGroupsOpen(action === 'expand');
    setText('status', action === 'expand' ? '已展开全部节点' : '已收起全部节点');
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
