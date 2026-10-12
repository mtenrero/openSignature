'use client'

import React from 'react'
import { Accordion, Alert, SimpleGrid, Stack, Text, Timeline } from '@mantine/core'
import {
  IconShield, IconLock, IconCertificate, IconGavel, IconEye, IconCloudCheck, IconFingerprint, IconDeviceDesktop,
  IconAlertTriangle, IconScale, IconClock, IconDatabase, IconKey, IconFileCheck, IconUserCheck,
} from '@tabler/icons-react'
import { MarketingHero, MarketingBody, SectionTitle, FeatureCard, CheckList, CtaBlock } from '../../components/marketing/Marketing'

const securityFeatures = [
  { icon: IconLock, title: 'Encriptación extremo a extremo', description: 'Todos los documentos se encriptan con AES-256 antes de ser almacenados. Las claves se gestionan por cliente.', color: 'red' },
  { icon: IconFingerprint, title: 'Timestamps cualificados', description: 'Integración con servidores TSA certificados (RFC 3161) para timestamps cualificados con validez legal.', color: 'blue' },
  { icon: IconDeviceDesktop, title: 'Metadatos de dispositivo', description: 'Captura automática de IP, navegador, dispositivo y geolocalización para auditoría completa.', color: 'green' },
  { icon: IconEye, title: 'Auditoría completa', description: 'Registro detallado de todos los accesos y modificaciones con integridad criptográfica.', color: 'violet' },
  { icon: IconCloudCheck, title: 'Infraestructura segura', description: 'Servidores en centros de datos certificados ISO 27001 con redundancia y backups automáticos.', color: 'orange' },
  { icon: IconKey, title: 'Protección de documentos', description: 'PDFs protegidos con contraseña automática y permisos restringidos para evitar modificaciones.', color: 'teal' },
]

const eidas = [
  { icon: IconFileCheck, title: 'Firma electrónica simple', description: 'Válida para la mayoría de documentos comerciales y administrativos', color: 'green' },
  { icon: IconUserCheck, title: 'Firma electrónica avanzada', description: 'Con identificación del firmante y detección de cambios posteriores', color: 'blue' },
  { icon: IconCertificate, title: 'Firma electrónica cualificada', description: 'Máximo nivel legal, equivalente a firma manuscrita', color: 'violet' },
]

const complianceStandards = [
  { title: 'eIDAS (UE 910/2014)', description: 'Cumplimiento completo del reglamento europeo de identificación electrónica y servicios de confianza.', icon: IconScale, color: 'blue' },
  { title: 'RGPD/GDPR', description: 'Protección de datos personales según el Reglamento General de Protección de Datos.', icon: IconShield, color: 'green' },
  { title: 'ISO 27001', description: 'Gestión de seguridad de la información según estándares internacionales.', icon: IconCertificate, color: 'orange' },
  { title: 'Ley 6/2020 (España)', description: 'Cumplimiento de la normativa española de servicios electrónicos de confianza.', icon: IconGavel, color: 'red' },
]

const detail = (rows: Array<[string, string]>) => (
  <Stack gap="sm">
    {rows.map(([k, v]) => (
      <Text size="sm" key={k}>
        <strong>{k}:</strong> {v}
      </Text>
    ))}
  </Stack>
)

