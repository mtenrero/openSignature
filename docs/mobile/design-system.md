# oSign Mobile design system

Mobile-first, native-like, Mantine based. Breakpoints are Mantine defaults: mobile < `sm` (48em), tablet `sm`..`lg`, desktop >= `lg`.
Prefer CSS props (`hiddenFrom` / `visibleFrom`) over `useIsMobile()` to avoid SSR flashes.

## Tokens (`styles/tokens.css`, classes in `styles/ui.css`)
`--os-bg --os-surface --os-surface-2 --os-border --os-text --os-text-dim --os-brand --os-success --os-warning --os-danger --os-info`
(light/dark through `data-mantine-color-scheme`), `--os-header-h 56px`, `--os-tabbar-h 64px`, `--os-touch 44px`,
`--os-safe-{top,right,bottom,left}`, `--os-gutter` (16/24/32). Never hardcode white/gray backgrounds: use tokens.
Theme (`lib/theme.tsx`): primaryShade {light 7, dark 6}, system font, radius sm8/md12/lg16/xl24, Card/Paper bordered, Tooltip works on touch.
Status labels/colours/icons: `lib/ui/status.ts` -> `getStatusMeta(kind, status)`.

## Shell
`AppFrame` (in `app/layout.tsx`) picks the chrome with `getShellVariant(pathname+search, sessionStatus)` (`lib/ui/shellVariant.ts`):
`signer` (/sign, /sign/*; NOT /signatures), `kiosk` (/tablet?kiosk=1), `public` (marketing/auth/unauthenticated), `app`, `loading`.
`app` = Mantine AppShell: sidebar (220/260) from `sm`, `BottomTabBar` below `sm`. NO global top header: each page renders `<PageHeader>`.
Tab bar is hidden on `/signatures/new`, `/contracts/new`, `/contracts/*/edit` (`shouldHideTabBar`) and when the keyboard is open.
Account pages (/profile, /settings, /docs) keep the "Más" tab active. Destinations live in `components/shell/navItems.ts`.
Put page content in `<Container ... data-testid="page-content">` and start it with `<PageHeader>`.

## Components (`components/ui`, import from `components/ui`)
- `PageHeader {title, subtitle?, back?: string|true, actions?, overflowActions?, large?, sticky?}`: sticky 56px bar on mobile (large title on root tabs).
- `AdaptiveSheet {opened,onClose,title,children,footer?,size?,fullScreenOnMobile?}`: bottom Drawer on mobile, Modal from `sm`. Use instead of Modal.
- `ActionSheet {opened,onClose,title?,items}` / `ActionMenu {target,items}`: item = `{key,label,description?,icon?,color?:'red',disabled?,disabledReason?,onClick}`; destructive last. ActionMenu = sheet on mobile, Menu on desktop.
- `ConfirmSheet {opened,onClose,title,message,confirmLabel,destructive?,requireReason?,loading?,onConfirm(reason)}`.
- `StickyActionBar {aboveTabBar?}`: fixed bottom on mobile (renders its own spacer), inline from `sm`.
- `ListItemCard {title,subtitle?,meta?,status?,leading?,href?|onClick?,trailing?,testId?}`: whole row = one link; `trailing` is a separate target.
- `StatusBadge {kind:'signature'|'contract'|'signatureType', status}`, `KeyValueList`, `StatTiles`, `SearchField`, `FilterChips`, `FilterSheet`, `EmptyState`, `ListSkeleton`, `Section`.
- `StepWizard {steps,active(0-based),onBack,onNext,nextLabel,nextDisabled,loading}`, `MethodCard` (role=radio; wrap in `role=radiogroup`), `ShareLinkPanel {url,qr?}`.
- Helpers: `lib/ui/share.ts` (`shareOrCopy`), `useIsMobile`, `useKeyboardOpen`, `lib/ui/signOut.ts` (`performSignOut(session)`).

## Rules
1. No horizontal page scroll at 360/390 (wide content scrolls in its own container or becomes cards). 2. Interactive elements >= 44x44.
3. No hover-only affordances; icon buttons need `aria-label`. 4. Sheets replace modals, ActionSheet replaces dropdowns on mobile.
5. Primary action sticky at the bottom. 6. Lists are tappable rows with a status badge; no dense tables on mobile.
7. Skeletons, not full-screen spinners. 8. Same-tab navigation; never `window.open` after an `await`.
9. Use `env(safe-area-inset-*)` and `dvh`. 10. Dark mode only via tokens. 11. Spanish copy. Keep accessible names used by e2e
('Crear Contrato', 'Guardar', tabs 'Código'/'Campos Dinámicos'/'Editor', 'Añadir campo', 'Agregar Campo', ...). 12. Contrast AA; visible labels.

## Testing
Unit: pure logic in `lib/**/*.test.ts`; components in `__tests__/unit/**/*.test.tsx` with `__tests__/helpers/renderWithMantine` (`setMobile(true)` forces the mobile media query).
E2E: `E2E_PORT=3101 npx playwright test e2e/mobile` (projects mobile 390x844, tablet 768x1024, desktop-responsive 1440x900); helpers in `e2e/mobile/helpers.ts`
(`loginAsOwner`, `seedActiveContract`, `seedRequest`, `expectNoHorizontalOverflow`, `expectNoOverlap`, `expectTouchTargets`, `shot` with `OSIGN_SHOTS_DIR`).
Never run plain `next dev` locally: `.env.local` holds production credentials.
