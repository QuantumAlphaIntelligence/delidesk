$ErrorActionPreference = 'Continue'
$printerName = 'DeliDesk'
$portName = 'DeliDesk_TCP_19100'

if (Get-Printer -Name $printerName -ErrorAction SilentlyContinue) {
  Remove-Printer -Name $printerName -ErrorAction SilentlyContinue
}

if (Get-PrinterPort -Name $portName -ErrorAction SilentlyContinue) {
  Remove-PrinterPort -Name $portName -ErrorAction SilentlyContinue
}

Write-Output "OK removed"
