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
  Divider
} from '@mantine/core'
import { 
  IconCheck, 
  IconShield, 
  IconRobot,
  IconMail,
  IconMessage,
  IconApi,
  IconCloudUpload,
  IconLock,
  IconCertificate,
  IconDeviceTablet,
  IconUsers,
  IconChartBar,
  IconDownload,
  IconClock,
  IconGavel,
  IconInfoCircle
} from '@tabler/icons-react'
import Link from 'next/link'

const mainFeatures = [
  {
    icon: IconShield,
    title: 'Cumplimiento eIDAS',
    description: 'Firmas electrónicas con plena validez legal en toda la Unión Europea según el reglamento eIDAS.',
    color: 'green'
  },
  {
    icon: IconRobot,
    title: 'Generación IA de Contratos',
    description: 'Crea contratos profesionales en segundos con inteligencia artificial. Personaliza según tus necesidades.',
    color: 'blue'
  },
  {
    icon: IconMail,
    title: 'Firmas por Email',
    description: 'Los firmantes reciben el documento por email y firman desde cualquier dispositivo sin necesidad de registro.',
    color: 'orange'
  },
  {
    icon: IconMessage,
    title: 'Firmas por SMS',
    description: 'Envía documentos para firmar por SMS. Perfecto para procesos rápidos y usuarios sin email.',
    color: 'yellow'
  },
  {
    icon: IconApi,
    title: 'API REST Completa',
    description: 'Integra oSign.eu en tus aplicaciones con nuestra API REST. Documentación completa incluida.',
    color: 'purple'
  },
  {
    icon: IconDeviceTablet,
    title: 'Firma en Tableta',
    description: 'Registra tabletas para firmas presenciales. Ideal para comercios y oficinas.',
    color: 'teal'
  }
]

const technicalFeatures = [
  'Timestamps cualificados RFC 3161',
  'Protección con contraseña automática',
  'Metadatos de dispositivo y geolocalización',
  'Auditoría completa de accesos',
  'Encriptación extremo a extremo',
  'Backup automático de documentos'
]

const businessFeatures = [
  'Dashboard de gestión intuitivo',
  'Plantillas de contratos personalizables',
  'Variables dinámicas en documentos',
  'Seguimiento en tiempo real',
  'Reportes de uso y estadísticas',
  'Soporte multiidioma'
]

