// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════

using System;
using System.Collections.Generic;

static class AvListState
{
    public static readonly Dictionary<string, object> LastResults = new();
}

static string Str(object? v, string def = "") => v?.ToString() ?? def;
