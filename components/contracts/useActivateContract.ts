'use client'

import { useState } from 'react'
import { notifications } from '@mantine/notifications'

export interface ActivatableContract {
  id: string
  name?: string
}

/** Activates a library contract (PUT /api/contracts/{id}/status). The caller applies the optimistic update. */
export function useActivateContract(onActivated: (id: string) => void) {
  const [activatingId, setActivatingId] = useState<string | null>(null)
  const activate = async (c: ActivatableContract) => {
    setActivatingId(c.id)
    try {
      const res = await fetch(`/api/contracts/${c.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo activar el contrato')
      onActivated(c.id)
      notifications.show({ title: 'Contrato activado', message: `«${c.name ?? 'Contrato'}» ya se puede enviar a firmar.`, color: 'green' })
    } catch (err: any) {
      notifications.show({ title: 'No se pudo activar', message: err?.message || 'Error al activar el contrato', color: 'red' })
    } finally {
      setActivatingId(null)
    }
  }
  return { activate, activatingId }
}
