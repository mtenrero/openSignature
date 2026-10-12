/**
 * Contract editor (tiptap) on touch: toolbar, field palette sheet, status sheet, tabs.
 * Runs in mobile (390), tablet (768) and desktop-responsive (1440, side palette instead of the sheet).
 */
import { test, expect, dropTestDb, seedContract } from '../fixtures'
import { loginAsOwner, expectNoHorizontalOverflow, expectNoOverlap, expectTouchTargets, shot } from './helpers'

const T = 30_000

test.describe('Contract editor (responsive)', () => {
  test.beforeEach(async ({ page, db, baseURL }) => {
    await dropTestDb(db)
    await loginAsOwner(page, baseURL!)
    page.setDefaultTimeout(T)
  })

  const sheetLayout = (project: string) => project !== 'desktop-responsive'

  test('types, applies Negrita and keeps toolbar/tabs touch-sized without overflow', async ({ page, db }, testInfo) => {
    const c = await seedContract(db, { content: '' })
    await page.goto(`/contracts/${c._id.toString()}/edit`)

    const editor = page.locator('.ProseMirror')
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.type('Acuerdo entre las partes')
    await page.keyboard.press('ControlOrMeta+A')
    await page.getByRole('button', { name: 'Negrita' }).click()
    await expect(editor.locator('strong')).toContainText('Acuerdo entre las partes')
    await expect(page.getByRole('button', { name: 'Negrita' })).toHaveAttribute('aria-pressed', 'true')

    await expectNoHorizontalOverflow(page)
    await expectNoOverlap(page, '[data-testid=page-header]', '[data-testid=page-content] h2, [data-testid=editor-surface]')
    await expectTouchTargets(page, '[data-testid=editor-toolbar]')
    await expectTouchTargets(page, '[role=tablist]')
    await expectTouchTargets(page, '[data-testid=page-header]')

    // editor surface: 16px text, at least 60dvh tall on phones
    const m = await editor.evaluate((el) => ({ fs: getComputedStyle(el).fontSize, h: el.getBoundingClientRect().height, vh: window.innerHeight }))
    expect(m.fs).toBe('16px')
    if (testInfo.project.name === 'mobile') expect(m.h).toBeGreaterThanOrEqual(m.vh * 0.6 - 1)
    await shot(page, testInfo, 'editor')
  })

  test('"Insertar campo" opens the sheet; tapping a signer field inserts it and closes the sheet', async ({ page, db }, testInfo) => {
    test.skip(!sheetLayout(testInfo.project.name), 'desktop uses the side palette (covered in e2e/contract-editor.spec.ts)')
    const c = await seedContract(db, { content: '' })
    await page.goto(`/contracts/${c._id.toString()}/edit`)
    const editor = page.locator('.ProseMirror')
    await editor.click()
    await page.keyboard.type('Firmado por ')

    await page.getByRole('button', { name: 'Insertar campo' }).click()
    const sheet = page.getByRole('dialog', { name: 'Insertar campo' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'miNombre' })).toBeVisible()
    await shot(page, testInfo, 'palette-sheet')

    // search narrows the list
    await sheet.getByPlaceholder('Buscar campo').fill('NIF')
    await expect(sheet.getByRole('button', { name: 'miNombre' })).toHaveCount(0)
    await sheet.getByPlaceholder('Buscar campo').fill('')

    await sheet.getByRole('button', { name: 'Nombre del firmante' }).click()
    await expect(sheet).toBeHidden()
    await expect(editor.locator('.field-dynamic-styled[data-field-name="clientName"]')).toBeVisible()

    // pill tap target >= 32px
    const box = await editor.locator('.field-dynamic-styled').first().boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(31.5)

    // variable via the sheet too
    await page.getByRole('button', { name: 'Insertar campo' }).click()
    await page.getByRole('dialog', { name: 'Insertar campo' }).getByRole('button', { name: 'miNombre' }).click()
    await expect(editor.locator('.field-variable-styled[data-field-name="miNombre"]')).toBeVisible()
  })

  test('tapping a field badge opens a sheet to remove it', async ({ page, db }, testInfo) => {
    const c = await seedContract(db, { content: '' })
    await page.goto(`/contracts/${c._id.toString()}/edit`)
    const editor = page.locator('.ProseMirror')
    await editor.click()
    await page.keyboard.type('Hola {{dynamic:clientName}} fin')
    const pill = editor.locator('.field-dynamic-styled[data-field-name="clientName"]')
    await expect(pill).toBeVisible()
    await pill.click()
    const sheet = page.getByRole('dialog', { name: /Campo:/ })
    await expect(sheet).toBeVisible()
    await shot(page, testInfo, 'field-tap-sheet')
    await sheet.getByRole('menuitem', { name: 'Quitar del texto' }).click()
    await expect(sheet).toBeHidden()
    await expect(editor.locator('.field-dynamic-styled')).toHaveCount(0)
    await expect(editor).toContainText('Hola')
    await expect(editor).toContainText('fin')
  })

  test('Guardar saves and the content survives a reload', async ({ page, db }, testInfo) => {
    const c = await seedContract(db, { content: '<p>Original</p>' })
    await page.goto(`/contracts/${c._id.toString()}/edit`)
    const editor = page.locator('.ProseMirror')
    await editor.click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type(' añadido desde el móvil {{dynamic:clientName}} y {{dynamic:clientTaxId}}')
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByText('Contrato guardado exitosamente')).toBeVisible()
    await shot(page, testInfo, 'saved')

    await page.reload()
    await expect(page.locator('.ProseMirror')).toContainText('añadido desde el móvil')
  })

  test('status changes through overflow -> Estado sheet and persists', async ({ page, db }, testInfo) => {
    const c = await seedContract(db)
    await page.goto(`/contracts/${c._id.toString()}/edit`)
    await expect(page.locator('.ProseMirror')).toBeVisible()

    await page.getByRole('button', { name: 'Más acciones' }).click()
    await page.getByRole('menuitem', { name: /Estado/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Estado del contrato' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('radio', { name: /Borrador/ })).toHaveAttribute('aria-checked', 'true')
    await expect(sheet.getByRole('radio', { name: /Borrador/ })).toBeVisible()
    await shot(page, testInfo, 'status-sheet')
    await sheet.getByRole('radio', { name: /^Activo/ }).click()
    await expect(page.getByText('Estado actualizado')).toBeVisible()

    await page.reload()
    await expect(page.locator('.ProseMirror')).toBeVisible()
    await page.getByRole('button', { name: 'Más acciones' }).click()
    await page.getByRole('menuitem', { name: /Estado/ }).click()
    await expect(page.getByRole('dialog', { name: 'Estado del contrato' }).getByRole('radio', { name: /^Activo/ })).toHaveAttribute('aria-checked', 'true')
  })

  test('tabs never clip: each tab fits its scrollable strip', async ({ page, db }, testInfo) => {
    const c = await seedContract(db)
    await page.goto(`/contracts/${c._id.toString()}/edit`)
    const list = page.getByRole('tablist')
    await expect(list).toBeVisible()
    const names = ['Editor', /Variables/, /Campos Dinámicos/, /Código/]
    for (const n of names) await expect(page.getByRole('tab', { name: n })).toBeVisible()

    const info = await list.evaluate((el) => {
      const cr = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        overflowX: cs.overflowX,
        scrollable: el.scrollWidth > el.clientWidth,
        tabs: Array.from(el.querySelectorAll('[role=tab]')).map((t) => {
          const r = t.getBoundingClientRect()
          return { left: r.left - cr.left, right: cr.right - r.right, w: r.width }
        }),
      }
    })
    expect(['auto', 'scroll']).toContain(info.overflowX)
    // a tab that does not fit must be reachable by scrolling the strip itself, never cut by the page
    for (const t of info.tabs) {
      expect(t.w).toBeGreaterThan(40)
      if (!info.scrollable) {
        expect(t.left).toBeGreaterThanOrEqual(-1)
        expect(t.right).toBeGreaterThanOrEqual(-1)
      }
    }
    await page.getByRole('tab', { name: /Código/ }).scrollIntoViewIfNeeded()
    const last = await page.getByRole('tab', { name: /Código/ }).boundingBox()
    expect(last!.x + last!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
    await expectNoHorizontalOverflow(page)

    // Campos Dinámicos: cards with >=44px actions; Código: monospace textarea scrolls inside itself
    await page.getByRole('tab', { name: /Campos Dinámicos/ }).click()
    await expectTouchTargets(page, '[role=tabpanel]:not([hidden])')
    await expectNoHorizontalOverflow(page)
    await shot(page, testInfo, 'fields-tab')
    await page.getByRole('tab', { name: /Código/ }).click()
    await expect(page.getByPlaceholder(/Tu contenido aquí/)).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await shot(page, testInfo, 'code-tab')
    await page.getByRole('tab', { name: /Variables/ }).click()
    await expectTouchTargets(page, '[role=tabpanel]:not([hidden])')
    await shot(page, testInfo, 'variables-tab')
  })

  test('adds a signer field from the sheet and it shows up in the palette', async ({ page, db }, testInfo) => {
    const c = await seedContract(db, { content: '' })
    await page.goto(`/contracts/${c._id.toString()}/edit`)
    await page.getByRole('tab', { name: /Campos Dinámicos/ }).click()
    await page.getByRole('button', { name: 'Agregar Campo' }).click()
    const dlg = page.getByRole('dialog')
    await expect(dlg).toBeVisible()
    await shot(page, testInfo, 'field-form')
    await dlg.getByLabel('Etiqueta del campo').fill('Importe total')
    await dlg.getByLabel('Nombre técnico').fill('importeTotal')
    await dlg.getByRole('button', { name: 'Agregar Campo' }).click()
    await expect(dlg).toBeHidden()
    await expect(page.locator('.mantine-Card-root', { hasText: 'Importe total' }).last()).toBeVisible()
  })

  test('mobile editor is a full-screen surface: no bottom tab bar, back button and Guardar in the app bar', async ({ page, db }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'bottom tab bar only exists on phones')
    const c = await seedContract(db)
    await page.goto(`/contracts/${c._id.toString()}/edit`)
    await expect(page.locator('.ProseMirror')).toBeVisible()
    await expect(page.getByTestId('bottom-tab-bar')).toBeHidden()
    const header = page.getByTestId('page-header')
    await expect(header.getByRole('button', { name: 'Volver' })).toBeVisible()
    await expect(header.getByRole('button', { name: 'Guardar' })).toBeVisible()
    await expect(header.getByRole('heading', { level: 1 })).toHaveText('Contrato E2E')
  })

  test('desktop keeps the palette beside the editor', async ({ page, db }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-responsive')
    const c = await seedContract(db, { content: '' })
    await page.goto(`/contracts/${c._id.toString()}/edit`)
    const palette = page.getByTestId('field-palette')
    await expect(palette).toBeVisible()
    await expect(page.getByRole('button', { name: 'Insertar campo' })).toBeHidden()
    await palette.getByRole('button', { name: 'Nombre del firmante' }).click()
    await expect(page.locator('.field-dynamic-styled[data-field-name="clientName"]')).toBeVisible()
    await shot(page, testInfo, 'editor-palette')
  })
})
