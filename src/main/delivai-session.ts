import { session, type Session } from 'electron'

/** Partition compartilhada: login em /autorizar e painel Pedidos/Conversas. */
export const DELIVAI_SESSION_PARTITION = 'persist:delivai'

export function getDelivaiSession(): Session {
  return session.fromPartition(DELIVAI_SESSION_PARTITION)
}
