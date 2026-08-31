// com.libra.aitoken — 纯原生 DOM 页面逻辑(无外部依赖)
(() => {
  'use strict';

  const PLUGIN_ID = 'com.libra.aitoken';

  const VENDOR_META = {
    ClaudeCode: { icon: 'claude.svg', label: 'Claude Code' },
    OpenCode: { icon: 'opencode-logo-light.svg', label: 'OpenCode' },
    MimoCode: { icon: 'xiaomimimo.svg', label: 'MimoCode' },
    CodeX: { icon: 'openai.svg', label: 'CodeX' },
    Gemini: { icon: 'gemini.svg', label: 'Gemini' },
    OpenClaw: { icon: 'claw.svg', label: 'OpenClaw' },
    HermesAgent: { icon: 'hermes.png', label: 'Hermes Agent' },
    CCSwitch: { icon: 'ccs.ico', label: 'CC Switch' },
    DeepSeekHarness: { icon: 'deepseek.svg', label: 'DeepSeek Harness' },
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    scanBtn: $('scanBtn'),
    noAgentTip: $('noAgentTip'),
    runningBar: $('runningBar'),
    errorCard: $('errorCard'),
    errorText: $('errorText'),
    resultCard: $('resultCard'),
    countChip: $('countChip'),
    groups: $('groups'),
    emptyText: $('emptyText'),
  };

  const host = LibraPluginHost.usePluginHost();

  let running = false;
  let result = null;
  let lastAutoAgentId = null;
  let rerunQueued = false;

  function assetUrl(file) {
    const origin = LibraPluginHost.getApiOrigin();
    const pluginId = encodeURIComponent(LibraPluginHost.pluginId);
    return `${origin}/api/plugins/${pluginId}/assets/${encodeURIComponent(file)}`;
  }

  // dispatchTask 的 result 可能是对象,也可能是 JSON 字符串(兼容两种形态)
  function parseResult(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch {
        // 非 JSON 字符串,不是有效结果
      }
    }
    return null;
  }

  function currentAgent() {
    return host.selectedAgent || null;
  }

  function updateAgentUI() {
    const agent = currentAgent();
    els.noAgentTip.hidden = Boolean(agent);
    els.scanBtn.disabled = !agent || running;
    if (agent) {
      els.scanBtn.title = `扫描 ${agent.hostname || agent.ipAddress || agent.id || ''}`;
    } else {
      els.scanBtn.title = '';
    }
  }

  function setRunning(value) {
    running = value;
    els.runningBar.hidden = !value;
    els.scanBtn.classList.toggle('is-pending', value);
    updateAgentUI();
  }

  function groupItems(items) {
    const map = new Map();
    for (const it of items) {
      const vendor = it.vendor || 'Unknown';
      if (!map.has(vendor)) map.set(vendor, []);
      map.get(vendor).push(it);
    }
    return Array.from(map.entries()).map(([vendor, list]) => ({ vendor, items: list }));
  }

  function buildItem(it) {
    const item = document.createElement('div');
    item.className = 'item';

    const head = document.createElement('div');
    head.className = 'item-head';

    const keyName = document.createElement('span');
    keyName.className = 'key-name';
    keyName.textContent = it.keyName || '';

    const sourceChip = document.createElement('span');
    const isConfig = it.source === 'config-file';
    sourceChip.className = isConfig ? 'chip chip-accent' : 'chip chip-warning';
    sourceChip.textContent = isConfig ? 'Config' : 'Env';

    head.append(keyName, sourceChip);

    const keyValue = document.createElement('div');
    keyValue.className = 'key-value';
    keyValue.textContent = it.keyValue || '';

    const path = document.createElement('div');
    path.className = 'item-path';
    path.textContent = it.path || '';
    path.title = it.path || '';

    item.append(head, keyValue, path);
    return item;
  }

  function buildGroup({ vendor, items }) {
    const meta = VENDOR_META[vendor] || { icon: '', label: vendor };

    const details = document.createElement('details');
    details.className = 'group';

    const summary = document.createElement('summary');
    summary.className = 'group-summary';

    if (meta.icon) {
      const img = document.createElement('img');
      img.className = 'vendor-icon';
      img.src = assetUrl(meta.icon);
      img.alt = meta.label;
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        img.style.display = 'none';
      });
      summary.appendChild(img);
    }

    const label = document.createElement('span');
    label.className = 'vendor-label';
    label.textContent = meta.label;
    summary.appendChild(label);

    const countChip = document.createElement('span');
    countChip.className = 'chip chip-secondary';
    countChip.textContent = String(items.length);
    summary.appendChild(countChip);

    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.setAttribute('aria-hidden', 'true');
    summary.appendChild(chevron);

    const panel = document.createElement('div');
    panel.className = 'group-panel';

    const list = document.createElement('div');
    list.className = 'item-list';
    for (const it of items) list.appendChild(buildItem(it));

    panel.appendChild(list);
    details.append(summary, panel);

    // 与 HeroUI Accordion 默认行为一致:同一时间只展开一组
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      const all = els.groups.querySelectorAll('details.group');
      for (const other of all) {
        if (other !== details) other.open = false;
      }
    });

    return details;
  }

  function renderResult(parsed) {
    result = parsed;
    els.resultCard.hidden = false;
    els.countChip.textContent = `${parsed.total} 条`;

    const groups = groupItems(parsed.items || []);
    els.groups.textContent = '';

    if (groups.length === 0) {
      els.emptyText.hidden = false;
      els.groups.hidden = true;
      return;
    }

    els.emptyText.hidden = true;
    els.groups.hidden = false;
    for (const group of groups) els.groups.appendChild(buildGroup(group));
  }

  async function run() {
    const agent = currentAgent();
    if (!agent) return;
    if (running) {
      rerunQueued = true;
      return;
    }

    setRunning(true);
    els.errorCard.hidden = true;
    els.errorText.textContent = '';

    try {
      const res = await host.dispatchTask(PLUGIN_ID, 'collect', {});
      const raw = res && typeof res === 'object' && 'result' in res ? res.result : res;
      const parsed = parseResult(raw);
      if (!parsed || !Array.isArray(parsed.items)) {
        throw new Error('扫描结果格式异常（未返回 items 列表）');
      }
      renderResult(parsed);
    } catch (e) {
      els.errorText.textContent = e instanceof Error && e.message ? e.message : '扫描失败';
      els.errorCard.hidden = false;
    } finally {
      setRunning(false);
      if (rerunQueued) {
        rerunQueued = false;
        setTimeout(() => {
          if (currentAgent()) run();
        }, 0);
      }
    }
  }

  // 与 TSX 版的 useEffect 等价:选中设备变化(且非上次自动扫描过的设备)时自动扫描。
  // 桥每 2s 同步一次 selectedAgent,这里用 1s 轮询感知变化,初次加载也能等到桥同步完成。
  function checkAutoRun() {
    const agent = currentAgent();
    const agentId = agent ? agent.id : null;
    if (agentId && agentId !== lastAutoAgentId) {
      lastAutoAgentId = agentId;
      run();
    }
    updateAgentUI();
  }

  els.scanBtn.addEventListener('click', run);
  updateAgentUI();
  checkAutoRun();
  setInterval(checkAutoRun, 1000);
})();
