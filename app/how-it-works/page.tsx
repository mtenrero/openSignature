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
  Stepper,
  ThemeIcon,
  Alert,
  Divider,
  Image,
  Center,
  Timeline
} from '@mantine/core'
import {
  IconUpload,
  IconUsers,
  IconMail,
  IconPencil,
  IconCheck,
  IconDownload,
  IconDeviceTablet,
  IconClock,
  IconShield,
  IconEye,
  IconFileCheck,
  IconArrowRight,
  IconApi
} from '@tabler/icons-react'
import Link from 'next/link'

const steps = [
  {
    icon: IconUpload,
    title: 'Sube tu documento',
    description: 'Arrastra tu PDF o crea uno nuevo con IA',
    details: [
      'Formatos soportados: PDF, DOC, DOCX',
      'Genera contratos con inteligencia artificial',
      'Plantillas predefinidas disponibles',
      'Variables dinámicas personalizables'
    ],
    color: 'blue'
  },
  {
    icon: IconUsers,
    title: 'Añade firmantes',
    description: 'Define quién debe firmar y cuándo',
    details: [
      'Firma secuencial o en paralelo',
      'Email, teléfono o ambos',
      'Campos personalizados opcionales',
      'Orden de firma configurable'
    ],
    color: 'green'
  },
  {
    icon: IconMail,
    title: 'Envía para firmar',
    description: 'Los firmantes reciben una notificación automática',
    details: [
      'Email personalizable automático',
      'SMS opcional para mayor alcance',
      'Recordatorios automáticos',
      'Seguimiento en tiempo real'
    ],
    color: 'orange'
  },
  {
    icon: IconPencil,
    title: 'Proceso de firma',
    description: 'Firma simple desde cualquier dispositivo',
    details: [
      'Sin necesidad de registro',
      'Firma manuscrita o digital',
      'Verificación de identidad',
      'Geolocalización y metadatos'
    ],
    color: 'purple'
  },
  {
    icon: IconDownload,
    title: 'Documento firmado',
    description: 'Recibe el documento con validez legal',
    details: [
      'PDF protegido con contraseña',
      'Certificado de autenticidad',
      'Timestamp cualificado incluido',
      'Auditoría completa disponible'
    ],
    color: 'red'
  }
]

const useCases = [
  {
    title: 'Contratos Comerciales',
    description: 'Acuerdos comerciales, contratos de servicios, convenios de colaboración.',
    icon: IconFileCheck,
    examples: ['Contratos de prestación de servicios', 'Acuerdos de confidencialidad', 'Convenios de colaboración']
  },
  {
    title: 'Recursos Humanos',
    description: 'Contratos laborales, nóminas, documentos de RRHH.',
    icon: IconUsers,
    examples: ['Contratos de trabajo', 'Finiquitos', 'Políticas internas']
  },
  {
    title: 'Sector Inmobiliario',
    description: 'Contratos de arrendamiento, compraventa, reservas.',
    icon: IconShield,
    examples: ['Contratos de alquiler', 'Reservas de inmuebles', 'Acuerdos de compraventa']
  },
  {
    title: 'Servicios Profesionales',
    description: 'Propuestas, presupuestos, acuerdos con clientes.',
    icon: IconEye,
    examples: ['Presupuestos aceptados', 'Propuestas comerciales', 'Autorizaciones']
  }
]

const integrationMethods = [
  {
    title: 'Web Dashboard',
    description: 'Interfaz web completa para gestión manual de documentos',
    icon: IconEye,
    features: ['Dashboard intuitivo', 'Gestión de plantillas', 'Seguimiento visual', 'Informes detallados']
  },
  {
    title: 'API REST',
    description: 'Integración completa en tus aplicaciones existentes',
    icon: IconApi,
    features: ['Endpoints completos', 'Documentación OpenAPI', 'SDKs disponibles', 'Webhooks de estado']
  },
  {
    title: 'Tableta Presencial',
    description: 'Firmas presenciales en comercios y oficinas',
    icon: IconDeviceTablet,
    features: ['Registro de dispositivos', 'Modo offline', 'Sincronización automática', 'Interfaz táctil']
  }
]

