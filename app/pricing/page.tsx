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
  List,
  ThemeIcon,
  Box,
  Center,
  Alert,
  Divider
} from '@mantine/core'
import { 
  IconCheck, 
  IconX, 
  IconCrown, 
  IconStar,
  IconMail,
  IconMessage,
  IconRobot,
  IconUsers,
  IconApi,
  IconShield,
  IconInfoCircle
} from '@tabler/icons-react'
import Link from 'next/link'
import { getVisiblePlans, formatPrice, BARVET_DISCOUNTS } from '@/lib/subscription/plans'

const plans = getVisiblePlans()

const features = [
  { name: 'Contratos diferentes', free: 5, payPerUse: 5, pyme: 15, pymeAdvanced: 25, premium: 50, enterprise: '∞' },
  { name: 'Generaciones IA', free: '10 total', payPerUse: '∞', pyme: '∞', pymeAdvanced: '∞', premium: '∞', enterprise: '∞' },
  { name: 'Firmas email/mes', free: 20, payPerUse: 'Pago por uso', pyme: 150, pymeAdvanced: 150, premium: 500, enterprise: '∞' },
  { name: 'Firmas locales/mes', free: 100, payPerUse: 100, pyme: '∞', pymeAdvanced: '∞', premium: '∞', enterprise: '∞' },
  { name: 'Firmas por SMS', free: false, payPerUse: true, pyme: true, pymeAdvanced: true, premium: true, enterprise: true },
  { name: 'SMS incluidos/mes', free: 0, payPerUse: 0, pyme: 0, pymeAdvanced: 100, premium: 0, enterprise: '∞' },
  { name: 'Firma avanzada SMS', free: false, payPerUse: false, pyme: false, pymeAdvanced: true, premium: false, enterprise: true },
  { name: 'Acceso API', free: false, payPerUse: false, pyme: true, pymeAdvanced: true, premium: true, enterprise: true },
  { name: 'Soporte', free: 'Básico', payPerUse: 'Email', pyme: 'Prioritario', pymeAdvanced: 'Prioritario', premium: 'Premium', enterprise: 'Dedicado' }
]

