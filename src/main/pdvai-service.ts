import { randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app, net } from 'electron'
import type { CatalogItem, PdvaiLocalOrder, PdvaiState } from '../shared/pdvai'
import { buildOrderCoupon } from './escpos'
import { sendRawToPrinter } from './print-raw'
import { getSnapshot as getPrintSnapshot } from './print-service'
import { getMainWindow } from './window'
import { IPC } from '../shared/ipc'

const DEFAULT_CATALOG: CatalogItem[] = [
  { id: 'xb', name: 'X-Burger', price: 28.9, priceLabel: '28,90' },
  { id: 'refri', name: 'Refri', price: 8, priceLabel: '8,00' },
  { id: 'batata', name: 'Batata', price: 12, priceLabel: '12,00' },
  { id: 'combo', name: 'Combo', price: 39.9, priceLabel: '39,90' }
]

let catalog: CatalogItem[] = [...DEFAULT_CATALOG]
let orders: PdvaiLocalOrder[] = []
let lastSyncAt: number | null = null
let forceOffline = false
let localSeq = 9000

function storePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'pdvai-cache.json')
}

function persist(): void {
  writeFileSync(
    storePath(),
    JSON.stringify({ catalog, orders: orders.slice(0, 100), lastSyncAt, forceOffline, localSeq }, null, 2),
    'utf8'
  )
}

function load(): void {
  const path = storePath()
  if (!existsSync(path)) return
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as {
      catalog?: CatalogItem[]
      orders?: PdvaiLocalOrder[]
      lastSyncAt?: number | null
      forceOffline?: boolean
      localSeq?: number
    }
    if (Array.isArray(data.catalog) && data.catalog.length) catalog = data.catalog
    if (Array.isArray(data.orders)) orders = data.orders
    lastSyncAt = data.lastSyncAt ?? null
    forceOffline = Boolean(data.forceOffline)
    if (typeof data.localSeq === 'number') localSeq = data.localSeq
  } catch {
    /* ignore */
  }
}

function emit(): void {
  getMainWindow()?.webContents.send(IPC.PDVAI_STATE_CHANGED, getPdvaiState())
}

export function getPdvaiState(): PdvaiState {
  return {
    catalog,
    orders: [...orders].sort((a, b) => b.createdAt - a.createdAt),
    pendingSyncCount: orders.filter((o) => o.status === 'local' || o.status === 'failed').length,
    lastSyncAt,
    forceOffline
  }
}

export function setForceOffline(value: boolean): PdvaiState {
  forceOffline = value
  persist()
  emit()
  if (!value && net.isOnline()) {
    void syncPending()
  }
  return getPdvaiState()
}

export async function createLocalOrder(itemId: string, qty = 1): Promise<PdvaiState> {
  const item = catalog.find((c) => c.id === itemId)
  if (!item) throw new Error('Item não encontrado no cache')

  localSeq += 1
  const order: PdvaiLocalOrder = {
    id: `L${localSeq}`,
    createdAt: Date.now(),
    items: [{ itemId: item.id, name: item.name, qty, price: item.price }],
    total: item.price * qty,
    status: 'local',
    printed: false
  }
  orders.unshift(order)
  persist()
  emit()

  // Imprime cupom local
  const printer = getPrintSnapshot().defaultPrinter
  const coupon = buildOrderCoupon(order.id, [
    {
      name: `${qty}x ${item.name}`,
      price: (item.price * qty).toFixed(2).replace('.', ',')
    }
  ])
  if (printer) {
    const result = await sendRawToPrinter(printer, coupon.bytes, order.id)
    order.printed = result.ok
    persist()
    emit()
  }

  return getPdvaiState()
}

export async function syncPending(): Promise<PdvaiState> {
  if (forceOffline || !net.isOnline()) {
    return getPdvaiState()
  }

  const pending = orders.filter((o) => o.status === 'local' || o.status === 'failed')
  for (const order of pending) {
    order.status = 'syncing'
  }
  emit()

  // Stub até existir BE de sync: marca como sincronizado após delay curto
  await new Promise((r) => setTimeout(r, 600))
  for (const order of pending) {
    order.status = 'synced'
  }
  lastSyncAt = Date.now()
  persist()
  emit()
  return getPdvaiState()
}

export function initPdvai(): void {
  load()
  emit()
}
