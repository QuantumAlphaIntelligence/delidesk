$ErrorActionPreference = 'Stop'
$portName = 'DeliDesk_TCP_19100'
$printerName = 'DeliDesk'
$hostAddr = '127.0.0.1'
$port = 19100

if (-not (Get-PrinterPort -Name $portName -ErrorAction SilentlyContinue)) {
  Add-PrinterPort -Name $portName -PrinterHostAddress $hostAddr -PortNumber $port
}

if (-not (Get-Printer -Name $printerName -ErrorAction SilentlyContinue)) {
  $drivers = @(
    'Generic / Text Only',
    'Microsoft IPP Class Driver',
    'MS Publisher Color Printer'
  )
  $ok = $false
  foreach ($d in $drivers) {
    try {
      Add-Printer -Name $printerName -DriverName $d -PortName $portName
      $ok = $true
      break
    } catch {
      # tenta próximo driver
    }
  }
  if (-not $ok) {
    throw 'Nenhum driver compatível para criar a impressora DeliDesk'
  }
}

Write-Output "OK $printerName"