export default function SecurityPage() {
  return (
    <>
      <MarketingHero
        badge="Seguridad y cumplimiento"
        title="Máxima seguridad y validez legal"
        subtitle="oSign.eu cumple con los estándares internacionales de seguridad y las normativas legales para garantizar la validez de tus firmas electrónicas."
      />
      <MarketingBody>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {securityFeatures.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </SimpleGrid>

        <section>
          <SectionTitle sub="El reglamento eIDAS establece el marco legal para las firmas electrónicas en la Unión Europea.">Cumplimiento eIDAS</SectionTitle>
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
            {eidas.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </SimpleGrid>
        </section>

        <section>
          <SectionTitle>Estándares de cumplimiento</SectionTitle>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {complianceStandards.map((s) => (
              <FeatureCard key={s.title} {...s} />
            ))}
          </SimpleGrid>
        </section>

        <section className="os-rt-card" style={{ padding: 20 }}>
          <SectionTitle>Proceso de seguridad</SectionTitle>
          <Timeline active={-1} bulletSize={28} lineWidth={2}>
            <Timeline.Item bullet={<IconCloudCheck size={16} />} title="Recepción segura" color="blue">
              <Text c="dimmed" size="sm">El documento se recibe a través de conexión HTTPS cifrada</Text>
            </Timeline.Item>
            <Timeline.Item bullet={<IconLock size={16} />} title="Encriptación" color="green">
              <Text c="dimmed" size="sm">Se encripta con AES-256 y se genera una clave única por cliente</Text>
            </Timeline.Item>
            <Timeline.Item bullet={<IconDatabase size={16} />} title="Almacenamiento seguro" color="orange">
              <Text c="dimmed" size="sm">Se almacena en infraestructura certificada ISO 27001 con backup automático</Text>
            </Timeline.Item>
            <Timeline.Item bullet={<IconFingerprint size={16} />} title="Proceso de firma" color="violet">
              <Text c="dimmed" size="sm">Se capturan metadatos del dispositivo, IP y se aplica timestamp cualificado</Text>
            </Timeline.Item>
            <Timeline.Item bullet={<IconKey size={16} />} title="Protección final" color="red">
              <Text c="dimmed" size="sm">El documento firmado se protege con contraseña automática y permisos restringidos</Text>
            </Timeline.Item>
          </Timeline>
        </section>

        <Accordion variant="separated" chevronPosition="right">
          <Accordion.Item value="encryption">
            <Accordion.Control icon={<IconLock size={20} />} style={{ minHeight: 56 }}>Detalles de encriptación</Accordion.Control>
            <Accordion.Panel>
              {detail([
                ['Algoritmo', 'AES-256-GCM para documentos, RSA-4096 para intercambio de claves'],
                ['Gestión de claves', 'Una clave maestra única por cliente, derivada con PBKDF2'],
                ['Transmisión', 'TLS 1.3 para todas las comunicaciones cliente-servidor'],
                ['Almacenamiento', 'Claves almacenadas en HSM (Hardware Security Module) certificado'],
              ])}
            </Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item value="audit">
            <Accordion.Control icon={<IconEye size={20} />} style={{ minHeight: 56 }}>Sistema de auditoría</Accordion.Control>
            <Accordion.Panel>
              {detail([
                ['Registro de eventos', 'Todos los accesos, modificaciones y firmas se registran'],
                ['Metadatos', 'IP, User-Agent, geolocalización, timestamp preciso'],
                ['Integridad', 'Cada entrada de auditoría incluye hash SHA-256 del evento anterior'],
                ['Inmutabilidad', 'Los registros de auditoría no pueden ser modificados una vez creados'],
              ])}
            </Accordion.Panel>
          </Accordion.Item>
          <Accordion.Item value="timestamps">
            <Accordion.Control icon={<IconClock size={20} />} style={{ minHeight: 56 }}>Timestamps cualificados</Accordion.Control>
            <Accordion.Panel>
              {detail([
                ['Protocolo', 'RFC 3161 - Time-Stamp Protocol (TSP)'],
                ['Proveedores', 'Servidores TSA certificados (DigiCert, Sectigo, Certum)'],
                ['Verificación', 'Cada timestamp incluye certificado del TSA para verificación independiente'],
                ['Precisión', 'Timestamps con precisión de milisegundos y validez legal'],
              ])}
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>

        <Alert color="green" icon={<IconGavel size={16} />} title="Validez legal garantizada">
          <Text size="sm" mb="sm">
            Los documentos firmados con oSign.eu tienen plena validez legal en España y todos los países de la Unión Europea, cumpliendo con:
          </Text>
          <CheckList
            items={[
              'Reglamento eIDAS (UE) 910/2014',
              'Ley 6/2020 de servicios electrónicos de confianza',
              'Código Civil español (Art. 1265 y siguientes)',
              'Ley de Enjuiciamiento Civil (Art. 299 y 326)',
            ]}
          />
        </Alert>

        <Alert color="orange" icon={<IconAlertTriangle size={16} />} title="Compromiso de seguridad">
          <Text size="sm">
            oSign.eu se compromete a mantener los más altos estándares de seguridad y privacidad. Nunca accedemos al contenido de tus documentos sin tu autorización explícita, y todos los datos se procesan conforme al RGPD y normativas de protección de datos.
          </Text>
        </Alert>

        <CtaBlock
          title="¿Necesitas más información?"
          text="Consulta nuestra documentación técnica para resolver cualquier duda sobre cumplimiento y validez legal."
          primary={{ label: 'Probar ahora', href: '/auth/signup' }}
          secondary={{ label: 'Documentación técnica', href: '/docs/api' }}
        />
      </MarketingBody>
    </>
  )
}
