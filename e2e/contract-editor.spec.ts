/**
 * Contract editor e2e — covers the full authoring lifecycle and verifies the
 * editor is responsive / mobile-friendly.
 *
 * Auth: the editor is a session-protected page. We drive it with the cookie-gated
 * E2E bypass (E2E_TEST_MODE + e2e_session cookie → customerId 'e2e-customer'),
 * which matches the customer that seedContract() / the new-contract API write to.
 *
 * Flows covered:
 *   1. Create a new contract (validation + POST + redirect to editor).
 *   2. Personalize text + insert account variable & dynamic field from the palette.
 *   3. Add a custom dynamic field, then delete it.
 *   4. Edit raw content via the "Código" tab.
 *   5. Save (PUT) and confirm persistence after reload.
 *   6. Responsive: no horizontal overflow at 375px; toolbar + tabs usable.
 */
import { test, expect, seedContract, dropTestDb } from './fixtures'

const EDITOR_TIMEOUT = 30_000

test.describe('Contract editor', () => {
  test.beforeEach(async ({ page, db, baseURL }) => {
    await dropTestDb(db)
    // Cookie-gated auth bypass for the protected editor pages.
    await page.context().addCookies([{ name: 'e2e_session', value: '1', url: baseURL! }])
    page.setDefaultTimeout(EDITOR_TIMEOUT)
  })

  test('creates a new contract and lands in the editor', async ({ page }) => {
    await page.goto('/contracts/new')

    const createBtn = page.getByRole('button', { name: 'Crear Contrato' })
    // Validation: the button is disabled until a name is entered.
    await expect(createBtn).toBeDisabled()

    await page.getByLabel('Nombre del contrato').fill('Contrato de prueba E2E')
    await expect(createBtn).toBeEnabled()
    await createBtn.click()

    // POST /api/contracts → redirect to /contracts/{id}/edit
    await expect(page).toHaveURL(/\/contracts\/[a-f0-9]{24}\/edit/, { timeout: EDITOR_TIMEOUT })
    await expect(page.getByRole('button', { name: 'Guardar' })).toBeVisible()
  })

  test('personalizes content and inserts a variable + dynamic field from the palette', async ({ page, db }) => {
    const contract = await seedContract(db, { content: '' })
    await page.goto(`/contracts/${contract._id.toString()}/edit`)

    const editor = page.locator('.ProseMirror')
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.type('Acuerdo entre las partes. ')

    // Insert an account variable (violet palette) and a signer field (blue palette).
    await page.getByRole('button', { name: 'miNombre' }).first().click()
    await page.getByRole('button', { name: /Nombre del firmante/ }).first().click()

    // Desktop visual snapshot for design review.
    await page.screenshot({ path: 'test-results/editor-desktop.png', fullPage: true })

    // The "Código" tab exposes the raw internal format — verify the tokens landed.
    await page.getByRole('tab', { name: /Código/ }).click()
    const code = page.getByPlaceholder(/Tu contenido aquí/)
    await expect(code).toBeVisible()
    const value = await code.inputValue()
    expect(value).toContain('Acuerdo entre las partes')
    expect(value).toContain('{{variable:miNombre}}')
    expect(value).toContain('{{dynamic:clientName}}')
  })

  test('adds a custom dynamic field and deletes it', async ({ page, db }) => {
    const contract = await seedContract(db)
    await page.goto(`/contracts/${contract._id.toString()}/edit`)

    await page.getByRole('tab', { name: /Campos Dinámicos/ }).click()
    await page.getByRole('button', { name: 'Agregar Campo' }).click()

    // Modal (scoped to the dialog so we hit the modal's submit, not the tab trigger)
    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()
    await modal.getByLabel('Etiqueta del campo').fill('Importe total')
    await modal.getByLabel('Nombre técnico').fill('importeTotal')
    await modal.getByRole('button', { name: 'Agregar Campo' }).click()
    await expect(modal).toBeHidden()

    // The new field card appears. hasText also matches ancestor (nested) cards,
    // so take the innermost match — the actual field row.
    const card = page.locator('.mantine-Card-root', { hasText: 'Importe total' }).last()
    await expect(card).toBeVisible()

    // Delete it (custom fields have a trash action; predefined ones do not).
    await card.getByRole('button').last().click() // trash ActionIcon
    await expect(page.getByText('Importe total')).toHaveCount(0)
  })

  test('the editor "Añadir campo" button opens the modal and adds a signer field to the palette', async ({ page, db }) => {
    const contract = await seedContract(db, { content: '' })
    await page.goto(`/contracts/${contract._id.toString()}/edit`)

    const palette = page.getByTestId('field-palette')
    await expect(palette).toBeVisible()
    await palette.getByRole('button', { name: 'Añadir campo' }).click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()
    await modal.getByLabel('Etiqueta del campo').fill('Matrícula')
    await modal.getByLabel('Nombre técnico').fill('matricula')
    await modal.getByRole('button', { name: 'Agregar Campo' }).click()
    await expect(modal).toBeHidden()

    // The new field becomes an insertable chip in the top palette.
    await expect(palette.getByRole('button', { name: /Matrícula/ })).toBeVisible()
  })

  test('edits raw content via the Código tab and saves; persists after reload', async ({ page, db }) => {
    const contract = await seedContract(db, { content: '<p>Original</p>' })
    const id = contract._id.toString()
    await page.goto(`/contracts/${id}/edit`)

    // Rename + edit raw content
    const nameInput = page.getByLabel('Nombre del contrato')
    await nameInput.fill('Contrato editado E2E')

    await page.getByRole('tab', { name: /Código/ }).click()
    const code = page.getByPlaceholder(/Tu contenido aquí/)
    await code.fill('<p>Texto personalizado con {{dynamic:clientName}} y NIF {{dynamic:clientTaxId}}.</p>')

    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Contrato guardado exitosamente')).toBeVisible({ timeout: EDITOR_TIMEOUT })

    // Reload → values persisted
    await page.reload()
    await expect(page.getByLabel('Nombre del contrato')).toHaveValue('Contrato editado E2E')
    await page.getByRole('tab', { name: /Código/ }).click()
    await expect(page.getByPlaceholder(/Tu contenido aquí/)).toHaveValue(/Texto personalizado con/)
  })

  test('Backspace deletes a whole field badge atomically (not just the }})', async ({ page, db }) => {
    const contract = await seedContract(db, { content: '' })
    await page.goto(`/contracts/${contract._id.toString()}/edit`)

    // Type the token directly so the cursor ends right after the closing "}}".
    const editor = page.locator('.ProseMirror')
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.type('Texto {{variable:miNombre}}')

    // A single Backspace must remove the ENTIRE token, not leave "{{variable:miNombre".
    await page.keyboard.press('Backspace')

    await page.getByRole('tab', { name: /Código/ }).click()
    const value = await page.getByPlaceholder(/Tu contenido aquí/).inputValue()
    expect(value).toContain('Texto')
    expect(value).not.toContain('{{variable')
  })

  test('Delete removes a whole field badge atomically (forward)', async ({ page, db }) => {
    const contract = await seedContract(db, { content: '' })
    await page.goto(`/contracts/${contract._id.toString()}/edit`)

    const editor = page.locator('.ProseMirror')
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.type('{{dynamic:clientName}} fin')
    // One ArrowLeft from the end lands inside the trailing text; keep stepping to
    // a position INSIDE the token, where forward-Delete must remove it whole.
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(50) // let the editor's content-sync settle
    await page.keyboard.press('Delete')

    await page.getByRole('tab', { name: /Código/ }).click()
    const value = await page.getByPlaceholder(/Tu contenido aquí/).inputValue()
    expect(value).toContain('fin')
    expect(value).not.toContain('{{dynamic')
  })

  test('is responsive at 375px (no horizontal overflow, toolbar + tabs usable)', async ({ page, db }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    const contract = await seedContract(db)
    await page.goto(`/contracts/${contract._id.toString()}/edit`)

    await expect(page.getByTestId('editor-toolbar')).toBeVisible()
    await expect(page.getByTestId('editor-surface')).toBeVisible()

    // The page must not overflow horizontally on a phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, `horizontal overflow of ${overflow}px at 375px`).toBeLessThanOrEqual(2)

    // Tabs remain reachable (scrollable strip) — the last tab can be activated.
    await page.getByRole('tab', { name: /Código/ }).click()
    await expect(page.getByPlaceholder(/Tu contenido aquí/)).toBeVisible()

    // Back to the editor tab and capture a mobile visual snapshot for design review.
    await page.getByRole('tab', { name: /Editor/ }).click()
    await page.screenshot({ path: 'test-results/editor-mobile.png', fullPage: true })
  })
})
