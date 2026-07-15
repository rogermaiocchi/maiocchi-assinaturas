param(
  [Parameter(Mandatory = $true)]
  [string]$BinaryPath,
  [switch]$AllowUnsigned
)

$ErrorActionPreference = 'Stop'
$source = (Resolve-Path $BinaryPath).Path
$signature = Get-AuthenticodeSignature -FilePath $source
if (-not $AllowUnsigned -and $signature.Status -ne 'Valid') {
  throw 'O binário deve possuir assinatura Authenticode válida.'
}

$installDirectory = Join-Path $env:LOCALAPPDATA 'Maiocchi\PadesAgent'
$destination = Join-Path $installDirectory 'maiocchi-pades-token-agent.exe'
New-Item -ItemType Directory -Force -Path $installDirectory | Out-Null
Copy-Item -Force -Path $source -Destination $destination

$action = New-ScheduledTaskAction -Execute $destination
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Days 3650) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'MaiocchiPadesTokenAgent' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'MaiocchiPadesTokenAgent'
Start-Sleep -Seconds 2

Invoke-RestMethod -Uri 'http://127.0.0.1:35100/v1/status' -Headers @{ Origin = 'https://assinatura.maiocchi.adv.br' }
