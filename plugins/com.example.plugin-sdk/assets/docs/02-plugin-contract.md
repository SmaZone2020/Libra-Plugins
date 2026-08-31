# 插件契约 meta.json

`meta.json` 是插件的唯一契约，位于 zip 根目录。字段如下：

## 顶层字段

| 字段 | 必填 | 说明 | 可选项 |
|---|---|---|---|
| `schemaVersion` | 是 | 契约版本 | 恒为 1 |
| `pluginId` | 是 | 全局唯一 ID，也是包目录名/脚本目录名 | 仅 `[A-Za-z0-9.-_]`，建议 `com.作者.插件` |
| `name` | 是 | 插件显示名 | 任意字符串 |
| `version` | 是 | 插件版本 | 语义化版本号，如 `1.0.0` |
| `author` | 是 | 作者 | 任意字符串 |
| `description` | 是 | 一句话说明（市场列表显示） | 任意字符串 |
| `entry` | 是 | 前端路由/导航/图标 | 见下 |
| `i18n` | 否 | 多语言文案 | `{ zh: {...}, en: {...} }` |
| `actions[]` | 是 | 动作 = 按钮 + 转发 + Agent 模块调用 | 见下 |

## entry

| 字段 | 必填 | 说明 | 可选项 |
|---|---|---|---|
| `route` | 是 | 前端路由 | `/plugins/<route>` |
| `label` | 是 | 导航名 | i18n 键，如 `nav.pluginSdk` |
| `icon` | 否 | 导航图标 | `@gravity-ui/icons` 图标名（白名单），如 `Puzzle` |
| `apiRoot` | 否 | 页面 API 前缀（约定，页面自行使用） | `/api/plugins/<pluginId>` |

## actions[]

| 字段 | 必填 | 说明 | 可选项 |
|---|---|---|---|
| `action` | 是 | 动作 ID（前端 `dispatchTask` 用） | 任意字符串，如 `showcase` |
| `label` | 是 | 按钮/动作显示名 | 任意字符串 |
| `method` | 是 | HTTP 方法 | `GET` / `POST` |
| `argsSchema` | 否 | 参数表单（JSON Schema 子集） | `type: object`；`properties: {字段: {type, title}}`；`required: [字段]` |
| `module.kind` | 是 | Agent 模块通道 | `script`（`.js`，QuickJS 无需编译）/ `native`（cdylib `.dll`/`.so`） |
| `module.name` | 是 | 模块名 | `.js` 文件 stem 或 `.dll`/`.so` 名 |
| `module.op` | 否 | 注入模块输入 JSON 的 `op` 字段 | 任意字符串，模块内分支用 |
| `module.entry` | 否 | 脚本入口函数 | 如 `main` |

## 示例（本插件）

```json
{
  "schemaVersion": 1,
  "pluginId": "com.example.plugin-sdk",
  "name": "插件开发 SDK 示例",
  "version": "2.0.0",
  "entry": {
    "route": "plugin-sdk",
    "label": "nav.pluginSdk",
    "icon": "Puzzle",
    "apiRoot": "/api/plugins/com.example.plugin-sdk"
  },
  "actions": [
    {
      "action": "showcase",
      "label": "运行能力展示",
      "method": "POST",
      "argsSchema": {
        "type": "object",
        "properties": { "capability": { "type": "string", "title": "能力名称" } }
      },
      "module": { "kind": "script", "name": "plugin_sdk", "op": "showcase", "entry": "main" }
    }
  ]
}
```

## 动作流转

`POST /api/plugins/<pluginId>/<action>`（body: `{ agentId, args }`）→ 校验 argsSchema →
把 `module.op` + args 合成模块输入 JSON → 通过 `RelayService` 下发 Generic 任务 →
Agent 执行模块（script 通道 = QuickJS 跑 `module/<name>.js` 的 `entry` 函数）→
结果经 WS 推送 `plugin.result`，前端 `dispatchTask` 返回。
