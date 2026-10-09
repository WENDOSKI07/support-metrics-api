# Ejecutar con la API iniciada: powershell -File docs/demo.ps1
# Crea un ticket ficticio nuevo por ejecución. No elimina datos.
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:3000'

function Send-DemoJson($method, $path, $value) {
    $json = $value | ConvertTo-Json -Depth 5
    Invoke-RestMethod -Method $method -Uri "$base$path" -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json))
}

$ticket = Send-DemoJson 'Post' '/tickets' @{
    title = 'Prueba guiada de reporte'
    description = 'Ejemplo ficticio: el reporte no se descarga al solicitarlo.'
    category = 'functionality'
}
$id = $ticket.id
Send-DemoJson 'Post' "/tickets/$id/comments" @{ body = 'El problema aparece al seleccionar el reporte mensual.' }
Send-DemoJson 'Patch' "/tickets/$id/status" @{
    expectedStatus = 'open'; status = 'in_progress'; reason = 'Se inicia la revisión del reporte de demostración.'
}
Send-DemoJson 'Patch' "/tickets/$id/status" @{
    expectedStatus = 'in_progress'; status = 'resolved'; reason = 'Se corrigió la configuración y se comprobó la descarga ficticia.'
}
Invoke-RestMethod "$base/tickets/$id"
Invoke-RestMethod "$base/tickets/$id/history"
Invoke-RestMethod "$base/metrics/tickets"
