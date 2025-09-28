'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { Container, Title, Text, Stack, Center, Loader, Alert, Box, Button } from '@mantine/core'
import { IconLogin, IconAlertTriangle, IconKey } from '@tabler/icons-react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginPageContent() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/contracts'

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Check if user is already authenticated
        const session = await getSession()
        if (session) {
          router.push(callbackUrl)
          return
        }

        // Don't automatically redirect to OAuth provider, wait for user action
        setLoading(false)
      } catch (error) {
        console.error('Session check error:', error)
        setLoading(false)
        setError('Error al verificar la sesión')
      }
    }

    checkSession()
  }, [router, callbackUrl])

  const handleOAuthSignIn = async () => {
    try {
      const result = await signIn('auth0', {
        callbackUrl,
        redirect: true
      })

      if (result?.error) {
        console.error('OAuth sign in error:', result.error)
        setError('Error al iniciar sesión')
      }
    } catch (error) {
      console.error('OAuth sign in error:', error)
      setError('Error al conectar con el proveedor de autenticación')
    }
  }

  if (loading) {
    return (
      <Container size="sm" py="xl">
        <Center>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Title size="1.5rem">
Iniciando sesión...
            </Title>
            <Text size="sm" c="dimmed" ta="center">
Serás redirigido automáticamente para iniciar sesión
            </Text>
          </Stack>
        </Center>
      </Container>
    )
  }

  return (
    <Container size="sm" py="xl">
      <Center>
        <Stack align="center" gap="xl" style={{ maxWidth: 400 }}>
          <div style={{ textAlign: 'center' }}>
            <Title size="2.5rem" fw={700} mb="sm">
              oSign.eu
            </Title>
            <Text size="lg" c="dimmed">
              Firma digital segura y confiable
            </Text>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert icon={<IconAlertTriangle size={16} />} title="Error" color="red" variant="light">
              {error}
              <br />
              <Text size="sm" mt="xs">
                Si el problema persiste, contacta al administrador del sistema.
              </Text>
            </Alert>
          )}

          <Box style={{
            padding: '2rem',
            border: '1px solid var(--mantine-color-gray-3)',
            borderRadius: '8px',
            backgroundColor: 'var(--mantine-color-gray-0)',
            width: '100%'
          }}>
            <Stack align="center" gap="md">
              <IconKey size={48} color="#0066CC" />

              <Title size="1.5rem" ta="center">
                Iniciar Sesión
              </Title>

              <Text size="sm" c="dimmed" ta="center">
                Haz clic en el botón para iniciar sesión de forma segura mediante OAuth 2.0.
              </Text>

              <Button
                size="lg"
                onClick={handleAuth0SignIn}
                loading={loading}
                leftSection={<IconLogin size={20} />}
                style={{
                  backgroundColor: '#0066CC',
                  color: 'white'
                }}
                fullWidth
              >
Iniciar Sesión
              </Button>

              <Text size="xs" c="dimmed" ta="center">
Esta aplicación utiliza OAuth 2.0 como método de autenticación para garantizar la máxima seguridad.
              </Text>
            </Stack>
          </Box>
        </Stack>
      </Center>
    </Container>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <Container size="sm" py="xl">
        <Center>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Title size="1.5rem">
              Cargando...
            </Title>
          </Stack>
        </Center>
      </Container>
    }>
      <LoginPageContent />
    </Suspense>
  )
}