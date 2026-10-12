import { getStatusMeta } from './status'

export interface KioskOutcome {
  success: boolean
  title: string
  message: string
  /** Status label from getStatusMeta (null when the status could not be resolved). */
  label: string | null
  color: string
}

/**
 * What the kiosk tells the customer once the active request leaves the pending list.
 * Only a signed/completed request is a success; anything else (discarded elsewhere, expired...) must not say "Gracias".
 */
export function getKioskOutcome(status: string | null | undefined): KioskOutcome {
  if (status === 'signed' || status === 'completed') {
    const m = getStatusMeta('signature', status)
    return { success: true, title: 'Solicitud finalizada', message: 'Gracias. La tableta vuelve a quedar en espera.', label: m.label, color: m.color }
  }
  if (!status || status === 'pending') {
    return { success: false, title: 'Solicitud cerrada', message: 'La solicitud ya no está disponible. La tableta vuelve a quedar en espera.', label: null, color: 'gray' }
  }
  const m = getStatusMeta('signature', status)
  return { success: false, title: `Solicitud ${m.label.toLowerCase()}`, message: 'La firma no se ha completado. La tableta vuelve a quedar en espera.', label: m.label, color: m.color }
}
