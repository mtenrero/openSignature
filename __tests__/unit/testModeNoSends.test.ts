/**
 * Modo test (E2E_TEST_MODE=true): ningun proveedor de email/SMS puede ser
 * invocado, aunque haya credenciales cargadas (.env.local de produccion).
 */
import axios from 'axios'
import { BulkGateProvider } from '@/lib/sms/providers/bulkgate'
import { GatewayApiProvider } from '@/lib/sms/providers/gatewayapi'
import { ScalewayEmailService, createScalewayEmailService } from '@/lib/email/scaleway-service'
import { isSMSEnabled, checkSMSAvailability } from '@/lib/utils/smsConfig'
import { isTestMode } from '@/lib/utils/testModeGuard'

jest.mock('axios')

const SAVED = { ...process.env }

beforeEach(() => {
  process.env.E2E_TEST_MODE = 'true'
  // Credenciales "reales" cargadas: la guarda debe ganar igualmente.
  process.env.DISABLE_SMS = 'false'
  process.env.BULKGATE_APPLICATION_ID = 'real-id'
  process.env.BULKGATE_APPLICATION_TOKEN = 'real-token'
  process.env.SMS_TOKEN = 'real-token'
  process.env.SCALEWAY_KEY_ID = 'real'
  process.env.SCALEWAY_KEY_SECRET = 'real'
  process.env.SCALEWAY_PROJECT_ID = 'real'
  ;(axios.post as jest.Mock).mockReset()
  ;(axios as any).mockReset?.()
})
afterEach(() => {
  process.env = { ...SAVED }
  jest.restoreAllMocks()
})

describe('modo test: sin envios reales', () => {
  it('isTestMode y SMS deshabilitado', () => {
    expect(isTestMode()).toBe(true)
    expect(isSMSEnabled()).toBe(false)
    expect(checkSMSAvailability().enabled).toBe(false)
  })

  it('BulkGate no llama a la red', async () => {
    const r = await new BulkGateProvider().send('x', 'hola', '+34600000000')
    expect(r.success).toBe(false)
    expect(r.status).toBe('disabled')
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('GatewayAPI no llama a la red', async () => {
    const r = await new GatewayApiProvider().send('x', 'hola', '+34600000000')
    expect(r.status).toBe('disabled')
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('Scaleway no hace fetch y la factoria devuelve null', async () => {
    const fetchSpy = jest.fn()
    ;(global as any).fetch = fetchSpy
    expect(createScalewayEmailService()).toBeNull()
    const svc = new ScalewayEmailService({
      apiKey: 'k', secretKey: 's', projectId: 'p', fromEmail: 'a@b.es', region: 'fr-par',
    } as any)
    const r = await svc.sendEmail({ to: [{ email: 'a@b.es' }], subject: 's', html: '<p>x</p>' } as any)
    expect(r.success).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fuera de modo test el SMS depende de DISABLE_SMS', () => {
    delete process.env.E2E_TEST_MODE
    expect(isSMSEnabled()).toBe(true)
    process.env.DISABLE_SMS = 'true'
    expect(isSMSEnabled()).toBe(false)
  })
})
