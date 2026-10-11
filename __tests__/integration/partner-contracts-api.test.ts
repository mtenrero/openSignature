/**
 * Contracts API for API keys (partner integration): contract status, account
 * variables (GET/POST/PATCH) and contract placeholders, all authenticated with
 * osk_ keys through getAuthContext and isolated per customerId.
 */
import { NextRequest } from 'next/server'
import { PUT as statusPUT } from '@/app/api/contracts/[id]/status/route'
import { GET as placeholdersGET } from '@/app/api/contracts/[id]/placeholders/route'
import { GET as variablesGET, POST as variablesPOST, PATCH as variablesPATCH } from '@/app/api/variables/route'
import { buildRequest, readJson } from '../helpers/nextRequest'
import { insertContract } from '../helpers/fixtures'
import { mockAuthAs } from '../helpers/mockAuth'

const A = 'partner_vetcontrol_aaaa'
const B = 'partner_vetcontrol_bbbb'
const KEY_A = 'osk_test_key_a_0123456789'

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (method: any, url: string, body?: unknown, headers?: Record<string, string>) =>
  buildRequest({ method, url: `http://localhost:3000${url}`, body, headers }) as NextRequest
const json = async (res: Response) => (await readJson(res)) as any

describe('Partner contracts API (osk_ keys)', () => {
  describe('PUT /api/contracts/{id}/status', () => {
    it('activates a contract authenticated with an osk_ API key', async () => {
      const db = await (global as any).__getTestDb()
      await db.collection('esign_apikeys').insertOne({ _id: KEY_A, active: true, customerId: A, userId: 'u-a' })
      const contract = await insertContract({ customerId: A })
      // use the REAL getAuthContext (globally mocked in setup)
      const unified = require('@/lib/auth/unified')
      const actual = jest.requireActual('@/lib/auth/unified')
      ;(unified.getAuthContext as jest.Mock).mockImplementationOnce(actual.getAuthContext)

      const res = await statusPUT(
        req('PUT', `/api/contracts/${contract._id}/status`, { status: 'active' }, { authorization: `Bearer ${KEY_A}` }),
        ctx(String(contract._id))
      )
      expect(res.status).toBe(200)
      expect((await json(res)).contract.status).toBe('active')
    })

    it('returns 401 without credentials', async () => {
      mockAuthAs({ unauthenticated: true })
      const contract = await insertContract({ customerId: A })
      const res = await statusPUT(req('PUT', `/api/contracts/${contract._id}/status`, { status: 'active' }), ctx(String(contract._id)))
      expect(res.status).toBe(401)
    })

    it('rejects activation when mandatory signer fields are missing (same validation as session)', async () => {
      mockAuthAs({ customerId: A })
      const contract = await insertContract({ customerId: A, content: '<p>Sin campos del firmante</p>' })
      const res = await statusPUT(req('PUT', `/api/contracts/${contract._id}/status`, { status: 'active' }), ctx(String(contract._id)))
      expect(res.status).toBe(400)
      expect((await json(res)).requiresMandatoryFields).toBe(true)
    })

    it('returns 404 for another customer\'s contract (cross-tenant)', async () => {
      mockAuthAs({ customerId: B })
      const contract = await insertContract({ customerId: A })
      const res = await statusPUT(req('PUT', `/api/contracts/${contract._id}/status`, { status: 'active' }), ctx(String(contract._id)))
      expect(res.status).toBe(404)
    })
  })

  describe('/api/variables', () => {
    it('GET returns 401 without credentials', async () => {
      mockAuthAs({ unauthenticated: true })
      expect((await variablesGET(req('GET', '/api/variables'))).status).toBe(401)
    })

    it('POST then GET with an API-key customer keeps replace semantics and isolates tenants', async () => {
      mockAuthAs({ customerId: A })
      const post = await variablesPOST(req('POST', '/api/variables', { variables: [{ id: '1', name: 'clinicName', type: 'text', placeholder: 'Clinica A', enabled: true }] }))
      expect(post.status).toBe(200)

      const getA = await json(await variablesGET(req('GET', '/api/variables')))
      expect(getA.data.variables.map((v: any) => v.name)).toContain('clinicName')

      mockAuthAs({ customerId: B })
      const getB = await json(await variablesGET(req('GET', '/api/variables')))
      expect(getB.data.variables.map((v: any) => v.name)).not.toContain('clinicName')
    })

    it('PATCH merges by name: updates existing, appends new, keeps the rest', async () => {
      mockAuthAs({ customerId: A })
      await variablesPOST(req('POST', '/api/variables', { variables: [
        { id: '1', name: 'one', type: 'text', placeholder: 'v1', enabled: true },
        { id: '2', name: 'two', type: 'text', placeholder: 'v2', enabled: true },
      ] }))
      const res = await variablesPATCH(req('PATCH', '/api/variables', { variables: [
        { name: 'two', placeholder: 'v2-new' },
        { name: 'three', placeholder: 'v3' },
      ] }))
      expect(res.status).toBe(200)
      const vars = (await json(res)).data.variables as any[]
      expect(vars.map(v => v.name)).toEqual(['one', 'two', 'three'])
      expect(vars.find(v => v.name === 'one').placeholder).toBe('v1')
      expect(vars.find(v => v.name === 'two').placeholder).toBe('v2-new')
      expect(vars.find(v => v.name === 'two').id).toBe('2')
      expect(vars.find(v => v.name === 'three').placeholder).toBe('v3')
    })

    it('PATCH does not touch another customer\'s variables', async () => {
      mockAuthAs({ customerId: B })
      await variablesPOST(req('POST', '/api/variables', { variables: [{ id: '1', name: 'secretB', type: 'text', placeholder: 'b', enabled: true }] }))
      mockAuthAs({ customerId: A })
      await variablesPATCH(req('PATCH', '/api/variables', { variables: [{ name: 'secretB', placeholder: 'hacked' }] }))
      mockAuthAs({ customerId: B })
      const b = await json(await variablesGET(req('GET', '/api/variables')))
      expect(b.data.variables.find((v: any) => v.name === 'secretB').placeholder).toBe('b')
    })

    it('PATCH rejects invalid bodies with 400 and unauthenticated with 401', async () => {
      mockAuthAs({ customerId: A })
      expect((await variablesPATCH(req('PATCH', '/api/variables', { variables: [{ placeholder: 'x' }] }))).status).toBe(400)
      expect((await variablesPATCH(req('PATCH', '/api/variables', { nope: 1 }))).status).toBe(400)
      mockAuthAs({ unauthenticated: true })
      expect((await variablesPATCH(req('PATCH', '/api/variables', { variables: [] }))).status).toBe(401)
    })
  })

  describe('GET /api/contracts/{id}/placeholders', () => {
    const content = '<p>{{variable:clinicName}} {{dynamic:clientName}} {{dynamic:petName}} [legacyField] {{variable:clinicName}}</p>'

    it('lists variables, dynamic and legacy placeholders', async () => {
      mockAuthAs({ customerId: A })
      const contract = await insertContract({ customerId: A, content })
      const res = await placeholdersGET(req('GET', `/api/contracts/${contract._id}/placeholders`), ctx(String(contract._id)))
      expect(res.status).toBe(200)
      const body = await json(res)
      expect(body.variables).toEqual(['clinicName'])
      expect(body.dynamic.sort()).toEqual(['clientName', 'petName'])
      expect(body.legacy).toEqual(['legacyField'])
    })

    it('returns 404 cross-tenant and 401 unauthenticated', async () => {
      const contract = await insertContract({ customerId: A, content })
      mockAuthAs({ customerId: B })
      expect((await placeholdersGET(req('GET', '/x'), ctx(String(contract._id)))).status).toBe(404)
      mockAuthAs({ unauthenticated: true })
      expect((await placeholdersGET(req('GET', '/x'), ctx(String(contract._id)))).status).toBe(401)
    })
  })
})
