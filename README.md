# Libra-Plugins

Libra-Nextgen official plugin repository (插件市场).

每个插件占一个目录：`plugins/<pluginId>/` 同时存放**源码**与**打包 zip**，
仓库根目录只保留 `index.json` 与构建脚本，保持整洁。

```
Libra-Plugins/
├── index.json              # CI 生成，勿手工编辑
├── build-index.ps1         # 递归扫描 plugins/**/*.zip
├── .github/workflows/      # plugin-index.yml：push *.zip 时自动重建索引
└── plugins/
    ├── com.example.plugin-sdk/   # 源码（meta.json / module/ / service/ / page/ / assets/…）
    │   └── plugin-sdk.zip        # 打包产物（分发态）
    ├── com.libra.aitoken/
    └── com.libra.qqkey/
```

## 索引 index.json

`index.json` 是所有插件的索引清单，供控制台「插件管理 → 插件市场」调用。
每个条目包含：`pluginId`、`name`、`version`、`author`、`description`、
`file`（zip 相对 `plugins/` 的路径，如 `com.libra.qqkey/qqkey.zip`）、`size`（字节数）。

> **不要手工编辑** `index.json`，由 `build-index.ps1` 生成（CI/CD 自动执行，
> 也可本地运行：`pwsh -File ./build-index.ps1`）。

## 打包要求

- 压缩包根目录必须包含 `meta.json`（插件契约），否则该包会被索引跳过。
- `meta.json` 至少包含 `pluginId`（字母/数字/`.`/`-`/`_`）与 `name`。
- zip 命名与 `pluginId` 对应（如 `com.libra.qqkey` → `qqkey.zip`），
  放在 `plugins/<pluginId>/` 目录内，与源码同目录。
- 源码目录与 zip 一起提交，方便作者维护与审阅。

## 版本更新

1. 在插件源码目录 `npm run pack` 产出新 zip（Libra-Plugin-Template 内置零依赖打包脚本）。
2. 用新 zip 替换 `plugins/<pluginId>/` 下的旧 zip，连同源码一起提交到 `main`；
3. CI（`.github/workflows/plugin-index.yml`）自动重建 `index.json` 并提交；
   也可本地 `pwsh -File ./build-index.ps1` 手动生成。
4. 控制台刷新「插件市场」即可看到更新；安装即从本仓库下载 zip 导入。
