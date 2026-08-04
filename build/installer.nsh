!macro customInstall
  DetailPrint "Instalando impressora virtual DeliDesk..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\install-virtual-printer.ps1"'
!macroend

!macro customUnInstall
  DetailPrint "Removendo impressora virtual DeliDesk..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\uninstall-virtual-printer.ps1"'
!macroend
