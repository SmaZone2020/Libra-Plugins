# build-index.ps1 - plugin repository index generator
#
# Recursively scans plugins/**/*.zip under this repository, reads the meta.json
# inside each package, and writes index.json (pluginId / name / version /
# author / description / file / size). `file` carries the zip's path relative
# to the repository root (e.g. plugins/com.libra.qqkey/qqkey.zip) so the
# frontend can append it directly to the GitHub raw base URL:
#   https://github.com/<owner>/<repo>/raw/refs/heads/main/plugins/<id>/<file>.zip
# Used by CI/CD (GitHub Actions) to rebuild the index whenever a zip changes;
# can also be run locally.
#
# Usage:
#   pwsh -File ./build-index.ps1   (run from anywhere; script dir is the repo root)

$ErrorActionPreference = 'Stop'

# Script directory = repository root (index.json lives here; zips live under plugins/)
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($Dir)) { $Dir = Get-Location }
$PluginsDir = Join-Path $Dir 'plugins'

Add-Type -AssemblyName System.IO.Compression.FileSystem

$plugins = @()

foreach ($zipPath in (Get-ChildItem -Path $PluginsDir -Filter '*.zip' -Recurse | Sort-Object FullName)) {
    $zip = $null
    try {
        $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath.FullName)

        $entry = $zip.GetEntry('meta.json')
        if ($null -eq $entry) {
            Write-Warning "skip $($zipPath.Name): no meta.json inside"
            continue
        }

        $reader = New-Object System.IO.StreamReader($entry.Open())
        try {
            $meta = $reader.ReadToEnd() | ConvertFrom-Json -ErrorAction Stop
        } finally {
            $reader.Dispose()
        }

        if ([string]::IsNullOrWhiteSpace($meta.pluginId)) {
            Write-Warning "skip $($zipPath.Name): meta.json missing pluginId"
            continue
        }

        # Path of the zip relative to the repository root, forward slashes —
        # matches the standard GitHub raw download URL shape:
        #   https://github.com/<owner>/<repo>/raw/refs/heads/main/plugins/<id>/<file>.zip
        $repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
        $repoRoot = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd('\') + '\'
        $fullPath = [System.IO.Path]::GetFullPath($zipPath.FullName)
        $relPath = $fullPath
        if ($relPath.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            $relPath = $relPath.Substring($repoRoot.Length)
        }
        $relPath = $relPath.Replace('\', '/')

        $plugins += [PSCustomObject]@{
            pluginId    = [string]$meta.pluginId
            name        = [string]$meta.name
            version     = [string]$meta.version
            author      = [string]$meta.author
            description = [string]$meta.description
            file        = $relPath
            size        = $zipPath.Length
        }
    }
    catch {
        Write-Warning "failed to process $($zipPath.Name): $($_.Exception.Message)"
    }
    finally {
        if ($null -ne $zip) { $zip.Dispose() }
    }
}

$index = [PSCustomObject]@{
    schemaVersion = 1
    generatedAt   = (Get-Date).ToUniversalTime().ToString('o')
    pluginCount   = $plugins.Count
    plugins       = @($plugins | Sort-Object pluginId)
}

$indexPath = Join-Path $Dir 'index.json'
# UTF-8 无 BOM(PS 5.1 的 Set-Content -Encoding UTF8 会带 BOM,导致前端 JSON.parse 失败)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($indexPath, ($index | ConvertTo-Json -Depth 5), $utf8NoBom)

Write-Host "[build-index] wrote $indexPath with $($plugins.Count) plugin(s)"
