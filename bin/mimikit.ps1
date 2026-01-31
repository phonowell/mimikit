# PowerShell wrapper: restarts tsx on exit code 75
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Resolve-Path (Join-Path $ScriptDir '..')

while ($true) {
  & pnpm exec tsx (Join-Path $Root 'src/cli.ts') @args
  $exitCode = $LASTEXITCODE

  if ($exitCode -eq 75) {
    Write-Host "[mimikit] restarting..."
    Start-Sleep -Seconds 1
    continue
  }

  Write-Host "[mimikit] exited with code $exitCode"
  exit $exitCode
}
