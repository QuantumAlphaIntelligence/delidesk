import { createHash, randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import os from 'os'
import type {
  PrintJob,
  PrintResult,
  PrintStateSnapshot,
  PrinterInfo
} from '../shared/print'
import { isAuthMockEnabled } from '../shared/config'
import { buildOrderCoupon, buildTestCoupon } from './escpos'
import { previewFromEscPos } from './escpos-preview'
import { listPrinters, sendRawToPrinter } from './print-raw'
import { getMainWindow } from './window'
import { IPC } from '../shared/ipc'
import { getSession, isMockSession } from './auth-store'
import {
  AgentAuthError,
  fetchNextJob,
  postJobResult,
  postVirtualCapture,
  reportPrinters
} from './agent-api'
import {
  ensureVirtualPrinter,
  getVirtualPrinterStatus,
  installVirtualPrinterElevated,
  isVirtualPrinterName,
  refreshVirtualInstalledFlag,
  setVirtualJobHandler,
  startVirtualPrinterListener,
  stopVirtualPrinterListener
} from './virtual-printer-win'

type Persisted = {
  defaultPrinter: string | null
  jobs: PrintJob[]
  lastSuccess: PrintStateSnapshot['lastSuccess']
}

const POLL_BASE_MS = 4_000
const POLL_MAX_MS = 30_000
const RECENT_JOB_LIMIT = 64

let printers: PrinterInfo[] = []
let defaultPrinter: string | null = null
let jobs: PrintJob[] = []
let lastSuccess: PrintStateSnapshot['lastSuccess'] = null
let mockSseTimer: NodeJS.Timeout | null = null
let mockOrderSeq = 1840
let processing = false
/** Jobs que o usuário pediu para cancelar enquanto printing. */
const cancelRequested = new Set<string>()

let backendPollTimer: NodeJS.Timeout | null = null
let backendPollDesired = false
let pollDelayMs = POLL_BASE_MS
let pollInFlight = false
const recentBackendJobIds: string[] = []
let lastCaptureStatus:
  | 'idle'
  | 'sent'
  | 'order_created'
  | 'test_demo'
  | 'no_order'
  | 'error' = 'idle'
let lastCaptureMessage: string | undefined

function authMock(): boolean {
  return isAuthMockEnabled(app.isPackaged)
}

function storePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'print-queue.json')
}

function persist(): void {
  const data: Persisted = { defaultPrinter, jobs: jobs.slice(0, 50), lastSuccess }
  writeFileSync(storePath(), JSON.stringify(data, null, 2), 'utf8')
}

function load(): void {
  const path = storePath()
  if (!existsSync(path)) return
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Persisted
    defaultPrinter = data.defaultPrinter ?? null
    jobs = Array.isArray(data.jobs) ? data.jobs : []
    lastSuccess = data.lastSuccess ?? null
  } catch {
    /* ignore */
  }
}

function emit(): void {
  getMainWindow()?.webContents.send(IPC.PRINT_STATE_CHANGED, getSnapshot())
}

export function getSnapshot(): PrintStateSnapshot {
  const sorted = [...jobs].sort((a, b) => b.createdAt - a.createdAt)
  const vp = getVirtualPrinterStatus()
  return {
    printers,
    defaultPrinter,
    // Não envia ESC/POS bruto ao renderer (só previewText).
    jobs: sorted.map(({ contentBase64: _b64, ...rest }) => rest),
    lastSuccess,
    mockSseRunning: mockSseTimer !== null,
    backendPollRunning: backendPollDesired,
    authMock: authMock(),
    virtualPrinter: {
      supported: process.platform === 'win32',
      installed: vp.installed,
      listening: vp.listening,
      lastError: vp.lastError,
      lastForwardAt: vp.lastForwardAt,
      lastCaptureStatus,
      lastCaptureMessage
    }
  }
}

function rememberBackendJobId(id: string): void {
  if (recentBackendJobIds.includes(id)) return
  recentBackendJobIds.push(id)
  while (recentBackendJobIds.length > RECENT_JOB_LIMIT) {
    recentBackendJobIds.shift()
  }
}

function hasRecentBackendJob(id: string): boolean {
  return recentBackendJobIds.includes(id)
}

