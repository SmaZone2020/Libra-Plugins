# 前端宿主 API

插件页面是**源码分发**：`page/index.tsx` 放入前端仓库
`src/webapp/src/plugins/<pluginId>/index.tsx`（`import.meta.glob` 构建期收集），
重建前端后生效。运行时页面是 React 组件，可用下面的宿主能力。

## usePluginHost()

```tsx
import { usePluginHost } from '../../hooks/usePluginHost';
const { selectedAgent, selectAgent, dispatchTask, subscribeOutput, lastOutput } = usePluginHost();
```

| 成员 | 说明 | 示例 |
|---|---|---|
| `selectedAgent` | 当前选中设备（与控制台顶部选择器共享） | `selectedAgent?.hostname` |
| `selectAgent(id)` | 切换选中设备（与主控制台联动） | `selectAgent(agentId)` |
| `dispatchTask(pluginId, action, args?, agentId?)` | 调插件动作 → Agent 内存执行模块 | `dispatchTask('com.example.plugin-sdk', 'showcase', { capability: 'fs' })` |
| `subscribeOutput(cb, action?)` | 订阅 WS 实时推送（可选按 action 过滤），返回退订函数 | `subscribeOutput(o => setX(o.data), 'showcase')` |
| `lastOutput` | 最近一条 `plugin.result` 推送（便捷读取） | `lastOutput?.data` |

> `dispatchTask` 返回 `{ pluginId, action, result }`；`result` 已做 JSON 反序列化
> （字符串按 JSON 尝试解析，非 JSON 文本原样保留）。

## api client

```tsx
import { api, API_ORIGIN } from '../../api/client';
```

| 成员 | 说明 | 示例 |
|---|---|---|
| `api.get(path)` | GET，自动带 JWT | `api.get('/plugins/manager')` |
| `api.post(path, body?)` | POST JSON | `api.post('/plugin/com.example.plugin-sdk/echo', { text: 'hi' })` |
| `api.put(path, body?)` | PUT JSON | `api.put('/plugins/manager/<id>', { meta })` |
| `api.delete(path)` | DELETE | `api.delete('/plugins/manager/<id>')` |
| `API_ORIGIN` | 后端地址（`VITE_API_BASE` 或默认 5270） | `http://127.0.0.1:5270` |

## 插件管理 API

```tsx
import { listPlugins, togglePlugin, updatePlugin, deletePlugin,
         importPlugin, importPluginFromGit, getPluginRegistry, installPluginFromRegistry } from '../../api/plugins';
```

- `listPlugins()` → 已装插件（含 disabled）
- `togglePlugin(id, enabled)` / `updatePlugin(id, meta)` / `deletePlugin(id)`
- `importPlugin(file, enable)`（zip 上传）/ `importPluginFromGit(gitUrl, enable)`
- `getPluginRegistry()` → 市场索引（GitHub raw + localStorage 1h 缓存）
- `installPluginFromRegistry(file)` → 下载并导入市场 zip

## 资源与文档加载

插件包内静态资源经 **assets 端点**动态加载（无需构建期打包进前端）：

```
GET /api/plugins/<pluginId>/assets/<file>     ← 匿名可访问（img/md/fetch 均可）
```

- 图标/图片：`<img src={assetUrl('icons/foo.svg')} />`（参见 com.libra.aitoken 的 assets 用法）。
- 活文档：`fetch(assetUrl('docs/01-overview.md'))` + react-markdown 渲染
  （本 Demo「文档」页签即此模式，`react-markdown` + `remark-gfm` 已在 webapp 依赖中）。

## 路由 / 图标 / i18n

- 路由：`entry.route` → `/plugins/<route>`（由宿主注册表自动挂载）。
- 图标：`entry.icon` 是**图标名字符串**，宿主经白名单映射（`src/plugins/icons.ts`），
  插件不能 import 任意模块。可用名：`Cpu / Globe / Folder / Terminal / Camera / Bug /
  PlugConnection / Puzzle / Shield / Server / Magnifier / Rocket`。
- i18n：`meta.json` 的 `i18n` 提供 `nav.xxx` 文案；页面内部文案可自行用
  `react-i18next` 或直接写死。

## 页面最小骨架

```tsx
import { useState } from 'react';
import { Button, Card } from '@heroui/react';
import { usePluginHost } from '../../hooks/usePluginHost';

export default function MyPluginPage() {
  const { selectedAgent, dispatchTask } = usePluginHost();
  const [result, setResult] = useState<unknown>(null);

  const run = async () => {
    const res = await dispatchTask('com.example.myplugin', 'do_something', { key: 'value' });
    setResult(res.result);
  };

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">My Plugin</h1>
      <Button variant="primary" isDisabled={!selectedAgent} onPress={run}>执行</Button>
      {result !== null && <pre className="mt-3 font-mono text-xs">{JSON.stringify(result, null, 2)}</pre>}
    </Card>
  );
}
```
