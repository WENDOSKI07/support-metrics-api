# Ejecutar con la API iniciada: powershell -File docs/demo.ps1
# Crea un ticket ficticio nuevo por ejecución. No elimina datos.
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:3000'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$headers = @{ Origin = $base; 'X-Requested-With' = 'support-metrics' }
$credential = Get-Credential -Message 'Cuenta de soporte local'
try {
    $login = @{ username = $credential.UserName; password = $credential.GetNetworkCredential().Password } | ConvertTo-Json
    $null = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -WebSession $session -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($login))
} finally { $login = $null; $credential = $null }


function Send-DemoJson($method, $path, $value) {
    $json = $value | ConvertTo-Json -Depth 5
    Invoke-RestMethod -WebSession $session -Headers $headers -Method $method -Uri "$base$path" -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json))
}

$ticket = Send-DemoJson 'Post' '/tickets' @{
    title = 'Prueba guiada de reporte'
    description = 'Ejemplo ficticio: el reporte no se descarga al solicitarlo.'
    category = 'functionality'
}
$id = $ticket.id
Send-DemoJson 'Post' "/tickets/$id/comments" @{ body = 'El problema aparece al seleccionar el reporte mensual.' }
Send-DemoJson 'Patch' "/tickets/$id/status" @{
    expectedVersion = 1; expectedStatus = 'open'; status = 'in_progress'; reason = 'Se inicia la revisión del reporte de demostración.'
}
Send-DemoJson 'Patch' "/tickets/$id/status" @{
    expectedVersion = 2; expectedStatus = 'in_progress'; status = 'resolved'; reason = 'Se corrigió la configuración y se comprobó la descarga ficticia.'
}
Invoke-RestMethod -WebSession $session -Uri "$base/tickets/$id"
Invoke-RestMethod -WebSession $session -Uri "$base/tickets/$id/history"
Invoke-RestMethod -WebSession $session -Uri "$base/metrics/tickets"

$null = Invoke-RestMethod -Method Post -Uri "$base/auth/logout" -WebSession $session -Headers $headers
