'use client'

import { Button, Text, Stack, ThemeIcon } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { AuthShell } from '../../../components/auth/AuthShell'

const getErrorMessage = (error: string | null) => {
  switch (error) {
    case 'Configuration':
      return 'Hay un problema con la configuración del servidor.'
    case 'AccessDenied':
      return 'No tienes permisos para acceder a esta aplicación.'
    case 'EmailNotVerified':
      return 'Verifica tu email: te hemos enviado un correo con un enlace de confirmación. Ábrelo y vuelve a iniciar sesión.'
    case 'clinic_not_enabled':
      return 'Tu clínica aún no ha activado oSign. Actívalo desde VetControl (Ajustes → Firma digital) y vuelve a entrar con tu cuenta de VetControl.'
    case 'Verification':
      return 'El enlace de verificación ha expirado o ya ha sido utilizado.'
    default:
      return 'Ha ocurrido un error durante la autenticación.'
  }
}

function AuthErrorPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  return (
    <AuthShell title="Error de autenticación">
      <Stack align="center" gap="md">
        <ThemeIcon size={56} radius="xl" color="red" variant="light">
          <IconAlertTriangle size={30} aria-hidden="true" />
        </ThemeIcon>
        <Text size="md" ta="center" role="alert">
          {getErrorMessage(error)}
        </Text>
        <Button size="lg" onClick={() => router.push('/auth/signin')} fullWidth>
          Intentar de Nuevo
        </Button>
        <Button size="lg" variant="subtle" onClick={() => router.push('/')} fullWidth>
          Ir al Inicio
        </Button>
      </Stack>
    </AuthShell>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<AuthShell title="Cargando...">{null}</AuthShell>}>
      <AuthErrorPageContent />
    </Suspense>
  )
}