export default function FeaturesPage() {
  return (
    <Box>
      {/* Hero Section */}
      <Box bg="blue.0" py="xl">
        <Container size="lg" py="xl">
          <Stack align="center" gap="xl">
            <Badge size="lg" variant="light" color="blue">
              Características Principales
            </Badge>
            <Title size="3rem" ta="center" fw={900}>
              Todo lo que necesitas para firmas electrónicas
            </Title>
            <Text size="xl" ta="center" c="dimmed" maw={600}>
              Una plataforma completa con todas las funcionalidades que tu empresa necesita 
              para digitalizar sus procesos de firma.
            </Text>
          </Stack>
        </Container>
      </Box>

      <Container size="xl" py="xl">
        <Stack gap="xl">
          {/* Main Features Grid */}
          <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
            {mainFeatures.map((feature) => (
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

          {/* Technical & Business Features */}
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="xl" mt="xl">
            <Card shadow="sm" padding="xl" radius="md" withBorder>
              <Stack gap="md">
                <Group align="center" gap="sm">
                  <IconLock size={24} color="var(--mantine-color-green-6)" />
                  <Title order={3}>Características Técnicas</Title>
                </Group>
                <Text c="dimmed" mb="md">
                  Tecnología avanzada para máxima seguridad y cumplimiento legal
                </Text>
                <List spacing="xs" size="sm" icon={
                  <ThemeIcon color="green" size={16} radius="xl">
                    <IconCheck size={10} />
                  </ThemeIcon>
                }>
                  {technicalFeatures.map((feature, index) => (
                    <List.Item key={index}>{feature}</List.Item>
                  ))}
                </List>
              </Stack>
            </Card>

            <Card shadow="sm" padding="xl" radius="md" withBorder>
              <Stack gap="md">
                <Group align="center" gap="sm">
                  <IconChartBar size={24} color="var(--mantine-color-blue-6)" />
                  <Title order={3}>Funcionalidades de Negocio</Title>
                </Group>
                <Text c="dimmed" mb="md">
                  Herramientas diseñadas para optimizar tus procesos empresariales
                </Text>
                <List spacing="xs" size="sm" icon={
                  <ThemeIcon color="blue" size={16} radius="xl">
                    <IconCheck size={10} />
                  </ThemeIcon>
                }>
                  {businessFeatures.map((feature, index) => (
                    <List.Item key={index}>{feature}</List.Item>
                  ))}
                </List>
              </Stack>
            </Card>
          </SimpleGrid>

          {/* Process Flow */}
          <Box mt="xl">
            <Title order={2} ta="center" mb="xl">
              Proceso de Firma Simplificado
            </Title>
            
            <SimpleGrid cols={{ base: 1, md: 4 }} spacing="lg">
              <Card shadow="sm" padding="lg" radius="md" withBorder ta="center">
                <Stack align="center" gap="md">
                  <ThemeIcon size={60} radius="xl" color="blue">
                    <IconCloudUpload size={30} />
                  </ThemeIcon>
                  <Title order={4}>1. Sube el Documento</Title>
                  <Text size="sm" c="dimmed">
                    Arrastra tu archivo PDF o créalo con IA directamente en la plataforma
                  </Text>
                </Stack>
              </Card>

              <Card shadow="sm" padding="lg" radius="md" withBorder ta="center">
                <Stack align="center" gap="md">
                  <ThemeIcon size={60} radius="xl" color="green">
                    <IconUsers size={30} />
                  </ThemeIcon>
                  <Title order={4}>2. Añade Firmantes</Title>
                  <Text size="sm" c="dimmed">
                    Especifica quién debe firmar y en qué orden. Email o SMS disponible
                  </Text>
                </Stack>
              </Card>

              <Card shadow="sm" padding="lg" radius="md" withBorder ta="center">
                <Stack align="center" gap="md">
                  <ThemeIcon size={60} radius="xl" color="orange">
                    <IconMail size={30} />
                  </ThemeIcon>
                  <Title order={4}>3. Envía para Firmar</Title>
                  <Text size="sm" c="dimmed">
                    Los firmantes reciben una notificación automática con el enlace seguro
                  </Text>
                </Stack>
              </Card>

              <Card shadow="sm" padding="lg" radius="md" withBorder ta="center">
                <Stack align="center" gap="md">
                  <ThemeIcon size={60} radius="xl" color="purple">
                    <IconCertificate size={30} />
                  </ThemeIcon>
                  <Title order={4}>4. Documento Firmado</Title>
                  <Text size="sm" c="dimmed">
                    Recibe el documento firmado con validez legal completa y auditoría
                  </Text>
                </Stack>
              </Card>
            </SimpleGrid>
          </Box>

          {/* Integration Options */}
          <Card shadow="sm" padding="xl" radius="md" withBorder mt="xl">
            <Title order={3} ta="center" mb="xl">Opciones de Integración</Title>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
              <Stack align="center" ta="center">
              <IconApi size={40} color="var(--mantine-color-blue-6)" />
              <Title order={5}>API REST</Title>
                <Text size="sm" c="dimmed">
                  Integración completa con tu software existente mediante nuestra API REST
                </Text>
              </Stack>
              <Stack align="center" ta="center">
                <IconDeviceTablet size={40} color="var(--mantine-color-teal-6)" />
                <Title order={5}>Tabletas Registradas</Title>
                <Text size="sm" c="dimmed">
                  Firma presencial en tabletas registradas para comercios y oficinas
                </Text>
              </Stack>
              <Stack align="center" ta="center">
                <IconDownload size={40} color="var(--mantine-color-orange-6)" />
                <Title order={5}>Webhooks</Title>
                <Text size="sm" c="dimmed">
                  Recibe notificaciones automáticas cuando se complete el proceso de firma
                </Text>
              </Stack>
            </SimpleGrid>
          </Card>

          {/* Legal Compliance */}
          <Alert color="green" icon={<IconGavel size={16} />}>
            <Text fw={600} mb="xs">Validez Legal Garantizada</Text>
            <Text size="sm">
              Todos los documentos firmados con oSign.eu tienen plena validez legal en España y la Unión Europea, 
              cumpliendo con el reglamento eIDAS y la legislación nacional de firma electrónica.
            </Text>
          </Alert>

          {/* CTA Section */}
          <Box ta="center" mt="xl" py="xl">
            <Stack align="center" gap="md">
              <Title order={2}>¿Listo para empezar?</Title>
              <Text size="lg" c="dimmed" maw={500}>
                Prueba todas estas funcionalidades gratis. Sin permanencia, 
                sin compromiso, sin tarjeta de crédito.
              </Text>
              <Group gap="md">
                <Link href="/auth/signin">
                  <Button size="lg" leftSection={<IconCheck size={20} />}>
                    Probar Gratis
                  </Button>
                </Link>
                <Link href="/pricing">
                  <Button size="lg" variant="outline">
                    Ver Precios
                  </Button>
                </Link>
              </Group>
            </Stack>
          </Box>
        </Stack>
      </Container>
    </Box>
  )
}