param(
  [string]$PrinterName = 'DeliDesk',
  [string]$PortName = 'DeliDesk_TCP_19100'
)

$ErrorActionPreference = 'Continue'

if (Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue) {
  Remove-Printer -Name $PrinterName -ErrorAction SilentlyContinue
}

if (Get-PrinterPort -Name $PortName -ErrorAction SilentlyContinue) {
  Remove-PrinterPort -Name $PortName -ErrorAction SilentlyContinue
}

Write-Output "OK removed $PrinterName"
