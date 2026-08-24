# Libra-Plugins

Libra-Nextgen official plugin repository.

本仓库是**插件市场**：每个插件是一个压缩包（zip），放在仓库根目录。

## 索引 index.json

`index.json` 是所有插件的索引清单，供控制台「插件管理 → 插件市场」调用。
每个条目包含：`pluginId`、`name`、`version`、`author`、`description`、
`file`（zip 文件名）、`size`（字节数）。

> **不要手工编辑** `index.json`，由 `build-index.ps1` 生成（CI/CD 自动执行，
> 也可本地运行：`pwsh -File ./build-index.ps1`）。

## 打包要求

- 压缩包根目录必须包含 `meta.json`（插件契约），否则该包会被索引跳过。
- `meta.json` 至少包含 `pluginId`（字母/数字/`.`/`-`/`_`）与 `name`。
- 压缩包命名建议与 `pluginId` 对应（如 `com.libra.qqkey` → `qqkey.zip`）。

## 版本更新

- 替换同名 zip（或新增新版本 zip）→ 推到 `main`；
- CI（`.github/workflows/plugin-index.yml`）自动重建 `index.json` 并提交；
- 控制台刷新「插件市场」即可看到更新；安装即从本仓库下载 zip 导入。