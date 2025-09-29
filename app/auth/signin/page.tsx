'use client'

import { useState, useEffect, Suspense } from 'react'
import { Container, Title, Text, Stack, Center, Loader, Alert, Button, Group, Divider, TextInput, PasswordInput } from '@mantine/core'
import { IconLogin, IconAlertTriangle, IconKey, IconArrowLeft, IconBrandGoogle, IconBrandWindows, IconMail, IconLock } from '@tabler/icons-react'
import Link from 'next/link'
import { signIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'

function SignInPageContent() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [credentials, setCredentials] = useState({ email: '', password: '' })
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/contracts'
  const isSignup = searchParams.get('signup') === 'true'
  const provider = searchParams.get('provider')
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

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true)
      console.log('[SIGNIN] Starting Google OAuth...')

      // Simulamos Google OAuth - en producción esto usaría el provider real
      await signIn('google', {
        callbackUrl,
        redirect: true
      })
    } catch (error) {
      console.error('[SIGNIN] Google OAuth error:', error)
      setError('Error al continuar con Google')
      setLoading(false)
    }
  }

  const handleMicrosoftSignIn = async () => {
    try {
      setLoading(true)
      console.log('[SIGNIN] Starting Microsoft OAuth...')

      // Simulamos Microsoft OAuth - en producción esto usaría el provider real
      await signIn('azure-ad', {
        callbackUrl,
        redirect: true
      })
    } catch (error) {
      console.error('[SIGNIN] Microsoft OAuth error:', error)
      setError('Error al continuar con Microsoft')
      setLoading(false)
    }
  }

  const handleCredentialsSignIn = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!credentials.email || !credentials.password) {
      setError('Email y contraseña son requeridos')
      return
    }

    try {
      setLoading(true)
      setError('')
      console.log('[SIGNIN] Starting credentials sign in...')

      const result = await signIn('credentials', {
        email: credentials.email,
        password: credentials.password,
        callbackUrl,
        redirect: false
      })

      if (result?.error) {
        setError(result.error)
      } else if (result?.ok) {
        console.log('[SIGNIN] Credentials sign in successful, redirecting...')
        router.push(callbackUrl)
      }
    } catch (error) {
      console.error('[SIGNIN] Credentials sign in error:', error)
      setError('Error al iniciar sesión')
    } finally {
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

          {isSignup ? (
            // Vista para registro - OAuth desactivado temporalmente
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
                  Registro con Formulario
                </Title>

                <Text size="sm" c="dimmed" ta="center">
                  El registro social OAuth está temporalmente desactivado.
                  Por favor, usa el formulario de registro tradicional.
                </Text>

                <Group gap="xs" mt="md">
                  <Link href="/auth/signup">
                    <Button variant="filled" leftSection={<IconArrowLeft size={16} />}>
                      Volver al formulario de registro
                    </Button>
                  </Link>
                </Group>

                <Text size="xs" c="dimmed" ta="center">
                  El registro OAuth estará disponible próximamente.
                </Text>
              </Stack>
            </div>
          ) : (
            // Vista normal de login
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
                  Inicia sesión de forma segura con tu cuenta de Auth0.
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
                  Iniciar Sesión con Barvet Empresas
                </Button>

                <Text size="xs" c="dimmed" ta="center">
                  OAuth 2.0 proporciona autenticación segura adicional.
                </Text>
              </Stack>
            </div>
          )}

          {!isSignup && (
            <Center>
              <Text size="sm" c="dimmed">
                ¿No tienes cuenta?{' '}
                <Link href="/auth/signup" style={{ color: 'var(--mantine-color-blue-6)', textDecoration: 'none' }}>
                  Créala aquí
                </Link>
              </Text>
            </Center>
          )}
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
