'use client'

import React from 'react'
import Link from 'next/link'
import { Accordion, Alert, Badge, Button, Group, SimpleGrid, Stack, Text, ThemeIcon, Timeline, Title } from '@mantine/core'
import {
  IconUpload, IconUsers, IconMail, IconPencil, IconCheck, IconDownload, IconDeviceTablet, IconClock, IconShield,
  IconEye, IconFileCheck, IconApi,
} from '@tabler/icons-react'
import { MarketingHero, MarketingBody, SectionTitle, FeatureCard, CheckList, CtaBlock } from '../../components/marketing/Marketing'

const steps = [
  { icon: IconUpload, title: 'Sube tu documento', description: 'Arrastra tu PDF o crea uno nuevo con IA', details: ['Formatos soportados: PDF, DOC, DOCX', 'Genera contratos con inteligencia artificial', 'Plantillas predefinidas disponibles', 'Variables dinámicas personalizables'], color: 'blue' },
  { icon: IconUsers, title: 'Añade firmantes', description: 'Define quién debe firmar y cuándo', details: ['Firma secuencial o en paralelo', 'Email, teléfono o ambos', 'Campos personalizados opcionales', 'Orden de firma configurable'], color: 'green' },
  { icon: IconMail, title: 'Envía para firmar', description: 'Los firmantes reciben una notificación automática', details: ['Email personalizable automático', 'SMS opcional para mayor alcance', 'Recordatorios automáticos', 'Seguimiento en tiempo real'], color: 'orange' },
  { icon: IconPencil, title: 'Proceso de firma', description: 'Firma simple desde cualquier dispositivo', details: ['Sin necesidad de registro', 'Firma manuscrita o digital', 'Verificación de identidad', 'Geolocalización y metadatos'], color: 'violet' },
  { icon: IconDownload, title: 'Documento firmado', description: 'Recibe el documento con validez legal', details: ['PDF protegido con contraseña', 'Certificado de autenticidad', 'Timestamp cualificado incluido', 'Auditoría completa disponible'], color: 'red' },
]

const useCases = [
  { title: 'Contratos comerciales', description: 'Acuerdos comerciales, contratos de servicios, convenios de colaboración.', icon: IconFileCheck, examples: ['Contratos de prestación de servicios', 'Acuerdos de confidencialidad', 'Convenios de colaboración'] },
  { title: 'Recursos humanos', description: 'Contratos laborales, nóminas, documentos de RRHH.', icon: IconUsers, examples: ['Contratos de trabajo', 'Finiquitos', 'Políticas internas'] },
  { title: 'Sector inmobiliario', description: 'Contratos de arrendamiento, compraventa, reservas.', icon: IconShield, examples: ['Contratos de alquiler', 'Reservas de inmuebles', 'Acuerdos de compraventa'] },
  { title: 'Servicios profesionales', description: 'Propuestas, presupuestos, acuerdos con clientes.', icon: IconEye, examples: ['Presupuestos aceptados', 'Propuestas comerciales', 'Autorizaciones'] },
]

const integrationMethods = [
  { title: 'Web dashboard', description: 'Interfaz web completa para gestión manual de documentos', icon: IconEye, features: ['Dashboard intuitivo', 'Gestión de plantillas', 'Seguimiento visual', 'Informes detallados'] },
  { title: 'API REST', description: 'Integración completa en tus aplicaciones existentes', icon: IconApi, features: ['Endpoints completos', 'Documentación OpenAPI', 'SDKs disponibles', 'Webhooks de estado'] },
  { title: 'Tableta presencial', description: 'Firmas presenciales en comercios y oficinas', icon: IconDeviceTablet, features: ['Registro de dispositivos', 'Modo offline', 'Sincronización automática', 'Interfaz táctil'] },
]

const faqs = [
  { q: '¿Cuánto tiempo tarda el proceso completo?', a: 'Desde que subes el documento hasta recibir las firmas, el proceso típico tarda entre 1 y 15 minutos, dependiendo de la rapidez de los firmantes.' },
  { q: '¿Necesitan los firmantes crear una cuenta?', a: 'No. Los firmantes reciben un enlace único y pueden firmar directamente sin necesidad de registrarse o crear una cuenta.' },
  { q: '¿Qué pasa si alguien no firma?', a: 'El sistema envía recordatorios automáticos. Puedes configurar la frecuencia o cancelar el proceso en cualquier momento desde tu dashboard.' },
  { q: '¿Se puede modificar un documento después de enviarlo?', a: 'No. Una vez enviado, el documento queda inmutable para garantizar la integridad. Si necesitas cambios, deberás crear una nueva solicitud de firma.' },
]

