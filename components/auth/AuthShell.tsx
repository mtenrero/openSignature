import React from 'react'
import { Stack, Text, Title } from '@mantine/core'
import { Logo } from '../shell/Logo'

/**
 * Full-height centered layout for the auth pages: logo, title, a bordered surface card and a footer line.
 * Inputs inside inherit the 16px theme size (no iOS zoom); provider buttons should be `size="lg"` + `fullWidth` (48px).
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  testId = 'auth-shell',
  wide,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  testId?: string
  wide?: boolean
}) {
  return (
    <div className="os-auth" data-testid={testId} data-page-content>
      <div className="os-auth__card" style={wide ? { maxWidth: 520 } : undefined}>
        <Stack gap="lg" align="stretch">
          <Stack gap={6} align="center" ta="center">
            <Logo size={44} label="" />
            <Title order={1} fz={{ base: 26, sm: 30 }}>
              {title}
            </Title>
            {subtitle ? (
              <Text c="dimmed" size="md">
                {subtitle}
              </Text>
            ) : null}
          </Stack>
          <div className="os-rt-card" style={{ padding: 20, borderRadius: 'var(--mantine-radius-lg)' }}>
            <Stack gap="md">{children}</Stack>
          </div>
          {footer ? (
            <Text ta="center" size="sm" c="dimmed">
              {footer}
            </Text>
          ) : null}
        </Stack>
      </div>
    </div>
  )
}
