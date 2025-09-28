'use client'

import { Button, Container, Title, Text, Stack, Center } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function AuthErrorPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  
  // Log error details for debugging
  console.log('[AUTH ERROR PAGE] Error:', error)
  console.log('[AUTH ERROR PAGE] All search params:', Object.fromEntries(searchParams.entries()))

  const getErrorMessage = (error: string | null) => {
    switch (error) {
      case 'Configuration':
        return 'Hay un problema con la configuración del servidor.'
      case 'AccessDenied':
        return 'No tienes permisos para acceder a esta aplicación.'
      case 'Verification':
        return 'El enlace de verificación ha expirado o ya ha sido utilizado.'
      default:
        return 'Ha ocurrido un error durante la autenticación.'
    }
  }

  return (
    <Container size="sm" py="xl">
      <Center>
        <Stack align="center" gap="xl" style={{ maxWidth: 400 }}>
          <div style={{ textAlign: 'center' }}>
            <IconAlertTriangle size={64} color="var(--mantine-color-red-6)" />
            <Title size="2rem" fw={700} mt="md" c="red">
              Error de Autenticación
            </Title>
          </div>

          <div style={{
            padding: '2rem',
            border: '1px solid var(--mantine-color-red-3)',
            borderRadius: '8px',
            backgroundColor: 'var(--mantine-color-red-0)',
            width: '100%'
          }}>
            <Stack align="center" gap="md">
              <Text size="sm" ta="center">
                {getErrorMessage(error)}
              </Text>

              <Button
                variant="light"
                color="blue"
                onClick={() => router.push('/auth/signin')}
                fullWidth
              >
                Intentar de Nuevo
              </Button>

              <Button
                variant="subtle"
                onClick={() => router.push('/')}
                fullWidth
              >
                Ir al Inicio
              </Button>
            </Stack>
          </div>
        </Stack>
      </Center>
    </Container>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <Container size="sm" py="xl">
        <Center>
          <Stack align="center" gap="md">
            <Title size="1.5rem">
              Cargando...
            </Title>
          </Stack>
        </Center>
      </Container>
    }>
      <AuthErrorPageContent />
    </Suspense>
  )
}
