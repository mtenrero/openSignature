'use client'

import React, { useState } from 'react'
import { Text, Stack, Group, Button, TextInput, PasswordInput, Switch, Alert, ThemeIcon } from '@mantine/core'
import { IconMail, IconLock, IconUser, IconAlertCircle, IconCheck, IconBuildingBank, IconArrowLeft, IconMailForward } from '@tabler/icons-react'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { validateRegistration, PASSWORD_POLICY_MESSAGE } from '@/lib/auth/registration'
import { AuthShell } from '../../../components/auth/AuthShell'

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
    website: '', // honeypot: hidden from people, bots fill it
    acceptTerms: false
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    // Same rules as the server (lib/auth/registration), so the form never promises
    // what the API will refuse.
    const parsed = validateRegistration(formData)
    if (!parsed.ok) {
      const field = parsed.field === 'body' ? 'name' : parsed.field
      newErrors[field] = parsed.error
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
          company: formData.company,
          website: formData.website
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        // Registration errors
        throw new Error(result.error || 'Error durante el registro')
      }

      // Registro exitoso
      setSuccess(true)
      setRegisteredEmail(formData.email)

    } catch (error) {
      console.error('Error durante el registro:', error)
      const errorMessage = error instanceof Error ? error.message : 'Error durante el registro. Inténtalo de nuevo.'
      setErrors({ general: errorMessage })
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <AuthShell title="¡Cuenta creada!" subtitle="Tu cuenta ha sido creada correctamente" wide>
        <Stack align="center" gap="md">
          <ThemeIcon size={56} radius="xl" color="green" variant="light">
            <IconMailForward size={30} aria-hidden="true" />
          </ThemeIcon>
        </Stack>
        <Alert color="blue" icon={<IconMail size={16} />} title="Verifica tu email">
          <Text size="sm">
            Si <strong style={{ overflowWrap: 'anywhere' }}>{registeredEmail}</strong> puede usarse, te hemos enviado un enlace de verificación. Si ya tienes una cuenta, simplemente inicia sesión.
          </Text>
          <Text size="sm" mt="xs">
            Revisa tu bandeja de entrada y haz clic en el enlace para activar tu cuenta. También revisa la carpeta de spam.
          </Text>
        </Alert>
        <Text size="sm" c="dimmed" ta="center">
          Si no recibes el email en unos minutos, revisa tu carpeta de spam. El enlace de verificación expira en 24 horas.
        </Text>
        <Button component={Link} href="/auth/signin" size="lg" fullWidth>
          Ir a iniciar sesión
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Crear cuenta gratuita"
      subtitle="Comienza gratis, sin tarjeta de crédito"
      wide
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link href="/auth/signin" style={{ color: 'var(--os-brand)', fontWeight: 600 }}>
            Inicia sesión aquí
          </Link>
        </>
      }
    >
      {errors.general && (
        <Alert color={errors.type === 'existing_account' ? 'blue' : 'red'} icon={<IconAlertCircle size={16} />} role="alert">
          {errors.general}
          {errors.type === 'existing_account' && (
            <Button component={Link} href="/auth/signin" mt="sm" leftSection={<IconArrowLeft size={16} />}>
              Iniciar sesión
            </Button>
          )}
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Stack gap="md">
          <TextInput label="Nombre completo" placeholder="Tu nombre completo" autoComplete="name" leftSection={<IconUser size={16} />} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} error={errors.name} required />
          <TextInput label="Nombre de usuario" placeholder="usuario123" autoComplete="username" autoCapitalize="none" leftSection={<IconUser size={16} />} value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase() })} error={errors.username} description="Solo letras, números y guiones bajos. Mínimo 3 caracteres." required />
          <TextInput label="Email corporativo" type="email" inputMode="email" autoComplete="email" placeholder="tu@empresa.com" leftSection={<IconMail size={16} />} value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} error={errors.email} required />

          {/* Honeypot: off-screen and not focusable; people never fill it */}
          <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
            <label>
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} />
            </label>
          </div>

          <TextInput label="Empresa" placeholder="Nombre de tu empresa" autoComplete="organization" leftSection={<IconBuildingBank size={16} />} value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} />
          <PasswordInput label="Contraseña" placeholder="Mínimo 8 caracteres, 3 de 4 tipos" autoComplete="new-password" description={PASSWORD_POLICY_MESSAGE} leftSection={<IconLock size={16} />} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} error={errors.password} required />
          <PasswordInput label="Confirmar contraseña" placeholder="Repite tu contraseña" autoComplete="new-password" leftSection={<IconLock size={16} />} value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} error={errors.confirmPassword} required />

          <Switch
            size="md"
            label={
              <Text size="sm">
                Acepto los{' '}
                <Link href="/legal/terms" style={{ textDecoration: 'underline' }}>términos y condiciones</Link>{' '}
                y la{' '}
                <Link href="/legal/privacy" style={{ textDecoration: 'underline' }}>política de privacidad</Link>
              </Text>
            }
            checked={formData.acceptTerms}
            onChange={(e) => setFormData({ ...formData, acceptTerms: e.currentTarget.checked })}
            error={errors.acceptTerms}
          />

          <Button type="submit" size="lg" loading={loading} leftSection={<IconCheck size={20} />} fullWidth>
            Crear cuenta gratuita
          </Button>
        </Stack>
      </form>

      <Stack gap={6} mt="xs" aria-label="Ventajas de oSign.EU">
        {[
          'Plan gratuito para siempre con 5 contratos mensuales',
          'Validez legal completa en España y la UE',
          'API REST para integrar con tu software',
          'Soporte técnico en español',
          'Sin permanencia, cancela cuando quieras',
        ].map((t) => (
          <Group key={t} gap="xs" wrap="nowrap" align="flex-start">
            <IconCheck size={16} color="var(--os-success)" style={{ flex: '0 0 auto', marginTop: 3 }} aria-hidden="true" />
            <Text size="sm">{t}</Text>
          </Group>
        ))}
      </Stack>
    </AuthShell>
  )
}
