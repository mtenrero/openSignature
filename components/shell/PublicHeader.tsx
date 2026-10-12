'use client'

import React from 'react'
import Link from 'next/link'
import { ActionIcon, Burger, Button, Drawer, Group, Stack, useMantineColorScheme } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconLogin, IconSunMoon, IconUserPlus } from '@tabler/icons-react'
import { useSession } from 'next-auth/react'
import { Logo } from './Logo'
import { ColorSchemeControl } from './SideNav'

const LINKS = [
  { href: '/', label: 'Inicio' },
  { href: '/features', label: 'Características' },
  { href: '/pricing', label: 'Precios' },
  { href: '/security', label: 'Seguridad' },
  { href: '/how-it-works', label: 'Cómo funciona' },
]

function ThemeToggle() {
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  return (
    <ActionIcon
      variant="subtle"
      size="lg"
      aria-label="Cambiar esquema de color"
      onClick={() => setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')}
      suppressHydrationWarning
    >
      <IconSunMoon size={20} />
    </ActionIcon>
  )
}

/** 56px sticky public bar: inline links from `md`, a right Drawer (burger) below. No hover. */
export function PublicHeader() {
  const [opened, { toggle, close }] = useDisclosure(false)
  const { status } = useSession()
  const authed = status === 'authenticated'
  return (
    <header className="os-topbar" data-testid="public-header">
      <div className="os-topbar__inner">
        <Link href="/" aria-label="oSign.eu, inicio" style={{ textDecoration: 'none' }}>
          <Logo />
        </Link>
        <Group gap={4} visibleFrom="md" wrap="nowrap">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="os-link-btn">
              {l.label}
            </Link>
          ))}
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Group gap="xs" visibleFrom="md" wrap="nowrap">
            {authed ? (
              <Button component={Link} href="/signatures">
                Ir a la app
              </Button>
            ) : (
              <>
                <Button component={Link} href="/auth/signin" variant="default" leftSection={<IconLogin size={16} />}>
                  Iniciar sesión
                </Button>
                <Button component={Link} href="/auth/signup" leftSection={<IconUserPlus size={16} />}>
                  Crear cuenta
                </Button>
              </>
            )}
          </Group>
          <ThemeToggle />
          <Burger opened={opened} onClick={toggle} hiddenFrom="md" size="sm" aria-label="Abrir menú" style={{ minWidth: 44, minHeight: 44 }} />
        </Group>
      </div>
      <Drawer
        opened={opened}
        onClose={close}
        position="right"
        size="min(86vw, 340px)"
        title="Menú"
        hiddenFrom="md"
        zIndex={300}
      >
        <Stack gap="xs">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="os-link-btn" onClick={close}>
              {l.label}
            </Link>
          ))}
          <Stack gap="xs" mt="md">
            {authed ? (
              <Button component={Link} href="/signatures" onClick={close} fullWidth>
                Ir a la app
              </Button>
            ) : (
              <>
                <Button component={Link} href="/auth/signin" onClick={close} fullWidth leftSection={<IconLogin size={16} />}>
                  Iniciar sesión
                </Button>
                <Button component={Link} href="/auth/signup" onClick={close} fullWidth variant="default" leftSection={<IconUserPlus size={16} />}>
                  Crear cuenta
                </Button>
              </>
            )}
          </Stack>
          <ColorSchemeControl />
        </Stack>
      </Drawer>
    </header>
  )
}
