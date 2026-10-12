'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { Text, Stack, Center, Loader, Alert, Button } from '@mantine/core'
import { IconLogin, IconAlertTriangle, IconArrowLeft } from '@tabler/icons-react'
import Link from 'next/link'
import { signIn, useSession, getProviders } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { isSwitchAccount, safeCallbackUrl } from '@/lib/auth/customerId'
import { AuthShell } from '../../../components/auth/AuthShell'

function SignInPageContent() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [credentials, setCredentials] = useState({ email: '', password: '' })
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = safeCallbackUrl(
    searchParams.get('callbackUrl'),
    typeof window !== 'undefined' ? window.location.origin : ''
  )
  const switchAccount = isSwitchAccount(searchParams.get('switch'))
  const isSignup = searchParams.get('signup') === 'true'
  const provider = searchParams.get('provider')
  const { data: session, status } = useSession()
  // 'Entrar con VetControl' only exists when the server enabled the authentik provider.
  const [authentikEnabled, setAuthentikEnabled] = useState(false)
  const [providersLoaded, setProvidersLoaded] = useState(false)
  const autoStarted = useRef(false)

  useEffect(() => {
    let cancelled = false
    getProviders()
      .then((p) => { if (!cancelled) setAuthentikEnabled(!!p?.authentik) })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setProvidersLoaded(true) })
    return () => { cancelled = true }
  }, [])

  const handleAuthentikSignIn = async () => {
    try {
      setLoading(true)
      // ?switch=1 forces the login prompt at the IdP (use another VetControl account).
      await signIn('authentik', { callbackUrl, redirect: true }, switchAccount ? { prompt: 'login' } : undefined)
    } catch (error) {
      console.error('[SIGNIN] Authentik sign in error:', error)
      setError('Error al iniciar sesión')
      setLoading(false)
    }
  }

  // /auth/signin?provider=authentik&callbackUrl=... ("Abrir en oSign" from VetControl)
  // starts the VetControl login by itself; callbackUrl went through safeCallbackUrl above.
  useEffect(() => {
    if (provider !== 'authentik' || !providersLoaded || !authentikEnabled) return
    // Always start the IdP flow, even with an existing oSign session (Auth0, partner SSO or
    // another clinic's Authentik): Authentik SSO makes it silent and the new session
    // REPLACES the old one. Never skip into the existing session.
    if (status === 'loading') return
    if (autoStarted.current) return
    autoStarted.current = true
    void handleAuthentikSignIn()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, providersLoaded, authentikEnabled, status, switchAccount])

  useEffect(() => {
    // If user is already authenticated, redirect immediately
    // (not while ?provider=authentik is pending: that flow replaces the session instead)
    if (provider === 'authentik' && (!providersLoaded || authentikEnabled)) return
    if (session && status === 'authenticated' && !switchAccount) {
      console.log('[SIGNIN] User already authenticated, redirecting to:', callbackUrl)
      router.replace(callbackUrl)
    }
  }, [session, status, router, callbackUrl, switchAccount, provider, providersLoaded, authentikEnabled])

  const handleOAuthSignIn = async () => {
    try {
      setLoading(true)
      console.log('[SIGNIN] Starting OAuth sign in process...')

      // Use redirect: true to let NextAuth handle the OAuth flow properly
      // ?switch=1 forces the Auth0 login prompt (account switch); by default an
      // existing Auth0 session gives one-click SSO.
      const forceLogin = new URLSearchParams(window.location.search).get('switch') === '1'
      await signIn('auth0', {
        callbackUrl,
        redirect: true // Let NextAuth handle the OAuth flow
      }, forceLogin ? { prompt: 'login' } : undefined)

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
      <AuthShell title="Iniciando sesión..." subtitle="Redirigiendo automáticamente para iniciar sesión">
        <Center py="md" role="status" aria-live="polite">
          <Loader size="lg" />
        </Center>
      </AuthShell>
    )
  }

  const errorAlert = error ? (
    <Alert icon={<IconAlertTriangle size={16} />} title="Error" color="red" variant="light" role="alert">
      {error}
      <Text size="sm" mt="xs">
        Si el problema persiste, contacta al administrador del sistema.
      </Text>
    </Alert>
  ) : null

  if (isSignup) {
    // Registro social OAuth desactivado temporalmente
    return (
      <AuthShell title="Registro con formulario" subtitle="Firma digital segura y confiable">
        {errorAlert}
        <Text size="sm" c="dimmed" ta="center">
          El registro social OAuth está temporalmente desactivado. Por favor, usa el formulario de registro tradicional.
        </Text>
        <Button component={Link} href="/auth/signup" size="lg" fullWidth leftSection={<IconArrowLeft size={18} />}>
          Volver al formulario de registro
        </Button>
        <Text size="xs" c="dimmed" ta="center">
          El registro OAuth estará disponible próximamente.
        </Text>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Iniciar sesión"
      subtitle="Firma digital segura y confiable"
      footer={
        <>
          ¿No tienes cuenta?{' '}
          <Link href="/auth/signup" style={{ color: 'var(--os-brand)', fontWeight: 600 }}>
            Créala aquí
          </Link>
        </>
      }
    >
      {errorAlert}
      <Text size="sm" c="dimmed" ta="center">
        Inicia sesión de forma segura con tu cuenta de Auth0.
      </Text>

      <Button size="lg" onClick={handleOAuthSignIn} loading={loading} leftSection={<IconLogin size={20} />} fullWidth>
        Iniciar Sesión con Barvet Empresas
      </Button>

      {authentikEnabled && (
        <Button size="lg" variant="default" onClick={handleAuthentikSignIn} loading={loading} leftSection={<IconLogin size={20} />} fullWidth>
          Entrar con VetControl
        </Button>
      )}

      <Text size="xs" c="dimmed" ta="center">
        OAuth 2.0 proporciona autenticación segura adicional.
      </Text>
    </AuthShell>
  )
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Cargando...">
          <Center py="md">
            <Loader size="lg" />
          </Center>
        </AuthShell>
      }
    >
      <SignInPageContent />
    </Suspense>
  )
}
