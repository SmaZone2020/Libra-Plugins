/* =========================================================================
 * com.example.plugin-sdk · page/index.js
 * 插件页面（纯原生 JS，DOM 构建，零外部依赖）。
 * 依赖桥 SDK：window.LibraPluginHost（由 page/_bridge.js 注入，必须先于本文件加载）。
 *
 * 数据获取约定：
 *   - 后端 API    → LibraPluginHost.api.get/post/put/delete(path 不含 /api 前缀)
 *   - 包内资源    → 直接 fetch（iframe 与后端同源）
 *   - 设备操作    → LibraPluginHost.usePluginHost()（selectedAgent / dispatchTask / subscribeOutput）
 *   - dispatchTask 的 pluginId 可省略（桥自动取当前插件）
 * ========================================================================= */
(function () {
  'use strict';

  /* ---------------- 桥 SDK ---------------- */

  const bridge = window.LibraPluginHost || null;
  const host = bridge ? bridge.usePluginHost() : null;
  const SDK_ID = bridge ? bridge.pluginId : 'com.example.plugin-sdk';
  const API_ORIGIN = bridge ? bridge.getApiOrigin() : window.location.origin;

  /* ---------------- 基础工具 ---------------- */

  /** 元素构造器：h('div', { class, dataset, onClick, value, ... }, ...children) */
  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k === 'style') Object.assign(node.style, v);
        else if (k === 'value') node.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'hidden') node[k] = !!v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else node.setAttribute(k, v);
      }
    }
    for (const c of children) appendChild(node, c);
    return node;
  }

  function appendChild(node, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach((x) => appendChild(node, x)); return; }
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }

  function code(text) { return h('code', { text }); }

  function tryParse(raw) {
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch { return raw; }
  }

  /** dispatchTask 结果可能是对象或 JSON 字符串，统一转可读文本 */
  function pretty(data) {
    const parsed = tryParse(data);
    return typeof parsed === 'string' ? parsed : JSON.stringify(parsed ?? '(empty)', null, 2);
  }

  function assetUrl(file) {
    return `${API_ORIGIN}/api/plugins/${SDK_ID}/assets/${file}`;
  }

  async function callScript(fn, params) {
    if (!bridge) return { ok: false, error: '桥 SDK 未加载' };
    return bridge.api.post(`/plugin/${SDK_ID}/${fn}`, params ?? {});
  }

  function timeStr(ts) { return new Date(ts).toLocaleTimeString(); }
  function truncate(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }

  /** 相对链接（如 docs 间互链）相对 assets/docs/ 解析 */
  function resolveHref(url) {
    if (/^(https?:|data:|mailto:|#)/i.test(url) || url.startsWith('/')) return url;
    try { return new URL(url, assetUrl('docs/')).href; } catch { return url; }
  }

  /* ---------------- 图标（内联 SVG，零依赖） ---------------- */

  const ICONS = {
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"/>',
    file: '<path d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v4h4"/>',
    code: '<polyline points="8 8 4 12 8 16"/><polyline points="16 8 20 12 16 16"/><line x1="13" y1="6" x2="11" y2="18"/>',
    doc: '<path d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v4h4"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="14" y2="16"/>',
    chevron: '<polyline points="6 9 12 15 18 9"/>',
  };

  function icon(name, cls) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon' + (cls ? ' ' + cls : ''));
    svg.innerHTML = ICONS[name] || '';
    return svg;
  }

  /* ---------------- Chip / Alert ---------------- */

  const CHIP_COLORS = {
    accent: 'chip-accent',
    success: 'chip-success',
    warning: 'chip-warning',
    danger: 'chip-danger',
    secondary: 'chip-secondary',
    soft: 'chip-soft',
    'danger-soft': 'chip-danger-soft',
  };

  function chip(text, variant) {
    return h('span', { class: 'chip ' + (CHIP_COLORS[variant] || 'chip-secondary'), text });
  }

  function alertBox(variant, title, desc) {
    return h('div', { class: `alert alert-${variant}` },
      h('div', { class: 'alert-title', text: title }),
      h('div', { class: 'alert-desc' }, desc));
  }

  /* ---------------- 共享数据（与 TSX 版 shared.tsx 对应） ---------------- */

  const DOC_FILES = [
    { id: '01', label: '总览', file: 'docs/01-overview.md' },
    { id: '02', label: '插件契约', file: 'docs/02-plugin-contract.md' },
    { id: '03', label: 'Agent JS API', file: 'docs/03-agent-js-api.md' },
    { id: '04', label: '服务端脚本', file: 'docs/04-server-script.md' },
    { id: '05', label: '前端宿主', file: 'docs/05-frontend-host.md' },
    { id: '06', label: '打包发布', file: 'docs/06-pack-publish.md' },
  ];

  const STEPS = [
    ['建包', '写好 meta.json + module/（script 或 native）+ service/*.cs + page/index.html，node pack.mjs 打成 zip'],
    ['导入', '控制台 → 插件管理 → 上传插件 / 从 Git 导入 / 从市场安装'],
    ['启用', '插件登记到后端，动作可下发到 Agent'],
    ['写页面', 'page/index.html + index.js + index.css（原生 HTML，随包分发，安装/更新后刷新即生效）'],
    ['调 Agent', '页面里 LibraPluginHost.usePluginHost().dispatchTask(pluginId?, action, args)'],
    ['调服务', '页面里 LibraPluginHost.api.post(\'/plugin/<pluginId>/<fn>\', params) 驱动 service/*.cs'],
    ['发布', '把 zip 提交到 Libra-Plugins 仓库 plugins/<pluginId>/，CI 生成 index.json 即上架市场'],
  ];

  const AGENT_CAPS = [
    { value: 'whoami', label: 'whoami', desc: '当前用户' },
    { value: 'fs', label: 'fs', desc: '文件系统：写 /tmp/libra_sdk_probe.txt → 读 → 列目录 → 存在性' },
    { value: 'proc', label: 'proc', desc: '进程列表 + PATH 环境变量' },
    { value: 'network', label: 'network', desc: '网络信息（按平台自动选命令）' },
    { value: 'system', label: 'system', desc: '系统信息（按平台自动选命令）' },
    { value: 'env', label: 'env', desc: '环境变量集合 + 当前用户（新增）' },
    { value: 'shell', label: 'shell', desc: '执行任意命令（可选项 command）', needsCommand: true },
    { value: 'log', label: 'log', desc: '写一条 Agent 日志（控制台日志流可见）' },
    { value: 'all', label: 'all', desc: '全量自检（默认）' },
    { value: 'manifest', label: 'manifest', desc: '返回能力目录（自描述）' },
  ];

  const COMMON_API = [
    ['fs.read(path)', '读文件，返回字符串'],
    ['fs.write(path, content)', '写文件，返回 bool'],
    ['fs.list(path)', '列目录，返回数组'],
    ['fs.exists(path)', '判断是否存在，返回 bool'],
    ['proc.list()', '枚举进程，返回 [{pid,name}]'],
    ['proc.kill(pid)', '杀进程，返回 bool（危险操作）'],
    ['env.get(name)', '读环境变量，返回字符串'],
    ['env.set(name, value)', '写环境变量（多线程下安全 no-op 占位）'],
    ['whoami()', '当前用户名'],
    ['log(msg)', '打印到 Agent 日志'],
    ['__platform()', '运行时平台分支："windows"|"linux"|"macos"|"unknown"'],
  ];

  const WINDOWS_API = [
    ['cmd(cmdline)', '执行 CMD 命令'],
    ['powershell(script)', '进程内 CLR 执行 PowerShell（无 powershell.exe 进程）'],
    ['reg_query(key, name)', '查询注册表值'],
    ['reg_set(key, name, data)', '写注册表值，返回 bool'],
    ['reg_delete(key, name)', '删注册表值，返回 bool'],
    ['ipconfig()', '网络配置（/all）'],
    ['wmic(query)', '执行 WMIC 查询（Win11 24H2 已移除，注意空返回）'],
    ['tasklist()', '任务列表'],
  ];

  const LINUX_API = [
    ['shell(cmdline)', '执行 /bin/sh -c'],
    ['bash(script)', '执行 /bin/bash -c'],
    ['uname()', '内核/主机/架构（uname -a）'],
    ['ip_route()', '网络接口/IP，等价 ip addr'],
    ['ss(path)', '读 /proc 或 /sys 文件'],
    ['hostname()', '主机名'],
    ['dns()', '/etc/resolv.conf'],
  ];

  const PACKAGE_TREE = {
    name: 'com.example.plugin-sdk/',
    kind: 'folder',
    children: [
      { name: 'meta.json', kind: 'file', note: '插件契约（必需）' },
      {
        name: 'module/', kind: 'folder',
        note: 'Agent 端模块',
        children: [
          { name: 'plugin_sdk.js', kind: 'file', note: 'script 通道：JS 源码，QuickJS 内存执行' },
        ],
      },
      {
        name: 'service/', kind: 'folder',
        note: '服务端逻辑（C# 脚本，随包分发）',
        children: [
          { name: 'sdk_utils.cs', kind: 'file', note: '工具类/静态状态（按文件名排序，先拼接）' },
          { name: 'main.cs', kind: 'file', note: '导出函数（末尾 return Dictionary）' },
        ],
      },
      {
        name: 'page/', kind: 'folder',
        note: '纯 HTML 页面（随包分发，无需重建前端）',
        children: [
          { name: 'index.html', kind: 'file' },
          { name: 'index.js', kind: 'file' },
          { name: 'index.css', kind: 'file' },
        ],
      },
      {
        name: 'assets/', kind: 'folder',
        note: '静态资源（经 /api/plugins/<id>/assets/ 动态加载）',
        children: [
          { name: 'docs/', kind: 'folder', note: '活文档（markdown，本页「文档」页签在线渲染）' },
        ],
      },
      { name: 'data/', kind: 'folder', note: '随包分发的数据/配置文件（脚本 file 函数可读）' },
      { name: 'README.md', kind: 'file', note: '插件说明' },
    ],
  };

  const PACKAGE_EXPANDED = [
    'com.example.plugin-sdk/',
    'com.example.plugin-sdk/module/',
    'com.example.plugin-sdk/service/',
    'com.example.plugin-sdk/page/',
    'com.example.plugin-sdk/assets/',
    'com.example.plugin-sdk/assets/docs/',
  ];

  /* ---------------- 轻量 Markdown 渲染（DOM 构建，XSS 安全） ---------------- */

  const INLINE_RE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(~~[^~\n]+~~)|(!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\))/g;

  function renderInline(text) {
    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    INLINE_RE.lastIndex = 0;
    while ((m = INLINE_RE.exec(text))) {
      if (m.index > last) frag.append(document.createTextNode(text.slice(last, m.index)));
      if (m[1] !== undefined) {
        frag.append(h('code', { text: m[1].slice(1, -1) }));
      } else if (m[2] !== undefined) {
        const strong = h('strong');
        strong.append(renderInline(m[2].slice(2, -2)));
        frag.append(strong);
      } else if (m[3] !== undefined) {
        const em = h('em');
        em.append(renderInline(m[3].slice(1, -1)));
        frag.append(em);
      } else if (m[4] !== undefined) {
        frag.append(h('del', { text: m[4].slice(2, -2) }));
      } else if (m[5] !== undefined) {
        const whole = m[5];
        const isImg = whole.startsWith('!');
        const inner = whole.slice(isImg ? 1 : 0);
        const openParen = inner.indexOf('](');
        const closeParen = inner.lastIndexOf(')');
        const alt = inner.slice(1, openParen);
        const url = inner.slice(openParen + 2, closeParen);
        if (isImg) {
          frag.append(h('img', { src: resolveHref(url), alt, loading: 'lazy' }));
        } else {
          const a = h('a', { href: resolveHref(url) });
          a.append(renderInline(alt));
          frag.append(a);
        }
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.append(document.createTextNode(text.slice(last)));
    return frag;
  }

  function isBlockStart(line) {
    return /^\s*(#{1,6})\s/.test(line)
      || /^\s*>\s?/.test(line)
      || /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)
      || /^\s*(```+|~~~+)/.test(line)
      || /^\s*([-*+]|\d+[.)])\s+/.test(line);
  }

  function isTableStart(lines, i) {
    if (!lines[i] || !/^\s*\|.*\|\s*$/.test(lines[i])) return false;
    const next = lines[i + 1];
    if (!next) return false;
    return /^\s*\|?[\s:|-]+\|?\s*$/.test(next) && /-/.test(next);
  }

  function splitRow(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    // 按未转义管道符拆分（支持 GFM 的 \| 转义）
    const parts = [];
    let cur = '';
    for (let k = 0; k < s.length; k++) {
      const ch = s[k];
      if (ch === '\\' && s[k + 1] === '|') { cur += '|'; k++; continue; }
      if (ch === '|') { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
    return parts.map((x) => x.trim());
  }

  function parseTable(lines, i) {
    const header = splitRow(lines[i]);
    const aligns = splitRow(lines[i + 1]);
    const table = h('table');
    const thead = h('thead');
    const trh = h('tr');
    header.forEach((cell, ci) => {
      const th = h('th');
      th.append(renderInline(cell));
      const a = aligns[ci] || '';
      if (a.startsWith(':') && a.endsWith(':')) th.style.textAlign = 'center';
      else if (a.endsWith(':')) th.style.textAlign = 'right';
      trh.append(th);
    });
    thead.append(trh);
    table.append(thead);
    const tbody = h('tbody');
    for (let j = i + 2; j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j]); j++) {
      const cells = splitRow(lines[j]);
      const tr = h('tr');
      header.forEach((_, ci) => {
        const td = h('td');
        td.append(renderInline(cells[ci] || ''));
        tr.append(td);
      });
      tbody.append(tr);
    }
    table.append(tbody);
    return table;
  }

  function parseList(lines, i) {
    const first = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
    const indent = first[1].length;
    const ordered = /^\d/.test(first[2]);
    const list = h(ordered ? 'ol' : 'ul');
    while (i < lines.length) {
      const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
      if (!m) break;
      if (m[1].length < indent) break;
      if (m[1].length === indent) {
        const li = h('li');
        li.append(renderInline(m[3].trim()));
        list.append(li);
        i++;
      } else {
        const li = list.lastElementChild;
        if (li) {
          const nested = parseList(lines, i);
          li.append(nested.node);
          i = nested.nextIndex;
        } else {
          i++;
        }
      }
    }
    return { node: list, nextIndex: i };
  }

  /** 块级解析：标题/段落/粗斜体/行内代码/代码块/列表/链接/表格/分隔线/引用 */
  function renderMarkdown(md) {
    const root = h('div');
    const lines = String(md).replace(/\r\n/g, '\n').split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // 围栏代码块
      const fence = /^\s*(```+|~~~+)\s*([\w+-]*)\s*$/.exec(line);
      if (fence) {
        const lang = fence[2];
        i++;
        const buf = [];
        while (i < lines.length && !/^\s*(```+|~~~+)\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        const pre = h('pre');
        if (lang) pre.dataset.lang = lang;
        pre.append(h('code', { text: buf.join('\n') }));
        root.append(pre);
        continue;
      }

      // 分隔线
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
        root.append(h('hr'));
        i++;
        continue;
      }

      // 标题
      const head = /^(#{1,6})\s+(.*)$/.exec(line);
      if (head) {
        const node = h('h' + head[1].length);
        node.append(renderInline(head[2].trim()));
        root.append(node);
        i++;
        continue;
      }

      // 表格（GFM 分隔行）
      if (isTableStart(lines, i)) {
        root.append(parseTable(lines, i));
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) i++;
        continue;
      }

      // 引用
      if (/^\s*>\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        const quote = h('blockquote');
        const inner = renderMarkdown(buf.join('\n'));
        while (inner.firstChild) quote.append(inner.firstChild);
        root.append(quote);
        continue;
      }

      // 列表
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        const parsed = parseList(lines, i);
        root.append(parsed.node);
        i = parsed.nextIndex;
        continue;
      }

      if (line.trim() === '') { i++; continue; }

      // 段落（合并到下一个块起点）
      const buf = [line];
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (l.trim() === '' || isBlockStart(l) || isTableStart(lines, i)) break;
        buf.push(l);
        i++;
      }
      const p = h('p');
      p.append(renderInline(buf.join('\n')));
      root.append(p);
    }
    return root;
  }

  /* ---------------- 实时状态同步（桥每 2s 轮询一次 host 状态） ---------------- */

  const liveRefreshers = [];
  function refreshLive() { liveRefreshers.forEach((fn) => fn()); }

  /* ---------------- 模态框（服务端脚本页签共用） ---------------- */

  const modalBackdrop = document.getElementById('modal-backdrop');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  let modalOpen = false;

  function openModal(payload) {
    modalOpen = true;
    modalTitle.textContent = payload.title;
    modalBody.replaceChildren();

    const status = h('div', { class: 'alert ' + (payload.ok ? 'alert-success' : 'alert-danger') },
      h('div', { class: 'alert-title', text: payload.ok ? '调用成功' : '调用失败' }));
    if (payload.error !== undefined && payload.error !== null && payload.error !== '') {
      status.append(h('div', { class: 'alert-desc', text: payload.error }));
      if (!payload.ok) {
        status.append(h('p', { class: 'modal-hint' },
          '提示：请求 body 在 callScript 里统一以 ', code('{params ?? {}}'),
          ' 发送；服务端把 body 反序列化为 dynamic ', code('p'),
          ' 传给脚本函数。报 “does not contain a definition” 是脚本里访问了 body 里不存在的字段名 —— ',
          '检查演练表单参数名是否与函数期望一致（见上方函数目录）。'));
      }
    }
    modalBody.append(status);
    modalBody.append(h('pre', { class: 'pre-dark', text: pretty(payload.data) }));
    modalBackdrop.hidden = false;
  }

  function closeModal() {
    modalOpen = false;
    modalBackdrop.hidden = true;
  }

  document.getElementById('modal-close').addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalOpen) closeModal(); });

  /* ================= 总览页签 ================= */

  function treeNode(entry, path, expanded) {
    const isFolder = entry.kind === 'folder';
    const children = isFolder ? h('div', { class: 'tree-children' + (expanded ? '' : ' is-hidden') }) : null;
    const row = h(isFolder ? 'button' : 'div', {
      class: 'tree-row' + (isFolder ? ' is-folder' + (expanded ? ' is-open' : '') : ''),
      type: isFolder ? 'button' : null,
      'aria-label': isFolder ? entry.name : null,
    });
    if (isFolder) row.append(icon('chevron', 'tree-chevron'));
    row.append(
      h('span', { class: 'tree-icon' }, icon(isFolder ? 'folder' : (entry.name.endsWith('.md') ? 'doc' : 'code'))),
      h('span', { class: 'tree-label', text: entry.name }),
    );
    if (entry.note) row.append(h('span', { class: 'tree-note', text: entry.note }));
    if (isFolder) {
      row.addEventListener('click', () => {
        children.classList.toggle('is-hidden');
        row.classList.toggle('is-open');
      });
      (entry.children || []).forEach((c) =>
        children.append(treeNode(c, path + entry.name, PACKAGE_EXPANDED.includes(path + entry.name))));
      return h('div', { class: 'tree-item' }, row, children);
    }
    return h('div', { class: 'tree-item' }, row);
  }

  function renderOverview() {
    const layers = [
      {
        chipV: 'accent', chipT: 'Agent 端', title: 'module/',
        items: [
          'script 通道：.js 源码，QuickJS 内存执行，无需编译',
          'native 通道：Rust cdylib，按平台目录分发（x64/x86/linux-x64）',
          '能力：文件/进程/环境/Shell/注册表/网络/系统信息…',
          '__platform() 运行时平台分支（无需 #if 预处理）',
        ],
      },
      {
        chipV: 'warning', chipT: '服务端', title: 'service/*.cs',
        items: [
          '随包分发的 C# 脚本（Roslyn 解析执行，多文件拼接编译）',
          'POST /api/plugin/<pluginId>/<fn> 驱动',
          '可引用库：HttpClient / System.Text.Json / Linq…',
          '服务端发起网络请求（无 CORS）、读包内文件、跨调用状态',
        ],
      },
      {
        chipV: 'success', chipT: '前端', title: 'page/index.html',
        items: [
          '原生 HTML/JS/CSS + LibraPluginHost（设备/任务/WS 推送）',
          'dispatchTask 调 Agent 模块；api.post 调服务端脚本',
          '活文档在线渲染（assets/docs/*.md + 轻量 markdown 渲染器，零依赖）',
          '随包分发：index.html 原样打包，安装/更新后刷新即生效',
        ],
      },
    ];

    const arch = h('div', { class: 'grid-3' }, layers.map((l) =>
      h('div', { class: 'card' },
        h('div', { class: 'card-head' },
          chip(l.chipT, l.chipV),
          h('h3', { class: 'card-title', text: l.title })),
        h('ul', { class: 'overview-ul' }, l.items.map((it) => h('li', { class: 'text-2', text: it }))),
      )));

    const tree = h('div', { class: 'tree', 'aria-label': '插件包目录结构' },
      treeNode(PACKAGE_TREE, '', PACKAGE_EXPANDED.includes(PACKAGE_TREE.name)));

    const steps = h('div', {},
      STEPS.map(([title, desc], i) =>
        h('div', { class: 'step' },
          h('span', { class: 'step-num', text: String(i + 1) }),
          h('div', {},
            h('div', { class: 'step-title', text: title }),
            h('div', { class: 'step-desc', text: desc })))));

    const notice = alertBox('accent', '分发须知', [
      'module/ 与 service/ 随 zip 运行时分发；page/index.html + index.js + index.css 也是随包分发 —— ',
      '安装/更新插件后刷新控制台即生效（dev / preview 一致），无需重建前端。',
      '完整文档见「文档」页签（assets/docs/*.md 随包分发，在线渲染）。',
    ]);

    return h('div', { class: 'space-y' },
      arch,
      h('div', { class: 'card' },
        h('h3', { class: 'card-title', text: '插件包目录结构' }),
        tree),
      h('div', { class: 'card' },
        h('h3', { class: 'card-title', text: '接入流程（7 步）' }),
        steps),
      notice);
  }

  /* ================= 文档页签 ================= */

  const docEls = {
    btns: new Map(),
    header: null,
    source: null,
    body: null,
  };
  const docState = { id: DOC_FILES[0].id, md: null, err: null, loading: false };

  function renderDocBody() {
    docEls.body.replaceChildren();
    if (docState.loading) {
      docEls.body.append(
        h('div', { class: 'skeleton', style: { width: '50%', height: '28px' } }),
        h('div', { class: 'skeleton' }),
        h('div', { class: 'skeleton', style: { width: '75%' } }),
        h('div', { class: 'skeleton', style: { width: '50%' } }),
      );
      return;
    }
    if (docState.err) {
      docEls.body.append(
        h('p', { class: 'text-danger', text: docState.err + '（服务端未重启/插件未启用/包内缺 docs？）' }));
      return;
    }
    if (docState.md !== null) {
      const article = renderMarkdown(docState.md);
      article.classList.add('md');
      // 文档间互链：点击 *.md 相对链接切换到对应文档
      article.addEventListener('click', (e) => {
        const a = e.target.closest('a[href]');
        if (!a) return;
        const href = a.getAttribute('href') || '';
        const fn = href.split('/').pop() || '';
        if (fn.endsWith('.md')) {
          const target = DOC_FILES.find((d) => d.file.split('/').pop() === fn);
          if (target) { e.preventDefault(); selectDoc(target.id); }
        }
      });
      docEls.body.append(article);
    }
  }

  async function selectDoc(id) {
    const doc = DOC_FILES.find((d) => d.id === id);
    if (!doc) return;
    docState.id = id;
    docEls.btns.forEach((btn, key) => btn.classList.toggle('is-selected', key === id));
    docEls.header.textContent = `${id} · ${doc.label}`;
    docEls.source.replaceChildren('来源：', code('assets/docs/' + doc.file.replace('docs/', '')));
    docState.loading = true;
    docState.err = null;
    docState.md = null;
    renderDocBody();
    try {
      const res = await fetch(assetUrl(doc.file));
      if (!res.ok) throw new Error(`加载失败：HTTP ${res.status}`);
      docState.md = await res.text();
    } catch (e) {
      docState.err = e instanceof Error ? e.message : String(e);
    }
    docState.loading = false;
    renderDocBody();
  }

  function renderDocs() {
    const notice = alertBox('accent', '活文档（随 zip 分发）', [
      '六篇 markdown 存放在插件包 ', code('assets/docs/'), '，经 ',
      code('/api/plugins/com.example.plugin-sdk/assets/docs/<file>'),
      ' 在线拉取渲染（页面内置轻量 markdown 渲染器：标题/段落/粗斜体/行内代码/代码块/列表/链接/表格/分隔线，',
      'DOM 构建，零依赖，XSS 安全）。文档只写一份，页面与仓库共用 —— 改文档 → 重新打包 → 刷新页面即可，无需重建前端。',
    ]);

    function docItem(d) {
      const btn = h('button', {
        class: 'tree-row is-file' + (d.id === docState.id ? ' is-selected' : ''),
        type: 'button',
        dataset: { doc: d.id },
      },
        h('span', { class: 'tree-icon' }, icon('code')),
        h('span', { class: 'tree-label' }, code(d.id), ' ', d.label));
      btn.addEventListener('click', () => selectDoc(d.id));
      docEls.btns.set(d.id, btn);
      return h('div', { class: 'tree-item' }, btn);
    }

    const side = h('div', { class: 'docs-side' },
      h('div', { class: 'tree' },
        h('div', { class: 'tree-item' },
          h('div', { class: 'tree-row is-folder is-open' },
            h('span', { class: 'tree-icon' }, icon('folder')),
            h('span', { class: 'tree-label', text: 'assets/' })),
          h('div', { class: 'tree-children' },
            h('div', { class: 'tree-item' },
              h('div', { class: 'tree-row is-folder is-open' },
                h('span', { class: 'tree-icon' }, icon('folder')),
                h('span', { class: 'tree-label', text: 'docs/' })),
              h('div', { class: 'tree-children' }, DOC_FILES.map(docItem)))))));

    docEls.header = h('h3', { class: 'docs-title' });
    docEls.source = h('p', { class: 'docs-source' });
    docEls.body = h('div', { class: 'docs-body' });
    const main = h('div', { class: 'docs-main' }, docEls.header, docEls.source, docEls.body);

    const layout = h('div', { class: 'docs-layout' }, side, main);

    selectDoc(docState.id);
    return h('div', { class: 'space-y' }, notice, layout);
  }

  /* ================= Agent 端页签 ================= */

  function renderAgent() {
    const state = { cap: 'whoami', command: '', running: false, result: null, err: null, events: [] };
    let liveKey = '';

    /* 能力列表 */
    const capList = h('div', { class: 'card' },
      h('h3', { class: 'card-title', text: '能力与可选项（capability）' }),
      h('div', { class: 'divide' },
        AGENT_CAPS.map((c) =>
          h('div', { class: 'divide-row' },
            h('code', { class: 'mono w-40', text: c.label + (c.needsCommand ? '(command)' : '') }),
            h('span', { class: 'text-2', text: c.desc })))));

    /* 实时执行 */
    const agentChip = h('span', { class: 'chip chip-secondary' });
    const errEl = h('p', { class: 'text-danger is-hidden' });
    const resultWrap = h('div', { class: 'is-hidden' });
    const resultPre = h('pre', { class: 'pre-dark' });
    resultWrap.append(
      h('div', { class: 'text-3', text: 'dispatchTask 返回（result）' }),
      resultPre);

    const eventsCount = h('span', { class: 'text-3' });
    const eventsEmpty = h('p', { class: 'text-2', text: '暂无推送 —— 执行上面的能力后，Agent 的结果会实时出现在这里。' });
    const eventsList = h('div', { class: 'events' });

    function updateEvents() {
      eventsCount.textContent = `（subscribeOutput，共 ${state.events.length} 条 · 无需手动刷新）`;
      eventsEmpty.classList.toggle('is-hidden', state.events.length > 0);
      eventsList.replaceChildren();
      state.events.forEach((ev) => {
        const dataStr = pretty(ev.data);
        eventsList.append(h('div', { class: 'event' },
          h('span', { class: 'event-time', text: timeStr(ev.ts) }),
          chip(ev.action || '(untagged)', 'secondary'),
          h('span', { class: 'event-agent mono', text: String(ev.agentId).slice(0, 8) }),
          h('span', { class: 'event-data mono', text: truncate(dataStr, 220) })));
      });
    }

    /* capability 下拉选择 */
    const selectWrap = h('div', { class: 'select' });
    const selectValue = h('span', { class: 'select-value' });
    const selectTrigger = h('button', { class: 'select-trigger', type: 'button' },
      selectValue, icon('chevron', 'select-caret'));
    const selectPop = h('div', { class: 'select-popover is-hidden' });

    function capLabel(c) { return c.label + (c.needsCommand ? ' (command)' : ''); }

    AGENT_CAPS.forEach((c) => {
      const item = h('button', {
        class: 'select-item',
        type: 'button',
        dataset: { value: c.value },
      },
        h('span', { class: 'select-item-label mono', text: c.label }),
        h('span', { class: 'select-item-desc', text: c.desc }));
      item.addEventListener('click', () => {
        state.cap = c.value;
        selectValue.textContent = capLabel(c);
        selectPop.classList.add('is-hidden');
        selectWrap.classList.remove('is-open');
        updateControls();
      });
      selectPop.append(item);
    });

    selectTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = selectPop.classList.toggle('is-hidden');
      selectWrap.classList.toggle('is-open', !willOpen);
      if (!willOpen) {
        selectPop.querySelectorAll('.select-item').forEach((it) =>
          it.classList.toggle('is-selected', it.dataset.value === state.cap));
      }
    });
    document.addEventListener('click', (e) => {
      if (!selectWrap.contains(e.target)) {
        selectPop.classList.add('is-hidden');
        selectWrap.classList.remove('is-open');
      }
    });

    /* command 输入（shell 能力时显示） */
    const commandWrap = h('div', { class: 'field is-hidden' },
      h('span', { class: 'field-label', text: 'command' }),
      h('input', {
        class: 'input', type: 'text', placeholder: '要执行的命令（如 whoami）',
        onInput: (e) => { state.command = e.target.value; },
      }));

    const runBtn = h('button', { class: 'btn btn-primary', type: 'button', text: '执行' });
    const spinnerEl = h('span', { class: 'spinner is-hidden' });

    function updateControls() {
      const agent = host ? host.selectedAgent : null;
      agentChip.className = 'chip ' + (agent ? 'chip-success' : 'chip-warning');
      agentChip.textContent = agent ? `${agent.hostname} (${agent.ipAddress})` : '请先在顶部选择设备';
      runBtn.disabled = !agent || state.running;
      spinnerEl.classList.toggle('is-hidden', !state.running);
      commandWrap.classList.toggle('is-hidden', state.cap !== 'shell');
      errEl.classList.toggle('is-hidden', !state.err);
      errEl.textContent = state.err || '';
      resultWrap.classList.toggle('is-hidden', state.result === null);
      if (state.result !== null) resultPre.textContent = pretty(state.result);
    }

    async function runCap() {
      if (!host || !host.selectedAgent) return;
      state.running = true;
      state.err = null;
      state.result = null;
      updateControls();
      try {
        const isShell = state.cap === 'shell';
        // pluginId 省略：桥自动取当前插件
        const res = await host.dispatchTask(undefined,
          isShell ? 'shell' : 'showcase',
          isShell ? { command: state.command || 'echo hello' } : { capability: state.cap });
        state.result = res.result ?? null;
      } catch (e) {
        state.err = e instanceof Error ? e.message : String(e);
      }
      state.running = false;
      updateControls();
    }
    runBtn.addEventListener('click', runCap);

    if (host) {
      host.subscribeOutput((out) => {
        state.events = [out, ...state.events].slice(0, 12);
        updateEvents();
      });
    }

    // 桥每 2s 同步选中设备，这里把 UI 也跟上去
    liveRefreshers.push(() => {
      const agent = host ? host.selectedAgent : null;
      const key = agent ? agent.id : '';
      if (key !== liveKey) { liveKey = key; updateControls(); }
    });

    selectValue.textContent = capLabel(AGENT_CAPS[0]);
    updateEvents();
    updateControls();

    const execCard = h('div', { class: 'card' },
      h('h3', { class: 'card-title', text: '实时执行（dispatchTask → Agent 内存执行 JS → WS 推送）' }),
      h('p', { class: 'text-2' },
        '目标设备：', agentChip,
        ' · 选择 capability（可选项），点执行；结果与 WS 推送都在下方。'),
      h('div', { class: 'controls' },
        h('div', { class: 'field' },
          h('span', { class: 'field-label', text: 'capability' }),
          selectWrap),
        commandWrap,
        h('div', { class: 'controls' },
          runBtn,
          spinnerEl)),
      errEl,
      resultWrap,
      h('div', { class: 'mt-14' },
        h('div', { class: 'text-3', style: { marginBottom: '4px' } },
          'WebSocket 实时推送', eventsCount),
        eventsEmpty,
        eventsList));

    /* API 表 */
    function apiTable(title, rows) {
      return h('div', { class: 'card' },
        h('h3', { class: 'card-title', text: title }),
        h('div', { class: 'divide' },
          rows.map(([sig, desc]) =>
            h('div', { class: 'divide-row' },
              h('code', { class: 'mono', text: sig }),
              h('span', { class: 'text-2', text: desc })))));
    }

    /* 跨平台写法 */
    const platformSample = `function main(args) {
    if (args.capability === "network") {
        var net;
        if (__platform() === "windows") {
            net = ipconfig();
        } else if (__platform() === "linux") {
            net = ip_route() + "\\n" + dns();
        } else {
            net = "unsupported platform";
        }
        return { "network": net };
    }
    return { "ok": true };
}`;

    const platformCard = h('div', { class: 'card' },
      h('h3', { class: 'card-title', text: '跨平台写法（__platform 运行时分支）' }),
      h('p', { class: 'text-2', style: { marginBottom: '8px' } },
        '平台 API 按运行平台注册：Windows 上调用 shell() 会得到 "not a function" 错误，反之亦然。',
        '跨平台脚本用 __platform() 运行时分支（不需要 #if 预处理）。'),
      h('pre', { class: 'pre-sample mono', text: platformSample }));

    return h('div', { class: 'space-y' },
      capList,
      execCard,
      apiTable('通用 API（所有平台）', COMMON_API),
      h('div', { class: 'grid-2' },
        apiTable('Windows 专属', WINDOWS_API),
        apiTable('Linux 专属', LINUX_API)),
      platformCard);
  }

  /* ================= 服务端脚本页签 ================= */

  function renderService() {
    const state = {
      manifest: null,
      manifestErr: null,
      busy: false,
      modal: null,
      list: null,
      listErr: null,
      echoText: 'hello sdk',
      echoCount: '3',
      nowFormat: 'yyyy-MM-dd HH:mm:ss',
      nowUtc: false,
      skey: 'abcdef0123456789',
      httpUrl: 'https://api.ipify.org?format=json',
      httpMethod: 'GET',
      httpHeaders: '{"X-Demo": "plugin-sdk"}',
      httpBody: '',
      httpTimeout: '15',
      fileName: 'meta.json',
      listCount: '5',
      listPrefix: 'item',
      tableRows: '3',
      tablePrefix: 'sdk',
      failMsg: 'demo failure',
    };

    const notice = alertBox('accent', '如何驱动 service/*.cs（多文件拼接编译）', [
      'POST /api/plugin/<pluginId>/<fn>，body 任意 JSON 会变成脚本函数的 p（dynamic）；',
      '返回 ', code('{ ok:true, data }'), '；脚本抛异常返回 ', code('{ ok:false, error }'),
      '。宿主把 service/ 下所有 .cs 按文件名排序拼接为单个脚本编译，文件变更自动失效。',
      '函数是同步签名，内部可用 .GetAwaiter().GetResult() 等待异步（如 HttpClient）。',
    ]);

    /* ---------- manifest 目录 ---------- */
    const busySpinner = h('span', { class: 'spinner is-hidden' });
    const callCountChip = h('span', { class: 'chip chip-secondary is-hidden' });
    const manifestErrEl = h('p', { class: 'text-danger is-hidden' });
    const manifestBody = h('div');

    function renderManifest() {
      manifestBody.replaceChildren();
      if (state.manifestErr) {
        manifestErrEl.classList.remove('is-hidden');
        manifestErrEl.textContent = state.manifestErr + '（服务端可能未重启/未启用插件）';
        return;
      }
      if (!state.manifest) {
        manifestBody.append(
          h('div', { class: 'skeleton', style: { height: '34px' } }),
          h('div', { class: 'skeleton', style: { height: '34px' } }),
          h('div', { class: 'skeleton', style: { height: '34px' } }));
        return;
      }
      callCountChip.classList.remove('is-hidden');
      callCountChip.textContent = `已调用 ${state.manifest.callCount} 次`;

      const table = h('table', { class: 'table' });
      const thead = h('thead');
      const trh = h('tr');
      ['函数', '说明', '可选项（参数）'].forEach((t) => trh.append(h('th', { text: t })));
      thead.append(trh);
      const tbody = h('tbody');
      (state.manifest.funcs || []).forEach((f) => {
        const tr = h('tr');
        tr.append(h('td', {}, h('code', { class: 'mono', text: f.name })));
        tr.append(h('td', { class: 'text-2', text: f.desc }));
        const optsTd = h('td', { class: 'text-2' });
        if (!f.options || f.options.length === 0) {
          optsTd.append(h('span', { class: 'text-3', text: '无' }));
        } else {
          const wrap = h('div', { class: 'chip-row' });
          f.options.forEach((o) => {
            const label = o.optional
              ? (o.default ? `${o.name}=${o.default}` : `${o.name}?`)
              : `${o.name}*`;
            wrap.append(chip(label, o.optional ? 'soft' : 'secondary'));
          });
          optsTd.append(wrap);
        }
        tr.append(optsTd);
        tbody.append(tr);
      });
      table.append(thead, tbody);
      manifestBody.append(h('div', { class: 'table-scroll' }, table));
    }

    /* ---------- 函数演练 ---------- */
    function textInput(value, placeholder, onInput) {
      const input = h('input', { class: 'input', type: 'text', placeholder, value });
      input.addEventListener('input', () => onInput(input.value));
      return input;
    }
    function field(labelText, input) {
      return h('label', { class: 'field' },
        h('span', { class: 'field-label', text: labelText }), input);
    }
    function tool(title, desc, fieldsNodes, runFn) {
      const details = h('details', { class: 'tool' });
      const summary = h('summary', { class: 'tool-summary' },
        h('span', { class: 'tool-title', text: title }),
        h('span', { class: 'tool-desc text-2', text: desc }),
        icon('chevron', 'tool-caret'));
      const runBtn = h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: '执行' });
      runBtn.addEventListener('click', async () => { await runFn(); });
      const body = h('div', { class: 'tool-body' },
        h('div', { class: 'tool-fields' }, fieldsNodes || null),
        runBtn);
      details.append(summary, body);
      return details;
    }

    async function run(fn, title, params) {
      state.busy = true;
      busySpinner.classList.remove('is-hidden');
      try {
        const res = await callScript(fn, params);
        openModal({ title: `${fn} — ${title}`, ok: res.ok, data: res.data, error: res.error });
      } catch (e) {
        openModal({ title, ok: false, data: null, error: e instanceof Error ? e.message : String(e) });
      } finally {
        state.busy = false;
        busySpinner.classList.add('is-hidden');
      }
    }

    const echoTextInput = textInput(state.echoText, 'text', (v) => { state.echoText = v; });
    const echoCountInput = textInput(state.echoCount, 'count', (v) => { state.echoCount = v; });

    const nowFormatInput = textInput(state.nowFormat, 'format', (v) => { state.nowFormat = v; });
    const utcSwitch = h('label', { class: 'switch' },
      h('input', { type: 'checkbox' }),
      h('span', { class: 'switch-track' }),
      h('span', { class: 'switch-label', text: 'UTC' }));
    utcSwitch.querySelector('input').addEventListener('change', (e) => { state.nowUtc = e.target.checked; });

    const skeyInput = textInput(state.skey, 'skey', (v) => { state.skey = v; });

    const httpUrlInput = textInput(state.httpUrl, 'url', (v) => { state.httpUrl = v; });
    const httpMethodInput = textInput(state.httpMethod, 'method', (v) => { state.httpMethod = v; });
    const httpTimeoutInput = textInput(state.httpTimeout, 'timeoutSec', (v) => { state.httpTimeout = v; });
    const httpHeadersArea = h('textarea', {
      class: 'input', rows: 2, placeholder: 'headers JSON，如 {"X-Demo":"1"}',
      value: state.httpHeaders, onInput: (e) => { state.httpHeaders = e.target.value; },
    });
    const httpBodyArea = h('textarea', {
      class: 'input', rows: 2, placeholder: 'body JSON（POST/PUT 时发送）',
      value: state.httpBody, onInput: (e) => { state.httpBody = e.target.value; },
    });

    const fileNameInput = textInput(state.fileName, '包内相对路径', (v) => { state.fileName = v; });

    const listCountInput = textInput(state.listCount, 'count', (v) => { state.listCount = v; });
    const listPrefixInput = textInput(state.listPrefix, 'prefix', (v) => { state.listPrefix = v; });

    const tableRowsInput = textInput(state.tableRows, 'rows', (v) => { state.tableRows = v; });
    const tablePrefixInput = textInput(state.tablePrefix, 'prefix', (v) => { state.tablePrefix = v; });

    const failMsgInput = textInput(state.failMsg, 'message', (v) => { state.failMsg = v; });

    const tools = h('div', { class: 'card' },
      h('h3', { class: 'card-title', text: '逐个函数演练（每个函数 = 一个能力点）' }),
      tool('echo — 动态参数访问', 'body 任意字段以 p.字段 读取，支持嵌套',
        [field('text', echoTextInput), field('count', echoCountInput)],
        () => run('echo', '参数原样回显', {
          text: state.echoText,
          count: Number(state.echoCount) || 0,
          nested: { deep: [1, 2, 3], ok: true },
        })),
      tool('now — 时间格式化', '可选项 format / utc',
        [field('format', nowFormatInput), utchWrap()],
        () => run('now', '时间格式化', { format: state.nowFormat, utc: state.nowUtc ? 1 : 0 })),
      tool('bkn — 签名计算', '纯数学计算（bkn/g_tk 算法），可选项 skey',
        [field('skey', skeyInput)],
        () => run('bkn', 'bkn 计算', { skey: state.skey })),
      tool('state — 跨调用内存状态', '静态字段随脚本编译缓存保留（服务重启清零）',
        null,
        () => run('state', '状态演示', {})),
      tool('ip — 服务端网络请求', 'GET 外网 IP（服务端发起，无 CORS）',
        null,
        () => run('ip', '外网 IP', {})),
      tool('http — 通用 HTTP 请求', '可选项 url / method / headers / body / timeoutSec',
        [
          h('div', { class: 'tool-fields-inline' },
            field('url', httpUrlInput),
            field('method', httpMethodInput),
            field('timeoutSec', httpTimeoutInput)),
          h('div', { class: 'tool-fields-inline' },
            field('headers', httpHeadersArea),
            field('body', httpBodyArea)),
        ],
        () => {
          let headers;
          let body;
          try { headers = state.httpHeaders.trim() ? JSON.parse(state.httpHeaders) : undefined; } catch { headers = undefined; }
          try { body = state.httpBody.trim() ? JSON.parse(state.httpBody) : undefined; } catch { body = state.httpBody; }
          return run('http', 'HTTP 请求', {
            url: state.httpUrl,
            method: state.httpMethod,
            headers,
            body,
            timeoutSec: Number(state.httpTimeout) || 15,
          });
        }),
      tool('file — 读取包内文件', '数据/配置随 zip 分发，脚本按插件目录定位',
        [field('name', fileNameInput)],
        () => run('file', '包内文件', { name: state.fileName })),
      tool('list — 返回数组', '可选项 count / prefix',
        [field('count', listCountInput), field('prefix', listPrefixInput)],
        () => run('list', '数组返回', { count: Number(state.listCount) || 5, prefix: state.listPrefix })),
      tool('table — 返回对象数组', '前端 Table 直接渲染，可选项 rows / prefix',
        [field('rows', tableRowsInput), field('prefix', tablePrefixInput)],
        () => run('table', '表格数据', { rows: Number(state.tableRows) || 3, prefix: state.tablePrefix })),
      tool('fail — 抛异常（错误契约）', '宿主统一转 { ok:false, error }',
        [field('message', failMsgInput)],
        () => run('fail', '错误契约', { message: state.failMsg })));

    function utchWrap() {
      return h('div', { class: 'field' },
        h('span', { class: 'field-label', text: 'utc' }),
        utcSwitch);
    }

    /* ---------- 插件脚本列表 ---------- */
    const listErrEl = h('p', { class: 'text-danger is-hidden' });
    const listBody = h('div');
    const loadListBtn = h('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '加载' });

    function renderList() {
      listBody.replaceChildren();
      if (!state.list) return;
      if (state.list.length === 0) {
        listBody.append(h('p', { class: 'text-2', text: '没有插件带 service/*.cs。' }));
        return;
      }
      state.list.forEach((p) => {
        listBody.append(h('div', { class: 'divide-row' },
          h('code', { class: 'mono', text: p.pluginId }),
          h('span', { class: 'chip-row' }, (p.functions || []).map((f) => chip(f, 'soft')))));
      });
    }

    async function loadList() {
      state.listErr = null;
      listErrEl.classList.add('is-hidden');
      try {
        const res = await bridge.api.get('/plugin/list');
        state.list = res.plugins;
      } catch (e) {
        state.listErr = e instanceof Error ? e.message : String(e);
        listErrEl.classList.remove('is-hidden');
        listErrEl.textContent = state.listErr;
      }
      renderList();
    }
    loadListBtn.addEventListener('click', () => {
      if (!bridge) {
        listErrEl.classList.remove('is-hidden');
        listErrEl.textContent = '桥 SDK 未加载';
        return;
      }
      loadList();
    });

    const listCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h3', { class: 'card-title', text: 'GET /api/plugin/list — 已导入且含 service/*.cs 的插件' }),
        loadListBtn),
      listErrEl,
      h('div', { class: 'divide' }, listBody));

    /* ---------- 组装 ---------- */
    const manifestCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h3', { class: 'card-title', text: '服务端函数目录（manifest 实时拉取）' }),
        busySpinner,
        callCountChip),
      manifestErrEl,
      manifestBody);

    // 初始拉取 manifest
    callScript('manifest').then((res) => {
      if (res.ok) state.manifest = tryParse(res.data);
      else state.manifestErr = res.error ?? 'manifest 拉取失败';
      renderManifest();
    }).catch((e) => {
      state.manifestErr = e instanceof Error ? e.message : String(e);
      renderManifest();
    });

    return h('div', { class: 'space-y' },
      notice,
      manifestCard,
      tools,
      listCard);
  }

  /* ================= 前端 API 页签 ================= */

  function renderFrontend() {
    const HOST_API = [
      { member: 'selectedAgent', desc: '当前选中的设备（与控制台顶部选择器共享）', sample: 'selectedAgent?.hostname' },
      { member: 'selectAgent(id)', desc: '切换选中设备（与主控制台联动）', sample: 'selectAgent(agentId)' },
      { member: 'dispatchTask(pluginId?, action, args?, agentId?)', desc: '调用插件操作 → Agent 内存执行模块（pluginId 可省略，桥自动取当前插件）', sample: "dispatchTask('showcase', { capability: 'fs' })" },
      { member: 'subscribeOutput(cb, action?)', desc: '订阅 WS 实时推送（可选按 action 过滤），返回退订函数', sample: "subscribeOutput(o => setX(o.data), 'showcase')" },
      { member: 'lastOutput', desc: '最近一条 plugin.result 推送（便捷读取）', sample: 'lastOutput?.data' },
    ];
    const CLIENT_API = [
      { member: 'api.get(path)', desc: 'GET，自动带 JWT', sample: "api.get('/plugins/manager')" },
      { member: 'api.post(path, body?)', desc: 'POST JSON', sample: "api.post('/plugin/com.example.plugin-sdk/echo', { text: 'hi' })" },
      { member: 'api.put(path, body?)', desc: 'PUT JSON', sample: "api.put('/plugins/manager/<id>', { meta })" },
      { member: 'api.delete(path)', desc: 'DELETE', sample: "api.delete('/plugins/manager/<id>')" },
      { member: 'getApiOrigin()', desc: '后端地址（iframe 与后端同源，location.origin）', sample: 'getApiOrigin()' },
    ];
    const RESOURCE_API = [
      { member: 'GET /api/plugins/<id>/assets/<file>', desc: '包内静态资源（图标/图片/markdown），匿名可访问', sample: "fetch(`${getApiOrigin()}/api/plugins/com.example.plugin-sdk/assets/docs/01-overview.md`)" },
    ];

    function apiMember(member, desc, sample) {
      const row = h('div', { class: 'api-row' },
        h('code', { class: 'mono', text: member }),
        h('p', { class: 'text-2', text: desc }));
      if (sample) row.append(h('pre', { class: 'pre-sample mono', text: sample }));
      return row;
    }

    /* 实时状态 */
    const agentChip = h('span', { class: 'chip chip-secondary' });
    const lastOutputChip = h('span', { class: 'chip chip-soft is-hidden' });
    let liveKey = '';
    let loKey = 0;
    function updateLive() {
      const agent = host ? host.selectedAgent : null;
      const key = agent ? agent.id : '';
      if (key !== liveKey) {
        liveKey = key;
        agentChip.className = 'chip ' + (agent ? 'chip-success' : 'chip-warning');
        agentChip.textContent = agent ? `${agent.hostname} (${agent.ipAddress})` : '未选择设备';
      }
      const lo = host ? host.lastOutput : null;
      const k2 = lo ? lo.ts : 0;
      if (k2 !== loKey) {
        loKey = k2;
        if (lo) {
          lastOutputChip.classList.remove('is-hidden');
          lastOutputChip.textContent = 'lastOutput: ' + truncate(pretty(lo.data), 60);
        } else {
          lastOutputChip.classList.add('is-hidden');
        }
      }
    }
    liveRefreshers.push(updateLive);
    updateLive();

    /* 插件管理 */
    const pluginsErrEl = h('p', { class: 'text-danger is-hidden' });
    const pluginsBody = h('div');
    const pluginsState = { plugins: null, err: null };
    const loadPluginsBtn = h('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '加载已装插件' });

    function renderPlugins() {
      pluginsBody.replaceChildren();
      if (!pluginsState.plugins) return;
      if (pluginsState.plugins.length === 0) {
        pluginsBody.append(h('p', { class: 'text-2', text: '暂无插件。' }));
        return;
      }
      const table = h('table', { class: 'table' });
      const thead = h('thead');
      const trh = h('tr');
      ['pluginId', '名称', '版本', '状态'].forEach((t) => trh.append(h('th', { text: t })));
      thead.append(trh);
      const tbody = h('tbody');
      pluginsState.plugins.forEach((p) => {
        const tr = h('tr');
        tr.append(h('td', {}, h('code', { class: 'mono', text: p.pluginId })));
        tr.append(h('td', { class: 'text-2', text: p.name }));
        tr.append(h('td', {}, h('code', { class: 'mono', text: p.version })));
        tr.append(h('td', {}, chip(p.enabled ? 'enabled' : 'disabled', p.enabled ? 'success' : 'danger-soft')));
        tbody.append(tr);
      });
      table.append(thead, tbody);
      pluginsBody.append(h('div', { class: 'table-scroll' }, table));
    }

    async function loadPlugins() {
      pluginsState.err = null;
      pluginsErrEl.classList.add('is-hidden');
      try {
        pluginsState.plugins = await bridge.api.get('/plugins/manager');
      } catch (e) {
        pluginsState.err = e instanceof Error ? e.message : String(e);
        pluginsErrEl.classList.remove('is-hidden');
        pluginsErrEl.textContent = pluginsState.err;
      }
      renderPlugins();
    }
    loadPluginsBtn.addEventListener('click', () => {
      if (!bridge) {
        pluginsErrEl.classList.remove('is-hidden');
        pluginsErrEl.textContent = '桥 SDK 未加载';
        return;
      }
      loadPlugins();
    });

    const hostCard = h('div', { class: 'card' },
      h('h3', { class: 'card-title', text: 'usePluginHost() — 页面宿主 API' }),
      h('div', { class: 'divide' }, HOST_API.map((x) => apiMember(x.member, x.desc, x.sample))),
      h('div', { class: 'status-row mt-14' },
        h('span', { class: 'text-2', text: '当前状态：' }),
        agentChip,
        lastOutputChip));

    const clientCard = h('div', { class: 'card' },
      h('h3', { class: 'card-title', text: 'api client（自动带 JWT，出错抛异常）' }),
      h('div', { class: 'divide' }, CLIENT_API.map((x) => apiMember(x.member, x.desc))),
      h('p', { class: 'text-3', style: { marginTop: '8px' } },
        '当前后端地址：', code(API_ORIGIN)));

    const resourceCard = h('div', { class: 'card' },
      h('h3', { class: 'card-title', text: '包内资源端点（assets 动态加载）' }),
      h('div', { class: 'divide' }, RESOURCE_API.map((x) => apiMember(x.member, x.desc, x.sample))),
      h('p', { class: 'text-3', style: { marginTop: '8px' } },
        '图标/图片：', code("<img src='.../assets/icons/foo.svg' />"),
        '（参见 com.libra.aitoken 的 assets 用法）；活文档：fetch + 轻量 markdown 渲染（本页「文档」页签即此模式）。'));

    const pluginsCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h3', { class: 'card-title', text: '插件管理 API（listPlugins / toggle / update / delete）' }),
        loadPluginsBtn),
      pluginsErrEl,
      pluginsBody,
      h('p', { class: 'text-3', style: { marginTop: '8px' } },
        '变更类操作示例（本页不实际执行）：togglePlugin(id, enabled) · updatePlugin(id, meta) · ',
        'deletePlugin(id) · importPlugin(file, enable) · importPluginFromGit(gitUrl, enable)'));

    return h('div', { class: 'space-y' }, hostCard, clientCard, resourceCard, pluginsCard);
  }

  /* ================= 初始化 ================= */

  const TABS = {
    overview: renderOverview,
    docs: renderDocs,
    agent: renderAgent,
    service: renderService,
    frontend: renderFrontend,
  };

  function activateTab(id) {
    document.querySelectorAll('.tab').forEach((b) => {
      const active = b.dataset.tab === id;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const panel = document.getElementById('panel-' + id);
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('is-active', p === panel));
    if (!panel.dataset.rendered) {
      panel.append(TABS[id]());
      panel.dataset.rendered = '1';
    }
  }

  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  // 桥每 2s 同步 host.selectedAgent / lastOutput，UI 随之刷新
  setInterval(refreshLive, 2000);

  if (!bridge) {
    const panel = document.getElementById('panel-overview');
    panel.append(h('div', { class: 'alert alert-danger' },
      h('div', { class: 'alert-title', text: '桥 SDK 未加载' }),
      h('div', { class: 'alert-desc', text: '请通过控制台 /api/plugins/<id>/page/index.html 访问本页（依赖 page/_bridge.js）。' })));
  }

  activateTab('overview');
})();
