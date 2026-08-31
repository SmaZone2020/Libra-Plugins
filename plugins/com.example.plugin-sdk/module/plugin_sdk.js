// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
//                                       op:"showcase", entry:"main" }
//
//     fs.read(path) → string      fs.write(path, content) → bool
//     fs.list(path) → string[]    fs.exists(path) → bool
//                 ipconfig / wmic / tasklist
//
// ═══════════════════════════════════════════════════════════════════════

function main(args) {
    var op = args.op || "showcase";
    var cap = op === "shell" ? "shell" : (args.capability || "all");
    var result;

    if (cap === "manifest") {
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
        var ok = fs.write("/tmp/libra_sdk_probe.txt", "hello from plugin-sdk (js)");
        result = {
            "write_ok": ok,
            "read": fs.read("/tmp/libra_sdk_probe.txt"),
            "list_home": fs.list("."),
            "exists": fs.exists("/tmp/libra_sdk_probe.txt")
        };

    } else if (cap === "proc") {
        var procs = proc.list();
        result = {
            "processes": procs,
            "process_count": procs.length,
            "path_env": env.get("PATH")
        };

    } else if (cap === "network") {
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
        var user = __platform() === "windows" ? env.get("USERNAME") : env.get("USER");
        result = {
            "user": user,
            "path": env.get("PATH"),
            "os": env.get("OS") || env.get("OSTYPE") || "(none)"
        };

    } else if (cap === "shell") {
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
        log("plugin-sdk: log() demo called");
        result = { "logged": true, "msg": "plugin-sdk: log() demo called" };

    } else {
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