export default function HowItWorksPage() {
  return (
    <Box>
      {/* Hero Section */}
      <Box bg="green.0" py="xl">
        <Container size="lg" py="xl">
          <Stack align="center" gap="xl">
            <Badge size="lg" variant="light" color="green">
              Cómo Funciona
            </Badge>
            <Title size="3rem" ta="center" fw={900}>
              Firma electrónica en 5 pasos simples
            </Title>
            <Text size="xl" ta="center" c="dimmed" maw={600}>
              Descubre lo fácil que es digitalizar tus procesos de firma. 
              Desde subir el documento hasta recibir las firmas, todo en minutos.
            </Text>
          </Stack>
        </Container>
      </Box>

      <Container size="xl" py="xl">
        <Stack gap="xl">
          {/* Main Process Steps */}
          <Box>
            <Title order={2} ta="center" mb="xl">
              Proceso Paso a Paso
            </Title>
            
            <Stack gap="xl">
              {steps.map((step, index) => (
                <Card key={index} shadow="md" padding="xl" radius="lg" withBorder>
                  <Group align="flex-start" gap="xl">
                    {/* Step Number and Icon */}
                    <Stack align="center" gap="sm">
                      <ThemeIcon size={60} radius="xl" color={step.color}>
                        <step.icon size={30} />
                      </ThemeIcon>
                      <Badge color={step.color} variant="light" size="lg">
                        Paso {index + 1}
                      </Badge>
                    </Stack>

                    {/* Step Content */}
                    <Stack gap="md" style={{ flex: 1 }}>
                      <div>
                        <Title order={3} mb="xs">{step.title}</Title>
                        <Text size="lg" c="dimmed">{step.description}</Text>
                      </div>
                      
                      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                        {step.details.map((detail, detailIndex) => (
                          <Group key={detailIndex} gap="xs" align="center">
                            <ThemeIcon color={step.color} size={16} radius="xl">
                              <IconCheck size={10} />
                            </ThemeIcon>
                            <Text size="sm">{detail}</Text>
                          </Group>
                        ))}
                      </SimpleGrid>
                    </Stack>

                    {/* Arrow for next step */}
                    {index < steps.length - 1 && (
                      <Center>
                        <IconArrowRight size={24} color="var(--mantine-color-gray-5)" />
                      </Center>
                    )}
                  </Group>
                </Card>
              ))}
            </Stack>
          </Box>

          {/* Interactive Demo Section */}
          <Card shadow="sm" padding="xl" radius="md" withBorder bg="blue.0">
            <Group justify="space-between" align="center">
              <div>
                <Title order={3} mb="xs">¿Quieres verlo en acción?</Title>
                <Text c="dimmed" mb="md">
                  Prueba nuestra demo interactiva y experimenta el proceso completo de firma electrónica.
                </Text>
              </div>
              <Button size="lg" leftSection={<IconEye size={20} />}>
                Probar Demo
              </Button>
            </Group>
          </Card>

          {/* Use Cases */}
          <Box>
            <Title order={2} ta="center" mb="xl">
              Casos de Uso Principales
            </Title>
            
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              {useCases.map((useCase) => (
                <Card key={useCase.title} shadow="sm" padding="lg" radius="md" withBorder>
                  <Group align="center" gap="md" mb="md">
                    <ThemeIcon size={40} radius="md" color="blue">
                      <useCase.icon size={24} />
                    </ThemeIcon>
                    <Title order={4}>{useCase.title}</Title>
                  </Group>
                  <Text c="dimmed" size="sm" mb="md">
                    {useCase.description}
                  </Text>
                  <Stack gap="xs">
                    {useCase.examples.map((example, index) => (
                      <Group key={index} gap="xs">
                        <ThemeIcon color="blue" size={12} radius="xl">
                          <IconCheck size={8} />
                        </ThemeIcon>
                        <Text size="xs" c="dimmed">{example}</Text>
                      </Group>
                    ))}
                  </Stack>
                </Card>
              ))}
            </SimpleGrid>
          </Box>

          {/* Integration Methods */}
          <Box>
            <Title order={2} ta="center" mb="xl">
              Métodos de Integración
            </Title>
            
            <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="lg">
              {integrationMethods.map((method) => (
                <Card key={method.title} shadow="md" padding="xl" radius="lg" withBorder h="100%">
                  <Stack gap="md" h="100%">
                    <Group align="center" gap="md">
                      <ThemeIcon size={40} radius="md" color="green">
                        <method.icon size={24} />
                      </ThemeIcon>
                      <Title order={4}>{method.title}</Title>
                    </Group>
                    
                    <Text c="dimmed" style={{ flexGrow: 1 }}>
                      {method.description}
                    </Text>
                    
                    <Stack gap="xs">
                      {method.features.map((feature, index) => (
                        <Group key={index} gap="xs">
                          <ThemeIcon color="green" size={12} radius="xl">
                            <IconCheck size={8} />
                          </ThemeIcon>
                          <Text size="sm">{feature}</Text>
                        </Group>
                      ))}
                    </Stack>
                  </Stack>
                </Card>
              ))}
            </SimpleGrid>
          </Box>

          {/* Timeline of a typical signature process */}
          <Card shadow="sm" padding="xl" radius="md" withBorder>
            <Title order={3} mb="xl">Cronología de una Firma Típica</Title>
            <Timeline active={-1} bulletSize={24} lineWidth={2}>
              <Timeline.Item
                bullet={<IconClock size={16} />}
                title="0 minutos - Inicio"
                color="blue"
              >
                <Text c="dimmed" size="sm">
                  Subes el documento y defines los firmantes
                </Text>
              </Timeline.Item>

              <Timeline.Item
                bullet={<IconMail size={16} />}
                title="1 minuto - Envío"
                color="orange"
              >
                <Text c="dimmed" size="sm">
                  Los firmantes reciben el email con el enlace seguro
                </Text>
              </Timeline.Item>

              <Timeline.Item
                bullet={<IconPencil size={16} />}
                title="1-15 minutos - Firma"
                color="green"
              >
                <Text c="dimmed" size="sm">
                  Los firmantes acceden y firman el documento
                </Text>
              </Timeline.Item>

              <Timeline.Item
                bullet={<IconCheck size={16} />}
                title="Completado"
                color="purple"
              >
                <Text c="dimmed" size="sm">
                  Recibes el documento firmado con validez legal completa
                </Text>
              </Timeline.Item>
            </Timeline>
          </Card>

          {/* Technical Process */}
          <Card shadow="sm" padding="xl" radius="md" withBorder bg="gray.0">
            <Title order={3} mb="md">¿Qué ocurre técnicamente?</Title>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <Stack gap="sm">
                <Group gap="xs">
                  <ThemeIcon color="blue" size={16} radius="xl">
                    <IconShield size={10} />
                  </ThemeIcon>
                  <Text size="sm"><strong>Encriptación:</strong> Tu documento se encripta con AES-256</Text>
                </Group>
                <Group gap="xs">
                  <ThemeIcon color="green" size={16} radius="xl">
                    <IconClock size={10} />
                  </ThemeIcon>
                  <Text size="sm"><strong>Timestamp:</strong> Se aplica timestamp cualificado RFC 3161</Text>
                </Group>
                <Group gap="xs">
                  <ThemeIcon color="orange" size={16} radius="xl">
                    <IconEye size={10} />
                  </ThemeIcon>
                  <Text size="sm"><strong>Auditoría:</strong> Cada acción se registra de forma inmutable</Text>
                </Group>
              </Stack>
              <Stack gap="sm">
                <Group gap="xs">
                  <ThemeIcon color="purple" size={16} radius="xl">
                    <IconDeviceTablet size={10} />
                  </ThemeIcon>
                  <Text size="sm"><strong>Metadatos:</strong> IP, navegador y dispositivo se capturan</Text>
                </Group>
                <Group gap="xs">
                  <ThemeIcon color="red" size={16} radius="xl">
                    <IconFileCheck size={10} />
                  </ThemeIcon>
                  <Text size="sm"><strong>Validación:</strong> Se verifica la integridad del documento</Text>
                </Group>
                <Group gap="xs">
                  <ThemeIcon color="teal" size={16} radius="xl">
                    <IconShield size={10} />
                  </ThemeIcon>
                  <Text size="sm"><strong>Protección:</strong> PDF final protegido con contraseña</Text>
                </Group>
              </Stack>
            </SimpleGrid>
          </Card>

          {/* FAQ Section */}
          <Box>
            <Title order={2} ta="center" mb="xl">
              Preguntas Frecuentes
            </Title>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Text fw={600} mb="sm">¿Cuánto tiempo tarda el proceso completo?</Text>
                <Text size="sm" c="dimmed">
                  Desde que subes el documento hasta recibir las firmas, el proceso típico tarda entre 
                  1-15 minutos, dependiendo de la rapidez de los firmantes.
                </Text>
              </Card>

              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Text fw={600} mb="sm">¿Necesitan los firmantes crear una cuenta?</Text>
                <Text size="sm" c="dimmed">
                  No. Los firmantes reciben un enlace único y pueden firmar directamente sin 
                  necesidad de registrarse o crear una cuenta.
                </Text>
              </Card>

              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Text fw={600} mb="sm">¿Qué pasa si alguien no firma?</Text>
                <Text size="sm" c="dimmed">
                  El sistema envía recordatorios automáticos. Puedes configurar la frecuencia 
                  o cancelar el proceso en cualquier momento desde tu dashboard.
                </Text>
              </Card>

              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Text fw={600} mb="sm">¿Se puede modificar un documento después de enviarlo?</Text>
                <Text size="sm" c="dimmed">
                  No. Una vez enviado, el documento queda inmutable para garantizar la integridad. 
                  Si necesitas cambios, deberás crear una nueva solicitud de firma.
                </Text>
              </Card>
            </SimpleGrid>
          </Box>

          {/* Legal Validity */}
          <Alert color="green" icon={<IconShield size={16} />}>
            <Text fw={600} mb="xs">Validez Legal Garantizada</Text>
            <Text size="sm">
              Todos los documentos firmados siguiendo este proceso tienen plena validez legal en España y la 
              Unión Europea, cumpliendo con el reglamento eIDAS y normativas nacionales de firma electrónica.
            </Text>
          </Alert>

          {/* CTA Section */}
          <Box ta="center" mt="xl" py="xl">
            <Stack align="center" gap="md">
              <Title order={2}>¿Listo para probarlo?</Title>
              <Text size="lg" c="dimmed" maw={500}>
                Comienza ahora mismo con el plan gratuito. Sin permanencia, 
                sin tarjeta de crédito, sin complicaciones.
              </Text>
              <Group gap="md">
                <Link href="/auth/signin">
                  <Button size="lg" leftSection={<IconCheck size={20} />}>
                    Empezar Gratis
                  </Button>
                </Link>
                <Link href="/features">
                  <Button size="lg" variant="outline">
                    Ver Características
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