/** Reporta impressoras locais ao BE; ignora erro de rede. */
export async function reportLocalPrinters(): Promise<void> {
  const session = getSession()
  if (!session || isMockSession(session) || authMock()) return
  try {
    await reportPrinters(
      printers.map((p) => ({
        name: p.name,
        is_default: p.name === defaultPrinter
      }))
    )
  } catch (err) {
    console.warn('[print] report printers failed', err)
  }
}

export async function refreshPrinters(): Promise<PrintStateSnapshot> {
  const all = await listPrinters()
  // Virtual DeliDesk é entrada (iFood); destino é sempre a térmica física.
  printers = all.filter((p) => !isVirtualPrinterName(p.name))
  await refreshVirtualInstalledFlag()
  const stillThere = defaultPrinter && printers.some((p) => p.name === defaultPrinter)
  if (!stillThere) {
    defaultPrinter =
      printers.find((p) => p.isDefault)?.name ?? printers[0]?.name ?? null
  }
  persist()
  emit()
  void reportLocalPrinters()
  return getSnapshot()
}

export function setDefaultPrinter(name: string): PrintStateSnapshot {
  if (isVirtualPrinterName(name)) {
    return getSnapshot()
  }
  defaultPrinter = name
  persist()
  emit()
  void reportLocalPrinters()
  return getSnapshot()
}

async function handleVirtualPrintJob(bytes: Buffer): Promise<void> {
  const preview =
    bytes.length > 0
      ? previewFromEscPos(bytes).slice(0, 400) || `Job virtual (${bytes.length} bytes)`
      : 'Job virtual vazio'
  const contentBase64 = bytes.toString('base64')
  const job: PrintJob = {
    id: newJobId(),
    orderLabel: `Virtual #${Date.now().toString().slice(-4)}`,
    status: 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    previewText: preview,
    source: 'virtual',
    contentBase64
  }
  jobs.unshift(job)
  persist()
  emit()
  // 1) Forward para térmica (teste iFood / cozinha)
  await printBytes(job, bytes, preview)
  // 2) Upload base64 → IA → pedido em análise (se houver itens)
  if (bytes.length === 0) return
  const session = getSession()
  if (!session || isMockSession(session) || authMock()) {
    lastCaptureStatus = 'idle'
    lastCaptureMessage = 'Sem sessão real — captura IA ignorada'
    emit()
    return
  }
  lastCaptureStatus = 'sent'
  lastCaptureMessage = 'Enviando cupom à IA…'
  emit()
  try {
    const sha = createHash('sha256').update(bytes).digest('hex')
    const result = await postVirtualCapture({
      contentBase64,
      byteLength: bytes.length,
      contentSha256: sha,
      machineLabel: `${os.hostname()} · DeliDesk`
    })
    if (!result.ok) {
      lastCaptureStatus = 'error'
      lastCaptureMessage = result.error || 'Falha ao capturar pedido'
    } else if (result.testPrint && result.orderCreated) {
      lastCaptureStatus = 'test_demo'
      lastCaptureMessage =
        'Impressão teste detectada — pedido de demonstração no painel (Em análise)'
    } else if (result.orderCreated) {
      lastCaptureStatus = 'order_created'
      lastCaptureMessage = result.duplicate
        ? 'Pedido já existia (dedupe)'
        : `Pedido #${result.orderId ?? '?'} em análise — aprove no painel`
    } else if (result.testPrint) {
      lastCaptureStatus = 'test_demo'
      lastCaptureMessage =
        'Impressão teste detectada — cadastre produtos no cardápio para ver a demo'
    } else {
      lastCaptureStatus = 'no_order'
      lastCaptureMessage =
        result.error || 'Job recebido; sem itens para criar pedido'
    }
  } catch (err) {
    if (err instanceof AgentAuthError) {
      lastCaptureStatus = 'error'
      lastCaptureMessage = 'Sessão expirada — entre de novo no DeliDesk'
    } else {
      lastCaptureStatus = 'error'
      lastCaptureMessage = 'Não foi possível enviar o cupom. Tente de novo.'
      console.warn('[virtual-printer] capture upload failed', err)
    }
  }
  emit()
}

/** CTA na tela Impressão — UAC se necessário. */
export async function installVirtualPrinter(): Promise<PrintStateSnapshot> {
  const soft = await ensureVirtualPrinter()
  if (!soft.ok) {
    await installVirtualPrinterElevated()
  }
  await refreshPrinters()
  return getSnapshot()
}

