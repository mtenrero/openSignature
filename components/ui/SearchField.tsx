'use client'

import React, { useEffect, useRef, useState } from 'react'
import { ActionIcon, TextInput } from '@mantine/core'
import { IconSearch, IconX } from '@tabler/icons-react'

export interface SearchFieldProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  label?: string
  debounceMs?: number
}

/** 16px input, clearable, debounced (200ms). Has an accessible name even without a visible label. */
export function SearchField({ value, onChange, placeholder = 'Buscar', label, debounceMs = 200 }: SearchFieldProps) {
  const [local, setLocal] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => setLocal(value), [value])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const push = (v: string, immediate = false) => {
    setLocal(v)
    if (timer.current) clearTimeout(timer.current)
    if (immediate) onChange(v)
    else timer.current = setTimeout(() => onChange(v), debounceMs)
  }
  return (
    <TextInput
      type="search"
      inputMode="search"
      enterKeyHint="search"
      label={label}
      aria-label={label ? undefined : placeholder}
      placeholder={placeholder}
      value={local}
      onChange={(e) => push(e.currentTarget.value)}
      leftSection={<IconSearch size={18} />}
      rightSection={
        local ? (
          <ActionIcon variant="subtle" color="gray" aria-label="Limpiar búsqueda" onClick={() => push('', true)}>
            <IconX size={16} />
          </ActionIcon>
        ) : null
      }
    />
  )
}
