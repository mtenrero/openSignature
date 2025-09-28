'use client'

import React from 'react'
import { 
  Container, 
  Title, 
  Text, 
  Card, 
  Stack, 
  Group, 
  Badge, 
  Button, 
  SimpleGrid,
  Box,
  List,
  ThemeIcon,
  Alert,
  Divider,
  Accordion,
  Timeline
} from '@mantine/core'
import { 
  IconShield, 
  IconLock,
  IconCertificate,
  IconGavel,
  IconEye,
  IconCloudCheck,
  IconFingerprint,
  IconDeviceDesktop,
  IconCheck,
  IconAlertTriangle,
  IconInfoCircle,
  IconScale,
  IconClock,
  IconDatabase,
  IconKey,
  IconFileCheck,
  IconUserCheck
} from '@tabler/icons-react'
import Link from 'next/link'

const securityFeatures = [
  {
    icon: IconLock,
    title: 'Encriptación Extremo a Extremo',
    description: 'Todos los documentos se encriptan con AES-256 antes de ser almacenados. Las claves se gestionan por cliente.',
    color: 'red'
  },
  {
    icon: IconFingerprint,
    title: 'Timestamps Cualificados',
    description: 'Integración con servidores TSA certificados (RFC 3161) para timestamps cualificados con validez legal.',
    color: 'blue'
  },
  {
    icon: IconDeviceDesktop,
    title: 'Metadatos de Dispositivo',
    description: 'Captura automática de IP, navegador, dispositivo y geolocalización para auditoría completa.',
    color: 'green'
  },
  {
    icon: IconEye,
    title: 'Auditoría Completa',
    description: 'Registro detallado de todos los accesos y modificaciones con integridad criptográfica.',
    color: 'purple'
  },
  {
    icon: IconCloudCheck,
    title: 'Infraestructura Segura',
    description: 'Servidores en centros de datos certificados ISO 27001 con redundancia y backups automáticos.',
    color: 'orange'
  },
  {
    icon: IconKey,
    title: 'Protección de Documentos',
    description: 'PDFs protegidos con contraseña automática y permisos restringidos para evitar modificaciones.',
    color: 'teal'
  }
]

const complianceStandards = [
  {
    title: 'eIDAS (UE 910/2014)',
    description: 'Cumplimiento completo del reglamento europeo de identificación electrónica y servicios de confianza.',
    icon: IconScale,
    color: 'blue'
  },
  {
    title: 'RGPD/GDPR',
    description: 'Protección de datos personales según el Reglamento General de Protección de Datos.',
    icon: IconShield,
    color: 'green'
  },
  {
    title: 'ISO 27001',
    description: 'Gestión de seguridad de la información según estándares internacionales.',
    icon: IconCertificate,
    color: 'orange'
  },
  {
    title: 'Ley 6/2020 (España)',
    description: 'Cumplimiento de la normativa española de servicios electrónicos de confianza.',
    icon: IconGavel,
    color: 'red'
  }
]

