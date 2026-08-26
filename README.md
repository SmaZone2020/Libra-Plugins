# Libra-Plugins

Libra-Nextgen official plugin repository（插件市场）。

每个插件占一个目录：`plugins/<pluginId>/` 存放**打包 zip**

## 索引 index.json

`index.json` 是所有插件的索引清单，供控制台「插件管理 → 插件市场」调用。
每条目包含：`pluginId`、`name`、`version`、`author`、`description`、
`file`（zip 相对 `plugins/` 的路径，如 `com.libra.qqkey/qqkey.zip`）、`size`（字节数）。

> **不要手工编辑** `index.json`，由 `build-index.ps1` 生成（CI/CD 自动执行；
> 也可本地运行：`pwsh -File ./build-index.ps1`）。

## 打包要求

- 压缩包根目录必须包含 `meta.json`（插件契约），否则该包会被索引跳过。
- `meta.json` 至少包含 `pluginId`（字母/数字/`.`/`-`/`_`）与 `name`。
- zip 命名为 `pluginId` 对应（如 `com.libra.qqkey` → `qqkey.zip`），
  放在 `plugins/<pluginId>/` 目录内。
- **仓库只提交 zip**：源码在插件主仓库（如 Libra-Nextgen `src/plugins/<pluginId>/`）
  中维护，打包成 zip 后只把 zip 提到本仓库。

## 版本更新

1. 在插件源码目录执行打包脚本产出新 zip（如 `npm run pack`）。
2. 用新 zip 替换 `plugins/<pluginId>/` 下的旧 zip，提交到 `main`。
3. CI（`.github/workflows/plugin-index.yml`）自动重建 `index.json` 并提交；
   也可本地 `pwsh -File ./build-index.ps1` 手动生成。
4. 控制台刷新「插件市场」即可看到更新；安装即从本仓库下载 zip 导入。
