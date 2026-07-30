import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { app } from 'electron'
import type { PrinterInfo } from '../shared/print'

const execFileAsync = promisify(execFile)

function ps(command: string): Promise<string> {
  return execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { windowsHide: true, maxBuffer: 2 * 1024 * 1024 }
  ).then((r) => r.stdout.trim())
}

export async function listPrinters(): Promise<PrinterInfo[]> {
  if (process.platform !== 'win32') {
    return [
      {
        name: 'Mock Thermal 80mm (dev)',
        isDefault: true,
        status: 'simulated',
        portName: 'MOCK:'
      },
      {
        name: 'Cozinha 2 (dev)',
        isDefault: false,
        status: 'simulated',
        portName: 'MOCK:2'
      }
    ]
  }

  try {
    const json = await ps(
      `Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus,@{N='Default';E={$_.Name -eq (Get-CimInstance Win32_Printer | Where-Object Default).Name}} | ConvertTo-Json -Compress`
    )
    if (!json) return []
    const parsed = JSON.parse(json) as
      | Array<Record<string, unknown>>
      | Record<string, unknown>
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    return rows.map((r) => ({
      name: String(r.Name ?? ''),
      isDefault: Boolean(r.Default),
      status: String(r.PrinterStatus ?? ''),
      portName: String(r.PortName ?? '')
    })).filter((p) => p.name)
  } catch {
    return []
  }
}

/**
 * Envia bytes raw à impressora Windows via winspool.
 * Em plataformas não-Windows (ou falha), grava arquivo simulado em userData.
 */
export async function sendRawToPrinter(
  printerName: string,
  data: Buffer,
  label: string
): Promise<{ ok: boolean; simulated: boolean; error?: string; savedPath?: string }> {
  const debugDir = join(app.getPath('userData'), 'print-debug')
  if (!existsSync(debugDir)) mkdirSync(debugDir, { recursive: true })
  const stamp = Date.now()
  const binPath = join(debugDir, `job-${stamp}.bin`)
  const txtPath = join(debugDir, `job-${stamp}.txt`)
  writeFileSync(binPath, data)
  writeFileSync(txtPath, data.toString('latin1'))

  if (process.platform !== 'win32') {
    return { ok: true, simulated: true, savedPath: txtPath }
  }

  const tmpRaw = join(tmpdir(), `delidesk-${stamp}.raw`)
  writeFileSync(tmpRaw, data)

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class DelivRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
  public static bool SendBytes(string printer, string doc, byte[] bytes) {
    IntPtr hPrinter;
    if (!OpenPrinter(printer.Normalize(), out hPrinter, IntPtr.Zero)) return false;
    var di = new DOCINFOA();
    di.pDocName = doc;
    di.pDataType = "RAW";
    if (!StartDocPrinter(hPrinter, 1, di)) { ClosePrinter(hPrinter); return false; }
    StartPagePrinter(hPrinter);
    IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
    Marshal.Copy(bytes, 0, p, bytes.Length);
    int written;
    bool ok = WritePrinter(hPrinter, p, bytes.Length, out written);
    Marshal.FreeCoTaskMem(p);
    EndPagePrinter(hPrinter);
    EndDocPrinter(hPrinter);
    ClosePrinter(hPrinter);
    return ok;
  }
}
"@
$bytes = [System.IO.File]::ReadAllBytes('${tmpRaw.replace(/'/g, "''")}')
$ok = [DelivRawPrint]::SendBytes('${printerName.replace(/'/g, "''")}', '${label.replace(/'/g, "''")}', $bytes)
if (-not $ok) { throw "WritePrinter failed for ${printerName.replace(/'/g, "''")}" }
Write-Output 'OK'
`

  try {
    await ps(script)
    try {
      unlinkSync(tmpRaw)
    } catch {
      /* ignore */
    }
    return { ok: true, simulated: false, savedPath: txtPath }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, simulated: false, error: message, savedPath: txtPath }
  }
}
