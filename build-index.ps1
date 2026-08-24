# build-index.ps1 - plugin repository index generator
#
# Scans every *.zip in this directory (Libra-Plugins/), reads the meta.json
# inside each package, and writes index.json (pluginId / name / version /
# author / description / file / size). Used by CI/CD (GitHub Actions) to
# rebuild the index whenever a zip changes; can also be run locally.
#
# Usage:
#   pwsh -File ./build-index.ps1   (run from anywhere; script dir is the repo root)

$ErrorActionPreference = 'Stop'

# Script directory = repository root (zips and index.json live here)
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($Dir)) { $Dir = Get-Location }

Add-Type -AssemblyName System.IO.Compression.FileSystem

$plugins = @()

foreach ($zipPath in (Get-ChildItem -Path $Dir -Filter '*.zip' | Sort-Object Name)) {
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

        $plugins += [PSCustomObject]@{
            pluginId    = [string]$meta.pluginId
            name        = [string]$meta.name
            version     = [string]$meta.version
            author      = [string]$meta.author
            description = [string]$meta.description
            file        = $zipPath.Name
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
$index | ConvertTo-Json -Depth 5 | Set-Content -Path $indexPath -Encoding UTF8

Write-Host "[build-index] wrote $indexPath with $($plugins.Count) plugin(s)"