function newJobId(): string {
  return `job_${Date.now()}_${randomBytes(3).toString('hex')}`
}

async function printBytes(
  job: PrintJob,
  bytes: Buffer,
  previewText: string
): Promise<PrintResult> {
  const printerName = defaultPrinter
  if (!printerName) {
    job.status = 'failed'
    job.error = 'Nenhuma impressora padrão'
    job.updatedAt = Date.now()
    persist()
    emit()
    return { ok: false, error: job.error, jobId: job.id }
  }

  job.status = 'printing'
  job.updatedAt = Date.now()
  emit()

  if (cancelRequested.has(job.id)) {
    cancelRequested.delete(job.id)
    job.status = 'cancelled'
    job.error = 'Cancelado'
    job.updatedAt = Date.now()
    persist()
    emit()
    return { ok: false, jobId: job.id, error: job.error, previewText }
  }

  const result = await sendRawToPrinter(printerName, bytes, job.orderLabel)
  job.updatedAt = Date.now()

  if (cancelRequested.has(job.id)) {
    cancelRequested.delete(job.id)
    job.status = 'cancelled'
    job.error = 'Cancelado'
    persist()
    emit()
    return { ok: false, jobId: job.id, error: job.error, previewText }
  }

  if (result.ok) {
    job.status = 'done'
    lastSuccess = {
      jobId: job.id,
      printerName,
      at: Date.now(),
      previewText
    }
    persist()
    emit()
    return {
      ok: true,
      jobId: job.id,
      printerName,
      simulated: result.simulated,
      previewText
    }
  }

  job.status = 'failed'
  job.error = result.error ?? 'Falha ao imprimir'
  persist()
  emit()
  return { ok: false, jobId: job.id, error: job.error, previewText }
}

export async function printTestCoupon(): Promise<PrintResult> {
  const coupon = buildTestCoupon(`Pedido #T${Date.now().toString().slice(-4)}`)
  const job: PrintJob = {
    id: newJobId(),
    orderLabel: coupon.orderLabel,
    status: 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    previewText: coupon.previewText,
    source: 'test',
    contentBase64: coupon.bytes.toString('base64')
  }
  jobs.unshift(job)
  persist()
  emit()
  return printBytes(job, coupon.bytes, coupon.previewText)
}

export async function reprintLast(): Promise<PrintResult> {
  if (!lastSuccess) {
    return { ok: false, error: 'Nenhum cupom recente' }
  }
  return reprintJob(lastSuccess.jobId)
}

export function ackJob(jobId: string): PrintStateSnapshot {
  const job = jobs.find((j) => j.id === jobId)
  if (job && job.status === 'done') {
    job.updatedAt = Date.now()
    persist()
    emit()
  }
  return getSnapshot()
}

/** Cancela job na fila local (queued) ou marca cancelamento se ainda printing. */
export async function cancelJob(jobId: string): Promise<PrintStateSnapshot> {
  const job = jobs.find((j) => j.id === jobId)
  if (!job) return getSnapshot()

  if (job.status === 'queued') {
    job.status = 'cancelled'
    job.error = 'Cancelado'
    job.updatedAt = Date.now()
    persist()
    emit()
    if (job.source === 'backend') {
      try {
        await postJobResult(job.id, false, 'Cancelado no app')
      } catch (err) {
        console.warn('[print] cancel ack failed', jobId, err)
      }
    }
    return getSnapshot()
  }

  if (job.status === 'printing') {
    cancelRequested.add(jobId)
    job.error = 'Cancelando…'
    job.updatedAt = Date.now()
    emit()
    return getSnapshot()
  }

  return getSnapshot()
}

