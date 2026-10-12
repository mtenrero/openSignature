'use client'

import React from 'react'
import { Button, Group, Select, Stack, TextInput } from '@mantine/core'
import { AdaptiveSheet } from '../ui/AdaptiveSheet'
import type { WalletBillingData } from './types'

export function BillingDataSheet({
  opened,
  onClose,
  value,
  onChange,
  onSave,
  saving,
}: {
  opened: boolean
  onClose: () => void
  value: WalletBillingData
  onChange: (updater: (prev: WalletBillingData) => WalletBillingData) => void
  onSave: () => void
  saving?: boolean
}) {
  const setAddr = (patch: Partial<NonNullable<WalletBillingData['address']>>) =>
    onChange((prev) => ({ ...prev, address: { ...prev.address!, ...patch } }))
  return (
    <AdaptiveSheet
      opened={opened}
      onClose={onClose}
      title="Datos de facturación"
      size="md"
      footer={
        <Group grow>
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button onClick={onSave} loading={saving}>Guardar</Button>
        </Group>
      }
    >
      <Stack gap="md">
        <TextInput label="Nombre de la empresa" placeholder="Mi Empresa S.L." value={value.companyName ?? ''} onChange={(e) => onChange((p) => ({ ...p, companyName: e.target.value }))} required autoComplete="organization" />
        <TextInput label="NIF/CIF" placeholder="B12345678" value={value.taxId ?? ''} onChange={(e) => onChange((p) => ({ ...p, taxId: e.target.value }))} required />
        <TextInput label="Dirección" placeholder="Calle Mayor 123" value={value.address?.street ?? ''} onChange={(e) => setAddr({ street: e.target.value })} required autoComplete="street-address" />
        <TextInput label="Ciudad" placeholder="Madrid" value={value.address?.city ?? ''} onChange={(e) => setAddr({ city: e.target.value })} required autoComplete="address-level2" />
        <TextInput label="Código postal" placeholder="28001" inputMode="numeric" value={value.address?.postalCode ?? ''} onChange={(e) => setAddr({ postalCode: e.target.value })} required autoComplete="postal-code" />
        <Select
          label="País"
          allowDeselect={false}
          value={value.address?.country ?? 'ES'}
          onChange={(v) => setAddr({ country: v || 'ES' })}
          data={[
            { value: 'ES', label: 'España' },
            { value: 'FR', label: 'Francia' },
            { value: 'IT', label: 'Italia' },
            { value: 'PT', label: 'Portugal' },
          ]}
        />
        <TextInput label="Provincia (opcional)" placeholder="Comunidad de Madrid" value={value.address?.state ?? ''} onChange={(e) => setAddr({ state: e.target.value })} />
        <TextInput label="Email de facturación (opcional)" type="email" inputMode="email" placeholder="facturacion@empresa.com" value={value.email ?? ''} onChange={(e) => onChange((p) => ({ ...p, email: e.target.value }))} />
        <TextInput label="Teléfono (opcional)" type="tel" placeholder="+34 123 456 789" value={value.phone ?? ''} onChange={(e) => onChange((p) => ({ ...p, phone: e.target.value }))} />
      </Stack>
    </AdaptiveSheet>
  )
}
