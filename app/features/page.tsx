'use client'

import React from 'react'
import { Alert, SimpleGrid, Text } from '@mantine/core'
import {
  IconShield, IconRobot, IconMail, IconMessage, IconApi, IconCloudUpload, IconLock, IconCertificate,
  IconDeviceTablet, IconUsers, IconChartBar, IconDownload, IconGavel,
} from '@tabler/icons-react'
import { MarketingHero, MarketingBody, SectionTitle, FeatureCard, CheckList, CtaBlock } from '../../components/marketing/Marketing'

const mainFeatures = [
  { icon: IconShield, title: 'Cumplimiento eIDAS', description: 'Firmas electrónicas con plena validez legal en toda la Unión Europea según el reglamento eIDAS.', color: 'green' },
  { icon: IconRobot, title: 'Generación IA de contratos', description: 'Crea contratos profesionales en segundos con inteligencia artificial. Personaliza según tus necesidades.', color: 'blue' },
  { icon: IconMail, title: 'Firmas por email', description: 'Los firmantes reciben el documento por email y firman desde cualquier dispositivo sin necesidad de registro.', color: 'orange' },
  { icon: IconMessage, title: 'Firmas por SMS', description: 'Envía documentos para firmar por SMS. Perfecto para procesos rápidos y usuarios sin email.', color: 'yellow' },
  { icon: IconApi, title: 'API REST completa', description: 'Integra oSign.eu en tus aplicaciones con nuestra API REST. Documentación completa incluida.', color: 'violet' },
  { icon: IconDeviceTablet, title: 'Firma en tableta', description: 'Registra tabletas para firmas presenciales. Ideal para comercios y oficinas.', color: 'teal' },
]

const technicalFeatures = [
  'Timestamps cualificados RFC 3161',
  'Protección con contraseña automática',
  'Metadatos de dispositivo y geolocalización',
  'Auditoría completa de accesos',
  'Encriptación extremo a extremo',
  'Backup automático de documentos',
]

const businessFeatures = [
  'Dashboard de gestión intuitivo',
  'Plantillas de contratos personalizables',
  'Variables dinámicas en documentos',
  'Seguimiento en tiempo real',
  'Reportes de uso y estadísticas',
  'Soporte multiidioma',
]

const steps = [
  { icon: IconCloudUpload, title: '1. Sube el documento', description: 'Arrastra tu archivo PDF o créalo con IA directamente en la plataforma', color: 'blue' },
  { icon: IconUsers, title: '2. Añade firmantes', description: 'Especifica quién debe firmar y en qué orden. Email o SMS disponible', color: 'green' },
  { icon: IconMail, title: '3. Envía para firmar', description: 'Los firmantes reciben una notificación automática con el enlace seguro', color: 'orange' },
  { icon: IconCertificate, title: '4. Documento firmado', description: 'Recibe el documento firmado con validez legal completa y auditoría', color: 'violet' },
]

const integrations = [
  { icon: IconApi, title: 'API REST', description: 'Integración completa con tu software existente mediante nuestra API REST', color: 'blue' },
  { icon: IconDeviceTablet, title: 'Tabletas registradas', description: 'Firma presencial en tabletas registradas para comercios y oficinas', color: 'teal' },
  { icon: IconDownload, title: 'Webhooks', description: 'Recibe notificaciones automáticas cuando se complete el proceso de firma', color: 'orange' },
]

export default function FeaturesPage() {
  return (
    <>
      <MarketingHero
        badge="Características principales"
        title="Todo lo que necesitas para firmas electrónicas"
        subtitle="Una plataforma completa con todas las funcionalidades que tu empresa necesita para digitalizar sus procesos de firma."
      />
      <MarketingBody>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {mainFeatures.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <div className="os-rt-card" style={{ padding: 20 }}>
            <SectionTitle sub="Tecnología avanzada para máxima seguridad y cumplimiento legal">
              <IconLock size={22} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 8 }} />
              Características técnicas
            </SectionTitle>
            <CheckList items={technicalFeatures} />
          </div>
          <div className="os-rt-card" style={{ padding: 20 }}>
            <SectionTitle sub="Herramientas diseñadas para optimizar tus procesos empresariales">
              <IconChartBar size={22} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 8 }} />
              Funcionalidades de negocio
            </SectionTitle>
            <CheckList items={businessFeatures} color="blue" />
          </div>
        </SimpleGrid>

        <section>
          <SectionTitle>Proceso de firma simplificado</SectionTitle>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
            {steps.map((s) => (
              <FeatureCard key={s.title} {...s} />
            ))}
          </SimpleGrid>
        </section>

        <section>
          <SectionTitle>Opciones de integración</SectionTitle>
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
            {integrations.map((s) => (
              <FeatureCard key={s.title} {...s} />
            ))}
          </SimpleGrid>
        </section>

        <Alert color="green" icon={<IconGavel size={16} />} title="Validez legal garantizada">
          <Text size="sm">
            Todos los documentos firmados con oSign.eu tienen plena validez legal en España y la Unión Europea, cumpliendo con el reglamento eIDAS y la legislación nacional de firma electrónica.
          </Text>
        </Alert>

        <CtaBlock
          title="¿Listo para empezar?"
          text="Prueba todas estas funcionalidades gratis. Sin permanencia, sin compromiso, sin tarjeta de crédito."
          primary={{ label: 'Probar gratis', href: '/auth/signup' }}
          secondary={{ label: 'Ver precios', href: '/pricing' }}
        />
      </MarketingBody>
    </>
  )
}
