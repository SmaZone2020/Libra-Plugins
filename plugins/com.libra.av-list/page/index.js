'use strict';

(function () {
  var PLUGIN_ID = 'com.libra.av-list';

  if (!window.LibraPluginHost || typeof window.LibraPluginHost.usePluginHost !== 'function') {
    var app = document.getElementById('app');
    if (app) {
      app.textContent = '插件桥 SDK 未加载（_bridge.js）。';
    }
    return;
  }

  // 宿主能力：选中设备 / 任务下发 / WS 推送
  var host = window.LibraPluginHost.usePluginHost();

  var runBtn = document.getElementById('run-btn');
  var spinner = runBtn.querySelector('.btn-spinner');
  var noAgentChip = document.getElementById('no-agent-chip');
  var statsEl = document.getElementById('stats');
  var errorCard = document.getElementById('error-card');
  var errorText = document.getElementById('error-text');
  var emptyCard = document.getElementById('empty-card');
  var emptyText = document.getElementById('empty-text');
  var resultCard = document.getElementById('result-card');
  var resultBody = document.getElementById('result-body');

  var running = false;
  var result = null;
  var err = null;

  /**
   * 兼容 dispatchTask 返回的 result 为对象或 JSON 字符串。
   * 同时兼容 { result: {...} } 包裹与直接返回检测结果两种结构。
   */
  function parseResult(raw) {
    var obj = raw;
    if (typeof obj === 'string') {
      try {
        obj = JSON.parse(obj);
      } catch (e) {
        return null;
      }
    }
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      var rec = obj;
      var inner = (rec.result && typeof rec.result === 'object' && !Array.isArray(rec.result))
        ? rec.result
        : rec;
      if (Array.isArray(inner.av)) return inner;
    }
    return null;
  }

  function productName(platform) {
    return platform === 'windows' ? 'Windows' : 'Linux/macOS';
  }

  function makeChip(text, className) {
    var chip = document.createElement('span');
    chip.className = 'chip ' + className;
    chip.textContent = text;
    return chip;
  }

  function renderStats() {
    if (!result) {
      statsEl.hidden = true;
      statsEl.replaceChildren();
      return;
    }

    var avCount = result.av.length;
    var procCount = result.av.reduce(function (n, item) {
      return n + item.processes.length;
    }, 0);

    statsEl.replaceChildren(
      makeChip('识别产品 ' + avCount + ' 个', 'chip-accent'),
      makeChip('匹配进程 ' + procCount + ' 个', 'chip-warning'),
      makeChip('进程总数 ' + result.total_processes, 'chip-secondary'),
      makeChip(productName(result.platform) + ' 平台', 'chip-default')
    );
    statsEl.hidden = false;
  }

  function renderError() {
    errorCard.hidden = !err;
    if (err) {
      errorText.textContent = err;
    } else {
      errorText.textContent = '';
    }
  }

  function renderEmpty() {
    if (result && result.av.length === 0) {
      emptyText.textContent = '未检测到已知杀毒软件进程（已枚举 ' + result.total_processes + ' 个进程）。';
      emptyCard.hidden = false;
    } else {
      emptyCard.hidden = true;
      emptyText.textContent = '';
    }
  }

  function renderResult() {
    if (!result || result.av.length === 0) {
      resultCard.hidden = true;
      resultBody.replaceChildren();
      return;
    }

    resultCard.hidden = false;
    resultBody.replaceChildren();

    result.av.forEach(function (item) {
      var tr = document.createElement('tr');

      var productCell = document.createElement('th');
      productCell.scope = 'row';
      productCell.className = 'cell-product';
      productCell.textContent = item.product;

      var countCell = document.createElement('td');
      countCell.textContent = String(item.processes.length);

      var tagsCell = document.createElement('td');
      var tagsWrap = document.createElement('div');
      tagsWrap.className = 'tags';

      item.processes.forEach(function (p) {
        var tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = p.name + ' (' + p.pid + ')';
        tagsWrap.appendChild(tag);
      });

      tagsCell.appendChild(tagsWrap);
      tr.appendChild(productCell);
      tr.appendChild(countCell);
      tr.appendChild(tagsCell);
      resultBody.appendChild(tr);
    });
  }

  function render() {
    var hasAgent = Boolean(host.selectedAgent);
    runBtn.disabled = !hasAgent || running;
    runBtn.setAttribute('aria-busy', String(running));
    spinner.hidden = !running;
    noAgentChip.hidden = hasAgent;

    renderStats();
    renderError();
    renderEmpty();
    renderResult();
  }

  async function run() {
    if (!host.selectedAgent || running) return;

    running = true;
    err = null;
    result = null;
    render();

    try {
      var res = await host.dispatchTask(PLUGIN_ID, 'detect', {});
      var parsed = parseResult(res.result);
      if (!parsed || !Array.isArray(parsed.av)) {
        throw new Error('检测结果格式异常（未返回 av 列表）');
      }
      result = parsed;
    } catch (e) {
      err = e instanceof Error ? e.message : '检测失败';
    } finally {
      running = false;
      render();
    }
  }

  runBtn.addEventListener('click', run);

  // 桥 SDK 每 2 秒同步一次选中设备；这里镜像到 UI（按钮可用态/提示 Chip）。
  var lastAgentId = host.selectedAgent ? host.selectedAgent.id : null;
  function syncAgent() {
    var currentId = host.selectedAgent ? host.selectedAgent.id : null;
    if (currentId !== lastAgentId) {
      lastAgentId = currentId;
      render();
    }
  }
  window.setInterval(syncAgent, 1000);

  render();
})();
