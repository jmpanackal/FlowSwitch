$ErrorActionPreference = "Stop"

$RepoRoot = "E:\Coding\Projects\FlowSwitch"
$LogPath = Join-Path $env:APPDATA "FlowSwitch\logs\launch-latest.jsonl"
$RunRoot = Join-Path $RepoRoot ("artifacts\launch-bench\" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Force -Path $RunRoot | Out-Null

$FlagNames = @(
  "FLOWSWITCH_USE_RECT_FFI",
  "FLOWSWITCH_USE_MOVE_FFI",
  "FLOWSWITCH_USE_ENUM_CACHE",
  "FLOWSWITCH_USE_PS_RUNSPACE"
)

$Scenarios = @(
  @{ Name = "01-baseline"; Env = @{} },
  @{ Name = "02-rect-ffi"; Env = @{ FLOWSWITCH_USE_RECT_FFI = "1" } },
  @{ Name = "03-rect+move-ffi"; Env = @{ FLOWSWITCH_USE_RECT_FFI = "1"; FLOWSWITCH_USE_MOVE_FFI = "1" } },
  @{ Name = "04-rect+move+enum-cache"; Env = @{ FLOWSWITCH_USE_RECT_FFI = "1"; FLOWSWITCH_USE_MOVE_FFI = "1"; FLOWSWITCH_USE_ENUM_CACHE = "1" } },
  @{ Name = "05-all-flags"; Env = @{ FLOWSWITCH_USE_RECT_FFI = "1"; FLOWSWITCH_USE_MOVE_FFI = "1"; FLOWSWITCH_USE_ENUM_CACHE = "1"; FLOWSWITCH_USE_PS_RUNSPACE = "1" } }
)

function Stop-ProcTree([int]$Pid) {
  try {
    cmd /c "taskkill /PID $Pid /T /F >nul 2>&1"
  } catch {}
}

Write-Host ""
Write-Host "Output folder: $RunRoot" -ForegroundColor Cyan
Write-Host "IMPORTANT: use the same profile for every scenario." -ForegroundColor Yellow
Write-Host ""

Push-Location $RepoRoot
try {
  foreach ($scenario in $Scenarios) {
    $name = $scenario.Name
    $envMap = $scenario.Env
    $scenarioDir = Join-Path $RunRoot $name
    New-Item -ItemType Directory -Force -Path $scenarioDir | Out-Null

    foreach ($flag in $FlagNames) {
      Remove-Item "Env:$flag" -ErrorAction SilentlyContinue
    }

    foreach ($kv in $envMap.GetEnumerator()) {
      Set-Item "Env:$($kv.Key)" "$($kv.Value)"
    }

    $effective = @{}
    foreach ($flag in $FlagNames) {
      $effective[$flag] = [string](Get-Item "Env:$flag" -ErrorAction SilentlyContinue).Value
    }
    $effective | ConvertTo-Json | Set-Content (Join-Path $scenarioDir "env.json")

    Write-Host "=== $name ===" -ForegroundColor Green
    Write-Host ("Flags: " + (($effective.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ", "))

    $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev" -PassThru -WindowStyle Normal
    Start-Sleep -Seconds 12

    Read-Host "Launch your target profile ONCE in the app, wait until it finishes, then press Enter"

    if (Test-Path $LogPath) {
      Copy-Item $LogPath (Join-Path $scenarioDir "launch-latest.jsonl") -Force
      Write-Host "Saved: $(Join-Path $scenarioDir 'launch-latest.jsonl')" -ForegroundColor Cyan
    } else {
      Write-Warning "Log not found: $LogPath"
    }

    Read-Host "Press Enter to stop this dev session and continue"
    Stop-ProcTree -Pid $proc.Id
    Start-Sleep -Seconds 3
    Write-Host ""
  }
}
finally {
  Pop-Location
}

Write-Host "Done. Bench artifacts: $RunRoot" -ForegroundColor Magenta