/** Reimprime um job já feito/falho a partir do ESC/POS guardado (ou regenera cupom de teste). */
export async function reprintJob(jobId: string): Promise<PrintResult> {
  const original = jobs.find((j) => j.id === jobId)
  if (!original) {
    return { ok: false, error: 'Job não encontrado' }
  }

  let bytes: Buffer
  let previewText = original.previewText

  if (original.contentBase64) {
    bytes = Buffer.from(original.contentBase64, 'base64')
  } else if (original.source === 'mock-sse' || original.source === 'test') {
    const coupon =
      original.source === 'mock-sse'
        ? buildOrderCoupon(original.orderLabel.replace(/\D/g, '') || '0000', [
            { name: '1x X-Burger', price: '28,90' },
            { name: '1x Refri', price: '8,00' }
          ])
        : buildTestCoupon(original.orderLabel)
    bytes = coupon.bytes
    previewText = coupon.previewText
  } else {
    return {
      ok: false,
      error: 'Sem dados ESC/POS para reimprimir este cupom'
    }
  }

  const job: PrintJob = {
    id: newJobId(),
    orderLabel: `${original.orderLabel} (reimpressão)`,
    status: 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    previewText,
    source: original.source === 'backend' ? 'backend' : 'test',
    contentBase64: original.contentBase64 ?? bytes.toString('base64')
  }
  jobs.unshift(job)
  persist()
  emit()
  return printBytes(job, bytes, previewText)
}

async function processQueued(): Promise<void> {
  if (processing) return
  processing = true
  try {
    while (true) {
      const next = jobs.find((j) => j.status === 'queued')
      if (!next) return

      if (next.contentBase64) {
        const bytes = Buffer.from(next.contentBase64, 'base64')
        if (!next.previewText || next.previewText === next.orderLabel) {
          next.previewText = previewFromEscPos(bytes)
        }
        await printBytes(next, bytes, next.previewText)
        continue
      }

      const coupon =
        next.source === 'mock-sse'
          ? buildOrderCoupon(next.orderLabel.replace(/\D/g, '') || '0000', [
              { name: '1x X-Burger', price: '28,90' },
              { name: '1x Refri', price: '8,00' }
            ])
          : buildTestCoupon(next.orderLabel)
      next.previewText = coupon.previewText
      next.contentBase64 = coupon.bytes.toString('base64')
      await printBytes(next, coupon.bytes, coupon.previewText)
    }
  } finally {
    processing = false
  }
}

function enqueueMockJob(): void {
  mockOrderSeq += 1
  const orderId = String(mockOrderSeq)
  const coupon = buildOrderCoupon(orderId, [
    { name: '1x X-Burger', price: '28,90' },
    { name: '1x Refri', price: '8,00' }
  ])
  const job: PrintJob = {
    id: newJobId(),
    orderLabel: coupon.orderLabel,
    status: 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    previewText: coupon.previewText,
    source: 'mock-sse',
    contentBase64: coupon.bytes.toString('base64')
  }
  jobs.unshift(job)
  persist()
  emit()
  void processQueued()
}

export function startMockSse(): PrintStateSnapshot {
  if (mockSseTimer) return getSnapshot()
  // primeiro job em 3s, depois a cada 45s
  mockSseTimer = setInterval(() => enqueueMockJob(), 45_000)
  setTimeout(() => enqueueMockJob(), 3_000)
  emit()
  return getSnapshot()
}

export function stopMockSse(): PrintStateSnapshot {
  if (mockSseTimer) {
    clearInterval(mockSseTimer)
    mockSseTimer = null
  }
  emit()
  return getSnapshot()
}

function scheduleBackendPoll(delay: number): void {
  if (backendPollTimer) {
    clearTimeout(backendPollTimer)
    backendPollTimer = null
  }
  if (!backendPollDesired) return
  backendPollTimer = setTimeout(() => {
    void runBackendPollTick()
  }, delay)
}