export default function SecurityPage() {
  return (
    <Box>
      {/* Hero Section */}
      <Box bg="red.0" py="xl">
        <Container size="lg" py="xl">
          <Stack align="center" gap="xl">
            <Badge size="lg" variant="light" color="red">
              Seguridad y Cumplimiento
            </Badge>
            <Title size="3rem" ta="center" fw={900}>
              Máxima seguridad y validez legal
            </Title>
            <Text size="xl" ta="center" c="dimmed" maw={700}>
              oSign.eu cumple con todos los estándares internacionales de seguridad 
              y normativas legales para garantizar la validez de tus firmas electrónicas.
            </Text>
          </Stack>
        </Container>
      </Box>

      <Container size="xl" py="xl">
        <Stack gap="xl">
          {/* Security Features */}
          <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
            {securityFeatures.map((feature) => (
              <Card 
                key={feature.title} 
                shadow="md" 
                padding="xl" 
                radius="lg" 
                withBorder
                h="100%"
              >
                <Stack gap="md" h="100%">
                  <Group align="center" gap="md">
                    <ThemeIcon size={40} radius="md" color={feature.color}>
                      <feature.icon size={24} />
                    </ThemeIcon>
                    <Title order={4}>{feature.title}</Title>
                  </Group>
                  <Text c="dimmed" style={{ flexGrow: 1 }}>
                    {feature.description}
                  </Text>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>

          {/* eIDAS Compliance Section */}
          <Card shadow="sm" padding="xl" radius="md" withBorder>
            <Group align="center" gap="sm" mb="lg">
              <IconCertificate size={32} color="var(--mantine-color-blue-6)" />
              <Title order={2}>Cumplimiento eIDAS</Title>
            </Group>
            
            <Text mb="md">
              El reglamento eIDAS (Electronic IDentification, Authentication and Trust Services) 
              establece el marco legal para las firmas electrónicas en la Unión Europea.
            </Text>

            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg" mt="xl">
              <Stack align="center" ta="center">
                <ThemeIcon size={60} radius="xl" color="green">
                  <IconFileCheck size={30} />
                </ThemeIcon>
                <Title order={5}>Firma Electrónica Simple</Title>
                <Text size="sm" c="dimmed">
                  Válida para la mayoría de documentos comerciales y administrativos
                </Text>
              </Stack>
              <Stack align="center" ta="center">
                <ThemeIcon size={60} radius="xl" color="blue">
                  <IconUserCheck size={30} />
                </ThemeIcon>
                <Title order={5}>Firma Electrónica Avanzada</Title>
                <Text size="sm" c="dimmed">
                  Con identificación del firmante y detección de cambios posteriores
                </Text>
              </Stack>
              <Stack align="center" ta="center">
                <ThemeIcon size={60} radius="xl" color="purple">
                  <IconCertificate size={30} />
                </ThemeIcon>
                <Title order={5}>Firma Electrónica Cualificada</Title>
                <Text size="sm" c="dimmed">
                  Máximo nivel legal, equivalente a firma manuscrita
                </Text>
              </Stack>
            </SimpleGrid>
          </Card>

          {/* Compliance Standards */}
          <Box>
            <Title order={2} ta="center" mb="xl">
              Estándares de Cumplimiento
            </Title>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              {complianceStandards.map((standard) => (
                <Card key={standard.title} shadow="sm" padding="lg" radius="md" withBorder>
                  <Group align="center" gap="md" mb="md">
                    <ThemeIcon size={40} radius="md" color={standard.color}>
                      <standard.icon size={24} />
                    </ThemeIcon>
                    <Title order={4}>{standard.title}</Title>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {standard.description}
                  </Text>
                </Card>
              ))}
            </SimpleGrid>
          </Box>

          {/* Security Process Timeline */}
          <Card shadow="sm" padding="xl" radius="md" withBorder>
            <Title order={3} mb="xl">Proceso de Seguridad</Title>
            <Timeline active={-1} bulletSize={24} lineWidth={2}>
              <Timeline.Item
                bullet={<IconCloudCheck size={16} />}
                title="Recepción Segura"
                color="blue"
              >
                <Text c="dimmed" size="sm">
                  El documento se recibe a través de conexión HTTPS cifrada
                </Text>
              </Timeline.Item>

              <Timeline.Item
                bullet={<IconLock size={16} />}
                title="Encriptación"
                color="green"
              >
                <Text c="dimmed" size="sm">
                  Se encripta con AES-256 y se genera una clave única por cliente
                </Text>
              </Timeline.Item>

              <Timeline.Item
                bullet={<IconDatabase size={16} />}
                title="Almacenamiento Seguro"
                color="orange"
              >
                <Text c="dimmed" size="sm">
                  Se almacena en infraestructura certificada ISO 27001 con backup automático
                </Text>
              </Timeline.Item>

              <Timeline.Item
                bullet={<IconFingerprint size={16} />}
                title="Proceso de Firma"
                color="purple"
              >
                <Text c="dimmed" size="sm">
                  Se capturan metadatos del dispositivo, IP y se aplica timestamp cualificado
                </Text>
              </Timeline.Item>

              <Timeline.Item
                bullet={<IconKey size={16} />}
                title="Protección Final"
                color="red"
              >
                <Text c="dimmed" size="sm">
                  El documento firmado se protege con contraseña automática y permisos restringidos
                </Text>
              </Timeline.Item>
            </Timeline>
          </Card>

          {/* Technical Details */}
          <Accordion variant="separated">
            <Accordion.Item value="encryption">
              <Accordion.Control icon={<IconLock size={20} />}>
                Detalles de Encriptación
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="md">
                  <Text size="sm">
                    <strong>Algoritmo:</strong> AES-256-GCM para documentos, RSA-4096 para intercambio de claves
                  </Text>
                  <Text size="sm">
                    <strong>Gestión de Claves:</strong> Una clave maestra única por cliente, derivada con PBKDF2
                  </Text>
                  <Text size="sm">
                    <strong>Transmisión:</strong> TLS 1.3 para todas las comunicaciones cliente-servidor
                  </Text>
                  <Text size="sm">
                    <strong>Almacenamiento:</strong> Claves almacenadas en HSM (Hardware Security Module) certificado
                  </Text>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="audit">
              <Accordion.Control icon={<IconEye size={20} />}>
                Sistema de Auditoría
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="md">
                  <Text size="sm">
                    <strong>Registro de Eventos:</strong> Todos los accesos, modificaciones y firmas se registran
                  </Text>
                  <Text size="sm">
                    <strong>Metadatos:</strong> IP, User-Agent, geolocalización, timestamp preciso
                  </Text>
                  <Text size="sm">
                    <strong>Integridad:</strong> Cada entrada de auditoría incluye hash SHA-256 del evento anterior
                  </Text>
                  <Text size="sm">
                    <strong>Inmutabilidad:</strong> Los registros de auditoría no pueden ser modificados una vez creados
                  </Text>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="timestamps">
              <Accordion.Control icon={<IconClock size={20} />}>
                Timestamps Cualificados
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="md">
                  <Text size="sm">
                    <strong>Protocolo:</strong> RFC 3161 - Time-Stamp Protocol (TSP)
                  </Text>
                  <Text size="sm">
                    <strong>Proveedores:</strong> Servidores TSA certificados (DigiCert, Sectigo, Certum)
                  </Text>
                  <Text size="sm">
                    <strong>Verificación:</strong> Cada timestamp incluye certificado del TSA para verificación independiente
                  </Text>
                  <Text size="sm">
                    <strong>Precisión:</strong> Timestamps con precisión de milisegundos y validez legal
                  </Text>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>

          {/* Legal Validity Alert */}
          <Alert color="green" icon={<IconGavel size={16} />}>
            <Text fw={600} mb="xs">Validez Legal Garantizada</Text>
            <Text size="sm" mb="md">
              Los documentos firmados con oSign.eu tienen plena validez legal en España y todos los países 
              de la Unión Europea, cumpliendo con:
            </Text>
            <List size="sm" spacing="xs" icon={
              <ThemeIcon color="green" size={16} radius="xl">
                <IconCheck size={10} />
              </ThemeIcon>
            }>
              <List.Item>Reglamento eIDAS (UE) 910/2014</List.Item>
              <List.Item>Ley 6/2020 de servicios electrónicos de confianza</List.Item>
              <List.Item>Código Civil español (Art. 1265 y siguientes)</List.Item>
              <List.Item>Ley de Enjuiciamiento Civil (Art. 299 y 326)</List.Item>
            </List>
          </Alert>

          {/* Warning about misuse */}
          <Alert color="orange" icon={<IconAlertTriangle size={16} />}>
            <Text fw={600} mb="xs">Compromiso de Seguridad</Text>
            <Text size="sm">
              oSign.eu se compromete a mantener los más altos estándares de seguridad y privacidad. 
              Nunca accedemos al contenido de tus documentos sin tu autorización explícita, y todos los datos 
              se procesan conforme al RGPD y normativas de protección de datos.
            </Text>
          </Alert>

          {/* CTA Section */}
          <Box ta="center" mt="xl" py="xl">
            <Stack align="center" gap="md">
              <Title order={2}>¿Necesitas más información?</Title>
              <Text size="lg" c="dimmed" maw={500}>
                Consulta nuestra documentación técnica o contacta con nuestro equipo de seguridad 
                para resolver cualquier duda sobre cumplimiento y validez legal.
              </Text>
              <Group gap="md">
                <Link href="/auth/signin">
                  <Button size="lg" leftSection={<IconShield size={20} />}>
                    Probar Ahora
                  </Button>
                </Link>
                <Button size="lg" variant="outline" leftSection={<IconInfoCircle size={20} />}>
                  Documentación Técnica
                </Button>
              </Group>
            </Stack>
          </Box>
        </Stack>
      </Container>
    </Box>
  )
}