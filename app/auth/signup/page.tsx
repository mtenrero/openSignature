'use client'

import React, { useState } from 'react'
import {
  Container,
  Title,
  Text,
  Card,
  Stack,
  Group,
  Button,
  TextInput,
  PasswordInput,
  Checkbox,
  Alert,
  Box,
  Divider,
  Center,
  Notification
} from '@mantine/core'
import {
  IconMail,
  IconLock,
  IconUser,
  IconAlertCircle,
  IconCheck,
  IconBuildingBank,
  IconArrowLeft,
  IconBrandGoogle,
  IconBrandWindows,
  IconMailForward,
  IconX
} from '@tabler/icons-react'
import Link from 'next/link'
import { signIn } from 'next-auth/react'

export default function SignUpPage() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    company: '',
    acceptTerms: false
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es obligatorio'
    }

    if (!formData.username.trim()) {
      newErrors.username = 'El nombre de usuario es obligatorio'
    } else if (formData.username.length < 3) {
      newErrors.username = 'El nombre de usuario debe tener al menos 3 caracteres'
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      newErrors.username = 'El nombre de usuario solo puede contener letras, números y guiones bajos'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'El email es obligatorio'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'El email no es válido'
    }

    if (!formData.password) {
      newErrors.password = 'La contraseña es obligatoria'
    } else if (formData.password.length < 8) {
      newErrors.password = 'La contraseña debe tener al menos 8 caracteres'
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Las contraseñas no coinciden'
    }

    if (!formData.acceptTerms) {
      newErrors.acceptTerms = 'Debes aceptar los términos y condiciones'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setLoading(true)
    setErrors({})

    try {
      console.log('Enviando datos de registro:', formData)

      const response = await fetch('/api/auth/register-auth0', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          username: formData.username,
          email: formData.email,
          password: formData.password,
          company: formData.company
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        // Check if it's an existing account error
        if (result.type === 'existing_account') {
          setErrors({
            general: result.message,
            type: 'existing_account'
          })
          return
        }
        throw new Error(result.error || 'Error durante el registro')
      }

      // Registro exitoso
      setSuccess(true)
      setRegisteredEmail(formData.email)
      console.log('Registro exitoso:', result)

    } catch (error) {
      console.error('Error durante el registro:', error)
      const errorMessage = error instanceof Error ? error.message : 'Error durante el registro. Inténtalo de nuevo.'
      setErrors({ general: errorMessage })
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthSignUp = (provider: string) => {
    // Redirigir a la página de login con parámetro de registro
    window.location.href = `/auth/signin?signup=true&provider=${provider}`
  }

  return (
    <Box>
      {/* Hero Section */}
      <Box bg="blue.0" py="xl">
        <Container size="sm" py="xl">
          <Stack align="center" gap="xl">
            <Group gap="xs">
              <Link href="/auth/signin">
                <Button variant="subtle" leftSection={<IconArrowLeft size={16} />}>
                  Volver al inicio de sesión
                </Button>
              </Link>
            </Group>
            <Title size="2.5rem" ta="center" fw={900}>
              Crear cuenta gratuita
            </Title>
            <Text size="lg" ta="center" c="dimmed" maw={500}>
              Únete a miles de empresas que ya digitalizan sus procesos de firma.
              Comienza gratis, sin tarjeta de crédito.
            </Text>
          </Stack>
        </Container>
      </Box>

      <Container size="sm" py="xl">
        <Card shadow="md" padding="xl" radius="lg" withBorder>
          <Stack gap="md">
            {success ? (
              // Vista de éxito
              <>
                <div style={{ textAlign: 'center' }}>
                  <IconMailForward size={64} color="green" style={{ marginBottom: '1rem' }} />
                  <Title order={2} mb="xs" c="green">¡Cuenta creada exitosamente!</Title>
                  <Text size="sm" c="dimmed">
                    Tu cuenta ha sido creada correctamente
                  </Text>
                </div>

                <Alert color="blue" icon={<IconMail size={16} />}>
                  <Text fw={500} mb="xs">Verifica tu email</Text>
                  <Text size="sm">
                    Auth0 ha enviado un enlace de verificación a: <strong>{registeredEmail}</strong>
                  </Text>
                  <Text size="sm" mt="xs">
                    Revisa tu bandeja de entrada y haz clic en el enlace para activar tu cuenta.
                    También revisa la carpeta de spam.
                  </Text>
                </Alert>

                <Stack gap="sm">
                  <Text size="sm" c="dimmed" ta="center">
                    Si no recibes el email en unos minutos, revisa tu carpeta de spam.
                    El enlace de verificación expira en 24 horas.
                  </Text>

                  <Link href="/auth/signin">
                    <Button variant="filled" fullWidth>
                      Ir a iniciar sesión
                    </Button>
                  </Link>
                </Stack>
              </>
            ) : (
              // Vista de formulario
              <>
                <div>
                  <Title order={2} mb="xs">Crea tu cuenta</Title>
                  <Text size="sm" c="dimmed">
                    Completa los siguientes datos para crear tu cuenta gratuita
                  </Text>
                </div>

                {errors.general && (
                  <Alert color={errors.type === 'existing_account' ? 'blue' : 'red'} icon={<IconAlertCircle size={16} />}>
                    {errors.general}
                    {errors.type === 'existing_account' && (
                      <Group mt="sm">
                        <Link href="/auth/signin">
                          <Button variant="filled" size="sm" leftSection={<IconArrowLeft size={16} />}>
                            Iniciar sesión
                          </Button>
                        </Link>
                      </Group>
                    )}
                  </Alert>
                )}

            <form onSubmit={handleSubmit}>
              <Stack gap="md">
                <TextInput
                  label="Nombre completo"
                  placeholder="Tu nombre completo"
                  leftSection={<IconUser size={16} />}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  error={errors.name}
                  required
                />

                <TextInput
                  label="Nombre de usuario"
                  placeholder="usuario123"
                  leftSection={<IconUser size={16} />}
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase() })}
                  error={errors.username}
                  description="Solo letras, números y guiones bajos. Mínimo 3 caracteres."
                  required
                />

                <TextInput
                  label="Email corporativo"
                  placeholder="tu@empresa.com"
                  leftSection={<IconMail size={16} />}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  error={errors.email}
                  required
                />

                <TextInput
                  label="Empresa"
                  placeholder="Nombre de tu empresa"
                  leftSection={<IconBuildingBank size={16} />}
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                />

                <PasswordInput
                  label="Contraseña"
                  placeholder="Mínimo 8 caracteres"
                  leftSection={<IconLock size={16} />}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  error={errors.password}
                  required
                />

                <PasswordInput
                  label="Confirmar contraseña"
                  placeholder="Repite tu contraseña"
                  leftSection={<IconLock size={16} />}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  error={errors.confirmPassword}
                  required
                />

                <Checkbox
                  label={
                    <Text size="sm">
                      Acepto los{' '}
                      <Link href="/legal/terms" style={{ textDecoration: 'underline' }}>
                        términos y condiciones
                      </Link>{' '}
                      y la{' '}
                      <Link href="/legal/privacy" style={{ textDecoration: 'underline' }}>
                        política de privacidad
                      </Link>
                    </Text>
                  }
                  checked={formData.acceptTerms}
                  onChange={(e) => setFormData({ ...formData, acceptTerms: e.currentTarget.checked })}
                  error={errors.acceptTerms}
                />

                <Button
                  type="submit"
                  size="lg"
                  loading={loading}
                  leftSection={<IconCheck size={20} />}
                  fullWidth
                >
                  Crear cuenta gratuita
                </Button>
              </Stack>
            </form>

            {/* OAuth desactivado temporalmente */}
            {false && (
              <>
                <Divider label="O continúa con" labelPosition="center" />

                <Stack gap="sm">
                  <Button
                    variant="outline"
                    size="lg"
                    fullWidth
                    leftSection={<IconBrandGoogle size={20} />}
                    onClick={() => handleOAuthSignUp('google')}
                  >
                    Continuar con Google
                  </Button>

                  <Button
                    variant="outline"
                    size="lg"
                    fullWidth
                    leftSection={<IconBrandWindows size={20} />}
                    onClick={() => handleOAuthSignUp('azure-ad')}
                  >
                    Continuar con Microsoft
                  </Button>
                </Stack>
              </>
            )}

                <Center>
                  <Text size="sm" c="dimmed">
                    ¿Ya tienes cuenta?{' '}
                    <Link href="/auth/signin" style={{ color: 'var(--mantine-color-blue-6)', textDecoration: 'none' }}>
                      Inicia sesión aquí
                    </Link>
                  </Text>
                </Center>
              </>
            )}
          </Stack>
        </Card>

        {/* Benefits Section */}
        <Card shadow="sm" padding="lg" radius="md" withBorder mt="xl" bg="green.0">
          <Title order={3} mb="md" ta="center">¿Por qué elegir oSign.EU?</Title>
          <Stack gap="sm">
            <Group gap="xs">
              <IconCheck color="green" size={16} />
              <Text size="sm">Plan gratuito para siempre con 5 contratos mensuales</Text>
            </Group>
            <Group gap="xs">
              <IconCheck color="green" size={16} />
              <Text size="sm">Validez legal completa en España y la UE</Text>
            </Group>
            <Group gap="xs">
              <IconCheck color="green" size={16} />
              <Text size="sm">API REST para integrar con tu software</Text>
            </Group>
            <Group gap="xs">
              <IconCheck color="green" size={16} />
              <Text size="sm">Soporte técnico en español</Text>
            </Group>
            <Group gap="xs">
              <IconCheck color="green" size={16} />
              <Text size="sm">Sin permanencia, cancela cuando quieras</Text>
            </Group>
          </Stack>
        </Card>
      </Container>
    </Box>
  )
}