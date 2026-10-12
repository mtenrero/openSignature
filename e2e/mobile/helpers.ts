/**
 * Helpers for the responsive/mobile specs (projects: mobile, tablet, desktop-responsive).
 * Run with: E2E_PORT=3101 npx playwright test e2e/mobile
 */
import fs from 'fs'
import path from 'path'
import type { APIRequestContext, Page, TestInfo } from '@playwright/test'
import type { MongoClient } from 'mongodb'
import { expect, seedContract, TEST_DB_NAME } from '../fixtures'

/** Cookie-gated middleware bypass + the client-side session the authed pages wait for. */
export async function loginAsOwner(page: Page, baseURL: string) {
  await page.context().addCookies([{ name: 'e2e_session', value: '1', url: baseURL }])
  await page.route('**/api/auth/session', (r) =>
    r.fulfill({
      json: {
        user: { id: 'e2e-user', name: 'Ada Admin', email: 'ada@example.com' },
        customerId: 'e2e-customer',
        expires: new Date(Date.now() + 86_400_000).toISOString(),
      },
    })
  )
}

export async function seedActiveContract(db: MongoClient, overrides: Parameters<typeof seedContract>[1] = {}) {
  const doc = await seedContract(db, overrides)
  await db.db(TEST_DB_NAME).collection('contracts').updateOne({ _id: doc._id }, { $set: { status: 'active' } })
  return { ...doc, status: 'active' }
}

export async function seedRequest(
  authed: APIRequestContext,
  contractId: string,
  data: Record<string, unknown> = {}
): Promise<{ id: string; shortId: string; signatureUrl: string }> {
  const res = await authed.post('/api/signature-requests', {
    data: {
      contractId,
      signatureType: 'local',
      signerName: 'Ada Lovelace',
      signerEmail: 'ada@example.com',
      dynamicFieldValues: { clientName: 'Ada Lovelace', clientTaxId: '12345678A' },
      ...data,
    },
  })
  const body = await res.json()
  const url = new URL(body.signatureUrl)
  return {
    id: body.id ?? body._id,
    shortId: body.shortId ?? url.pathname.split('/').pop()!,
    signatureUrl: body.signatureUrl,
  }
}

export async function expectNoHorizontalOverflow(page: Page) {
  const res = await page.evaluate(() => {
    const doc = document.documentElement
    const offenders: string[] = []
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true
      }
      return false
    }
    document.body.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none') return
      if (r.right > window.innerWidth + 1 && !clipped(el)) {
        offenders.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(' ')[0]} right=${Math.round(r.right)}`)
      }
    })
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders: offenders.slice(0, 8) }
  })
  expect(res.scrollWidth, 'document scrollWidth').toBeLessThanOrEqual(res.clientWidth)
  expect(res.offenders, 'elements past the right edge').toEqual([])
}

/**
 * Regression for "global header paints over the page title": no sticky/fixed bar at the top of
 * the viewport may intersect the first heading / content element. `headerSelector` is optional
 * (pages that render a PageHeader); fixed/sticky bars are always checked.
 */
export async function expectNoOverlap(page: Page, headerSelector: string, contentSelector: string) {
  const res = await page.evaluate(
    ({ headerSelector, contentSelector }) => {
      const rect = (el: Element) => el.getBoundingClientRect()
      const bars = new Set<Element>()
      document.querySelectorAll(headerSelector).forEach((e) => bars.add(e))
      document.body.querySelectorAll('*').forEach((el) => {
        const cs = getComputedStyle(el)
        if ((cs.position === 'fixed' || cs.position === 'sticky') && cs.display !== 'none') {
          const r = rect(el)
          if (r.width > 0 && r.height > 0 && r.top <= 1 && r.height < 140) bars.add(el)
        }
      })
      const content = Array.from(document.querySelectorAll(contentSelector)).find((e) => {
        const r = rect(e)
        return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !Array.from(bars).some((b) => b.contains(e))
      })
      if (!content) return { ok: true, why: 'no content element' }
      const c = rect(content)
      for (const b of bars) {
        if (content.contains(b) || b.contains(content)) continue
        const r = rect(b)
        const inter = Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top)
        const interX = Math.min(r.right, c.right) - Math.max(r.left, c.left)
        if (inter > 1 && interX > 1) {
          return { ok: false, why: `${b.tagName}.${(b.getAttribute('class') ?? '').split(' ')[0]} overlaps content by ${Math.round(inter)}px` }
        }
      }
      return { ok: true, why: '' }
    },
    { headerSelector, contentSelector }
  )
  expect(res.ok, res.why).toBe(true)
}

/** Every visible interactive control inside `rootSelector` is at least min x min CSS px. */
export async function expectTouchTargets(page: Page, rootSelector: string, min = 44) {
  const bad = await page.evaluate(
    ({ rootSelector, min }) => {
      const root = document.querySelector(rootSelector)
      if (!root) return ['root not found: ' + rootSelector]
      const out: string[] = []
      root.querySelectorAll('button, [role=button], a[href], input, select, [role=tab]').forEach((el) => {
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden') return
        if (el.closest('p')) return
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) return
        const iconOnly = (el.textContent ?? '').trim() === ''
        const hidden = el instanceof HTMLInputElement && (el.type === 'hidden' || el.type === 'radio' || el.type === 'checkbox')
        if (hidden && cs.opacity === '0') return
        if (r.height + 0.5 < min || (iconOnly && r.width + 0.5 < min)) {
          out.push(`${el.tagName.toLowerCase()}[${el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 20)}] ${Math.round(r.width)}x${Math.round(r.height)}`)
        }
      })
      return out
    },
    { rootSelector, min }
  )
  expect(bad, 'controls below touch size').toEqual([])
}

/** Writes a screenshot to $OSIGN_SHOTS_DIR/<project>-<name>.png (only when the variable is set). */
export async function shot(page: Page, testInfo: TestInfo, name: string) {
  const dir = process.env.OSIGN_SHOTS_DIR
  if (!dir) return
  fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${testInfo.project.name}-${name}.png`), fullPage: false })
}
