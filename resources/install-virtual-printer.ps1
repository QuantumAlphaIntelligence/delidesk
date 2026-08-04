$ErrorActionPreference = 'Stop'
$portName = 'DeliDesk_TCP_19100'
$printerName = 'DeliDesk'
$hostAddr = '127.0.0.1'
$port = 19100
$preferredDriver = 'Generic / Text Only'

# Garante o driver de texto (RAW). Sem ele o Windows cai no IPP Class Driver,
# que não envia bytes úteis para o listener TCP do DeliDesk.
try {
  if (-not (Get-PrinterDriver -Name $preferredDriver -ErrorAction SilentlyContinue)) {
    Add-PrinterDriver -Name $preferredDriver
  }
} catch {
  # Em alguns PCs o driver já está no store mas ainda não registrado.
  try { Add-PrinterDriver -Name $preferredDriver } catch { }
}

if (-not (Get-PrinterPort -Name $portName -ErrorAction SilentlyContinue)) {
  Add-PrinterPort -Name $portName -PrinterHostAddress $hostAddr -PortNumber $port
}

$existing = Get-Printer -Name $printerName -ErrorAction SilentlyContinue
if ($existing -and $existing.DriverName -ne $preferredDriver) {
  Remove-Printer -Name $printerName
  $existing = $null
}

if (-not $existing) {
  $drivers = @(
    $preferredDriver,
    'MS Publisher Color Printer',
    'Microsoft IPP Class Driver'
  )
  $ok = $false
  foreach ($d in $drivers) {
    try {
      if ($d -ne $preferredDriver) {
        if (-not (Get-PrinterDriver -Name $d -ErrorAction SilentlyContinue)) {
          try { Add-PrinterDriver -Name $d } catch { }
        }
      }
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

$final = Get-Printer -Name $printerName
if ($final.DriverName -ne $preferredDriver) {
  Write-Warning "DeliDesk criou com driver '$($final.DriverName)' (ideal: $preferredDriver). Captura iFood pode falhar."
}

Write-Output "OK $printerName driver=$($final.DriverName)"
