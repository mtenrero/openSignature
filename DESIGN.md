# DESIGN.md — oSign.EU (derived from the codebase)

Stack: Next.js (App Router) + **Mantine v8** (`@mantine/core`, `@mantine/notifications`)
+ **Tabler icons** (`@tabler/icons-react`) + TipTap for the contract editor. Default
light theme. Prefer Mantine components and tokens over bespoke CSS.

## Theme
Light. Scene: an operator personalizing a contract on a phone or laptop in a clinic
during the day; needs calm, high-legibility surfaces and obvious affordances. Tinted
neutrals (Mantine `gray`), never pure `#000`/`#fff`.

## Color roles (semantic, consistent everywhere)
- **Variables (issuer/account data):** violet/purple. `var(--mantine-color-violet-6)`
  text on `violet-0` surface, `violet-3/6` borders. (Legacy hardcodes `#7c3aed`/`#f3e5f5`
  — migrate toward Mantine `violet` tokens.)
- **Dynamic fields (signer data):** blue. `var(--mantine-color-blue-6)` on `blue-0`,
  `blue-3/6` borders. (Legacy `#2196f3`/`#e3f2fd` → Mantine `blue`.)
- **Mandatory / destructive:** `red` (required markers, delete, mandatory fields).
- **Primary action:** Mantine primary (Guardar, Crear). **Status:** green=active,
  blue=signed, violet=completed, gray=archived, yellow=draft.
- Avoid raw hex + `!important`. Use Mantine CSS variables / `light-dark()`.

## Typography
Mantine defaults. Titles via `<Title>` with explicit sizes; body via `<Text>`.
Field-type legibility through color + icon, not weight alone.

## Components & layout
- `Container size="xl"`, `Card shadow="sm" radius="md" withBorder` as the section unit.
  Avoid nested cards (a known smell present in a few places).
- `Tabs` for editor sections — **must be horizontally scrollable on mobile** (5 tabs
  overflow 375px). Use `Tabs variant="default"` inside a `ScrollArea`/`Tabs.List`
  with `style={{ flexWrap: 'nowrap' }}` + scroll, never a wrapped pile.
- Side-by-side inputs use `SimpleGrid cols={{ base: 1, sm: 2 }}`, never a fixed
  `Group grow` (which crushes inputs on mobile).
- Editor toolbar: a compact formatting row (always visible) + a **scrollable** field
  palette (chips), never one giant non-wrapping `Group`.

## Motion
Subtle Mantine transitions only. Ease-out. No bounce. Don't animate layout props.

## Responsive breakpoints (Mantine)
`base` (mobile) → `sm` (≥768) → `lg`. Author mobile-first; use `hiddenFrom`/`visibleFrom`,
`useMediaQuery('(max-width: 48em)')`, and responsive props (`cols={{base,sm}}`).