export default function HowItWorksPage() {
  return (
    <>
      <MarketingHero
        badge="Cómo funciona"
        title="Firma electrónica en 5 pasos simples"
        subtitle="Descubre lo fácil que es digitalizar tus procesos de firma. Desde subir el documento hasta recibir las firmas, todo en minutos."
      />
      <MarketingBody>
        <section>
          <SectionTitle>Proceso paso a paso</SectionTitle>
          <Stack gap="md">
            {steps.map((step, index) => (
              <div key={step.title} className="os-rt-card" style={{ padding: 16 }}>
                <Group gap="md" wrap="nowrap" align="flex-start">
                  <ThemeIcon size={48} radius="xl" variant="light" color={step.color} style={{ flex: '0 0 auto' }}>
                    <step.icon size={26} />
                  </ThemeIcon>
                  <Stack gap="xs" style={{ minWidth: 0, flex: 1 }}>
                    <div>
                      <Badge variant="light" color={step.color} mb={4}>Paso {index + 1}</Badge>
                      <Title order={3} fz="lg">{step.title}</Title>
                      <Text c="dimmed" size="sm">{step.description}</Text>
                    </div>
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={4}>
                      <CheckList items={step.details} color={step.color} />
                    </SimpleGrid>
                  </Stack>
                </Group>
              </div>
            ))}
          </Stack>
        </section>

        <section className="os-rt-card" style={{ padding: 20 }}>
          <Stack gap="sm">
            <Title order={2} fz={22}>¿Quieres verlo en acción?</Title>
            <Text c="dimmed">Crea una cuenta gratuita y experimenta el proceso completo de firma electrónica.</Text>
            <Button component={Link} href="/auth/signup" size="lg" leftSection={<IconEye size={20} />}>Probar ahora</Button>
          </Stack>
        </section>

        <section>
          <SectionTitle>Casos de uso principales</SectionTitle>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            {useCases.map((u) => (
              <div key={u.title} className="os-rt-card" style={{ padding: 16 }}>
                <FeatureCard icon={u.icon} title={u.title} description={u.description} />
                <div style={{ marginTop: 12 }}><CheckList items={u.examples} color="blue" /></div>
              </div>
            ))}
          </SimpleGrid>
        </section>

        <section>
          <SectionTitle>Métodos de integración</SectionTitle>
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
            {integrationMethods.map((m) => (
              <div key={m.title} className="os-rt-card" style={{ padding: 16 }}>
                <FeatureCard icon={m.icon} title={m.title} description={m.description} color="green" />
                <div style={{ marginTop: 12 }}><CheckList items={m.features} /></div>
              </div>
            ))}
          </SimpleGrid>
        </section>

        <section className="os-rt-card" style={{ padding: 20 }}>
          <SectionTitle>Cronología de una firma típica</SectionTitle>
          <Timeline active={-1} bulletSize={28} lineWidth={2}>
            <Timeline.Item bullet={<IconClock size={16} />} title="0 minutos · Inicio" color="blue"><Text c="dimmed" size="sm">Subes el documento y defines los firmantes</Text></Timeline.Item>
            <Timeline.Item bullet={<IconMail size={16} />} title="1 minuto · Envío" color="orange"><Text c="dimmed" size="sm">Los firmantes reciben el email con el enlace seguro</Text></Timeline.Item>
            <Timeline.Item bullet={<IconPencil size={16} />} title="1-15 minutos · Firma" color="green"><Text c="dimmed" size="sm">Los firmantes acceden y firman el documento</Text></Timeline.Item>
            <Timeline.Item bullet={<IconCheck size={16} />} title="Completado" color="violet"><Text c="dimmed" size="sm">Recibes el documento firmado con validez legal completa</Text></Timeline.Item>
          </Timeline>
        </section>

        <section className="os-rt-card" style={{ padding: 20 }}>
          <Title order={2} fz={22} mb="md">¿Qué ocurre técnicamente?</Title>
          <CheckList
            items={[
              'Encriptación: tu documento se encripta con AES-256',
              'Timestamp: se aplica timestamp cualificado RFC 3161',
              'Auditoría: cada acción se registra de forma inmutable',
              'Metadatos: IP, navegador y dispositivo se capturan',
              'Validación: se verifica la integridad del documento',
              'Protección: PDF final protegido con contraseña',
            ]}
            color="blue"
          />
        </section>

        <section>
          <SectionTitle>Preguntas frecuentes</SectionTitle>
          <Accordion variant="separated" chevronPosition="right">
            {faqs.map((f) => (
              <Accordion.Item key={f.q} value={f.q}>
                <Accordion.Control style={{ minHeight: 56 }}>{f.q}</Accordion.Control>
                <Accordion.Panel><Text size="sm" c="dimmed">{f.a}</Text></Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </section>

        <Alert color="green" icon={<IconShield size={16} />} title="Validez legal garantizada">
          <Text size="sm">
            Todos los documentos firmados siguiendo este proceso tienen plena validez legal en España y la Unión Europea, cumpliendo con el reglamento eIDAS y normativas nacionales de firma electrónica.
          </Text>
        </Alert>

        <CtaBlock
          title="¿Listo para probarlo?"
          text="Comienza ahora mismo con el plan gratuito. Sin permanencia, sin tarjeta de crédito, sin complicaciones."
          primary={{ label: 'Empezar gratis', href: '/auth/signup' }}
          secondary={{ label: 'Ver características', href: '/features' }}
        />
      </MarketingBody>
    </>
  )
}
