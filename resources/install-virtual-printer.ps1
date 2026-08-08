param(
  [string]$PrinterName = 'DeliDesk',
  [string]$PortName = 'DeliDesk_TCP_19100',
  [int]$Port = 19100
)

$ErrorActionPreference = 'Stop'
$hostAddr = '127.0.0.1'
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

if (-not (Get-PrinterPort -Name $PortName -ErrorAction SilentlyContinue)) {
  Add-PrinterPort -Name $PortName -PrinterHostAddress $hostAddr -PortNumber $Port
}

$existing = Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue
if ($existing -and $existing.DriverName -ne $preferredDriver) {
  Remove-Printer -Name $PrinterName
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
      Add-Printer -Name $PrinterName -DriverName $d -PortName $PortName
      $ok = $true
      break
    } catch {
      # tenta próximo driver
    }
  }
  if (-not $ok) {
    throw "Nenhum driver compatível para criar a impressora $PrinterName"
  }
}

$final = Get-Printer -Name $PrinterName
if ($final.DriverName -ne $preferredDriver) {
  Write-Warning "$PrinterName criou com driver '$($final.DriverName)' (ideal: $preferredDriver). Captura iFood pode falhar."
}

Write-Output "OK $PrinterName driver=$($final.DriverName) port=$Port"
