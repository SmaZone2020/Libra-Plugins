// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
//
//
// ═══════════════════════════════════════════════════════════════════════

using System;
using System.Text.Json;
using System.Collections.Generic;

string Record(dynamic p)
{
    var agentId = Str((object?)p?.agentId);
    if (agentId.Length == 0) throw new ArgumentException("record: agentId 必填");
    var result = p?.result;
    AvListState.LastResults[agentId] = result ?? new { };
    return JsonSerializer.Serialize(new { ok = true, agentId, cached = AvListState.LastResults.ContainsKey(agentId) });
}

string Cache(dynamic p)
{
    var agentId = Str((object?)p?.agentId);
    if (agentId.Length == 0) throw new ArgumentException("cache: agentId 必填");
    return AvListState.LastResults.TryGetValue(agentId, out var v)
        ? JsonSerializer.Serialize(v)
        : JsonSerializer.Serialize(new { ok = false, error = "no cached result for agent" });
}

string Manifest(dynamic p)
{
    return JsonSerializer.Serialize(new
    {
        pluginId = "com.libra.av-list",
        host = "ServerScriptService (Roslyn C# Scripting)",
        endpoint = "POST /api/plugin/com.libra.av-list/<函数名>",
        funcs = new object[]
        {
            new { name = "record", desc = "保存 Agent 杀软检测结果缓存", options = new object[] {
                new { name = "agentId", type = "string", optional = false, desc = "Agent ID" },
                new { name = "result", type = "object", optional = false, desc = "检测结果对象" } } },
            new { name = "cache", desc = "读取 Agent 最近一次检测结果", options = new object[] {
                new { name = "agentId", type = "string", optional = false, desc = "Agent ID" } } },
            new { name = "manifest", desc = "自描述函数目录", options = Array.Empty<object>() },
        },
    });
}


return new Dictionary<string, Func<object, object>>
{
    ["record"]   = p => Record((dynamic)p),
    ["cache"]    = p => Cache((dynamic)p),
    ["manifest"] = p => Manifest((dynamic)p),
};
