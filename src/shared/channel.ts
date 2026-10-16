export type DelideskChannel = 'prod' | 'sandbox'

/**
 * Canal do app.
 * - `prod` ou `sandbox` explícitos (env ou channel.json) ganham.
 * - Sem canal: instalador (empacotado, inclusive versão antiga sem channel.json) é prod.
 * - Dev não empacotado, sem canal, fica sandbox.
 */
export function resolveDelideskChannel(packaged?: boolean): DelideskChannel {
  const raw = (process.env.DELIDESK_CHANNEL || process.env.CHANNEL || '')
    .trim()
    .toLowerCase()
  if (raw === 'prod' || raw === 'production') return 'prod'
  if (raw === 'sandbox') return 'sandbox'
  return isPackagedRuntime(packaged) ? 'prod' : 'sandbox'
}

function isPackagedRuntime(packaged?: boolean): boolean {
  if (typeof packaged === 'boolean') return packaged
  const proc = process as NodeJS.Process & { defaultApp?: boolean }
  return proc.defaultApp !== true
}
