'use client'

import React from 'react'
import Link from 'next/link'
import { Avatar, Box, Container, Stack, Text } from '@mantine/core'
import { IconChevronRight, IconLogout } from '@tabler/icons-react'
import { useSession } from 'next-auth/react'
import { PageHeader } from '../../components/ui'
import { ColorSchemeControl } from '../../components/shell/SideNav'
import { MORE_GROUPS } from '../../components/shell/navItems'
import { performSignOut } from '../../lib/ui/signOut'

export default function MorePage() {
  const { data: session } = useSession()
  const name = session?.user?.name || 'Usuario'
  return (
    <Container size="sm" px="md" pb="xl" data-testid="page-content">
      <PageHeader title="Más" large />
      <Stack gap={0}>
        <div className="os-group">
          <div className="os-row" style={{ minHeight: 72 }}>
            <Avatar size="lg" radius="xl" src={session?.user?.image}>
              {(session?.user?.name || session?.user?.email || '?').charAt(0)}
            </Avatar>
            <Box style={{ minWidth: 0 }}>
              <Text fw={650} truncate>
                {name}
              </Text>
              <Text fz="sm" c="dimmed" truncate>
                {session?.user?.email}
              </Text>
            </Box>
          </div>
        </div>

        {MORE_GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="os-group-title">{g.title}</h2>
            <div className="os-group">
              {g.items.map((i) => (
                <Link key={i.href} href={i.href} className="os-row" prefetch={i.external ? false : undefined}>
                  <i.icon size={22} />
                  <span style={{ flex: 1 }}>{i.label}</span>
                  <IconChevronRight size={18} style={{ color: 'var(--os-text-dim)' }} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        ))}

        <section>
          <h2 className="os-group-title">Apariencia</h2>
          <ColorSchemeControl />
        </section>

        <div className="os-group" style={{ marginTop: 24 }}>
          <button type="button" className="os-row" style={{ color: 'var(--os-danger)' }} onClick={() => performSignOut(session)}>
            <IconLogout size={22} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </Stack>
    </Container>
  )
}
