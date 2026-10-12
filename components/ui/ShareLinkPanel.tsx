'use client'

import React, { useEffect, useState } from 'react'
import { Button, Group, Image, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconCopy, IconShare } from '@tabler/icons-react'
import { shareOrCopy } from '../../lib/ui/share'

export function ShareLinkPanel({ url, qr = false, title = 'Enlace de firma' }: { url: string; qr?: boolean; title?: string }) {
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!qr) return
    let cancelled = false
    import('qrcode')
      .then((m) => (m.default ?? m).toDataURL(url, { margin: 1, width: 512 }))
      .then((d: string) => !cancelled && setQrUrl(d))
      .catch(() => !cancelled && setQrUrl(null))
    return () => {
      cancelled = true
    }
  }, [url, qr])

  const share = async () => {
    const r = await shareOrCopy(url, title)
    if (r === 'copied') notifications.show({ message: 'Enlace copiado', color: 'green' })
    if (r === 'failed') notifications.show({ message: 'No se pudo compartir el enlace', color: 'red' })
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      notifications.show({ message: 'Enlace copiado', color: 'green' })
    } catch {
      notifications.show({ message: 'No se pudo copiar el enlace', color: 'red' })
    }
  }
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  return (
    <Stack gap="sm" data-testid="share-link-panel">
      <Text ff="monospace" fz="sm" style={{ wordBreak: 'break-all' }}>
        {url}
      </Text>
      <Group grow>
        <Button variant="default" leftSection={<IconCopy size={18} />} onClick={copy}>
          Copiar enlace
        </Button>
        {canShare ? (
          <Button leftSection={<IconShare size={18} />} onClick={share}>
            Compartir
          </Button>
        ) : null}
      </Group>
      {qr && qrUrl ? <Image src={qrUrl} alt="Código QR del enlace de firma" w={220} h={220} mx="auto" /> : null}
    </Stack>
  )
}
