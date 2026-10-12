import React from 'react'
import Link from 'next/link'
import { Badge, Button, Container, Group, List, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'

type Icon = React.ComponentType<{ size?: number | string; stroke?: number | string }>

/** Token-based hero (works in light and dark): badge, h1, intro, optional actions. */
export function MarketingHero({
  badge,
  title,
  subtitle,
  actions,
  testId = 'marketing-hero',
}: {
  badge?: string
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  testId?: string
}) {
  return (
    <section className="os-hero" data-testid={testId}>
      <Container size="lg" px="md">
        <Stack align="center" gap="md" ta="center" py={{ base: 32, sm: 56 }}>
          {badge ? (
            <Badge size="lg" variant="light" color="primary" tt="none">
              {badge}
            </Badge>
          ) : null}
          <Title order={1} className="os-hero-title">
            {title}
          </Title>
          {subtitle ? (
            <Text fz={{ base: 'md', sm: 'lg' }} c="dimmed" maw={640}>
              {subtitle}
            </Text>
          ) : null}
          {actions}
        </Stack>
      </Container>
    </section>
  )
}

/** Page body container shared by marketing pages (16px gutter, safe-area aware through ui.css). */
export function MarketingBody({ children }: { children: React.ReactNode }) {
  return (
    <Container size="lg" px="md" py={{ base: 'lg', sm: 'xl' }} data-testid="page-content">
      <Stack gap={40}>{children}</Stack>
    </Container>
  )
}

export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <Stack gap={4} ta="center" mb="md">
      <Title order={2} fz={{ base: 24, sm: 30 }}>
        {children}
      </Title>
      {sub ? <Text c="dimmed">{sub}</Text> : null}
    </Stack>
  )
}

export function FeatureCard({ icon: IconC, title, description, color = 'primary' }: { icon: Icon; title: string; description?: string; color?: string }) {
  return (
    <div className="os-rt-card os-feature" style={{ padding: 16 }}>
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <ThemeIcon size={40} radius="md" variant="light" color={color} style={{ flex: '0 0 auto' }}>
          <IconC size={22} />
        </ThemeIcon>
        <div style={{ minWidth: 0 }}>
          <Title order={3} fz="md" mb={4}>
            {title}
          </Title>
          {description ? (
            <Text size="sm" c="dimmed">
              {description}
            </Text>
          ) : null}
        </div>
      </Group>
    </div>
  )
}

export function CheckList({ items, color = 'green' }: { items: string[]; color?: string }) {
  return (
    <List
      spacing="xs"
      size="sm"
      icon={
        <ThemeIcon color={color} size={18} radius="xl" variant="light">
          <IconCheck size={12} />
        </ThemeIcon>
      }
    >
      {items.map((t) => (
        <List.Item key={t}>{t}</List.Item>
      ))}
    </List>
  )
}

export function CtaBlock({
  title,
  text,
  primary,
  secondary,
}: {
  title: string
  text: string
  primary: { label: string; href: string }
  secondary?: { label: string; href: string }
}) {
  return (
    <section className="os-rt-card" style={{ padding: 24, textAlign: 'center' }} data-testid="cta-block">
      <Stack align="center" gap="sm">
        <Title order={2} fz={{ base: 22, sm: 28 }}>
          {title}
        </Title>
        <Text c="dimmed" maw={520}>
          {text}
        </Text>
        <Group gap="sm" justify="center" w="100%" grow={false} className="os-cta-actions">
          <Button component={Link} href={primary.href} size="lg" leftSection={<IconCheck size={20} />}>
            {primary.label}
          </Button>
          {secondary ? (
            <Button component={Link} href={secondary.href} size="lg" variant="default">
              {secondary.label}
            </Button>
          ) : null}
        </Group>
      </Stack>
    </section>
  )
}
