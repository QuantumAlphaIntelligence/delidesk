export type PanelMode = 'orders' | 'chat'

export type PanelBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type CatalogItem = {
  id: string
  name: string
  price: number
  priceLabel: string
}

export type PdvaiLocalOrder = {
  id: string
  createdAt: number
  items: Array<{ itemId: string; name: string; qty: number; price: number }>
  total: number
  status: 'local' | 'syncing' | 'synced' | 'failed'
  printed: boolean
}

export type PdvaiState = {
  catalog: CatalogItem[]
  orders: PdvaiLocalOrder[]
  pendingSyncCount: number
  lastSyncAt: number | null
  forceOffline: boolean
}
