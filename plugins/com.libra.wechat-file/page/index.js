'use strict';

/**
 * 微信文件插件页面（com.libra.wechat-file）—— 纯原生 JS 实现。
 *
 * 数据流（与旧 TSX 版等价）：
 *   1. dispatchTask(PLUGIN_ID, 'collect', {}) → Agent 端 native 模块扫描
 *      wxid_* 账号，返回 { accounts: [{ wxid, path, fileDirs }] }。
 *   2. 目录展开：LibraPluginHost.api.post('/files/<agentId>/list', ...)。
 *   3. 文件详情 + 下载：下载端点返回二进制且需要 JWT，iframe 内 fetch 无法
 *      携带父窗口 token，因此先经桥调用 /files/<agentId>/read（返回
 *      base64 content），再在页面内解码为 Blob 触发保存。
 */
(function () {
  const PLUGIN_ID = 'com.libra.wechat-file';

  const app = document.getElementById('app');
  const modalEl = document.getElementById('modal');
  const modalContent = document.getElementById('modal-content');
  const toastEl = document.getElementById('toast');
  const host = LibraPluginHost.usePluginHost();

  let accounts = [];
  let loading = true;
  let openDirs = Object.create(null); // dirPath -> FileEntry[]
  let loadingDir = null;
  let selectedFile = null;
  let currentAgentId = null;
  let toastTimer = null;

  const ICONS = {
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    picture: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 15l-5-5L5 21"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M22 8l-6 4 6 4V8z"/></svg>',
    music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-2-4H5L3 8v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/><path d="M3 8h18"/><path d="M10 12h4"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><text x="12" y="16" text-anchor="middle" font-size="8" font-weight="700" fill="currentColor" stroke="none">P</text></svg>',
    word: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><text x="12" y="16" text-anchor="middle" font-size="8" font-weight="700" fill="currentColor" stroke="none">W</text></svg>',
    excel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><text x="12" y="16" text-anchor="middle" font-size="8" font-weight="700" fill="currentColor" stroke="none">X</text></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M10 12l-2 2 2 2M14 12l2 2-2 2"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>'
  };

  // ── 工具函数 ──────────────────────────────────────────────────────────

  /** 插件结果可能是 JSON 字符串（服务端透传）或已是对象，统一解析。 */
  function parseResult(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch (_) { /* 非 JSON */ }
    }
    return null;
  }

  function fileIconName(entry) {
    if (entry.type === 'dir') return 'folder';
    const ext = String(entry.name || '').split('.').pop().toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'bmp', 'webp', 'ico'].includes(ext)) return 'picture';
    if (['mp4', 'avi', 'mkv', 'mov', 'webm', 'wmv', 'flv'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) return 'music';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return 'archive';
    if (['pdf'].includes(ext)) return 'pdf';
    if (['doc', 'docx'].includes(ext)) return 'word';
    if (['xls', 'xlsx'].includes(ext)) return 'excel';
    if (['txt', 'md', 'log', 'cfg', 'ini'].includes(ext)) return 'text';
    if (['js', 'ts', 'tsx', 'py', 'cs', 'json', 'xml', 'html', 'css', 'sh', 'bat', 'ps1', 'sql'].includes(ext)) return 'code';
    return 'file';
  }

  function formatSize(bytes) {
    const n = Number(bytes) || 0;
    if (n <= 0) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GB';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + ' KB';
    return n + ' B';
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function iconSpan(name, extraClass) {
    const span = document.createElement('span');
    span.className = 'icon' + (extraClass ? ' ' + extraClass : '');
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = ICONS[name] || ICONS.file;
    return span;
  }

  function showToast(message, isError) {
    toastEl.textContent = message;
    toastEl.classList.toggle('error', Boolean(isError));
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 3000);
  }

  function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function triggerBlobDownload(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  // ── 数据操作 ──────────────────────────────────────────────────────────

  async function fetchAccounts() {
    if (!host.selectedAgent) return;
    loading = true;
    render();
    try {
      const res = await host.dispatchTask(PLUGIN_ID, 'collect', {});
      const parsed = parseResult(res && res.result);
      if (parsed && parsed.error) {
        console.warn('wechat-file collect returned error:', parsed.error);
        accounts = [];
      } else {
        accounts = parsed && Array.isArray(parsed.accounts) ? parsed.accounts : [];
      }
    } catch (e) {
      console.warn('wechat-file collect failed:', e);
      accounts = [];
    } finally {
      loading = false;
      render();
    }
  }

  async function toggleDir(dirPath) {
    // 已加载过：折叠（等价 TSX：从 openDirs 删除）。
    if (openDirs[dirPath]) {
      delete openDirs[dirPath];
      render();
      return;
    }

    const agent = host.selectedAgent;
    if (!agent) {
      loadingDir = null;
      render();
      return;
    }

    loadingDir = dirPath;
    render();
    try {
      const res = await LibraPluginHost.api.post(
        '/files/' + encodeURIComponent(agent.id) + '/list',
        { path: dirPath, offset: 0, limit: 200 }
      );
      openDirs[dirPath] = res && Array.isArray(res.entries) ? res.entries : [];
    } catch (e) {
      // 与 TSX 一致：展开失败保持折叠，仅控制台告警。
      console.warn('wechat-file list failed:', e);
    } finally {
      loadingDir = null;
      render();
    }
  }

  /**
   * 下载文件：后端 download 端点为二进制流且要求 JWT，iframe 内 fetch
   * 无法携带父窗口 token；这里经桥调用 read 端点拿 base64 内容再生成
   * Blob 触发浏览器保存。
   */
  async function downloadFile(agentId, filePath) {
    const res = await LibraPluginHost.api.post(
      '/files/' + encodeURIComponent(agentId) + '/read',
      { path: filePath }
    );
    if (!res || typeof res.content !== 'string') {
      throw new Error((res && res.error) || '服务端未返回文件内容');
    }
    const bytes = base64ToBytes(res.content);
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const fileName = filePath.split(/[\\/]/).pop() || 'download';
    triggerBlobDownload(blob, fileName);
  }

  // ── 渲染 ──────────────────────────────────────────────────────────────

  function render() {
    app.replaceChildren();

    if (loading) {
      app.appendChild(el('div', 'page-state', '加载微信账号中...'));
      return;
    }
    if (accounts.length === 0) {
      app.appendChild(el('div', 'page-state', '未发现任何账号。'));
      return;
    }

    const page = el('div', 'page');

    const toolbar = el('div', 'toolbar');
    const refreshBtn = el('button', 'btn btn-ghost btn-sm', '刷新');
    refreshBtn.type = 'button';
    refreshBtn.addEventListener('click', fetchAccounts);
    toolbar.appendChild(refreshBtn);
    page.appendChild(toolbar);

    accounts.forEach(function (acc) {
      const card = el('section', 'card');

      const head = el('div', 'card-head');
      head.appendChild(el('span', 'wxid', acc.wxid));
      head.appendChild(el('span', 'chip', acc.path));
      card.appendChild(head);

      const fileDirs = Array.isArray(acc.fileDirs) ? acc.fileDirs : [];
      card.appendChild(el('div', 'section-label', '月份文件夹 (' + fileDirs.length + ')'));

      if (fileDirs.length === 0) {
        card.appendChild(el('div', 'empty-text', '该文件夹内无文件。'));
      } else {
        const monthList = el('div', 'month-list');
        fileDirs.forEach(function (m) {
          const dirPath = acc.path + '\\msg\\file\\' + m;
          const files = openDirs[dirPath];
          const open = Boolean(files) || loadingDir === dirPath;

          const row = el('div', 'month-row');
          const toggle = el('button', 'month-toggle');
          toggle.type = 'button';
          toggle.appendChild(iconSpan('folder'));
          toggle.appendChild(el('span', 'month-name', m));

          const state = el('span', 'month-state');
          if (loadingDir === dirPath) {
            state.textContent = '...';
          } else {
            state.appendChild(iconSpan('chevron', open ? 'rotated' : ''));
          }
          toggle.appendChild(state);
          toggle.addEventListener('click', function () {
            toggleDir(dirPath);
          });
          row.appendChild(toggle);

          if (open) {
            const body = el('div', 'month-body');
            if (files) {
              if (files.length === 0) {
                body.appendChild(el('div', 'empty-text', '该文件夹内无文件。'));
              } else {
                const grid = el('div', 'file-grid');
                files.forEach(function (f) {
                  grid.appendChild(fileItem(f, dirPath));
                });
                body.appendChild(grid);
              }
            } else if (loadingDir === dirPath) {
              // 与 TSX 文案一致（原版此分支显示“加载微信账号中...”）。
              body.appendChild(el('div', 'empty-text', '加载微信账号中...'));
            }
            row.appendChild(body);
          }

          monthList.appendChild(row);
        });
        card.appendChild(monthList);
      }

      page.appendChild(card);
    });

    app.appendChild(page);
  }

  function fileItem(entry, dirPath) {
    const btn = el('button', 'file-item');
    btn.type = 'button';
    btn.appendChild(iconSpan(fileIconName(entry)));
    btn.appendChild(el('span', 'file-name', entry.name));
    if (entry.type === 'file') {
      btn.appendChild(el('span', 'file-size', formatSize(entry.size)));
    }
    btn.addEventListener('click', function () {
      openFileModal(entry, dirPath);
    });
    return btn;
  }

  // ── 文件详情弹窗 ──────────────────────────────────────────────────────

  function openFileModal(entry, dirPath) {
    selectedFile = { entry: entry, dirPath: dirPath };
    fillModal();
    modalEl.hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeModal() {
    modalEl.hidden = true;
    selectedFile = null;
    document.body.classList.remove('modal-open');
  }

  function infoRow(label, value, truncate) {
    const row = el('div', 'info-row');
    row.appendChild(el('span', 'info-label', label));
    const valueNode = el('span', 'info-value' + (truncate ? ' truncate' : ''), value == null ? '—' : String(value));
    if (truncate) valueNode.title = String(value);
    row.appendChild(valueNode);
    return row;
  }

  function fillModal() {
    if (!selectedFile) return;
    const entry = selectedFile.entry;
    const dirPath = selectedFile.dirPath;

    const extPart = entry.name.split('.').pop();
    const ext = extPart ? extPart.toUpperCase() : '—';
    const modified = entry.modified ? new Date(entry.modified).toLocaleString() : '—';

    modalContent.replaceChildren();

    const header = el('div', 'modal-header');
    const iconWrap = el('div', 'modal-icon');
    iconWrap.appendChild(iconSpan(fileIconName(entry), 'lg'));
    header.appendChild(iconWrap);
    const title = el('h2', 'modal-title', entry.name);
    title.id = 'modal-title';
    header.appendChild(title);
    modalContent.appendChild(header);

    const body = el('div', 'modal-body');
    body.appendChild(infoRow('类型', ext));
    body.appendChild(infoRow('大小', entry.type === 'dir' ? '—' : formatSize(entry.size)));
    body.appendChild(infoRow('修改时间', modified));
    body.appendChild(infoRow('路径', dirPath, true));
    modalContent.appendChild(body);

    const footer = el('div', 'modal-footer');
    const downloadBtn = el('button', 'btn btn-primary', '下载');
    downloadBtn.type = 'button';
    downloadBtn.appendChild(iconSpan('download'));
    downloadBtn.addEventListener('click', function () {
      handleDownload(entry, dirPath);
    });
    footer.appendChild(downloadBtn);
    modalContent.appendChild(footer);
  }

  async function handleDownload(entry, dirPath) {
    const agent = host.selectedAgent;
    const fullPath = dirPath + '\\' + entry.name;
    closeModal();
    if (!agent) {
      showToast('未选择设备', true);
      return;
    }
    try {
      await downloadFile(agent.id, fullPath);
      showToast('下载完成：' + entry.name);
    } catch (err) {
      showToast('下载失败：' + (err && err.message ? err.message : String(err)), true);
    }
  }

  // ── 初始化：设备联动 + 弹窗事件 ───────────────────────────────────────

  function checkSelectedAgent() {
    const id = host.selectedAgent ? host.selectedAgent.id : null;
    // 桥每 2s 同步一次宿主选中设备；页面轮询以复刻 TSX 的
    // useEffect(..., [selectedAgent]) 行为。
    if (id && id !== currentAgentId) {
      currentAgentId = id;
      fetchAccounts();
    }
  }

  function init() {
    const closeBtn = document.querySelector('.modal-close');
    if (closeBtn) closeBtn.innerHTML = ICONS.close;

    modalEl.addEventListener('click', function (e) {
      const target = e.target;
      if (target === modalEl.querySelector('.modal-backdrop') || (target && target.closest('.modal-close'))) {
        closeModal();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modalEl.hidden) closeModal();
    });

    // 初始即渲染“加载微信账号中...”（与 TSX 的 useState(true) 一致）。
    render();
    checkSelectedAgent();
    setInterval(checkSelectedAgent, 1000);
  }

  init();
})();
