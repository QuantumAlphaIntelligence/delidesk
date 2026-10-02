export type RailLang = 'pt' | 'en' | 'es'

const STORAGE_KEY = 'delivai_language'

const COPY: Record<RailLang, Record<string, string>> = {
  pt: {
    pdv: 'PDV',
    delivery: 'Delivery',
    delivery_title: 'Delivery — despacho e Fast Order',
    motoboys: 'Motoboys',
    conversations: 'Conversas',
    schedule: 'Agendamentos',
    manager: 'Vendas',
    company: 'Empresa',
    employees: 'Colaboradores',
    clients: 'Clientes',
    license: 'Licença',
    print: 'Impressão',
    print_hint: 'Fila e agente',
    section_orders: 'Pedidos',
    section_store: 'Loja',
    section_machine: 'Máquina',
    online: 'Online',
    offline: 'Offline',
    logout: 'Sair',
    reload: 'Recarregar',
    open_browser: 'Abrir no navegador',
    language: 'Idioma',
    offline_panel: 'Sem internet — painel e WhatsApp indisponíveis',
    offline_wait: 'Quando a rede voltar, o painel carrega de novo.',
    print_pending: 'Para imprimir',
    print_done: 'Já impresso',
    print_empty_pending: 'Nada na fila.',
    print_empty_done: 'Nenhum cupom impresso ainda.',
    print_queued: 'Na fila',
    print_printing: 'Imprimindo',
    print_printed: 'Impresso',
    print_failed: 'Falhou',
    print_cancelled: 'Cancelado',
  },
  en: {
    pdv: 'POS',
    delivery: 'Delivery',
    delivery_title: 'Delivery — dispatch and Fast Order',
    motoboys: 'Couriers',
    conversations: 'Chats',
    schedule: 'Appointments',
    manager: 'Sales',
    company: 'Company',
    employees: 'Staff',
    clients: 'Clients',
    license: 'License',
    print: 'Print',
    print_hint: 'Queue and agent',
    section_orders: 'Orders',
    section_store: 'Store',
    section_machine: 'Machine',
    online: 'Online',
    offline: 'Offline',
    logout: 'Log out',
    reload: 'Reload',
    open_browser: 'Open in browser',
    language: 'Language',
    offline_panel: 'No internet — panel and WhatsApp unavailable',
    offline_wait: 'When the network is back, the panel loads again.',
    print_pending: 'To print',
    print_done: 'Printed',
    print_empty_pending: 'Nothing in the queue.',
    print_empty_done: 'No printed receipt yet.',
    print_queued: 'Queued',
    print_printing: 'Printing',
    print_printed: 'Printed',
    print_failed: 'Failed',
    print_cancelled: 'Cancelled',
  },
  es: {
    pdv: 'PDV',
    delivery: 'Delivery',
    delivery_title: 'Delivery — despacho y Fast Order',
    motoboys: 'Repartidores',
    conversations: 'Chats',
    schedule: 'Citas',
    manager: 'Ventas',
    company: 'Empresa',
    employees: 'Colaboradores',
    clients: 'Clientes',
    license: 'Licencia',
    print: 'Impresión',
    print_hint: 'Cola y agente',
    section_orders: 'Pedidos',
    section_store: 'Tienda',
    section_machine: 'Máquina',
    online: 'En línea',
    offline: 'Sin conexión',
    logout: 'Salir',
    reload: 'Recargar',
    open_browser: 'Abrir en el navegador',
    language: 'Idioma',
    offline_panel: 'Sin internet — panel y WhatsApp no disponibles',
    offline_wait: 'Cuando vuelva la red, el panel carga de nuevo.',
    print_pending: 'Por imprimir',
    print_done: 'Ya impreso',
    print_empty_pending: 'Nada en la cola.',
    print_empty_done: 'Ningún cupón impreso todavía.',
    print_queued: 'En cola',
    print_printing: 'Imprimiendo',
    print_printed: 'Impreso',
    print_failed: 'Falló',
    print_cancelled: 'Cancelado',
  }
}

export function readRailLang(): RailLang {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'en' || raw === 'es' || raw === 'pt') return raw
  } catch {
    /* ignore */
  }
  return 'pt'
}

export function writeRailLang(lang: RailLang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* ignore */
  }
}

export function railText(lang: RailLang, key: string): string {
  return COPY[lang][key] || COPY.pt[key] || key
}
