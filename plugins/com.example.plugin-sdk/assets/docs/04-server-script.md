# 服务端脚本（C#，多文件）

`service/` 目录是插件的服务端逻辑：C# 脚本随包分发，由 `ServerScriptService`
（Roslyn C# Scripting）解析执行，编译结果按插件缓存（文件变更自动失效）。

## 统一入口

```
POST /api/plugin/<pluginId>/<fn>
body: 任意 JSON（成为脚本函数的参数 p，dynamic；body 为空时为 null）
返回: { ok: true,  data: 函数返回值 }
      { ok: false, error: 错误消息 }   ← 脚本抛异常时
```

## 多文件组织（本插件演示）

宿主把 `service/` 下所有 `*.cs` **按文件名排序后拼接为单个脚本**再编译：

```
service/
├── sdk_utils.cs   # 先拼接：using / DemoState（跨调用状态）/ MakeClient / Str / Int
└── main.cs        # 后拼接：导出函数 + 末尾 return Dictionary
```

约定：

- 每个 .cs 文件都写自己的 `using`（拼接后重复 using 合法）。
- **函数级声明**（`static string Str(...)`）以「后出现的文件」为准 —— 工具类放
  靠前的文件、导出函数放 main.cs（最后拼接），避免同名覆盖。
- **类级声明**（`static class`）可以跨文件使用（拼接后同一脚本作用域）。
- 末尾的 `return new Dictionary<string, Func<object, object>>` 必须在 main.cs
  （拼接后的脚本尾部），宿主取它作为导出函数表。

## 函数契约

```csharp
return new Dictionary<string, Func<object, object>>
{
    ["echo"]     = p => Echo((dynamic)p),
    ["now"]      = p => Now((dynamic)p),
    // ... 每个函数 = 一个能力点
};
```

- 处理函数返回任意可 JSON 序列化对象（宿主自动序列化为 `data`）。
- 可直接使用引用库：`System` / `System.Net.Http` / `System.Text.Json` /
  `System.Collections.Generic` / `System.Dynamic` / `System.Linq`；
  可自己 `new HttpClient` 发网络请求（服务端发起，无 CORS）。
- 函数是同步签名，内部可用 `.GetAwaiter().GetResult()` 等待异步（如 HttpClient）。
- 抛异常 → 宿主统一返回 `{ ok:false, error }`（错误契约）。
- 跨调用状态用静态字段（脚本程序集只编译一次，多次调用间保留；服务重启清零）。

## 本插件函数目录（前端「服务端脚本」页调用 `manifest` 实时拉取）

| 函数 | 说明 | 可选项 |
|---|---|---|
| `echo` | 动态参数访问：原样回显 body（任意嵌套） | `text?` `count?` `nested?` |
| `now` | DateTime 格式化 | `format?`=`yyyy-MM-dd HH:mm:ss` `utc?`=0 |
| `bkn` | 签名计算（bkn/g_tk 算法） | `skey*` |
| `state` | 跨调用内存状态（静态字段） | 无 |
| `ip` | 服务端 GET 外网 IP（无 CORS 演示） | 无 |
| `http` | 通用 HTTP 请求 | `url*` `method?`=`GET` `headers?` `body?` `timeoutSec?`=15 |
| `file` | 读取插件包内随包分发文件 | `name?`=`meta.json` |
| `list` | 返回数组 | `count?`=5 `prefix?`=item |
| `table` | 返回对象数组（前端 Table 渲染） | `rows?`=3 `prefix?`=sdk |
| `fail` | 抛异常 → 演示错误契约 | `message?`=`demo failure` |
| `manifest` | 自描述：返回全部函数目录 | 无 |

## 定位插件包内文件

```csharp
static List<string> PluginRootCandidates() => new()
{
    // 部署形态：PluginsBaseDir = AppContext.BaseDirectory\..\..\..\..\plugins
    Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "plugins", "<pluginId>")),
    // 直接挂在 bin 旁
    Path.Combine(AppContext.BaseDirectory, "<pluginId>"),
    // 开发源目录（src/service/plugins-service/<pluginId>）
    Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "plugins-service", "<pluginId>")),
};
```

## 常见坑

- 把 `dynamic` 值直接传给普通方法（如 `Str(p?.text)`）会触发动态调度、返回类型变
  dynamic —— 先静态转换 `(object?)p?.text` 再传参。
- 同步签名里等待异步：`...GetAwaiter().GetResult()`，宿主有整体超时保护。
- 函数名与 `p` 字段约定：`p.字段` 直接读（ExpandoObject 递归），未约定字段也能读。
