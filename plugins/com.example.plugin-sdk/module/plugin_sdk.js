// ═══════════════════════════════════════════════════════════════════════
//  com.example.plugin-sdk — Agent 端模块全能力演示（module/plugin_sdk.js）
// ═══════════════════════════════════════════════════════════════════════
//  执行宿主：Agent 的 script 通道（QuickJS/rquickjs 沙箱，JS 源码随动作下发内存执行）
//  入口：meta.json actions[].module = { kind:"script", name:"plugin_sdk",
//                                       op:"showcase", entry:"main" }
//  输入：args = { op: "showcase"|"shell", capability?, command?, ... }
//  输出：main(args) 的返回值 → 宿主 JSON 序列化 → 控制台 WS 推送 plugin.result
//
//  【沙箱内可用全局】（详见 assets/docs/03-agent-js-api.md）
//   跨平台（所有平台通用）：
//     fs.read(path) → string      fs.write(path, content) → bool
//     fs.list(path) → string[]    fs.exists(path) → bool
//     proc.list() → [{pid,name}]  proc.kill(pid) → bool（危险，演示不执行）
//     env.get(name) → string      env.set(name, v) → void（多线程安全 no-op）
//     whoami() → string           log(msg) → 写入 Agent 日志（控制台可见）
//     __platform() → "windows"|"linux"|"macos"|"unknown"（运行时平台分支）
//   Windows 专属：cmd / powershell / reg_query / reg_set / reg_delete /
//                 ipconfig / wmic / tasklist
//   Linux 专属：shell / bash / uname / ip_route / ss / hostname / dns
//
//  【capability 可选项】（showcase 动作的参数）
//    whoami   当前用户
//    fs       文件系统读写（写 /tmp/libra_sdk_probe.txt → 读 → 列目录 → 存在性）
//    proc     进程列表 + PATH 环境变量
//    network  网络信息（按平台自动选择命令）
//    system   系统信息（按平台自动选择命令）
//    env      读多个环境变量 + whoami（新）
//    shell    执行任意命令（需要 command 参数，平台自动选择 cmd/shell）
//    log      演示 log()：只打日志无返回
//    all      全量自检（默认）
//    manifest 返回本脚本能力目录（自描述，前端实时渲染）
// ═══════════════════════════════════════════════════════════════════════

function main(args) {
    var op = args.op || "showcase";
    var cap = op === "shell" ? "shell" : (args.capability || "all");
    var result;

    if (cap === "manifest") {
        // 自描述：能力目录作为结构化数据返回，前端直接渲染，文档与实现同步。
        result = {
            "pluginId": "com.example.plugin-sdk",
            "host": "agent script channel (QuickJS)",
            "platform": __platform(),
            "capabilities": [
                { "name": "whoami",  "desc": "当前用户", "options": "无" },
                { "name": "fs",      "desc": "文件系统读写/列目录/存在性", "options": "写入路径固定 /tmp/libra_sdk_probe.txt" },
                { "name": "proc",    "desc": "进程列表 + 环境变量", "options": "proc.kill(pid) 危险操作仅文档说明" },
                { "name": "network", "desc": "网络信息（按平台选命令）", "options": "Windows=ipconfig / Linux=ip_route+dns" },
                { "name": "system",  "desc": "系统信息（按平台选命令）", "options": "Windows=wmic os / Linux=uname" },
                { "name": "env",     "desc": "环境变量集合 + 当前用户", "options": "读取 PATH/OS/USERNAME（或 USER）" },
                { "name": "shell",   "desc": "执行任意命令", "options": "command（必填，任意字符串）" },
                { "name": "log",     "desc": "写一条 Agent 日志", "options": "无（日志经 Agent 回传控制台）" },
                { "name": "all",     "desc": "全量自检（默认）", "options": "无" },
                { "name": "manifest","desc": "返回本能力目录", "options": "无" }
            ],
            "commonApi": ["fs.read", "fs.write", "fs.list", "fs.exists",
                          "proc.list", "proc.kill", "env.get", "env.set",
                          "whoami", "log", "__platform"],
            "windowsApi": ["cmd", "powershell", "reg_query", "reg_set",
                           "reg_delete", "ipconfig", "wmic", "tasklist"],
            "linuxApi": ["shell", "bash", "uname", "ip_route", "ss",
                         "hostname", "dns"]
        };

    } else if (cap === "whoami") {
        result = { "whoami": whoami() };

    } else if (cap === "fs") {
        // 跨平台文件系统：写 → 读 → 列目录 → 存在性（4 个选项全覆盖）。
        var ok = fs.write("/tmp/libra_sdk_probe.txt", "hello from plugin-sdk (js)");
        result = {
            "write_ok": ok,
            "read": fs.read("/tmp/libra_sdk_probe.txt"),
            "list_home": fs.list("."),
            "exists": fs.exists("/tmp/libra_sdk_probe.txt")
        };

    } else if (cap === "proc") {
        // 跨平台进程枚举 + 环境变量（多平台底层实现不同，见 agent script 模块）。
        var procs = proc.list();
        result = {
            "processes": procs,
            "process_count": procs.length,
            "path_env": env.get("PATH")
        };

    } else if (cap === "network") {
        // 多平台写法：同一个“网络信息”，Windows/Linux 用不同命令。
        var net;
        if (__platform() === "windows") {
            net = ipconfig();
        } else if (__platform() === "linux") {
            net = ip_route() + "\n" + dns();
        } else {
            net = "unsupported platform";
        }
        result = { "network": net };

    } else if (cap === "system") {
        // 多平台写法：系统信息。
        var sys;
        if (__platform() === "windows") {
            sys = wmic("os get Caption,Version,OSArchitecture /value");
        } else if (__platform() === "linux") {
            sys = uname();
        } else {
            sys = "unsupported platform";
        }
        result = { "system": sys };

    } else if (cap === "env") {
        // 环境变量集合：Windows 读 USERNAME，其他平台读 USER。
        var user = __platform() === "windows" ? env.get("USERNAME") : env.get("USER");
        result = {
            "user": user,
            "path": env.get("PATH"),
            "os": env.get("OS") || env.get("OSTYPE") || "(none)"
        };

    } else if (cap === "shell") {
        // Shell 执行：command 可选项（缺省 echo hello）。
        var command = args.command || "echo hello";
        var out;
        if (__platform() === "windows") {
            out = cmd(command);
        } else if (__platform() === "linux") {
            out = shell(command);
        } else {
            out = "unsupported platform";
        }
        result = { "command": command, "output": out };

    } else if (cap === "log") {
        // log()：写入 Agent 日志（控制台日志流可见），无业务返回。
        log("plugin-sdk: log() demo called");
        result = { "logged": true, "msg": "plugin-sdk: log() demo called" };

    } else {
        // 全量自检：每个能力都跑一遍，顺带演示 log()。
        var platform = __platform();
        var sys_info;
        if (platform === "windows") {
            sys_info = cmd("ver");
        } else if (platform === "linux") {
            sys_info = uname();
        } else {
            sys_info = "unknown";
        }

        log("plugin-sdk: running full capability sweep");

        result = {
            "platform": platform,
            "whoami": whoami(),
            "sys_info": sys_info,
            "proc_count": proc.list().length,
            "path": env.get("PATH"),
            "fs_probe_exists": fs.exists("/tmp/libra_sdk_probe.txt")
        };
    }

    return result;
}
