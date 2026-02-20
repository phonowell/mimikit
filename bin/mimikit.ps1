# PowerShell wrapper: restarts tsx on exit code 75
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Resolve-Path (Join-Path $ScriptDir '..')

while ($true) {
  & pnpm exec tsx (Join-Path $Root 'src/cli/index.ts') @args
  $exitCode = $LASTEXITCODE

  if ($exitCode -eq 75) {
    Write-Host "[mimikit] restarting..."
    & pnpm i
    if ($LASTEXITCODE -ne 0) {
      Write-Host "[mimikit] pnpm i failed, exit 1"
      exit 1
    }
    Start-Sleep -Seconds 1
    continue
  }

  Write-Host "[mimikit] exited with code $exitCode"
  exit $exitCode
}
