'use client'

import React from 'react'
import { Container, Title, Text, Button, Group, Stack, Center, Box, Card, SimpleGrid } from '@mantine/core'
import { IconFileText, IconSignature, IconShield, IconUsers, IconRocket } from '@tabler/icons-react'
import Link from 'next/link'

export default function WelcomePage() {
  return (
    <Box>
      {/* Hero Section */}
      <Box
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '80px 0',
        }}
      >
        <Container size="lg">
          <Center>
            <Stack align="center" gap="xl" style={{ textAlign: 'center' }}>
              <div>
                <Title size="3rem" fw={900} mb="md">
                  Firma Digital Simplificada
                </Title>
                <Text size="xl" mb="xl" style={{ maxWidth: 600 }}>
                  Crea plantillas de contratos profesionales, envíalas para firma digital y
                  gestiona todo el proceso de manera eficiente y segura.
                </Text>
              </div>

              <Group>
                <Link href="/auth/signin">
                  <Button 
                    size="lg" 
                    color="white" 
                    c="var(--mantine-color-blue-8)"
                    fw={600}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: '2px solid rgba(255, 255, 255, 0.8)',
                      '&:hover': {
                        backgroundColor: 'rgba(255, 255, 255, 1)',
                        transform: 'translateY(-2px)',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
                      }
                    }}
                  >
                    Comenzar Ahora
                  </Button>
                </Link>
                <Link href="/auth/signin">
                  <Button 
                    size="lg" 
                    variant="outline"
                    color="white"
                    c="white"
                    fw={600}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      borderColor: 'rgba(255, 255, 255, 0.7)',
                      border: '2px solid rgba(255, 255, 255, 0.7)',
                      '&:hover': {
                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                        transform: 'translateY(-2px)',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
                      }
                    }}
                  >
                    Iniciar Sesión
                  </Button>
                </Link>
              </Group>
            </Stack>
          </Center>
        </Container>
      </Box>

      {/* Features Section */}
      <Container size="lg" py={80}>
        <Title size="2.5rem" ta="center" mb="xl" fw={700}>
          Características Principales
        </Title>

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="sm">
              <Text fw={500}>Editor Avanzado</Text>
              <IconFileText size={24} />
            </Group>
            <Text size="sm" c="dimmed">
              Crea plantillas de contratos con nuestro editor HTML avanzado.
              Inserta campos dinámicos en cualquier posición del texto.
            </Text>
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="sm">
              <Text fw={500}>Firma Digital</Text>
              <IconSignature size={24} />
            </Group>
            <Text size="sm" c="dimmed">
              Proceso de firma digital seguro y legalmente válido.
              Compatible con dispositivos móviles y de escritorio.
            </Text>
          </Card>

          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="sm">
              <Text fw={500}>Gestión Completa</Text>
              <IconShield size={24} />
            </Group>
            <Text size="sm" c="dimmed">
              Gestiona todas tus plantillas y firmas desde un panel intuitivo.
              Seguimiento en tiempo real del estado de los contratos.
            </Text>
          </Card>
        </SimpleGrid>
      </Container>

      {/* Benefits Section */}
      <Box style={{ 
        backgroundColor: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))', 
        padding: '80px 0' 
      }}>
        <Container size="lg">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
            <Box>
              <Title size="2rem" mb="md" fw={700}>
                Para Empresas
              </Title>
              <Stack gap="md">
                <Group>
                  <IconUsers size={20} style={{ color: 'var(--mantine-color-blue-6)' }} />
                  <Text>Gestión eficiente de contratos con múltiples firmantes</Text>
                </Group>
                <Group>
                  <IconShield size={20} style={{ color: 'var(--mantine-color-green-6)' }} />
                  <Text>Seguridad y cumplimiento legal garantizado</Text>
                </Group>
                <Group>
                  <IconRocket size={20} style={{ color: 'var(--mantine-color-purple-6)' }} />
                  <Text>Automatización del proceso de firma</Text>
                </Group>
              </Stack>
              <Link href="/auth/signin">
                <Button 
                  mt="xl" 
                  size="lg"
                  style={{
                    backgroundColor: 'var(--mantine-color-blue-6)',
                    '&:hover': {
                      backgroundColor: 'var(--mantine-color-blue-7)',
                    }
                  }}
                >
                  Crear Plantilla
                </Button>
              </Link>
            </Box>

            <Box>
              <Title size="2rem" mb="md" fw={700}>
                Para Firmantes
              </Title>
              <Stack gap="md">
                <Group>
                  <IconSignature size={20} style={{ color: 'var(--mantine-color-blue-6)' }} />
                  <Text>Firma digital rápida y sencilla</Text>
                </Group>
                <Group>
                  <IconFileText size={20} style={{ color: 'var(--mantine-color-green-6)' }} />
                  <Text>Visualización clara del contrato</Text>
                </Group>
                <Group>
                  <IconShield size={20} style={{ color: 'var(--mantine-color-purple-6)' }} />
                  <Text>Seguridad y privacidad protegidas</Text>
                </Group>
              </Stack>
              <Link href="/auth/signin">
                <Button 
                  mt="xl" 
                  size="lg" 
                  variant="outline"
                  style={{
                    borderColor: 'var(--mantine-color-blue-6)',
                    color: 'var(--mantine-color-blue-6)',
                    '&:hover': {
                      backgroundColor: 'var(--mantine-color-blue-0)',
                    }
                  }}
                >
                  Acceder a Firmas
                </Button>
              </Link>
            </Box>
          </SimpleGrid>
        </Container>
      </Box>
    </Box>
  )
}