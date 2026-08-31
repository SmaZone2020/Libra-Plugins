# 打包发布

## 一键打包（npm，零依赖）

Libra-Plugin-Template 仓库内置零依赖打包脚本（Node 内置 `fs`/`zlib` 实现 zip，
无任何第三方包，无需 `npm install`）。在你的插件源码目录：

```bash
npm run pack          # 生成 dist/<pluginId>-<version>.zip
# 或
node pack.mjs         # 直接运行脚本
```

打包内容：`meta.json` + 顶层业务目录（`module/ service/ page/ assets/ data/ …`），
忽略 `.git` / `node_modules` / `dist` / 打包脚本本身 / README 可选（见 pack.mjs 配置）。

> 跨平台（Windows/macOS/Linux）行为一致；zip 内路径统一用 `/`，`meta.json` 位于根目录。

## 导入

1. 控制台 → 插件管理 → **上传插件**（选 zip）/ **从 Git 导入**（克隆仓库）/ **从市场安装**。
2. 启用插件：登记到后端，动作可下发到 Agent。
3. 页面源码（`page/index.tsx`）需放入前端仓库并重建前端才生效 ——
   对**分发场景**，页面随 zip 只是源码备份；对**本仓库插件**，前端已内置。

## 发布到插件市场（Libra-Plugins）

仓库结构（`plugins/` 子目录）：

```
Libra-Plugins/
├── index.json              # CI 生成，勿手工编辑
├── build-index.ps1         # 递归扫描 plugins/**/*.zip
└── plugins/
    ├── com.example.plugin-sdk/
    │   ├── meta.json / module/ / service/ ...   # 源码（开发态）
    │   └── plugin-sdk.zip                        # 打包产物（分发态）
    ├── com.libra.aitoken/
    └── com.libra.qqkey/
```

发布步骤：

1. 本地执行 `npm run pack`（或 `node pack.mjs`）产出 zip。
2. 把 **zip 放进对应 `plugins/<pluginId>/` 目录**（与源码同目录）。
3. 推送 `main`：CI（`.github/workflows/plugin-index.yml`）自动重新生成
   `index.json` 并提交；也可本地 `pwsh ./build-index.ps1` 手动生成。
4. 控制台刷新「插件市场」即可看到更新；安装即从本仓库下载 zip 导入。

> `index.json` 条目包含 `pluginId / name / version / author / description /
> file（zip 相对 plugins/ 的路径，如 com.example.plugin-sdk/plugin-sdk.zip）/ size`。
> 服务端市场下载端点已支持子目录路径。

## 版本更新

- 修改源码 → `npm run pack` → 替换 `plugins/<pluginId>/` 下的 zip → 推 `main`。
- CI 自动重建索引；控制台市场缓存 1 小时，或清缓存后刷新。
