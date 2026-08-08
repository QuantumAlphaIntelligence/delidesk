export type PanelMode =
  | 'orders'
  | 'chat'
  | 'delivery'
  | 'motoboys'
  | 'schedule'
  | 'company'
  | 'license'
  | 'clients'
  | 'dev-home'
  | 'dev-licenses'
  | 'dev-contracts'
  | 'dev-evolution'
  | 'dev-bot'
  | 'dev-delidesk'
  | 'dev-companies'
  | 'dev-prompts'
  | 'dev-clients'
  | 'dev-database'
  | 'dev-logs'
  | 'dev-observability'
  | 'dev-permissoes'

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
