/** Gera bytes ESC/POS de cupom de teste (fixture V1). */

function textLine(text: string): Buffer {
  return Buffer.from(`${text}\n`, 'latin1')
}

export type CouponFixture = {
  orderLabel: string
  previewText: string
  bytes: Buffer
  base64: string
}

export function buildTestCoupon(orderLabel = 'Pedido #TEST'): CouponFixture {
  const lines = [
    'LOJA CENTRO',
    'DelivAI / DeliDesk',
    '--------------------------------',
    orderLabel,
    'Fixture de teste · ESC/POS',
    '--------------------------------',
    '1x X-Burger              28,90',
    '1x Refri                  8,00',
    '--------------------------------',
    'TOTAL                    36,90',
    '',
    'Obrigado!',
    ''
  ]

  const parts: Buffer[] = []
  // ESC @ init
  parts.push(Buffer.from([0x1b, 0x40]))
  // Align center
  parts.push(Buffer.from([0x1b, 0x61, 0x01]))
  parts.push(textLine(lines[0]))
  parts.push(textLine(lines[1]))
  // Align left
  parts.push(Buffer.from([0x1b, 0x61, 0x00]))
  for (const line of lines.slice(2)) {
    parts.push(textLine(line))
  }
  // Feed + partial cut
  parts.push(Buffer.from([0x0a, 0x0a, 0x0a]))
  parts.push(Buffer.from([0x1d, 0x56, 0x01]))

  const bytes = Buffer.concat(parts)
  return {
    orderLabel,
    previewText: lines.join('\n'),
    bytes,
    base64: bytes.toString('base64')
  }
}

export function buildOrderCoupon(
  orderId: string,
  items: Array<{ name: string; price: string }>
): CouponFixture {
  const orderLabel = `Pedido #${orderId}`
  const itemLines = items.map(
    (i) => `${i.name.padEnd(22, ' ').slice(0, 22)}${i.price.padStart(8, ' ')}`
  )
  const lines = [
    'LOJA CENTRO',
    'DelivAI',
    '--------------------------------',
    orderLabel,
    'Maria · Delivery',
    '--------------------------------',
    ...itemLines,
    '--------------------------------',
    'TOTAL'.padEnd(22, ' ') + '36,90'.padStart(8, ' '),
    '',
    'Obrigado!',
    ''
  ]

  const parts: Buffer[] = []
  parts.push(Buffer.from([0x1b, 0x40]))
  parts.push(Buffer.from([0x1b, 0x61, 0x01]))
  parts.push(textLine(lines[0]))
  parts.push(textLine(lines[1]))
  parts.push(Buffer.from([0x1b, 0x61, 0x00]))
  for (const line of lines.slice(2)) {
    parts.push(textLine(line))
  }
  parts.push(Buffer.from([0x0a, 0x0a, 0x0a]))
  parts.push(Buffer.from([0x1d, 0x56, 0x01]))

  const bytes = Buffer.concat(parts)
  return {
    orderLabel,
    previewText: lines.join('\n'),
    bytes,
    base64: bytes.toString('base64')
  }
}
