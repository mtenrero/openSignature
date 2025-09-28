'use client'

import { useState, useEffect, Suspense } from 'react'
import { Container, Title, Text, Stack, Center, Loader, Alert, Button } from '@mantine/core'
import { IconLogin, IconAlertTriangle, IconKey } from '@tabler/icons-react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'

function SignInPageContent() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/contracts'
  const { data: session, status } = useSession()

  useEffect(() => {
    // If user is already authenticated, redirect immediately
    if (session && status === 'authenticated') {
      console.log('[SIGNIN] User already authenticated, redirecting to:', callbackUrl)
      router.replace(callbackUrl)
    }
  }, [session, status, router, callbackUrl])

  const handleOAuthSignIn = async () => {
    try {
      setLoading(true)
      console.log('[SIGNIN] Starting OAuth sign in process...')
      
      // Use redirect: true to let NextAuth handle the OAuth flow properly
      await signIn('auth0', {
        callbackUrl,
        redirect: true // Let NextAuth handle the OAuth flow
      })
      
      // This code won't execute because of the redirect
      // The user will be redirected to Auth0 for authentication
    } catch (error) {
      console.error('[SIGNIN] OAuth sign in error:', error)
      setError('Error al iniciar sesión')
      setLoading(false)
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
              Redirigiendo automáticamente para iniciar sesión
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

          <div style={{
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
                onClick={handleOAuthSignIn}
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
          </div>
        </Stack>
      </Center>
    </Container>
  )
}

export default function SignInPage() {
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
      <SignInPageContent />
    </Suspense>
  )
}
