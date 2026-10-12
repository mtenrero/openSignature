'use client'

import React, { useEffect, useState } from 'react'
import { Alert, Button, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'

export interface UsageLimit {
  type: string
  current: number
  limit: number
  exceeded?: boolean
}

const LABELS: Record<string, string> = { contracts: 'Contratos', email_signatures: 'Firmas por Email', ai_usage: 'Generaciones IA' }

function exceededMessage(type: string, planName: string, limit: number) {
  if (type === 'email_signatures') {
    return planName.toLowerCase().includes('pago por uso') || limit === 0
      ? 'Las solicitudes de firma utilizan crédito del monedero (0,10€ cada una)'
      : 'Las nuevas solicitudes de firma utilizarán crédito adicional del monedero'
  }
  if (type === 'contracts') return 'Los nuevos contratos utilizarán crédito adicional del monedero (0,50€ cada uno)'
  if (type === 'ai_usage') return 'Has alcanzado tu límite de generaciones IA. Mejora tu plan para continuar.'
  return 'Límite excedido'
}

const bannerId = (l: UsageLimit) => `${l.type}_${l.exceeded ? 'exceeded' : 'warning'}`
const monthKey = () => `dismissedBanners_${new Date().toISOString().slice(0, 7)}`

/** ONE compact alert for every limit that is exceeded or at >= 80%. Close = this visit; "No mostrar más" = this month. */
export function SubscriptionBanner({ limits, planName = '' }: { limits?: UsageLimit[]; planName?: string }) {
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [muted, setMuted] = useState<Set<string>>(new Set())
  useEffect(() => {
    try {
      const saved = localStorage.getItem(monthKey())
      if (saved) setMuted(new Set(JSON.parse(saved)))
    } catch {}
  }, [])

  const shown = (limits ?? [])
    .filter((l) => l.exceeded || (l.limit > 0 && l.current / l.limit >= 0.8) || (l.type === 'email_signatures' && l.limit === 0 && l.current > 0))
    .filter((l) => !closed.has(bannerId(l)) && !muted.has(bannerId(l)))
  if (shown.length === 0) return null

  const exceeded = shown.filter((l) => l.exceeded || l.limit === 0)
  const mute = () => {
    const next = new Set(Array.from(muted).concat(exceeded.map(bannerId)))
    setMuted(next)
    try {
      localStorage.setItem(monthKey(), JSON.stringify(Array.from(next)))
    } catch {}
  }
  return (
    <Alert
      color={exceeded.length ? 'orange' : 'yellow'}
      variant="light"
      icon={<IconAlertTriangle size={18} />}
      title="Uso de tu plan"
      withCloseButton
      closeButtonLabel="Cerrar aviso"
      onClose={() => setClosed(new Set(Array.from(closed).concat(shown.map(bannerId))))}
      data-testid="subscription-banner"
    >
      {shown.map((l) => (
        <Text key={l.type} fz="sm">
          <strong>{LABELS[l.type] ?? l.type}</strong>: {l.current} / {l.limit === -1 ? '∞' : l.limit}
          {l.exceeded || l.limit === 0 ? ` · ${exceededMessage(l.type, planName, l.limit)}` : ''}
        </Text>
      ))}
      {exceeded.length > 0 && (
        <Button variant="subtle" color="gray" size="sm" mt={4} px={0} onClick={mute}>
          No mostrar más
        </Button>
      )}
    </Alert>
  )
}
