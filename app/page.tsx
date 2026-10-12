'use client'

import React from 'react'
import Link from 'next/link'
import { Button, Group, SimpleGrid, Stack, Text, Title, ThemeIcon } from '@mantine/core'
import { IconFileText, IconSignature, IconShield, IconUsers, IconRocket, IconArrowRight } from '@tabler/icons-react'
import { useSession } from 'next-auth/react'
import { MarketingHero, MarketingBody, SectionTitle, FeatureCard, CtaBlock } from '../components/marketing/Marketing'

const FEATURES = [
  { icon: IconFileText, title: 'Editor avanzado', description: 'Crea plantillas de contratos con nuestro editor HTML avanzado. Inserta campos dinámicos en cualquier posición del texto.', color: 'blue' },
  { icon: IconSignature, title: 'Firma digital', description: 'Proceso de firma digital seguro y legalmente válido. Compatible con dispositivos móviles y de escritorio.', color: 'green' },
  { icon: IconShield, title: 'Gestión completa', description: 'Gestiona todas tus plantillas y firmas desde un panel intuitivo. Seguimiento en tiempo real del estado de los contratos.', color: 'violet' },
]

const AUDIENCES = [
  {
    title: 'Para empresas',
    items: [
      { icon: IconUsers, text: 'Gestión eficiente de contratos con múltiples firmantes' },
      { icon: IconShield, text: 'Seguridad y cumplimiento legal garantizado' },
      { icon: IconRocket, text: 'Automatización del proceso de firma' },
    ],
    cta: { label: 'Crear plantilla', href: '/auth/signin', primary: true },
  },
  {
    title: 'Para firmantes',
    items: [
      { icon: IconSignature, text: 'Firma digital rápida y sencilla' },
      { icon: IconFileText, text: 'Visualización clara del contrato' },
      { icon: IconShield, text: 'Seguridad y privacidad protegidas' },
    ],
    cta: { label: 'Acceder a firmas', href: '/auth/signin', primary: false },
  },
]

export default function WelcomePage() {
  const { status } = useSession()
  const authed = status === 'authenticated'

  return (
    <>
      <MarketingHero
        badge="Firma electrónica con validez legal"
        title="Firma digital simplificada"
        subtitle="Crea plantillas de contratos profesionales, envíalas para firma digital y gestiona todo el proceso de manera eficiente y segura."
        actions={
          <Stack gap="sm" w="100%" maw={360} mt="xs" data-testid="hero-actions">
            {authed ? (
              <Button component={Link} href="/signatures" size="lg" fullWidth rightSection={<IconArrowRight size={18} />}>
                Ir a la app
              </Button>
            ) : (
              <>
                <Button component={Link} href="/auth/signup" size="lg" fullWidth>
                  Comenzar ahora
                </Button>
                <Button component={Link} href="/auth/signin" size="lg" variant="default" fullWidth>
                  Iniciar sesión
                </Button>
              </>
            )}
          </Stack>
        }
      />

      <MarketingBody>
        <section>
          <SectionTitle>Características principales</SectionTitle>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {FEATURES.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </SimpleGrid>
        </section>

        <section>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            {AUDIENCES.map((a) => (
              <div key={a.title} className="os-rt-card" style={{ padding: 20 }}>
                <Title order={2} fz={22} mb="md">
                  {a.title}
                </Title>
                <Stack gap="sm" mb="md">
                  {a.items.map((i) => (
                    <Group key={i.text} gap="sm" wrap="nowrap" align="flex-start">
                      <ThemeIcon variant="light" size={28} radius="xl" style={{ flex: '0 0 auto' }}>
                        <i.icon size={16} />
                      </ThemeIcon>
                      <Text>{i.text}</Text>
                    </Group>
                  ))}
                </Stack>
                <Button component={Link} href={a.cta.href} size="md" variant={a.cta.primary ? 'filled' : 'default'} fullWidth>
                  {a.cta.label}
                </Button>
              </div>
            ))}
          </SimpleGrid>
        </section>

        <CtaBlock
          title="¿Listo para empezar?"
          text="Empieza gratis, sin permanencia y sin tarjeta de crédito."
          primary={authed ? { label: 'Ir a la app', href: '/signatures' } : { label: 'Crear cuenta gratis', href: '/auth/signup' }}
          secondary={{ label: 'Ver precios', href: '/pricing' }}
        />
      </MarketingBody>
    </>
  )
}