async function runBackendPollTick(): Promise<void> {
  if (!backendPollDesired || pollInFlight) {
    if (backendPollDesired && !pollInFlight) scheduleBackendPoll(pollDelayMs)
    return
  }

  pollInFlight = true
  try {
    const session = getSession()
    if (!session || isMockSession(session)) {
      stopBackendPoll()
      return
    }

    const agentJob = await fetchNextJob()
    pollDelayMs = POLL_BASE_MS

    if (!agentJob) {
      return
    }

    if (hasRecentBackendJob(agentJob.id)) {
      console.warn('[print] skipping already-seen job', agentJob.id)
      return
    }
    rememberBackendJobId(agentJob.id)

    const orderLabel =
      agentJob.title ||
      (agentJob.order_id != null ? `Pedido #${agentJob.order_id}` : `Job ${agentJob.id.slice(0, 8)}`)

    console.info('[print] backend job', {
      id: agentJob.id,
      title: agentJob.title,
      order_id: agentJob.order_id
    })

    const bytes = Buffer.from(agentJob.content_base64, 'base64')
    const previewText = previewFromEscPos(bytes)

    const job: PrintJob = {
      id: agentJob.id,
      orderLabel,
      status: 'queued',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      previewText,
      source: 'backend',
      contentBase64: agentJob.content_base64
    }
    jobs.unshift(job)
    persist()
    emit()

    if (cancelRequested.has(job.id)) {
      cancelRequested.delete(job.id)
      job.status = 'cancelled'
      job.error = 'Cancelado'
      job.updatedAt = Date.now()
      persist()
      emit()
      try {
        await postJobResult(agentJob.id, false, 'Cancelado no app')
      } catch (ackErr) {
        console.warn('[print] cancel ack failed', agentJob.id, ackErr)
      }
      return
    }

    const result = await printBytes(job, bytes, previewText)
    const cancelled = job.status === 'cancelled'
    try {
      await postJobResult(
        agentJob.id,
        result.ok && !cancelled,
        cancelled ? 'Cancelado no app' : result.ok ? undefined : result.error
      )
    } catch (ackErr) {
      console.warn('[print] ack failed', agentJob.id, ackErr)
    }
  } catch (err) {
    if (err instanceof AgentAuthError) {
      console.error('[print] auth lost, stopping poll', err.message)
      stopBackendPoll()
      return
    }
    console.warn('[print] poll tick failed', err)
    pollDelayMs = Math.min(POLL_MAX_MS, Math.round(pollDelayMs * 1.5))
  } finally {
    pollInFlight = false
    if (backendPollDesired) scheduleBackendPoll(pollDelayMs)
  }
}

export function startBackendPoll(): PrintStateSnapshot {
  if (backendPollDesired) return getSnapshot()
  backendPollDesired = true
  pollDelayMs = POLL_BASE_MS
  emit()
  scheduleBackendPoll(500)
  return getSnapshot()
}

export function stopBackendPoll(): PrintStateSnapshot {
  backendPollDesired = false
  if (backendPollTimer) {
    clearTimeout(backendPollTimer)
    backendPollTimer = null
  }
  pollDelayMs = POLL_BASE_MS
  emit()
  return getSnapshot()
}

/**
 * Remove cupons de fixture/mock da fila local (LOJA CENTRO / Maria / mock-sse).
 * Esses jobs ficam em userData/print-queue.json e NÃO são da loja autenticada.
 */
export function clearDemoPrintJobs(): PrintStateSnapshot {
  const before = jobs.length
  jobs = jobs.filter((j) => {
    if (j.source === 'test' || j.source === 'mock-sse') return false
    const preview = (j.previewText ?? '').toUpperCase()
    if (preview.includes('FIXTURE DE TESTE')) return false
    if (preview.includes('LOJA CENTRO') && preview.includes('MARIA')) return false
    return true
  })
  if (jobs.length !== before) {
    console.info('[print] cleared demo/fixture jobs', { removed: before - jobs.length })
    persist()
    emit()
  }
  return getSnapshot()
}

/** Após login real: limpa fixtures locais, reporta impressoras e inicia poll. */
export async function onRealSessionReady(): Promise<void> {
  stopMockSse()
  clearDemoPrintJobs()
  await refreshPrinters()
  startBackendPoll()
}

export async function initPrintService(): Promise<void> {
  load()
  // Se já há sessão real (cold start), não reexibir fila de mock de runs anteriores
  const session = getSession()
  if (session && !isMockSession(session) && !authMock()) {
    clearDemoPrintJobs()
  }
  setVirtualJobHandler((bytes) => {
    void handleVirtualPrintJob(bytes)
  })
  startVirtualPrinterListener()
  // Fallback: cria fila Spooler se o instalador NSIS não rodou (dev / sem admin).
  void ensureVirtualPrinter().then(() => refreshVirtualInstalledFlag().then(() => emit()))
  await refreshPrinters()
  // process leftover queued jobs from previous run
  void processQueued()
}

export function shutdownPrintService(): void {
  stopVirtualPrinterListener()
  setVirtualJobHandler(null)
  stopBackendPoll()
  stopMockSse()
}
