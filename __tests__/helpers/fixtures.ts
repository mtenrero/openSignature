import { ObjectId } from 'mongodb'
import { TEST_CUSTOMER_ID, TEST_USER_ID } from './mockAuth'

export interface ContractFixtureInput {
  _id?: ObjectId
  customerId?: string
  name?: string
  content?: string
  userFields?: Array<{
    id: string
    name: string
    type: string
    required: boolean
    label?: string
    placeholder?: string
    order?: number
    enabled?: boolean
  }>
  parameters?: Record<string, unknown>
}

export function buildContract(overrides: ContractFixtureInput = {}) {
  return {
    _id: overrides._id ?? new ObjectId(),
    customerId: overrides.customerId ?? TEST_CUSTOMER_ID,
    // Routes that scan contracts (e.g. /api/contracts, variable auto-detect)
    // filter on type:'contract', so fixtures must set it.
    type: 'contract',
    status: 'draft',
    name: overrides.name ?? 'Contrato de prueba',
    description: 'Contrato generado por fixture',
    content:
      overrides.content ??
      `<p>Yo, {{dynamic:clientName}} con NIF {{dynamic:clientTaxId}}, contrato {{dynamic:productName}}.</p>`,
    userFields: overrides.userFields ?? [
      { id: 'f1', name: 'clientName', type: 'name', required: true, label: 'Nombre', order: 1 },
      { id: 'f2', name: 'clientTaxId', type: 'text', required: true, label: 'NIF', order: 2 },
      { id: 'f3', name: 'clientEmail', type: 'email', required: false, label: 'Email', order: 3 },
      { id: 'f4', name: 'clientPhone', type: 'phone', required: false, label: 'Teléfono', order: 4 },
    ],
    parameters: overrides.parameters ?? {},
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: TEST_USER_ID,
  }
}

export async function insertContract(input: ContractFixtureInput = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = await (global as any).__getTestDb()
  const doc = buildContract(input)
  await db.collection('contracts').insertOne(doc)
  return doc
}

export async function insertSignatureRequest(doc: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = await (global as any).__getTestDb()
  await db.collection('signatureRequests').insertOne(doc)
  return doc
}

// Seed the customer's account variables. The configured value lives in each
// variable's `placeholder`. (The `variables` array is NOT an encrypted field.)
export async function insertAccountVariables(
  vars: Array<{ name: string; value: string }>,
  customerId: string = TEST_CUSTOMER_ID
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = await (global as any).__getTestDb()
  await db.collection('variables').replaceOne(
    { customerId, type: 'variables' },
    {
      customerId,
      type: 'variables',
      variables: vars.map(v => ({ name: v.name, placeholder: v.value, type: 'text', enabled: true })),
    },
    { upsert: true }
  )
}
