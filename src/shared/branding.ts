/** UUID v4 (e variantes comuns) — nunca usar como rótulo de loja na UI. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isLikelyUuid(value: string | undefined | null): boolean {
  const s = (value ?? '').trim()
  return s.length > 0 && UUID_RE.test(s)
}

/** Nome de loja exibível — rejeita UUID / vazio. */
export function sanitizeCompanyName(value: string | undefined | null): string | undefined {
  const s = (value ?? '').trim()
  if (!s || isLikelyUuid(s)) return undefined
  return s
}

export function displayCompanyName(
  session: { companyName?: string; companyId?: string } | null | undefined,
  fallback = 'Loja'
): string {
  return sanitizeCompanyName(session?.companyName) || fallback
}

/** Mascara CNPJ no padrão do front (2 dígitos, máscara, filial e DV). */
export function maskCnpj(raw: string | undefined | null): string {
  const d = (raw ?? '').replace(/\D/g, '')
  if (d.length !== 14) return ''
  return `${d.slice(0, 2)}.***.***/${d.slice(8, 12)}-${d.slice(12)}`
}

export function sanitizeLogoUrl(value: string | undefined | null): string | undefined {
  const s = (value ?? '').trim()
  if (!s) return undefined
  if (s.startsWith('data:image/')) return s
  if (s.startsWith('//')) return `https:${s}`
  if (/^https?:\/\//i.test(s)) return s
  return undefined
}
