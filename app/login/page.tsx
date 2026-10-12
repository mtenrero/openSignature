'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { Text, Center, Loader, Alert, Button } from '@mantine/core'
import { IconLogin, IconAlertTriangle } from '@tabler/icons-react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { safeCallbackUrl } from '@/lib/auth/customerId'
import { AuthShell } from '../../components/auth/AuthShell'

function LoginPageContent() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = safeCallbackUrl(
    searchParams.get('callbackUrl'),
    typeof window !== 'undefined' ? window.location.origin : ''
  )

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
      await signIn('auth0', {
        callbackUrl,
        redirect: true
      })

    } catch (error) {
      console.error('OAuth sign in error:', error)
      setError('Error al conectar con el proveedor de autenticación')
    }
  }

  if (loading) {
    return (
      <AuthShell title="Iniciando sesión..." subtitle="Serás redirigido automáticamente para iniciar sesión">
        <Center py="md" role="status" aria-live="polite">
          <Loader size="lg" />
        </Center>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Iniciar sesión" subtitle="Firma digital segura y confiable">
      {error && (
        <Alert icon={<IconAlertTriangle size={16} />} title="Error" color="red" variant="light" role="alert">
          {error}
          <Text size="sm" mt="xs">
            Si el problema persiste, contacta al administrador del sistema.
          </Text>
        </Alert>
      )}
      <Text size="sm" c="dimmed" ta="center">
        Pulsa el botón para iniciar sesión de forma segura mediante OAuth 2.0.
      </Text>
      <Button size="lg" onClick={handleOAuthSignIn} leftSection={<IconLogin size={20} />} fullWidth>
        Iniciar Sesión
      </Button>
      <Text size="xs" c="dimmed" ta="center">
        Esta aplicación utiliza OAuth 2.0 como método de autenticación para garantizar la máxima seguridad.
      </Text>
    </AuthShell>
  )
}

export default function LoginPage() {
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
      <LoginPageContent />
    </Suspense>
  )
}
