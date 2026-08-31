# 总览：Libra 插件体系

本文是插件开发的总入口。完整目录：`assets/docs/`（随 zip 分发，前端「文档」页签在线渲染）。

| 文档 | 内容 |
|---|---|
| [01-overview.md](01-overview.md) | 本文件：架构 / 包目录 / 接入流程 |
| [02-plugin-contract.md](02-plugin-contract.md) | 插件契约 `meta.json`：全字段与可选项 |
| [03-agent-js-api.md](03-agent-js-api.md) | Agent 端 JS API（QuickJS 沙箱）全清单 + 示例 |
| [04-server-script.md](04-server-script.md) | 服务端脚本：多文件组织 / 函数契约 / 可选项 |
| [05-frontend-host.md](05-frontend-host.md) | 前端宿主：usePluginHost / api / 路由 / i18n |
| [06-pack-publish.md](06-pack-publish.md) | 打包发布：`npm run pack` / 插件市场 |

## 三层架构

```
┌──────────────┐   POST /api/plugin/<pluginId>/<fn>    ┌──────────────────┐
│  Libra-Console │ ────────────────────────────────────▶ │  Libra-Server     │
│  (React 前端)  │ ◀──────────────────────────────────── │  (ASP.NET Core)   │
└──────────────┘          {ok,data}/{ok,false,error}   │  ServerScriptService│
        │  dispatchTask(pluginId, action, args)          └──────────────────┘
        │  (插件动作网关 /api/plugins/<pluginId>/<action>)
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Libra-Agent (Rust) — 按需下载模块，内存执行                            │
│    script 通道：QuickJS 沙箱执行 module/*.js（本 Demo 用的通道）        │
│    native 通道：Rust cdylib（module/x64/xxx.dll 等，按平台目录分发）     │
└──────────────────────────────────────────────────────────────────────┘
```

- **Agent 端**：`module/` 目录。`script` 通道 = JS 源码随动作下发、Agent 内 QuickJS
  内存执行；`native` 通道 = 编译好的 cdylib 按平台目录分发、`ModuleManager`
  下载后内存加载。
- **服务端**：`service/` 目录。C# 脚本（Roslyn）随包分发，统一入口
  `POST /api/plugin/<pluginId>/<fn>`，body 任意 JSON 作为参数 `p`（dynamic）。
- **前端**：`page/index.tsx` 是源码分发（构建期 `import.meta.glob` 收集，需放入
  前端仓库并重建）。运行时页面可用 `usePluginHost()` 与宿主共享设备/任务/WS 推送。

## 插件包目录结构

```
my-plugin/
├── meta.json                # 插件契约（必需）
├── module/                  # Agent 端模块
│   ├── plugin_sdk.js        #   script 通道：JS 源码，QuickJS 内存执行
│   ├── x64/plugin.dll       #   native 通道：按平台目录放 cdylib
│   ├── x86/plugin.dll
│   └── linux-x64/plugin.so
├── service/                 # 服务端逻辑（C# 脚本，随包分发，多文件拼接编译）
│   ├── sdk_utils.cs         #   工具类/静态状态（按文件名排序，先拼接）
│   └── main.cs              #   导出函数（末尾 return Dictionary）
├── page/                    # 前端页面源码（分发用，需重建前端）
│   └── index.tsx
├── assets/                  # 静态资源（经 /api/plugins/<id>/assets/ 动态加载）
│   └── docs/                #   活文档（markdown）
├── data/                    # 随包分发的数据/配置文件（脚本 file 函数可读）
└── README.md                # 插件说明
```

## 接入流程（7 步）

1. **建包**：写好 `meta.json` + `module/`（script 或 native）+ `service/*.cs` + `page/index.tsx`，
   执行 `npm run pack` 打成 zip（见 [06-pack-publish.md](06-pack-publish.md)）。
2. **导入**：控制台 → 插件管理 → 上传插件 / 从 Git 导入 / 从市场安装。
3. **启用**：插件登记到后端，动作可下发到 Agent。
4. **写页面**：`src/webapp/src/plugins/<pluginId>/index.tsx`
   （`import.meta.glob` 收集，需重建前端；本 Demo 仓库已内置页面）。
5. **调 Agent**：页面里 `usePluginHost().dispatchTask(pluginId, action, args)`。
6. **调服务**：页面里 `api.post('/plugin/<pluginId>/<fn>', params)` 驱动 `service/*.cs`。
7. **发布**：把 zip 提交到 Libra-Plugins 仓库 `plugins/<pluginId>/`，
   CI 生成 `index.json` 即上架市场。

## 分层能力一览

| 层 | 能力 | 详见 |
|---|---|---|
| Agent | fs 读写/列目录/存在性、proc 列表/kill、env、whoami、log、`__platform()`；Windows/Linux 平台命令 | [03-agent-js-api.md](03-agent-js-api.md) |
| 服务端 | 动态参数、时间格式化、签名计算、跨调用状态、无 CORS 网络请求、读包内文件、数组/表格返回、错误契约、自描述 | [04-server-script.md](04-server-script.md) |
| 前端 | usePluginHost（设备/任务/WS 推送）、api client、插件管理、路由/图标/i18n | [05-frontend-host.md](05-frontend-host.md) |
