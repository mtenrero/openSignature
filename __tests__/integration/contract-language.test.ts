/**
 * Idioma del contrato (`language`: es | en): se guarda al crear y al editar, se valida, viaja en el
 * snapshot de cada solicitud de firma y decide SÍ/NO o YES/NO en las casillas.
 */
import { NextRequest } from 'next/server'
import { GET as contractGET, PUT as contractPUT } from '@/app/api/contracts/[id]/route'
import { POST as contractsPOST } from '@/app/api/contracts/route'
import { buildRequest, readJson } from '../helpers/nextRequest'
import { mockAuthAs } from '../helpers/mockAuth'

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (method: any, url: string, body?: unknown) => buildRequest({ method, url: `http://localhost:3000${url}`, body }) as NextRequest
const json = async (res: Response) => (await readJson(res)) as any

const base = {
  name: 'Consentimiento',
  content: '<p>{{dynamic:clientName}} {{dynamic:clientTaxId}} {{dynamic:aceptaX}}</p>',
  userFields: [
    { id: '1', name: 'clientName', type: 'name', required: true },
    { id: '2', name: 'clientTaxId', type: 'text', required: true },
  ],
}

describe('contract language', () => {
  beforeEach(() => mockAuthAs({ customerId: 'lang-a' }))

  const create = async (extra: Record<string, unknown> = {}) => {
    const res = await contractsPOST(req('POST', '/api/contracts', { ...base, ...extra }))
    return { res, body: await json(res) }
  }
  const idOf = (b: any) => String(b?.contract?._id ?? b?._id ?? b?.id)

  it('guarda el idioma al crear (normalizado) y lo devuelve', async () => {
    const { res, body } = await create({ language: 'EN-us' })
    expect(res.status).toBeLessThan(300)
    const got = await json(await contractGET(req('GET', `/api/contracts/${idOf(body)}`), ctx(idOf(body))))
    expect((got.contract ?? got).language).toBe('en')
  })

  it('sin idioma, no guarda ninguno (se deduce del texto)', async () => {
    const { res, body } = await create()
    expect(res.status).toBeLessThan(300)
    const got = await json(await contractGET(req('GET', `/api/contracts/${idOf(body)}`), ctx(idOf(body))))
    expect((got.contract ?? got).language).toBeUndefined()
  })

  it('un idioma no válido al crear da 400', async () => {
    const { res } = await create({ language: 'fr' })
    expect(res.status).toBe(400)
  })

  it('al editar: cambia, se normaliza, se puede quitar y uno no válido da 400', async () => {
    const { body } = await create({ language: 'es' })
    const id = idOf(body)
    const put = (b: any) => contractPUT(req('PUT', `/api/contracts/${id}`, { ...base, ...b }), ctx(id))
    const read = async () => { const g = await json(await contractGET(req('GET', `/api/contracts/${id}`), ctx(id))); return (g.contract ?? g).language }

    expect((await put({ language: 'English' })).status).toBeLessThan(300)
    expect(await read()).toBe('en')
    expect((await put({ language: 'fr' })).status).toBe(400)
    expect(await read()).toBe('en') // no cambió
    expect((await put({ language: null })).status).toBeLessThan(300)
    expect(await read()).toBeNull()
  })
})
