import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * No .exe, `app.getVersion()` vem do extraMetadata do builder.
 * Em `npm run dev` o Electron às vezes lê package.json errado (fica versão velha).
 * Lê o package.json do repo (name=delidesk) quando unpackaged.
 */
export function resolveDelideskVersion(): string {
  if (app.isPackaged) return app.getVersion()
  const roots = [process.cwd(), app.getAppPath()]
  for (const root of roots) {
    const file = join(root, 'package.json')
    if (!existsSync(file)) continue
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
        name?: string
        version?: string
      }
      if (parsed.name !== 'delidesk') continue
      const version = typeof parsed.version === 'string' ? parsed.version.trim() : ''
      if (version) return version
    } catch {
      /* próximo candidato */
    }
  }
  return app.getVersion()
}
