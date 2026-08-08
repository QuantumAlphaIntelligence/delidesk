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
  source: 'test' | 'mock-sse' | 'callback' | 'backend' | 'virtual'
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
  /**
   * Feature Printer da plataforma (Dev). null = ainda não sincronizado.
   * false = lista impressoras, mas não usa fila de cupom DelivAI.
   */
  platformPrinterEnabled: boolean | null
  /** Feature virtual_capture (Dev). null = ainda não sincronizado. */
  platformVirtualCaptureEnabled: boolean | null
  /** Mapa completo de features globais (quando o BE enviar). */
  platformFeatures: Record<string, boolean> | null
  /** Impressora virtual Windows (entrada iFood → forward para térmica). */
  virtualPrinter: {
    supported: boolean
    installed: boolean
    listening: boolean
    /** Nome da fila Windows deste canal (prod: DeliDesk; sandbox: DeliDesk Test). */
    name: string
    channel: 'prod' | 'sandbox'
    listenPort: number
    lastError?: string
    lastForwardAt?: number
    /** Último envio à IA / captura. */
    lastCaptureStatus?:
      | 'idle'
      | 'sent'
      | 'order_created'
      | 'test_demo'
      | 'no_order'
      | 'error'
    lastCaptureMessage?: string
  }
}

export type PrintResult = {
  ok: boolean
  jobId?: string
  printerName?: string
  simulated?: boolean
  error?: string
  previewText?: string
}
