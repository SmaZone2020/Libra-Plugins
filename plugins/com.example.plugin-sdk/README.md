# 插件开发 SDK 示例（com.example.plugin-sdk）

这是 Libra-Nextgen 插件的**全能力演示（活文档）**：把插件作者能用的所有能力与
可选项都做成可运行示例。可直接导入（zip），也可作为新插件的最小起点模板。

## 目录结构

```
com.example.plugin-sdk/
├── meta.json                # 插件契约（字段与可选项见 docs/01-plugin-contract.md）
├── module/                  # Agent 端模块（script 通道，JS 源码无需编译）
│   └── plugin_sdk.js        #   QuickJS 运行时执行：fs/proc/env/whoami/log +
│                            #   平台命令 API（Windows/Linux 分支）+ __platform()
├── service/                 # 服务端逻辑（C# 脚本，随包分发，多文件拼接编译）
│   ├── sdk_utils.cs         #   工具类/静态状态（按文件名排序，先拼接）
│   └── main.cs              #   导出函数：echo/now/bkn/state/ip/http/file/list/…
├── page/                    # 前端页面源码（分发用，需重建前端）
│   └── index.tsx            #   5 个页签：总览 / 文档 / Agent 端 / 服务端 / 前端 API
├── assets/                  # 随包分发的静态资源（经 /api/plugins/<id>/assets/ 动态加载）
│   └── docs/                #   活文档（markdown，前端在线拉取渲染）
│       ├── 01-overview.md       # 总览：架构 / 目录 / 接入流程
│       ├── 02-plugin-contract.md# 插件契约：meta.json 全字段与可选项
│       ├── 03-agent-js-api.md   # Agent 端 JS API 全清单 + 示例
│       ├── 04-server-script.md  # 服务端脚本：多文件组织 / 函数契约 / 可选项
│       ├── 05-frontend-host.md  # 前端宿主：usePluginHost / api / 路由 / i18n
│       └── 06-pack-publish.md   # 打包发布：npm run pack / 插件市场
├── data/                    # 随包分发的数据文件（脚本 file 函数可读）
│   └── demo.json
└── README.md
```

## 能力矩阵

| 层 | 载体 | 能力 |
|---|---|---|
| Agent 端 | `module/plugin_sdk.js` | 跨平台：fs 读写/列目录/存在性、proc 列表/kill、env、whoami、log；Windows：cmd/powershell/reg_*/ipconfig/wmic/tasklist；Linux：shell/bash/uname/ip_route/ss/hostname/dns；运行时 `__platform()` 分支（QuickJS） |
| 服务端 | `service/*.cs` | echo(动态参数) / now(格式化) / bkn(签名) / state(跨调用状态) / ip(无 CORS 请求) / http(通用请求+请求头) / file(读包内文件) / list(数组) / table(对象数组) / fail(错误契约) / manifest(自描述目录)；多文件：工具类抽到 `sdk_utils.cs` |
| 前端 | `page/index.tsx` | 活文档在线渲染（assets/docs/*.md + react-markdown）、usePluginHost(selectedAgent/dispatchTask/subscribeOutput/lastOutput)、api client、插件管理；已移除 HeroUI 画廊与市场演示（保持页面聚焦） |

## 导入与运行

1. 控制台 → 插件管理 → 上传本 zip（或从 Git / 市场导入）。
2. 启用插件后：
   - **Agent 端**：前端页选择 capability 点执行 → `dispatchTask` 下发 → Agent
     内存执行 JS（QuickJS）→ 结果经 WS 实时推送。
   - **服务端脚本**：`POST /api/plugin/com.example.plugin-sdk/<函数名>`，
     body 任意 JSON 作为脚本参数 `p`（dynamic）；返回 `{ok,data}`，抛异常返回
     `{ok:false,error}`。函数目录可调 `manifest` 实时获取。
   - **活文档**：前端「文档」页签在线拉取 `assets/docs/*.md` 并渲染（无需重建前端）。
3. 前端页面是**源码分发**：`page/index.tsx` 需放入前端仓库
   `src/webapp/src/plugins/com.example.plugin-sdk/index.tsx` 并重建前端
   （`import.meta.glob` 构建期收集）。本仓库已内置该页面。

## 发布到插件市场

在插件源码目录执行 `npm run pack`（Libra-Plugin-Template 内置的零依赖打包脚本，
本插件同样适用），把打好的 zip 提交到 Libra-Plugins 仓库
`plugins/com.example.plugin-sdk/` 目录，CI（或本地 `pwsh build-index.ps1`）
会重新生成 `index.json`，市场即可安装。
