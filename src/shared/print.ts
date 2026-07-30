export type PrinterInfo = {
  name: string
  isDefault: boolean
  status?: string
  portName?: string
}

export type PrintJobStatus = 'queued' | 'printing' | 'done' | 'failed' | 'cancelled'

export type PrintJob = {
  id: string
  orderLabel: string
  status: PrintJobStatus
  createdAt: number
  updatedAt: number
  error?: string
  /** Preview text for UI (not the raw bytes). */
  previewText: string
  source: 'test' | 'mock-sse' | 'callback' | 'backend'
  /** Base64 ESC/POS — só no main/persist; strip no snapshot se preferir. Mantido para reimpressão. */
  contentBase64?: string
}

export type PrintStateSnapshot = {
  printers: PrinterInfo[]
  defaultPrinter: string | null
  jobs: PrintJob[]
  lastSuccess: {
    jobId: string
    printerName: string
    at: number
    previewText: string
  } | null
  mockSseRunning: boolean
  backendPollRunning: boolean
  /** true quando DELIDESK_AUTH_MOCK está ativo (fila mock). */
  authMock: boolean
}

export type PrintResult = {
  ok: boolean
  jobId?: string
  printerName?: string
  simulated?: boolean
  error?: string
  previewText?: string
}
