'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Avatar, Box, Button, Divider, Group, NavLink, ScrollArea, SegmentedControl, Stack, Text, useMantineColorScheme } from '@mantine/core'
import { IconLogout, IconPlus } from '@tabler/icons-react'
import { useSession } from 'next-auth/react'
import { ACCOUNT_NAV, MAIN_NAV, isNavActive } from './navItems'
import { Logo } from './Logo'
import { performSignOut } from '../../lib/ui/signOut'

export function ColorSchemeControl({ fullWidth = true }: { fullWidth?: boolean }) {
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  return (
    <SegmentedControl
      fullWidth={fullWidth}
      aria-label="Apariencia"
      value={colorScheme}
      onChange={(v) => setColorScheme(v as 'light' | 'dark' | 'auto')}
      data={[
        { value: 'light', label: 'Claro' },
        { value: 'dark', label: 'Oscuro' },
        { value: 'auto', label: 'Sistema' },
      ]}
    />
  )
}

export function SideNav({ loading = false }: { loading?: boolean }) {
  const pathname = usePathname() ?? ''
  const { data: session } = useSession()
  return (
    <Stack h="100%" gap="sm" data-testid="side-nav" justify="space-between" style={{ minHeight: 0 }}>
      <ScrollArea style={{ flex: 1 }} type="auto">
        <Stack gap="sm">
          <Link href="/signatures" style={{ textDecoration: 'none' }} aria-label="oSign.eu, ir a Firmas">
            <Logo />
          </Link>
          <Button component={Link} href="/signatures/new" leftSection={<IconPlus size={18} />} fullWidth>
            Nueva solicitud
          </Button>
          <Stack gap={2} component="nav" aria-label="Navegación principal">
            {MAIN_NAV.map((i) => (
              <NavLink
                key={i.href}
                component={Link}
                href={i.href}
                label={i.label}
                leftSection={<i.icon size={20} />}
                active={isNavActive(pathname, i.href)}
                aria-current={isNavActive(pathname, i.href) ? 'page' : undefined}
                style={{ borderRadius: 'var(--mantine-radius-md)', minHeight: 44 }}
              />
            ))}
          </Stack>
          <Text fz="xs" fw={600} c="dimmed" tt="uppercase" mt="sm">
            Cuenta
          </Text>
          <Stack gap={2} component="nav" aria-label="Cuenta">
            {ACCOUNT_NAV.map((i) => (
              <NavLink
                key={i.href}
                component={Link}
                href={i.href}
                label={i.label}
                leftSection={<i.icon size={20} />}
                active={isNavActive(pathname, i.href)}
                aria-current={isNavActive(pathname, i.href) ? 'page' : undefined}
                style={{ borderRadius: 'var(--mantine-radius-md)', minHeight: 44 }}
              />
            ))}
          </Stack>
        </Stack>
      </ScrollArea>
      <Box>
        <Divider mb="sm" />
        <Stack gap="sm">
          <ColorSchemeControl />
          {!loading && session?.user ? (
            <Group gap="xs" wrap="nowrap">
              <Avatar size="md" src={session.user.image} radius="xl">
                {(session.user.name || session.user.email || '?').charAt(0)}
              </Avatar>
              <Box style={{ minWidth: 0 }}>
                <Text fz="sm" fw={600} truncate>
                  {session.user.name || 'Usuario'}
                </Text>
                <Text fz="xs" c="dimmed" truncate>
                  {session.user.email}
                </Text>
              </Box>
            </Group>
          ) : null}
          <Button
            variant="subtle"
            color="red"
            leftSection={<IconLogout size={18} />}
            justify="flex-start"
            onClick={() => performSignOut(session)}
          >
            Cerrar sesión
          </Button>
        </Stack>
      </Box>
    </Stack>
  )
}
