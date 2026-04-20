# Enumerates installed AppX packages for the current user and joins them with `Get-StartApps`,
# which is the same AppsFolder index Start Menu / Windows Search use (localized display name + AUMID).
# Also parses each package's AppxManifest.xml for `<...:AppExecutionAlias Executable="..."/>` entries
# so we can map App Execution Alias shim exes under %LOCALAPPDATA%\Microsoft\WindowsApps
# (e.g. `SnippingTool.exe`, `chatgpt.exe`) back to their owning package + AUMID.
#
# Output: single JSON array on stdout with objects of the shape
#   { FamilyName, FullName, InstallLocation, DisplayName, AppUserModelIds, ExecutionAliases }.
# Errors fall back to an empty array so Node can continue without throwing.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Emit-Rows($rows) {
    $rows | ConvertTo-Json -Depth 6 -Compress
}

function Get-ExecutionAliasesFromManifest([string]$manifestPath) {
    $result = New-Object System.Collections.Generic.List[string]
    try {
        if (-not (Test-Path -LiteralPath $manifestPath)) { return $result }
        $xml = Get-Content -Raw -Path $manifestPath -ErrorAction SilentlyContinue
        if (-not $xml) { return $result }
        # Real manifests use `<uap5:ExecutionAlias Alias="Foo.exe"/>` (or `<desktop:ExecutionAlias>`)
        # nested under `<uap*:AppExecutionAlias>`. Match the inner `ExecutionAlias` with `Alias=` directly.
        $rx = [regex]::new('<(?:[\w]+:)?ExecutionAlias[^>]*\sAlias\s*=\s*"([^"]+)"', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        $matches = $rx.Matches($xml)
        foreach ($m in $matches) {
            $exe = [string]$m.Groups[1].Value
            if ($exe) { $result.Add($exe) }
        }
    } catch {
        # ignore manifest parse errors; aliases are best-effort
    }
    return $result
}

# 1) Pull the AppsFolder index (Start Menu / Search parity).
$startAppsByFamilyLc = @{}
$startAppNameByAumid = @{}
try {
    foreach ($sa in @(Get-StartApps)) {
        $aumid = [string]$sa.AppID
        if (-not $aumid) { continue }
        $name = [string]$sa.Name
        if ($name -and -not $startAppNameByAumid.ContainsKey($aumid)) {
            $startAppNameByAumid[$aumid] = $name
        }
        $bang = $aumid.IndexOf('!')
        if ($bang -gt 0) {
            $fam = $aumid.Substring(0, $bang).ToLowerInvariant()
            if (-not $startAppsByFamilyLc.ContainsKey($fam)) {
                $startAppsByFamilyLc[$fam] = New-Object System.Collections.Generic.List[string]
            }
            $startAppsByFamilyLc[$fam].Add($aumid)
        }
    }
} catch {
    # Get-StartApps missing (very old hosts) → keep maps empty; manifest alias + PFN still work.
}

# 2) Walk AppX packages and join with Get-StartApps data + manifest aliases.
$rows = New-Object System.Collections.Generic.List[object]

try {
    foreach ($pkg in Get-AppxPackage) {
        try {
            if ($pkg.IsFramework) { continue }
            if ($pkg.IsResourcePackage) { continue }
        } catch { continue }

        $loc = ''
        try { $loc = [string]$pkg.InstallLocation } catch { $loc = '' }
        if (-not $loc) { continue }

        $fam = [string]$pkg.PackageFamilyName
        if (-not $fam) { continue }
        $famLc = $fam.ToLowerInvariant()

        $aumids = @()
        if ($startAppsByFamilyLc.ContainsKey($famLc)) {
            $aumids = @($startAppsByFamilyLc[$famLc] | Select-Object -Unique)
        }

        $displayName = ''
        foreach ($a in $aumids) {
            if ($startAppNameByAumid.ContainsKey($a)) {
                $cand = [string]$startAppNameByAumid[$a]
                if ($cand) { $displayName = $cand; break }
            }
        }

        $manifestPath = Join-Path $loc 'AppxManifest.xml'
        $aliasNames = Get-ExecutionAliasesFromManifest $manifestPath

        $rows.Add([PSCustomObject]@{
                FamilyName       = $fam
                FullName         = [string]$pkg.PackageFullName
                InstallLocation  = $loc
                DisplayName      = $displayName
                AppUserModelIds  = $aumids
                ExecutionAliases = @($aliasNames | Select-Object -Unique)
            })
    }
    Emit-Rows ($rows.ToArray())
    exit 0
} catch {
    # Last-ditch fallback so callers always see valid JSON.
    Emit-Rows @()
    exit 0
}
