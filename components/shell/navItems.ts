import type { ComponentType } from 'react'
import {
  IconSignature,
  IconFileText,
  IconPlus,
  IconDeviceTablet,
  IconMenu2,
  IconUser,
  IconSettings,
  IconCreditCard,
  IconReceipt,
  IconKey,
  IconBook,
  IconBraces,
  IconSparkles,
} from '@tabler/icons-react'

type Icon = ComponentType<{ size?: number | string; stroke?: number | string }>

export interface TabItem {
  key: string
  href: string
  label: string
  ariaLabel?: string
  icon: Icon
  primary?: boolean
  /** Extra path prefixes that keep this tab highlighted (e.g. account pages live under "Más"). */
  match?: string[]
}

export const TAB_ITEMS: TabItem[] = [
  { key: 'signatures', href: '/signatures', label: 'Firmas', icon: IconSignature },
  { key: 'contracts', href: '/contracts', label: 'Contratos', icon: IconFileText },
  {
    key: 'new',
    href: '/signatures/new',
    label: 'Nueva',
    ariaLabel: 'Nueva solicitud de firma',
    icon: IconPlus,
    primary: true,
  },
  { key: 'tablet', href: '/tablet', label: 'Tableta', icon: IconDeviceTablet },
  {
    key: 'more',
    href: '/more',
    label: 'Más',
    icon: IconMenu2,
    match: ['/profile', '/settings', '/docs'],
  },
]

export interface NavLinkItem {
  href: string
  label: string
  icon: Icon
  external?: boolean
}

/** Main destinations shown in the desktop sidebar (same as the tabs, minus "Nueva"/"Más"). */
export const MAIN_NAV: NavLinkItem[] = [
  { href: '/signatures', label: 'Firmas', icon: IconSignature },
  { href: '/contracts', label: 'Contratos', icon: IconFileText },
  { href: '/tablet', label: 'Tableta', icon: IconDeviceTablet },
]

export const ACCOUNT_NAV: NavLinkItem[] = [
  { href: '/profile', label: 'Perfil', icon: IconUser },
  { href: '/settings', label: 'Configuración y variables', icon: IconSettings },
  { href: '/settings/subscription', label: 'Suscripción', icon: IconCreditCard },
  { href: '/settings/billing-wallet', label: 'Facturación y monedero', icon: IconReceipt },
  { href: '/settings/api-keys', label: 'API Keys', icon: IconKey },
  { href: '/docs/api', label: 'Docs API', icon: IconBook },
]

export interface MoreGroup {
  title: string
  items: NavLinkItem[]
}

export const MORE_GROUPS: MoreGroup[] = [
  {
    title: 'Cuenta',
    items: [
      { href: '/profile', label: 'Perfil', icon: IconUser },
      { href: '/settings', label: 'Configuración', icon: IconSettings },
      { href: '/settings/subscription', label: 'Suscripción', icon: IconCreditCard },
      { href: '/settings/billing-wallet', label: 'Facturación y monedero', icon: IconReceipt },
      { href: '/settings/api-keys', label: 'API Keys', icon: IconKey },
    ],
  },
  {
    title: 'Desarrolladores',
    items: [
      { href: '/docs/api', label: 'Docs API', icon: IconBook },
      { href: '/api/openapi', label: 'OpenAPI JSON', icon: IconBraces, external: true },
      { href: '/api/docs/index', label: 'Índice IA', icon: IconSparkles, external: true },
    ],
  },
]

const matches = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(prefix + '/')

/** Longest-prefix match so /signatures/new does not light up "Firmas" when "Nueva" owns it. */
export function getActiveTabKey(pathname: string): string | null {
  const path = pathname.split('?')[0]
  let best: { key: string; len: number } | null = null
  for (const t of TAB_ITEMS) {
    for (const prefix of [t.href, ...(t.match ?? [])]) {
      if (matches(path, prefix) && (!best || prefix.length > best.len)) {
        best = { key: t.key, len: prefix.length }
      }
    }
  }
  return best?.key ?? null
}

export function isNavActive(pathname: string, href: string): boolean {
  return matches(pathname.split('?')[0], href)
}