export default function PricingPage() {
  
  const formatPlanPrice = (price: number, currency: string = 'EUR') => {
    if (price === -1) return 'Personalizado'
    if (price === 0) return 'Gratis'
    return formatPrice(price, currency)
  }

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'free': return <IconUsers size={20} />
      case 'pay_per_use': return <IconMail size={20} />
      case 'pyme': return <IconStar size={20} />
      case 'pyme_advanced': return <IconCrown size={20} />
      case 'premium': return <IconCrown size={20} />
      case 'enterprise': return <IconShield size={20} />
      default: return <IconCheck size={20} />
    }
  }

  return (
    <Box>
      {/* Hero Section */}
      <Box bg="blue.0" py="xl">
        <Container size="lg" py="xl">
          <Stack align="center" gap="xl">
            <Badge size="lg" variant="light" color="blue">
              Precios Transparentes
            </Badge>
            <Title size="3rem" ta="center" fw={900}>
              Elige el plan perfecto para ti
            </Title>
            <Text size="xl" ta="center" c="dimmed" maw={600}>
              Firma electrónica segura y conforme a eIDAS. Sin sorpresas, sin letra pequeña.
              Empieza gratis y escala cuando lo necesites.
            </Text>
          </Stack>
        </Container>
      </Box>

      <Container size="xl" py="xl">
        <Stack gap="xl">
          {/* BARVET Customer Alert */}
          <Alert color="purple" icon={<IconInfoCircle size={16} />}>
            <Group justify="space-between" align="center">
              <div>
                <Text fw={600} mb="xs">¿Eres cliente de BARVET Empresas?</Text>
                <Text size="sm">
                  Obtén el plan PYME gratis + 25% descuento en otros planes + 10% descuento en pago por uso
                </Text>
              </div>
              <Button variant="light" color="purple" size="sm">
                Más info
              </Button>
            </Group>
          </Alert>

          {/* Plans Grid */}
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 5 }} spacing="lg">
            {plans.map((plan) => (
              <Card 
                key={plan.id} 
                shadow="md" 
                padding="xl" 
                radius="lg" 
                withBorder
                style={{ 
                  position: 'relative',
                  border: plan.popular ? '2px solid var(--mantine-color-blue-5)' : undefined,
                  transform: plan.popular ? 'scale(1.05)' : undefined
                }}
              >
                {plan.popular && (
                  <Badge 
                    color="blue" 
                    variant="filled" 
                    size="sm"
                    style={{ 
                      position: 'absolute',
                      top: -10,
                      left: '50%',
                      transform: 'translateX(-50%)'
                    }}
                  >
                    Más Popular
                  </Badge>
                )}

                <Stack gap="lg" h="100%" style={{ minHeight: plan.id === 'enterprise' ? '600px' : '480px' }}>
                  <div>
                    <Group align="center" gap="sm" mb="xs">
                      {getPlanIcon(plan.id)}
                      <Title order={3}>{plan.displayName}</Title>
                    </Group>
                    
                    <Group align="baseline" gap="xs" mb="md">
                      <Text size="3rem" fw={900} c="blue">
                        {formatPlanPrice(plan.price, plan.currency)}
                      </Text>
                      {plan.price > 0 && (
                        <Text c="dimmed">/mes</Text>
                      )}
                    </Group>
                    
                    {plan.price > 0 && (
                      <Text size="sm" c="dimmed" mb="md">
                        + IVA • Facturación mensual
                      </Text>
                    )}
                  </div>

                  <List 
                    spacing="xs" 
                    size="sm"
                    icon={
                      <ThemeIcon color="green" size={18} radius="xl">
                        <IconCheck size={12} />
                      </ThemeIcon>
                    }
                    style={{ flexGrow: 1 }}
                  >
                    {plan.features.map((feature, index) => (
                      <List.Item key={index}>{feature}</List.Item>
                    ))}
                  </List>

                  <Link href="/auth/signin" style={{ textDecoration: 'none' }}>
                    <Button 
                      fullWidth 
                      size="md"
                      variant={plan.popular ? 'filled' : 'outline'}
                      color={plan.popular ? 'blue' : undefined}
                    >
                      {plan.id === 'enterprise' ? 'Contactar' : 'Comenzar'}
                    </Button>
                  </Link>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>

          {/* Feature Comparison Table */}
          <Box mt="xl">
            <Title order={2} ta="center" mb="xl">
              Comparación Detallada
            </Title>
            
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Stack gap="md">
                <Group justify="space-between" align="center" p="md" bg="gradient.0" style={{ background: 'linear-gradient(135deg, var(--mantine-color-blue-0) 0%, var(--mantine-color-blue-1) 100%)' }}>
                  <Text fw={600} w="24%" c="blue.8">Característica</Text>
                  <Text fw={600} ta="center" w="12.67%" c="blue.7">Gratuito</Text>
                  <Text fw={600} ta="center" w="12.67%" c="blue.7">Pago por uso</Text>
                  <Text fw={600} ta="center" w="12.67%" c="blue.7">PYME</Text>
                  <Text fw={600} ta="center" w="12.67%" c="blue.7">PYME Avanzado</Text>
                  <Text fw={600} ta="center" w="12.67%" c="blue.7">Premium</Text>
                  <Text fw={600} ta="center" w="12.67%" c="blue.7">Empresas</Text>
                </Group>
                
                {features.map((feature, index) => (
                  <Group key={index} justify="space-between" align="center" p="md" style={{
                    backgroundColor: index % 2 === 0 ? 'var(--mantine-color-gray-0)' : 'white',
                    borderRadius: '4px'
                  }}>
                    <Text w="24%" fw={500}>{feature.name}</Text>
                    <Center w="12.67%">
                      {typeof feature.free === 'boolean' ? (
                        feature.free ? <IconCheck color="var(--mantine-color-green-6)" size={20} /> : <IconX color="var(--mantine-color-red-6)" size={20} />
                      ) : (
                        <Text ta="center" size="sm" fw={500} c={feature.free === 0 ? 'red' : 'dark'}>{feature.free}</Text>
                      )}
                    </Center>
                    <Center w="12.67%">
                      {typeof feature.payPerUse === 'boolean' ? (
                        feature.payPerUse ? <IconCheck color="var(--mantine-color-green-6)" size={20} /> : <IconX color="var(--mantine-color-red-6)" size={20} />
                      ) : (
                        <Text ta="center" size="sm" fw={500} c={feature.payPerUse === 0 ? 'red' : 'dark'}>{feature.payPerUse}</Text>
                      )}
                    </Center>
                    <Center w="12.67%">
                      {typeof feature.pyme === 'boolean' ? (
                        feature.pyme ? <IconCheck color="var(--mantine-color-green-6)" size={20} /> : <IconX color="var(--mantine-color-red-6)" size={20} />
                      ) : (
                        <Text ta="center" size="sm" fw={500} c={feature.pyme === 0 ? 'red' : feature.pyme === '∞' ? 'blue' : 'dark'}>{feature.pyme}</Text>
                      )}
                    </Center>
                    <Center w="12.67%">
                      {typeof feature.pymeAdvanced === 'boolean' ? (
                        feature.pymeAdvanced ? <IconCheck color="var(--mantine-color-green-6)" size={20} /> : <IconX color="var(--mantine-color-red-6)" size={20} />
                      ) : (
                        <Text ta="center" size="sm" fw={500} c={feature.pymeAdvanced === 0 ? 'red' : feature.pymeAdvanced === '∞' ? 'blue' : feature.pymeAdvanced === 100 ? 'green' : 'dark'}>{feature.pymeAdvanced}</Text>
                      )}
                    </Center>
                    <Center w="12.67%">
                      {typeof feature.premium === 'boolean' ? (
                        feature.premium ? <IconCheck color="var(--mantine-color-green-6)" size={20} /> : <IconX color="var(--mantine-color-red-6)" size={20} />
                      ) : (
                        <Text ta="center" size="sm" fw={500} c={feature.premium === 0 ? 'red' : feature.premium === '∞' ? 'blue' : 'dark'}>{feature.premium}</Text>
                      )}
                    </Center>
                    <Center w="12.67%">
                      {typeof feature.enterprise === 'boolean' ? (
                        feature.enterprise ? <IconCheck color="var(--mantine-color-green-6)" size={20} /> : <IconX color="var(--mantine-color-red-6)" size={20} />
                      ) : (
                        <Text ta="center" size="sm" fw={500} c={feature.enterprise === '∞' ? 'blue' : 'dark'}>{feature.enterprise}</Text>
                      )}
                    </Center>
                  </Group>
                ))}
              </Stack>
            </Card>
          </Box>

          {/* Pricing Details */}
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl" mt="xl">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Stack gap="md">
                <Group align="center" gap="sm">
                  <IconMail size={24} color="var(--mantine-color-blue-6)" />
                  <Title order={4}>Firmas por Email</Title>
                </Group>
                <Text size="sm" c="dimmed">
                  Cuando superes el límite de tu plan:
                </Text>
                <List spacing="xs" size="sm">
                  <List.Item>Plan Gratuito/Pago por uso/PYME: <strong>0,10€</strong> por firma extra</List.Item>
                  <List.Item>Plan Premium: <strong>0,08€</strong> por firma extra</List.Item>
                  <List.Item>Plan Empresas: Sin límites</List.Item>
                </List>
              </Stack>
            </Card>

            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Stack gap="md">
                <Group align="center" gap="sm">
                  <IconUsers size={24} color="var(--mantine-color-green-6)" />
                  <Title order={4}>Firmas Locales</Title>
                </Group>
                <Text size="sm" c="dimmed">
                  Firmas en persona con tableta o dispositivo local:
                </Text>
                <List spacing="xs" size="sm">
                  <List.Item>Gratuito/Pago por uso: <strong>100 firmas/mes</strong></List.Item>
                  <List.Item>PYME/Premium/Empresas: <strong>Ilimitadas</strong></List.Item>
                  <List.Item>Perfectas para oficinas y puntos de venta</List.Item>
                  <List.Item>Sin costes adicionales</List.Item>
                </List>
              </Stack>
            </Card>

            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Stack gap="md">
                <Group align="center" gap="sm">
                  <IconMessage size={24} color="var(--mantine-color-orange-6)" />
                  <Title order={4}>SMS (Solo España)</Title>
                </Group>
                <Text size="sm" c="dimmed">
                  Firmas por SMS disponibles en todos los planes de pago:
                </Text>
                <List spacing="xs" size="sm">
                  <List.Item><strong>0,05€</strong> por SMS enviado</List.Item>
                  <List.Item>Perfecto para firmas rápidas</List.Item>
                  <List.Item>Cumplimiento eIDAS garantizado</List.Item>
                </List>
              </Stack>
            </Card>
          </SimpleGrid>

          {/* FAQ Section */}
          <Box mt="xl">
            <Title order={2} ta="center" mb="xl">
              Preguntas Frecuentes
            </Title>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Text fw={600} mb="sm">¿Puedo cambiar de plan en cualquier momento?</Text>
                <Text size="sm" c="dimmed">
                  Sí, puedes mejorar o reducir tu plan cuando quieras. Los cambios se aplican inmediatamente 
                  y se prorratea la facturación.
                </Text>
              </Card>

              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Text fw={600} mb="sm">¿Las firmas tienen validez legal?</Text>
                <Text size="sm" c="dimmed">
                  Absolutamente. Nuestras firmas cumplen con el reglamento eIDAS y tienen plena validez 
                  legal en toda la Unión Europea.
                </Text>
              </Card>

              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Text fw={600} mb="sm">¿Hay permanencia o compromiso?</Text>
                <Text size="sm" c="dimmed">
                  No hay permanencia. Puedes cancelar tu suscripción en cualquier momento desde tu 
                  panel de facturación sin penalizaciones.
                </Text>
              </Card>

              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Text fw={600} mb="sm">¿Qué incluye el soporte?</Text>
                <Text size="sm" c="dimmed">
                  Desde email básico en el plan gratuito hasta soporte dedicado en el plan empresas, 
                  con tiempos de respuesta garantizados.
                </Text>
              </Card>
            </SimpleGrid>
          </Box>

          {/* CTA Section */}
          <Box ta="center" mt="xl" py="xl">
            <Stack align="center" gap="md">
              <Title order={2}>¿Listo para empezar?</Title>
              <Text size="lg" c="dimmed" maw={500}>
                Únete a miles de empresas que ya confían en oSign.eu 
                para sus procesos de firma electrónica.
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