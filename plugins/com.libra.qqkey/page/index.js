(function () {
  'use strict';

  var PLUGIN_ID = 'com.libra.qqkey';
  var bridge = window.LibraPluginHost;
  var host = bridge && typeof bridge.usePluginHost === 'function'
    ? bridge.usePluginHost()
    : null;

  if (!host) {
    var app = document.getElementById('app');
    if (app) app.textContent = '桥 SDK 不可用，请刷新页面';
    return;
  }

  /* ------------------------------------------------------------------ *
   * 状态
   * ------------------------------------------------------------------ */
  var state = {
    tab: 'list',
    scanRunning: false,
    ckRunning: false,
    rows: [],
    err: null,
    autoRef: null,
    busy: false,
    bizErr: null,
    modal: null,
  };

  // 业务表单字段（与 TSX 版共享状态的行为一致）
  var biz = {
    uin: '',
    key: '',
    ssText: '',
    nick: '',
    company: '',
    qunn: '',
    targetUin: '',
    busId: '',
    fileId: '',
    favorite: '',
  };

  var fieldEls = {};
  var fieldMeta = {};

  /* ------------------------------------------------------------------ *
   * 工具函数
   * ------------------------------------------------------------------ */
  function el(tag, props, children) {
    props = props || {};
    children = children || [];
    var node = document.createElement(tag);

    if (props.class) node.className = props.class;
    if (props.id) node.id = props.id;
    if (props.text !== undefined) node.textContent = props.text;
    if (props.value !== undefined) node.value = props.value;
    if (props.placeholder !== undefined) node.placeholder = props.placeholder;
    if (props.type !== undefined) node.type = props.type;
    if (props.rows !== undefined) node.rows = props.rows;
    if (props.disabled !== undefined) node.disabled = !!props.disabled;
    if (props.hidden !== undefined) {
      if (props.hidden) node.setAttribute('hidden', '');
      else node.removeAttribute('hidden');
    }
    if (props.attrs) {
      Object.keys(props.attrs).forEach(function (k) {
        var v = props.attrs[k];
        if (v === undefined || v === false) node.removeAttribute(k);
        else node.setAttribute(k, v === true ? '' : String(v));
      });
    }

    if (typeof children === 'string') children = [children];
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c === null || c === undefined) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function parseResult(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        var p = JSON.parse(raw);
        if (p && typeof p === 'object' && !Array.isArray(p)) return p;
      } catch (e) { /* ignore */ }
    }
    return null;
  }

  function avatarUrl(uin) {
    return 'https://q2.qlogo.cn/headimg_dl?dst_uin=' + uin + '&spec=100';
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } finally {
        ta.remove();
      }
    }
  }

  function mergeAccounts(scan, ck) {
    var map = new Map();
    (ck || []).forEach(function (a) {
      map.set(a.uin, Object.assign({}, a));
    });
    (scan || []).forEach(function (a) {
      var prev = map.get(a.uin) || { uin: a.uin };
      map.set(a.uin, Object.assign({}, prev, a));
    });
    return Array.from(map.values()).sort(function (a, b) {
      return String(a.uin).localeCompare(String(b.uin));
    });
  }

  function stripJsonp(raw) {
    var t = String(raw).trim();
    var m = t.match(/^[\w$]+\s*\((.*)\)\s*;?\s*$/s);
    return m ? (m[1] || t) : t;
  }

  function tryParse(raw) {
    try {
      return JSON.parse(stripJsonp(raw));
    } catch (e) {
      return null;
    }
  }

  var listFound = null;

  function firstList(obj) {
    listFound = null;
    if (Array.isArray(obj)) return obj;
    if (obj && typeof obj === 'object') {
      var direct = obj;
      var keys = ['items_list', 'gnamelist', 'file_list', 'feeds'];
      for (var i = 0; i < keys.length; i++) {
        if (Array.isArray(direct[keys[i]])) return direct[keys[i]];
      }
      ['data', 'returnData'].forEach(function (key) {
        var nested = direct[key];
        if (nested && typeof nested === 'object' && !Array.isArray(nested) && !listFound) {
          Object.keys(nested).some(function (k) {
            if (Array.isArray(nested[k])) {
              listFound = nested[k];
              return true;
            }
            return false;
          });
        }
      });
      if (listFound) return listFound;
    }
    return null;
  }

  function fmtBytes(n) {
    var b = Number(n) || 0;
    if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
    return b + ' B';
  }

  function qqBiz(action, params) {
    return bridge.api.post('/plugin/' + PLUGIN_ID + '/' + action, params);
  }

  /* ------------------------------------------------------------------ *
   * 页面元素
   * ------------------------------------------------------------------ */
  var tabListBtn, tabBizBtn, btnCk, btnRescan, chipNoAgent;
  var errBanner, errText, listPanel, bizPanel;
  var chipAccounts, chipCk, searchInput, btnExport;
  var listEmpty, tableWrap, listBody, listHint;
  var bizErrBanner, bizErrText, bizUinInput, bizKeyInput, bizSpinner, bizNote, accountsDatalist, jumpButtons;
  var modalEl, modalTitle, modalBody;

  function buildApp() {
    var app = document.getElementById('app');
    var page = el('div', { class: 'page' });

    /* 顶栏卡片 */
    var headerCard = el('div', { class: 'card header-card' });
    var headerRow = el('div', { class: 'header-row' });
    var title = el('h1', { class: 'page-title', text: 'QQ 业务' });

    var tabs = el('div', { class: 'tabs', attrs: { role: 'tablist', 'aria-label': 'QQ tabs' } });
    tabListBtn = el('button', {
      class: 'tab active', id: 'tab-list', text: 'QQ 列表',
      attrs: { role: 'tab', 'aria-selected': 'true' },
    });
    tabBizBtn = el('button', {
      class: 'tab', id: 'tab-biz', text: 'QQ 业务',
      attrs: { role: 'tab', 'aria-selected': 'false' },
    });
    tabs.appendChild(tabListBtn);
    tabs.appendChild(tabBizBtn);

    btnCk = el('button', { class: 'btn btn-primary', id: 'btn-ck', text: '获取 CK' });
    btnRescan = el('button', { class: 'btn btn-ghost', id: 'btn-rescan', text: '重新扫描' });
    chipNoAgent = el('span', {
      class: 'chip chip-warning', id: 'no-agent-chip', text: '请先在顶部选择设备', hidden: true,
    });

    headerRow.appendChild(title);
    headerRow.appendChild(tabs);
    headerRow.appendChild(el('div', { class: 'spacer' }));
    headerRow.appendChild(btnCk);
    headerRow.appendChild(btnRescan);
    headerRow.appendChild(chipNoAgent);
    headerCard.appendChild(headerRow);
    page.appendChild(headerCard);

    /* 全局错误 */
    errBanner = el('div', { class: 'error-banner', id: 'err-banner', hidden: true });
    errText = el('p', { class: 'error-text', id: 'err-text' });
    errBanner.appendChild(errText);
    page.appendChild(errBanner);

    /* 列表面板 */
    listPanel = el('section', { class: 'panel', id: 'panel-list' });
    var listCard = el('div', { class: 'card' });
    var listHead = el('div', { class: 'panel-head' });
    var listTitle = el('h2', { class: 'panel-title', text: 'QQ 列表' });
    chipAccounts = el('span', { class: 'chip', id: 'chip-accounts', text: '0 个账号' });
    chipCk = el('span', { class: 'chip chip-warning', id: 'chip-ck', text: 'CK 0 个' });
    searchInput = el('input', {
      class: 'input input-search', id: 'search-input', type: 'search',
      placeholder: '搜索 QQ 号 / 昵称',
    });
    btnExport = el('button', { class: 'btn btn-ghost btn-sm', id: 'btn-export', text: '导出 CSV' });
    listHead.appendChild(listTitle);
    listHead.appendChild(chipAccounts);
    listHead.appendChild(chipCk);
    listHead.appendChild(el('div', { class: 'spacer' }));
    listHead.appendChild(searchInput);
    listHead.appendChild(btnExport);

    listEmpty = el('p', {
      class: 'empty-text', id: 'list-empty',
      text: '未发现本机 QQ 数据（Documents\\Tencent Files）。点击「重新扫描」。',
    });
    tableWrap = el('div', { class: 'table-wrap', id: 'table-wrap' });
    var table = el('table', { class: 'table', attrs: { 'aria-label': 'QQ 账号列表' } });
    var thead = el('thead');
    var trHead = el('tr');
    ['LOGO', 'QQNumber', '昵称', 'ClientKey', '操作'].forEach(function (h) {
      trHead.appendChild(el('th', { text: h }));
    });
    thead.appendChild(trHead);
    listBody = el('tbody', { id: 'list-body' });
    table.appendChild(thead);
    table.appendChild(listBody);
    tableWrap.appendChild(table);
    listHint = el('p', {
      class: 'hint-text', id: 'list-hint',
      text: '尚未获取 ClientKey —— 点击顶部「获取 CK」按钮抓取。', hidden: true,
    });

    listCard.appendChild(listHead);
    listCard.appendChild(listEmpty);
    listCard.appendChild(tableWrap);
    listCard.appendChild(listHint);
    listPanel.appendChild(listCard);
    page.appendChild(listPanel);

    /* 业务面板 */
    bizPanel = el('section', { class: 'panel', id: 'panel-biz', hidden: true });

    bizErrBanner = el('div', { class: 'error-banner', id: 'biz-err-banner', hidden: true });
    bizErrText = el('p', { class: 'error-text', id: 'biz-err-text' });
    bizErrBanner.appendChild(bizErrText);
    bizPanel.appendChild(bizErrBanner);

    /* 账号选择 */
    var accountCard = el('div', { class: 'card' });
    accountCard.appendChild(el('h3', { class: 'card-title', text: '选择 QQ 账号（uin + clientkey，用于身份）' }));
    var accountRow = el('div', { class: 'biz-account-row' });
    bizUinInput = el('input', {
      class: 'input input-account', id: 'biz-uin', type: 'text',
      placeholder: '搜索/选择 QQ 账号…', attrs: { list: 'accounts-datalist', autocomplete: 'off' },
    });
    accountsDatalist = el('datalist', { id: 'accounts-datalist' });
    bizKeyInput = el('input', {
      class: 'input input-key', id: 'biz-key', type: 'text',
      placeholder: 'clientkey（留空自动取该账号）', attrs: { autocomplete: 'off' },
    });
    bizSpinner = el('span', { class: 'spinner', id: 'biz-spinner', hidden: true, attrs: { role: 'status' } });
    accountRow.appendChild(bizUinInput);
    accountRow.appendChild(accountsDatalist);
    accountRow.appendChild(bizKeyInput);
    accountRow.appendChild(bizSpinner);
    accountCard.appendChild(accountRow);
    bizNote = el('p', { class: 'note-text', id: 'biz-note' });
    accountCard.appendChild(bizNote);
    bizPanel.appendChild(accountCard);

    /* 免登跳转 */
    var jumpCard = el('div', { class: 'card' });
    jumpCard.appendChild(el('h3', { class: 'card-title', text: '免登业务跳转' }));
    jumpButtons = el('div', { class: 'jump-buttons', id: 'jump-buttons' });
    buildJumpButtons();
    jumpCard.appendChild(jumpButtons);
    bizPanel.appendChild(jumpCard);

    /* 业务工具 */
    var toolsCard = el('div', { class: 'card tools-card' });
    toolsCard.appendChild(buildTools());
    bizPanel.appendChild(toolsCard);

    page.appendChild(bizPanel);

    /* 结果模态框 */
    modalEl = el('div', { class: 'modal-backdrop', id: 'modal', hidden: true, attrs: { role: 'presentation' } });
    var modal = el('div', { class: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true' } });
    var modalHead = el('div', { class: 'modal-header' });
    modalTitle = el('h3', { class: 'modal-title', id: 'modal-title', text: '' });
    var modalClose = el('button', { class: 'modal-close', id: 'modal-close', text: '×', attrs: { 'aria-label': '关闭' } });
    modalHead.appendChild(modalTitle);
    modalHead.appendChild(modalClose);
    modalBody = el('div', { class: 'modal-body', id: 'modal-body' });
    modal.appendChild(modalHead);
    modal.appendChild(modalBody);
    modalEl.appendChild(modal);
    page.appendChild(modalEl);

    app.appendChild(page);

    /* 事件 */
    tabListBtn.addEventListener('click', function () { setTab('list'); });
    tabBizBtn.addEventListener('click', function () { setTab('biz'); });
    btnCk.addEventListener('click', fetchClientKeys);
    btnRescan.addEventListener('click', rescanAccounts);
    searchInput.addEventListener('input', renderList);
    btnExport.addEventListener('click', exportCsv);
    bizUinInput.addEventListener('input', function (e) {
      biz.uin = e.target.value.trim();
      biz.key = '';
      renderBizInfo();
    });
    bizKeyInput.addEventListener('input', function (e) {
      biz.key = e.target.value;
      renderBizInfo();
    });
    modalClose.addEventListener('click', closeModal);
    modalEl.addEventListener('click', function (e) {
      if (e.target === modalEl) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
  }

  function buildJumpButtons() {
    var BIZ_JUMP = {
      'QQ 空间': 'https://user.qzone.qq.com/{uin}/infocenter',
      'QQ 邮箱': 'https://wx.mail.qq.com/list/readtemplate?name=login_page.html',
      '群空间': 'https://qun.qq.com',
      '亲密空间': 'https://ti.qq.com',
      '账户中心': 'https://accounts.qq.com',
      'H5 空间': 'https://h5.qzone.qq.com',
      'ZBVIP': 'https://zb.vip.qq.com/kuikly/category/4350',
    };
    Object.keys(BIZ_JUMP).forEach(function (name) {
      var btn = el('button', { class: 'btn btn-outline btn-sm', text: name });
      btn.addEventListener('click', function () {
        var id = getBizIdentity();
        if (id.uin && id.key) {
          window.open(jumpUrl(id.uin, id.key, BIZ_JUMP[name].replace('{uin}', id.uin)), '_blank', 'noopener,noreferrer');
        }
      });
      jumpButtons.appendChild(btn);
    });
  }

  function jumpUrl(uin, key, u1) {
    return 'https://ssl.ptlogin2.qq.com/jump?ptlang=1033&clientuin=' + uin +
      '&clientkey=' + key +
      '&u1=' + encodeURIComponent(u1) +
      '&source=panelstar&keyindex=19';
  }

  /* ------------------------------------------------------------------ *
   * 业务工具（Accordion）
   * ------------------------------------------------------------------ */
  var TOOLS = [
    {
      title: '发 QQ 空间说说', desc: '发布一条动态到该账号空间',
      fields: [{ type: 'textarea', id: 'ssText', key: 'ssText', placeholder: '说说内容' }],
      run: function () { runBiz('shuoshuo', 'text', '发布说说', { text: biz.ssText }); },
    },
    {
      title: '修改 QQ 空间资料', desc: '改昵称 / 公司',
      fields: [
        { type: 'input', id: 'nick', key: 'nick', placeholder: '昵称' },
        { type: 'input', id: 'company', key: 'company', placeholder: '公司/签名' },
      ],
      run: function () { runBiz('profile', 'text', '修改资料', { nickname: biz.nick, company: biz.company }); },
    },
    {
      title: '好友列表', desc: '获取该账号 QQ 空间好友列表',
      fields: [],
      run: function () { runBiz('friends', 'friends', '好友列表'); },
    },
    {
      title: '群组列表', desc: '获取该账号加入的 QQ 群列表',
      fields: [],
      run: function () { runBiz('groups', 'groups', '群组列表'); },
    },
    {
      title: '群公告列表', desc: '获取指定群公告',
      fields: [{ type: 'input', id: 'qunnNotice', key: 'qunn', placeholder: '群号' }],
      run: function () { runBiz('group_notice', 'notices', '群公告 ' + biz.qunn, { qunn: biz.qunn }); },
    },
    {
      title: '群文件列表', desc: '获取指定群文件',
      fields: [{ type: 'input', id: 'qunnFiles', key: 'qunn', placeholder: '群号' }],
      run: function () { runBiz('group_files', 'files', '群文件 ' + biz.qunn, { qunn: biz.qunn }); },
    },
    {
      title: '删除群文件', desc: 'bus_id + file_id',
      fields: [
        { type: 'input', id: 'qunnDelete', key: 'qunn', placeholder: '群号' },
        { type: 'input', id: 'busId', key: 'busId', placeholder: 'bus_id' },
        { type: 'input', id: 'fileId', key: 'fileId', placeholder: 'file_id' },
      ],
      run: function () {
        runBiz('delete_file', 'text', '删除群文件', { qunn: biz.qunn, busId: biz.busId, fileId: biz.fileId });
      },
    },
    {
      title: '查看好友亲密度', desc: 'target_uin',
      fields: [{ type: 'input', id: 'targetUinF', key: 'targetUin', placeholder: '目标 uin' }],
      run: function () { runBiz('friendship', 'text', '亲密度 ' + biz.targetUin, { targetUin: biz.targetUin }); },
    },
    {
      title: '设置/移除特别关心', desc: 'special: 1 设置 / 0 移除',
      fields: [
        { type: 'input', id: 'targetUinC', key: 'targetUin', placeholder: '目标 uin' },
        { type: 'input', id: 'favorite', key: 'favorite', placeholder: 'action 0/1' },
      ],
      run: function () {
        runBiz('care', 'text', '特别关心', { targetUin: biz.targetUin, careAction: Number(biz.favorite || 1) });
      },
    },
    {
      title: '获取绑定手机号', desc: '读取账号绑定的手机号',
      fields: [],
      run: function () { runBiz('phone', 'text', '绑定手机号'); },
    },
  ];

  function buildTools() {
    var container = el('div', { class: 'accordion' });
    TOOLS.forEach(function (tool) {
      var item = el('div', { class: 'acc-item' });
      var trigger = el('button', {
        class: 'acc-trigger', attrs: { type: 'button', 'aria-expanded': 'false' },
      });
      trigger.appendChild(el('span', { class: 'acc-title', text: tool.title }));
      trigger.appendChild(el('span', { class: 'acc-desc', text: tool.desc }));
      trigger.appendChild(el('span', { class: 'acc-indicator', text: '▾' }));

      var panel = el('div', { class: 'acc-panel' });
      var body = el('div', { class: 'acc-body' });
      var fieldsRow = el('div', { class: 'tool-fields' });
      tool.fields.forEach(function (f) {
        var input = makeField(f);
        fieldEls[f.id] = input;
        fieldMeta[f.id] = f;
        fieldsRow.appendChild(input);
      });
      var runBtn = el('button', { class: 'btn btn-primary btn-sm', text: '执行' });
      runBtn.addEventListener('click', function () {
        if (!state.busy) tool.run();
      });
      body.appendChild(fieldsRow);
      body.appendChild(runBtn);
      panel.appendChild(body);
      item.appendChild(trigger);
      item.appendChild(panel);
      trigger.addEventListener('click', function () {
        var open = item.classList.toggle('open');
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      container.appendChild(item);
    });
    return container;
  }

  function makeField(f) {
    var node;
    if (f.type === 'textarea') {
      node = el('textarea', {
        class: 'input field-input', rows: 2, placeholder: f.placeholder || '',
      });
    } else {
      node = el('input', {
        class: 'input field-input', type: 'text', placeholder: f.placeholder || '',
      });
    }
    node.value = biz[f.key] || '';
    node.addEventListener('input', function (e) {
      biz[f.key] = e.target.value;
      syncFieldInputs(f.key, node);
    });
    return node;
  }

  function syncFieldInputs(key, skip) {
    Object.keys(fieldMeta).forEach(function (id) {
      if (fieldMeta[id].key === key && fieldEls[id] !== skip) {
        fieldEls[id].value = biz[key] || '';
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * 渲染
   * ------------------------------------------------------------------ */
  function setTab(tab) {
    state.tab = tab;
    tabListBtn.classList.toggle('active', tab === 'list');
    tabBizBtn.classList.toggle('active', tab === 'biz');
    tabListBtn.setAttribute('aria-selected', tab === 'list' ? 'true' : 'false');
    tabBizBtn.setAttribute('aria-selected', tab === 'biz' ? 'true' : 'false');
    listPanel.hidden = tab !== 'list';
    bizPanel.hidden = tab !== 'biz';
  }

  function renderHeader() {
    var agent = host.selectedAgent;
    btnCk.disabled = !agent || state.ckRunning;
    btnRescan.disabled = !agent || state.scanRunning;
    btnCk.classList.toggle('is-pending', state.ckRunning);
    btnRescan.classList.toggle('is-pending', state.scanRunning);
    chipNoAgent.hidden = !!agent;
  }

  function renderErr() {
    errBanner.hidden = !state.err;
    errText.textContent = state.err || '';
  }

  function renderBizErr() {
    bizErrBanner.hidden = !state.bizErr;
    bizErrText.textContent = state.bizErr || '';
  }

  function getBizIdentity() {
    var uin = (biz.uin || '').trim();
    var withKey = '';
    state.rows.forEach(function (r) {
      if (r.uin === uin && r.clientkey) withKey = r.clientkey;
    });
    var bizUin = uin || (state.rows.length ? state.rows[0].uin : '');
    var rowKey = '';
    state.rows.forEach(function (r) {
      if (r.uin === bizUin && r.clientkey) rowKey = r.clientkey;
    });
    var key = (biz.key || '').trim() || withKey || rowKey || '';
    return { uin: bizUin, key: key };
  }

  function renderBizInfo() {
    var id = getBizIdentity();
    bizKeyInput.value = id.key;
    bizSpinner.hidden = !state.busy;
    var note;
    if (id.uin && id.key) {
      note = '当前：' + id.uin + ' / ' + id.key.slice(0, 8) + '…\n业务由插件 service/main.cs 服务端执行.';
    } else {
      note = '请先「重新扫描」并在列表中选取账号。\n业务由插件 service/main.cs 服务端执行.';
    }
    bizNote.textContent = note;
    var buttons = jumpButtons.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = !(id.uin && id.key);
    }
  }

  function getFilteredRows() {
    var kw = searchInput.value.trim().toLowerCase();
    if (!kw) return state.rows.slice();
    return state.rows.filter(function (r) {
      return String(r.uin).includes(kw) || String(r.nickname || '').toLowerCase().includes(kw);
    });
  }

  function renderList() {
    var rows = state.rows;
    var ckCount = rows.filter(function (r) { return r.clientkey; }).length;

    chipAccounts.textContent = rows.length + ' 个账号';
    chipCk.textContent = 'CK ' + ckCount + ' 个';
    chipCk.classList.toggle('chip-success', ckCount > 0);
    chipCk.classList.toggle('chip-warning', ckCount === 0);

    var filtered = getFilteredRows();
    listEmpty.hidden = rows.length !== 0;
    tableWrap.hidden = rows.length === 0;
    listHint.hidden = !(rows.length > 0 && ckCount === 0);
    btnExport.disabled = filtered.length === 0;

    listBody.textContent = '';
    filtered.forEach(function (a) {
      listBody.appendChild(renderRow(a));
    });

    updateAccountsDatalist();
  }

  function renderRow(a) {
    var tr = el('tr');

    var avatarCell = el('td');
    var avatar = el('div', { class: 'avatar' });
    var img = el('img', { attrs: { src: avatarUrl(a.uin), alt: a.uin, loading: 'lazy' } });
    img.addEventListener('error', function () { img.style.visibility = 'hidden'; });
    avatar.appendChild(img);
    avatarCell.appendChild(avatar);
    tr.appendChild(avatarCell);

    tr.appendChild(el('td', { class: 'mono', text: a.uin }));
    tr.appendChild(el('td', { text: a.nickname || '-' }));

    var ckCell = el('td');
    if (a.clientkey) {
      ckCell.appendChild(el('span', { class: 'mono ck-text', text: a.clientkey }));
    } else {
      ckCell.appendChild(el('span', { class: 'muted', text: '-' }));
    }
    tr.appendChild(ckCell);

    var actionCell = el('td');
    var actionRow = el('div', { class: 'row-actions' });
    var copyBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'COPY' });
    copyBtn.disabled = !a.clientkey;
    copyBtn.addEventListener('click', function () {
      copyText((a.uin + ' ' + (a.clientkey || '')).trim());
    });
    var qzoneBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'QQ 空间' });
    qzoneBtn.disabled = !a.ptsigx;
    qzoneBtn.addEventListener('click', function () {
      if (a.ptsigx) window.open(a.ptsigx, '_blank', 'noopener,noreferrer');
    });
    actionRow.appendChild(copyBtn);
    actionRow.appendChild(qzoneBtn);
    actionCell.appendChild(actionRow);
    tr.appendChild(actionCell);

    return tr;
  }

  function updateAccountsDatalist() {
    accountsDatalist.textContent = '';
    state.rows.forEach(function (a) {
      if (!a.clientkey) return;
      accountsDatalist.appendChild(el('option', { attrs: { value: a.uin } }));
    });
  }

  function exportCsv() {
    var header = ['QQ号', '昵称', 'ClientKey'];
    var lines = getFilteredRows().map(function (r) {
      return [r.uin, r.nickname || '', r.clientkey || ''];
    });
    var csv = [header].concat(lines).map(function (line) {
      return line.map(function (c) {
        return '"' + String(c).replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'qq_accounts.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ------------------------------------------------------------------ *
   * 动作
   * ------------------------------------------------------------------ */
  async function rescanAccounts() {
    if (!host.selectedAgent) return;
    state.scanRunning = true;
    state.err = null;
    renderHeader();
    renderErr();
    try {
      var s = await host.dispatchTask(PLUGIN_ID, 'scan_accounts', {});
      var scan = (parseResult(s.result) || {}).accounts || [];
      state.rows = mergeAccounts(scan, state.rows);
    } catch (e) {
      state.err = e instanceof Error ? e.message : '探测失败';
    } finally {
      state.scanRunning = false;
      renderHeader();
      renderErr();
      renderList();
      renderBizInfo();
    }
  }

  async function fetchClientKeys() {
    if (!host.selectedAgent) return;
    state.ckRunning = true;
    state.err = null;
    renderHeader();
    renderErr();
    try {
      var c = await host.dispatchTask(PLUGIN_ID, 'collect', {});
      var ck = (parseResult(c.result) || {}).accounts || [];
      state.rows = mergeAccounts(state.rows, ck);
      if (ck.length === 0) state.err = '未抓到 ClientKey，请确认 Agent 上的 QQ 已登录';
    } catch (e) {
      state.err = e instanceof Error ? e.message : '抓取失败';
    } finally {
      state.ckRunning = false;
      renderHeader();
      renderErr();
      renderList();
      renderBizInfo();
    }
  }

  async function runBiz(action, kind, title, params) {
    var id = getBizIdentity();
    if (!id.uin || !id.key) {
      state.bizErr = '请先选择账号（需要 clientkey）';
      renderBizErr();
      return;
    }
    state.bizErr = null;
    state.busy = true;
    renderBizErr();
    renderBizInfo();
    try {
      var payload = Object.assign({ uin: id.uin, clientkey: id.key }, params || {});
      var res = await qqBiz(action, payload);
      if (!res || res.ok === false) {
        showModal({
          title: title, kind: 'text', data: null,
          raw: '执行失败：' + ((res && res.error) || 'unknown'),
        });
        return;
      }
      var raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data === undefined || res.data === null ? '(empty)' : res.data);
      var parsed = tryParse(raw);
      showModal({
        title: title,
        kind: parsed === null ? 'text' : kind,
        data: parsed,
        raw: raw,
      });
    } catch (e) {
      showModal({
        title: title, kind: 'text', data: null,
        raw: '请求失败：' + (e instanceof Error ? e.message : String(e)),
      });
    } finally {
      state.busy = false;
      renderBizInfo();
    }
  }

  function showModal(m) {
    state.modal = m;
    modalTitle.textContent = m.title;
    modalBody.textContent = '';
    modalBody.appendChild(renderResult(m.kind, m.data, m.raw));
    modalEl.hidden = false;
  }

  function closeModal() {
    state.modal = null;
    modalEl.hidden = true;
  }

  /* ------------------------------------------------------------------ *
   * 结果渲染
   * ------------------------------------------------------------------ */
  function renderResult(kind, data, raw) {
    if (data === null) return preBlock(raw);

    var list = firstList(data);

    if (kind === 'friends' && list) return renderFriends(list);
    if (kind === 'groups' && list) return renderGroups(list);
    if (kind === 'files' && list) return renderFiles(list);
    if (kind === 'notices' && list) return renderNotices(list);

    var obj = tryParse(raw);
    return preBlock(obj !== null ? JSON.stringify(obj, null, 2) : raw);
  }

  function preBlock(text) {
    return el('pre', { class: 'result-pre', text: text });
  }

  function resultAvatar(src, alt, fallback) {
    var avatar = el('div', { class: 'avatar avatar-sm' });
    var img = el('img', { attrs: { src: src, alt: alt, loading: 'lazy' } });
    img.addEventListener('error', function () { img.style.display = 'none'; });
    avatar.appendChild(img);
    avatar.appendChild(el('span', { class: 'avatar-fallback', text: fallback }));
    return avatar;
  }

  function renderFriends(list) {
    var wrap = el('div', { class: 'result-list' });
    list.forEach(function (it, i) {
      var o = (it && typeof it === 'object') ? it : {};
      var uin = String(o.uin === undefined || o.uin === null ? '' : o.uin);
      var name = String(o.name === undefined || o.name === null ? uin : o.name);
      var img = typeof o.img === 'string' && o.img ? o.img : avatarUrl(uin);
      var row = el('div', { class: 'result-item' });
      row.appendChild(resultAvatar(img, name, name[0] || '?'));
      var info = el('div', { class: 'result-info' });
      info.appendChild(el('div', { class: 'result-name', text: name }));
      var desc = uin;
      if (o.score !== undefined) desc += ' · 亲密度 ' + o.score;
      info.appendChild(el('div', { class: 'result-desc', text: desc }));
      row.appendChild(info);
      wrap.appendChild(row);
    });
    return wrap;
  }

  function renderGroups(list) {
    var wrap = el('div', { class: 'result-list' });
    list.forEach(function (it) {
      var o = (it && typeof it === 'object') ? it : {};
      var gc = String(o.gc !== undefined && o.gc !== null
        ? o.gc
        : (o.gcode !== undefined && o.gcode !== null
          ? o.gcode
          : (o.qid !== undefined && o.qid !== null ? o.qid : '')));
      var gname = String(o.gname !== undefined && o.gname !== null
        ? o.gname
        : (o.name !== undefined && o.name !== null ? o.name : gc));
      var row = el('div', { class: 'result-item' });
      row.appendChild(resultAvatar('https://p.qlogo.cn/gh/' + gc + '/' + gc + '/100', gname, gname[0] || '群'));
      var info = el('div', { class: 'result-info' });
      info.appendChild(el('div', { class: 'result-name', text: gname }));
      info.appendChild(el('div', { class: 'result-desc', text: gc || '未知群号' }));
      row.appendChild(info);
      wrap.appendChild(row);
    });
    return wrap;
  }

  function renderFiles(list) {
    var wrap = el('div', { class: 'result-stack' });
    list.forEach(function (it) {
      var o = (it && typeof it === 'object') ? it : {};
      var row = el('div', { class: 'file-item' });
      var info = el('div', { class: 'file-info' });
      var name = String(o.file_name !== undefined && o.file_name !== null
        ? o.file_name
        : (o.name !== undefined && o.name !== null ? o.name : '-'));
      info.appendChild(el('div', { class: 'file-name', text: name }));
      var meta = fmtBytes(o.file_size !== undefined && o.file_size !== null ? o.file_size : o.size);
      if (o.uploader_name) meta += ' · ' + o.uploader_name;
      if (o.bus_id !== undefined) meta += ' · bus=' + o.bus_id;
      info.appendChild(el('div', { class: 'file-meta', text: meta }));
      row.appendChild(info);
      if (o.btn_text) {
        row.appendChild(el('span', { class: 'chip chip-warning', text: String(o.btn_text) }));
      }
      wrap.appendChild(row);
    });
    return wrap;
  }

  function renderNotices(list) {
    var wrap = el('div', { class: 'result-stack' });
    list.forEach(function (it) {
      var o = (it && typeof it === 'object') ? it : {};
      var title = String(o.title !== undefined && o.title !== null
        ? o.title
        : (o.text_info !== undefined && o.text_info !== null ? o.text_info : '公告'));
      var card = el('div', { class: 'notice-item' });
      card.appendChild(el('div', { class: 'notice-title', text: title }));
      var textInfo = o.text_info;
      if (textInfo !== undefined && String(textInfo) !== title) {
        card.appendChild(el('p', { class: 'notice-text', text: String(textInfo) }));
      }
      if (o.time_str !== undefined) {
        card.appendChild(el('div', { class: 'notice-time', text: String(o.time_str) }));
      }
      wrap.appendChild(card);
    });
    return wrap;
  }

  /* ------------------------------------------------------------------ *
   * 启动
   * ------------------------------------------------------------------ */
  buildApp();
  renderHeader();
  renderErr();
  renderList();
  renderBizInfo();

  // 选中设备切换时自动重新扫描（桥通过轮询更新 selectedAgent）
  function pollAgent() {
    var agent = host.selectedAgent;
    var id = agent ? agent.id : null;
    if (state.autoRef === id) return;
    state.autoRef = id;
    renderHeader();
    if (agent) {
      rescanAccounts();
    } else {
      renderList();
      renderBizInfo();
    }
  }
  pollAgent();
  setInterval(pollAgent, 1000);
})();
