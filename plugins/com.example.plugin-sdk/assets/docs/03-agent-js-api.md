# Agent 端 JS API（QuickJS 沙箱）

`module/*.js` 由 Agent 的 script 模块在 **QuickJS（rquickjs）沙箱** 中执行：
源码随动作下发，内存执行，无编译步骤。沙箱刻意精简：**无定时器、无 fetch、
无 eval/Function**（宿主已删除），可用的只有下面的允许清单。

## 执行契约

- 脚本必须定义入口函数（默认 `main`）：`function main(args) { ... }`。
- `args` 是动作参数对象（`module.op` 也合并在内），如
  `{ op: "showcase", capability: "fs", command: "whoami" }`。
- 入口函数返回任意可 JSON 序列化的值 → 宿主序列化 → 控制台 WS 推送 `plugin.result`。

## 跨平台 API（所有平台通用）

| API | 返回 | 说明 |
|---|---|---|
| `fs.read(path)` | string | 读文件；失败返回 `read error: ...` |
| `fs.write(path, content)` | bool | 写文件 |
| `fs.list(path)` | string[] | 列目录（条目名） |
| `fs.exists(path)` | bool | 判断存在 |
| `proc.list()` | [{pid, name}] | 枚举进程（Windows=tasklist / 其他=ps） |
| `proc.kill(pid)` | bool | 杀进程（危险操作，演示不执行） |
| `env.get(name)` | string | 读环境变量 |
| `env.set(name, v)` | void | 写环境变量（多线程下安全 no-op 占位） |
| `whoami()` | string | 当前用户（Windows=USERNAME / 其他=USER） |
| `log(msg)` | void | 写一条 Agent 日志（控制台日志流可见） |
| `__platform()` | string | `"windows"` \| `"linux"` \| `"macos"` \| `"unknown"` |

## Windows 专属 API

| API | 返回 | 说明 |
|---|---|---|
| `cmd(cmdline)` | string | 执行 CMD 命令 |
| `powershell(script)` | string | 进程内 CLR 执行 PowerShell（无 powershell.exe 进程） |
| `reg_query(key, name)` | string | 查询注册表值 |
| `reg_set(key, name, data)` | bool | 写注册表值 |
| `reg_delete(key, name)` | bool | 删注册表值 |
| `ipconfig()` | string | 网络配置（`/all`） |
| `wmic(query)` | string | 执行 WMIC 查询（Win11 24H2 已移除，注意空返回） |
| `tasklist()` | string | 任务列表（LIST 格式） |

## Linux/macOS 专属 API

| API | 返回 | 说明 |
|---|---|---|
| `shell(cmdline)` | string | 执行 `/bin/sh -c` |
| `bash(script)` | string | 执行 `/bin/bash -c` |
| `uname()` | string | `uname -a` |
| `ip_route()` | string | `ip addr`（回退 `ifconfig`） |
| `ss(path)` | string | 读 `/proc` 或 `/sys` 文件 |
| `hostname()` | string | 主机名 |
| `dns()` | string | `/etc/resolv.conf` |

> 平台 API 按运行平台注册：Windows 上调用 `shell()` 会得到 "not a function" 错误，
> 反之亦然。跨平台脚本用 `__platform()` 运行时分支（不需要 `#if` 预处理）。

## 示例：跨平台网络信息

```js
function main(args) {
    var cap = args.capability || "all";
    if (cap === "network") {
        var net;
        if (__platform() === "windows") {
            net = ipconfig();
        } else if (__platform() === "linux") {
            net = ip_route() + "\n" + dns();
        } else {
            net = "unsupported platform";
        }
        return { "network": net };
    }
    return { "ok": true, "cap": cap };
}
```

## 示例：文件系统读写

```js
function main(args) {
    var ok = fs.write("/tmp/libra_sdk_probe.txt", "hello from plugin-sdk (js)");
    return {
        "write_ok": ok,
        "read": fs.read("/tmp/libra_sdk_probe.txt"),
        "list_home": fs.list("."),
        "exists": fs.exists("/tmp/libra_sdk_probe.txt")
    };
}
```

## 沙箱边界（安全）

- 删除 `eval` / `Function` / `gc` / `print`：脚本无法动态生成代码。
- 无 `setTimeout` / `fetch` / `XMLHttpRequest`：只能通过宿主提供的同步 API 行动。
- 模块是**每次动作独立执行**：QuickJS 运行时按调用创建，无跨调用状态；
  需要状态请用服务端脚本（静态字段）或把数据写文件/由宿主持久化。
- `env.set` 因 Agent 多线程环境拒绝改进程环境变量（`std::env::set_var` 仅单线程安全）。
