import { net } from 'electron'
import { sanitizeLogoUrl } from '../shared/branding'

const cache = new Map<string, string>()
const MAX_BYTES = 2_500_000

/**
 * Baixa o logo no processo main (sem CORS) e devolve data URL
 * para o shell Electron exibir com segurança.
 */
export async function resolveLogoForShell(
  raw: string | undefined | null
): Promise<string | undefined> {
  const url = sanitizeLogoUrl(raw)
  if (!url) return undefined
  if (url.startsWith('data:image/')) return url

  const hit = cache.get(url)
  if (hit) return hit

  try {
    const res = await net.fetch(url)
    if (!res.ok) {
      console.warn('[logo] HTTP', res.status, url.slice(0, 96))
      return undefined
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0 || buf.length > MAX_BYTES) return undefined
    const ctRaw = res.headers.get('content-type') || 'image/png'
    const ct = ctRaw.split(';')[0]?.trim() || 'image/png'
    if (!ct.startsWith('image/')) {
      console.warn('[logo] content-type não é imagem', ct)
      return undefined
    }
    const dataUrl = `data:${ct};base64,${buf.toString('base64')}`
    cache.set(url, dataUrl)
    return dataUrl
  } catch (err) {
    console.warn('[logo] fetch failed', url.slice(0, 96), err)
    return undefined
  }
}
