export type StatusKind = 'signature' | 'contract' | 'signatureType'
export interface StatusMeta {
  label: string
  /** Mantine color name */
  color: string
  /** Tabler icon name (without the Icon prefix handled by the consumer) */
  icon: string
}

const SIGNATURE: Record<string, StatusMeta> = {
  pending: { label: 'Pendiente', color: 'orange', icon: 'IconClock' },
  signed: { label: 'Firmada', color: 'green', icon: 'IconCircleCheck' },
  completed: { label: 'Firmada', color: 'green', icon: 'IconCircleCheck' },
  archived: { label: 'Archivada', color: 'gray', icon: 'IconArchive' },
  discarded: { label: 'Descartada', color: 'red', icon: 'IconTrash' },
  cancelled: { label: 'Descartada', color: 'red', icon: 'IconTrash' },
  canceled: { label: 'Descartada', color: 'red', icon: 'IconTrash' },
  expired: { label: 'Caducada', color: 'dark', icon: 'IconClockOff' },
  rejected: { label: 'Rechazada', color: 'red', icon: 'IconCircleX' },
}

const CONTRACT: Record<string, StatusMeta> = {
  draft: { label: 'Borrador', color: 'gray', icon: 'IconPencil' },
  active: { label: 'Activo', color: 'green', icon: 'IconCircleCheck' },
  archived: { label: 'Archivado', color: 'gray', icon: 'IconArchive' },
  pendingActivation: { label: 'Pendiente de activar', color: 'violet', icon: 'IconSparkles' },
}

const SIGNATURE_TYPE: Record<string, StatusMeta> = {
  email: { label: 'Email', color: 'blue', icon: 'IconMail' },
  sms: { label: 'SMS', color: 'teal', icon: 'IconMessage' },
  local: { label: 'En este dispositivo', color: 'grape', icon: 'IconDeviceMobile' },
  tablet: { label: 'Tableta', color: 'indigo', icon: 'IconDeviceTablet' },
  qr: { label: 'QR', color: 'cyan', icon: 'IconQrcode' },
}

const TABLES: Record<StatusKind, Record<string, StatusMeta>> = {
  signature: SIGNATURE,
  contract: CONTRACT,
  signatureType: SIGNATURE_TYPE,
}

/** Single source of truth for status labels/colours/icons. Unknown values are gray with the raw label. */
export function getStatusMeta(kind: StatusKind, status: string | null | undefined): StatusMeta {
  const raw = status == null ? '' : String(status)
  const table = TABLES[kind]
  const hit = Object.prototype.hasOwnProperty.call(table, raw) ? table[raw] : undefined
  return hit ?? { label: raw || 'Desconocido', color: 'gray', icon: 'IconHelp' }
}
