'use client'

import React, { useState } from 'react'
import { Group, Button, Text, ActionIcon, Box, Container, useMantineColorScheme, Menu, Avatar, Stack, Transition } from '@mantine/core'
import { IconSunMoon, IconFileText, IconSignature, IconLogin, IconHome, IconSettings, IconLogout, IconUser, IconDeviceTablet, IconCreditCard, IconReceipt, IconWallet, IconKey, IconUserPlus } from '@tabler/icons-react'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'

function LogoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="var(--mantine-color-blue-6)" />
    </svg>
  )
}

function ThemeToggle() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()

  return (
    <ActionIcon
      variant="light"
      color={colorScheme === 'dark' ? 'yellow' : 'blue'}
      onClick={toggleColorScheme}
      title="Cambiar esquema de color"
      suppressHydrationWarning
    >
      <IconSunMoon size={18} />
    </ActionIcon>
  )
}

function LoginWithSignupHover() {
  const [showSignup, setShowSignup] = useState(false)

  return (
    <Box
      style={{ position: 'relative' }}
      onMouseEnter={() => setShowSignup(true)}
      onMouseLeave={() => setShowSignup(false)}
    >
      <Link href="/auth/signin">
        <Button variant="filled" leftSection={<IconLogin size={16} />}>
          Iniciar Sesión
        </Button>
      </Link>

      <Transition
        mounted={showSignup}
        transition="slide-down"
        duration={200}
        timingFunction="ease"
      >
        {(styles) => (
          <Box
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 200,
              paddingTop: '4px',
              ...styles
            }}
          >
            <Link href="/auth/signup">
              <Button
                variant="filled"
                color="white"
                c="blue"
                leftSection={<IconUserPlus size={16} />}
                fullWidth
                size="sm"
                style={{
                  backgroundColor: 'white',
                  color: 'var(--mantine-color-blue-6)',
                  border: '1px solid var(--mantine-color-gray-3)',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                Crear Cuenta
              </Button>
            </Link>
          </Box>
        )}
      </Transition>
    </Box>
  )
}

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  
  // Define which pages are truly public (don't require auth)
  const isPublicPage = pathname === '/' ||
    pathname.startsWith('/welcome') ||
    pathname.startsWith('/sign') ||
    pathname === '/auth/signin' ||
    pathname === '/auth/signup' ||
    pathname === '/auth/error' ||
    pathname === '/pricing' ||
    pathname === '/features' ||
    pathname === '/security' ||
    pathname === '/how-it-works'

  // Sign pages should show minimal header (no menu, no buttons)
  // Only match the signing flow, not '/signatures'
  const isSignPage = pathname === '/sign' || pathname.startsWith('/sign/')
  
  // Pages that require authentication
  const requiresAuth = pathname.startsWith('/contracts') ||
    pathname.startsWith('/signatures') ||
    pathname.startsWith('/contracts') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/tablet') ||
    pathname.startsWith('/profile')

  // Simple session hook without forced requirements
  const { data: session, status } = useSession()

  // Debug logging
  if (process.env.NODE_ENV === 'development') {
    console.log('[HEADER DEBUG]', { 
      status, 
      session: !!session, 
      sessionData: session ? { id: session.user?.id, email: session.user?.email } : null,
      isPublicPage,
      requiresAuth,
      isSignPage,
      pathname,
      willShowPublicHeader: isPublicPage && !requiresAuth && status === 'unauthenticated',
      willShowFullHeader: !isSignPage && !(isPublicPage && !requiresAuth && status === 'unauthenticated')
    })
  }

  // Sign pages should show only the logo, no menu or buttons
  if (isSignPage) {
    return (
      <Box
        style={{
          borderBottom: '1px solid var(--mantine-color-gray-3)',
          backgroundColor: 'var(--mantine-color-white)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <Container size="xl">
          <Group justify="center" h={60}>
            <Group align="center" gap="xs">
              <LogoIcon />
              <Text size="lg" fw={700} c="blue">
                oSign.eu
              </Text>
            </Group>
          </Group>
        </Container>
      </Box>
    )
  }

  // For protected routes when user is not authenticated, redirect them
  if (requiresAuth && status === 'unauthenticated') {
    // The page component will handle the redirect, we just show a loading state
    return (
      <Box
        style={{
          borderBottom: '1px solid var(--mantine-color-gray-3)',
          backgroundColor: 'var(--mantine-color-white)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <Container size="xl">
          <Group justify="center" h={60}>
            <Group align="center" gap="xs">
              <LogoIcon />
              <Text size="lg" fw={700} c="blue">
                oSign.eu
              </Text>
            </Group>
          </Group>
        </Container>
      </Box>
    )
  }

  // For protected routes when session is still loading, show loading header with logo
  if (requiresAuth && status === 'loading') {
    return (
      <Box
        style={{
          borderBottom: '1px solid var(--mantine-color-gray-3)',
          backgroundColor: 'var(--mantine-color-white)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <Container size="xl">
          <Group justify="center" h={60}>
            <Group align="center" gap="xs">
              <LogoIcon />
              <Text size="lg" fw={700} c="blue">
                oSign.eu
              </Text>
            </Group>
          </Group>
        </Container>
      </Box>
    )
  }

  // Show public header ONLY when:
  // 1. We're on a public page (not auth-required)
  // 2. User is definitely not authenticated (not loading)
  if (isPublicPage && !requiresAuth && status === 'unauthenticated') {
    return (
      <Box
        style={{
          borderBottom: '1px solid var(--mantine-color-gray-3)',
          backgroundColor: 'var(--mantine-color-white)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <Container size="xl">
          <Group justify="space-between" h={60}>
            <Group>
              <Group align="center" gap="xs">
                <LogoIcon />
                <Text size="lg" fw={700} c="blue">
                  oSign.eu
                </Text>
              </Group>
            </Group>

            <Group>
              <Link href="/">
                <Button variant="subtle" leftSection={<IconHome size={16} />}>
                  Inicio
                </Button>
              </Link>
              <Link href="/features">
                <Button variant="subtle">
                  Características
                </Button>
              </Link>
              <Link href="/pricing">
                <Button variant="subtle">
                  Precios
                </Button>
              </Link>
              <Link href="/security">
                <Button variant="subtle">
                  Seguridad
                </Button>
              </Link>
              <Link href="/how-it-works">
                <Button variant="subtle">
                  Cómo Funciona
                </Button>
              </Link>
              <LoginWithSignupHover />
              <ThemeToggle />
            </Group>
          </Group>
        </Container>
      </Box>
    )
  }

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' })
  }

  return (
    <Box
      style={{
        borderBottom: '1px solid var(--mantine-color-gray-3)',
        backgroundColor: 'var(--mantine-color-white)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <Container size="xl">
        <Group h={60} px="md" justify="space-between">
          <Group>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <Group align="center" gap="xs">
                <LogoIcon />
                <Text size="xl" fw={700} c="blue">
                  oSign.eu
                </Text>
              </Group>
            </Link>
          </Group>

          <Group gap="xs">
            {status === 'loading' ? (
              // Show loading state
              <Text size="sm" c="dimmed">Cargando...</Text>
            ) : session ? (
              <>
                <Link href="/">
                  <Button variant="subtle" leftSection={<IconHome size={16} />}>
                    Inicio
                  </Button>
                </Link>
                <Link href="/contracts">
                  <Button variant="subtle" leftSection={<IconFileText size={16} />}>
                    Contratos
                  </Button>
                </Link>
                <Link href="/signatures">
                  <Button variant="subtle" leftSection={<IconSignature size={16} />}>
                    Firmas
                  </Button>
                </Link>
                <Link href="/tablet">
                  <Button variant="subtle" leftSection={<IconDeviceTablet size={16} />}>
                    Registrar Tableta
                  </Button>
                </Link>

                <Menu shadow="md" width={200}>
                  <Menu.Target>
                    <Button variant="subtle" leftSection={
                      <Avatar size="sm" src={session.user?.image}>
                        {session.user?.name?.charAt(0) || session.user?.email?.charAt(0)}
                      </Avatar>
                    }>
                      {session.user?.name || 'Usuario'}
                    </Button>
                  </Menu.Target>

                  <Menu.Dropdown>
                    <Menu.Item 
                      leftSection={<IconUser size={14} />}
                      onClick={() => router.push('/profile')}
                    >
                      Perfil
                    </Menu.Item>
                  <Menu.Item
                    leftSection={<IconFileText size={14} />}
                    onClick={() => router.push('/docs/api')}
                  >
                    Docs API
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconFileText size={14} />}
                    onClick={() => window.open('/api/openapi', '_blank')}
                  >
                    OpenAPI JSON
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconFileText size={14} />}
                    onClick={() => window.open('/api/docs/index', '_blank')}
                  >
                    Índice IA
                  </Menu.Item>
                    <Menu.Item
                      leftSection={<IconCreditCard size={14} />}
                      onClick={() => router.push('/settings/subscription')}
                    >
                      Suscripción
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconReceipt size={14} />}
                      onClick={() => router.push('/settings/billing-wallet')}
                    >
                      Facturación y Monedero
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconSettings size={14} />}
                      onClick={() => router.push('/settings')}
                    >
                      Configuración
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconKey size={14} />}
                      onClick={() => router.push('/settings/api-keys')}
                    >
                      API Keys
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      leftSection={<IconLogout size={14} />}
                      onClick={handleSignOut}
                      color="red"
                    >
                      Cerrar Sesión
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </>
            ) : (
              <>
                <Button
                  variant="filled"
                  leftSection={<IconLogin size={16} />}
                  onClick={() => window.location.href = '/auth/signin'}
                >
                  Iniciar Sesión
                </Button>
              </>
            )}
            <ThemeToggle />
          </Group>
        </Group>
      </Container>
    </Box>
  )
}
