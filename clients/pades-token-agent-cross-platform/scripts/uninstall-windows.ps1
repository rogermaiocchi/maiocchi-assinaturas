$ErrorActionPreference = 'Stop'
$installDirectory = Join-Path $env:LOCALAPPDATA 'Maiocchi\PadesAgent'

Stop-ScheduledTask -TaskName 'MaiocchiPadesTokenAgent' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'MaiocchiPadesTokenAgent' -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force -Path $installDirectory -ErrorAction SilentlyContinue
