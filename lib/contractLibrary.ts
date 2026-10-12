/**
 * Contract library (partner integration): pre-filled contracts that a partner
 * (VetControl) seeds into a clinic's oSign account as PENDING ACTIVATION
 * (status 'draft' + a plain-text `libraryTemplate` marker).
 *
 * Marker: `libraryTemplate.id = "vc-template:<platform>:<key>"` (unique per
 * customer). It lives OUTSIDE the encrypted fields so it can be queried.
 */
import { createHash } from 'crypto'
import { ObjectId } from 'mongodb'
import { CustomerEncryption, getContractsCollection } from '@/lib/db/mongodb'
import { validateMandatoryFields } from '@/lib/contractUtils'

export const LIBRARY_MARKER_PREFIX = 'vc-template'
export const LIBRARY_PLATFORMS = ['vet', 'salud'] as const
export type LibraryPlatform = (typeof LIBRARY_PLATFORMS)[number]
export const LIBRARY_MAX_TEMPLATES = 60
export const LIBRARY_MAX_CONTENT_BYTES = 300_000
const KEY_RE = /^[a-z0-9][a-z0-9-]{0,79}$/

export const libraryMarker = (platform: string, key: string) =>
  `${LIBRARY_MARKER_PREFIX}:${platform}:${key}`

export interface LibraryTemplateInput {
  key: string
  title: string
  description?: string
  category?: string
  content: string
  version?: number
  accountVariables?: string[]
  customClinicVariables?: unknown[]
  dynamicFields?: unknown[]
  notes?: string
}

export interface LibraryMeta {
  id: string
  platform: LibraryPlatform
  key: string
  version: number
  category?: string
  seededAt: Date
  contentHash: string
  edited: boolean
  editedAt?: Date
  activatedAt?: Date
  notes?: string
  accountVariables: string[]
  customClinicVariables: unknown[]
  /** Field definitions as supplied by the partner (source/label/inputType/options/default...). */
  fields: unknown[]
}

/** sha256 of what the clinic can edit in the editor (name, description, content). */
export function libraryContentHash(c: { name?: string; description?: string; content?: string }): string {
  return createHash('sha256')
    .update(JSON.stringify([c.name ?? '', c.description ?? '', c.content ?? '']))
    .digest('hex')
}

/** True when the contract is a library contract the clinic has not activated yet. */
export function isPendingActivation(doc: any): boolean {
  return !!doc?.libraryTemplate?.id && (doc.status || 'draft') === 'draft' && !doc.libraryTemplate.activatedAt
}

/** Mongo filter fragment that leaves pending library contracts out of plan-limit counts. */
export const EXCLUDE_PENDING_LIBRARY = {
  $nor: [
    {
      status: 'draft',
      'libraryTemplate.id': { $exists: true },
      'libraryTemplate.activatedAt': { $exists: false },
    },
  ],
}

export function validateLibraryInput(body: any): { ok: true; platform: LibraryPlatform; templates: LibraryTemplateInput[] } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' }
  if (!LIBRARY_PLATFORMS.includes(body.platform)) return { ok: false, error: `platform must be one of: ${LIBRARY_PLATFORMS.join(', ')}` }
  const templates = body.templates
  if (!Array.isArray(templates) || templates.length === 0) return { ok: false, error: 'templates must be a non-empty array' }
  if (templates.length > LIBRARY_MAX_TEMPLATES) return { ok: false, error: `At most ${LIBRARY_MAX_TEMPLATES} templates per call` }
  const seen = new Set<string>()
  for (const t of templates) {
    if (!t || typeof t.key !== 'string' || !KEY_RE.test(t.key)) return { ok: false, error: 'Each template needs a key matching ^[a-z0-9][a-z0-9-]{0,79}$' }
    if (seen.has(t.key)) return { ok: false, error: `Duplicate key ${t.key}` }
    seen.add(t.key)
    if (typeof t.title !== 'string' || !t.title.trim()) return { ok: false, error: `Template ${t.key}: title is required` }
    if (typeof t.content !== 'string' || !t.content.trim()) return { ok: false, error: `Template ${t.key}: content is required` }
    if (Buffer.byteLength(t.content) > LIBRARY_MAX_CONTENT_BYTES) return { ok: false, error: `Template ${t.key}: content too large` }
    if (t.version !== undefined && !(Number.isInteger(t.version) && t.version >= 1)) return { ok: false, error: `Template ${t.key}: version must be a positive integer` }
  }
  return { ok: true, platform: body.platform, templates }
}

/** Simple signer-field list so the editor's PUT validation (client name + tax id) passes. */
function userFieldsFor(t: LibraryTemplateInput) {
  const defs: any[] = Array.isArray(t.dynamicFields) ? (t.dynamicFields as any[]) : []
  const wanted = defs.filter(d => d && d.source === 'client' && typeof d.name === 'string')
  const names = new Set<string>(['clientName', 'clientTaxId', ...wanted.map(d => d.name)])
  const typeOf = (n: string) => (n === 'clientEmail' ? 'email' : n === 'clientPhone' ? 'phone' : n === 'clientName' ? 'name' : 'text')
  return Array.from(names).map((name, i) => {
    const d = wanted.find(w => w.name === name)
    return {
      id: `lib-${name}`,
      name,
      type: typeOf(name),
      required: name === 'clientName' || name === 'clientTaxId' ? true : !!d?.required,
      label: d?.label || name,
      placeholder: '',
      order: i + 1,
      enabled: true,
    }
  })
}

let indexReady: Promise<void> | null = null
async function ensureLibraryIndex() {
  if (!indexReady) {
    indexReady = (async () => {
      const col = await getContractsCollection()
      await col.createIndex(
        { customerId: 1, 'libraryTemplate.id': 1 },
        { unique: true, partialFilterExpression: { 'libraryTemplate.id': { $type: 'string' } }, name: 'uniq_library_marker' }
      )
    })().catch(err => {
      indexReady = null
      console.error('Could not create the library marker index:', err?.message)
    })
  }
  await indexReady
}

export type SeedAction = 'created' | 'exists' | 'updated'
export interface SeedResult {
  key: string
  marker: string
  id: string
  action: SeedAction
  status: string
  edited: boolean
  pendingActivation: boolean
  activatable: boolean
  version: number
}

function buildMeta(platform: LibraryPlatform, t: LibraryTemplateInput, contentHash: string): LibraryMeta {
  return {
    id: libraryMarker(platform, t.key),
    platform,
    key: t.key,
    version: t.version ?? 1,
    category: t.category,
    seededAt: new Date(),
    contentHash,
    edited: false,
    notes: t.notes,
    accountVariables: Array.isArray(t.accountVariables) ? t.accountVariables : [],
    customClinicVariables: Array.isArray(t.customClinicVariables) ? t.customClinicVariables : [],
    fields: Array.isArray(t.dynamicFields) ? t.dynamicFields : [],
  }
}

/**
 * Idempotent, atomic seeding of one customer's library. Never duplicates (partial
 * unique index + upsert), never overwrites a contract the clinic edited, archived or
 * activated; an untouched pending contract is refreshed only when `version` grows.
 */
export async function seedLibrary(
  customerId: string,
  userId: string,
  platform: LibraryPlatform,
  templates: LibraryTemplateInput[]
): Promise<SeedResult[]> {
  await ensureLibraryIndex()
  const collection = await getContractsCollection()
  const results: SeedResult[] = []

  for (const t of templates) {
    const marker = libraryMarker(platform, t.key)
    const name = t.title.trim()
    const description = (t.description || '').trim()
    const hash = libraryContentHash({ name, description, content: t.content })
    const meta = buildMeta(platform, t, hash)
    const now = new Date()
    const base = {
      name,
      description,
      content: t.content,
      dynamicFields: [],
      userFields: userFieldsFor(t),
      parameters: { requireDoubleSignatureSMS: false, collectDataTiming: 'before' },
      status: 'draft',
      libraryTemplate: meta,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    }
    const encrypted = CustomerEncryption.encryptSensitiveFields(base, customerId)
    const filter = { customerId, type: 'contract', 'libraryTemplate.id': marker }

    let existing: any = null
    const newId = new ObjectId()
    try {
      const before = await collection.findOneAndUpdate(
        filter,
        { $setOnInsert: { ...encrypted, _id: newId } },
        { upsert: true, returnDocument: 'before' }
      )
      existing = before || null
    } catch (err: any) {
      if (err?.code !== 11000) throw err
      existing = await collection.findOne(filter) // lost a race: the other writer created it
    }

    if (!existing) {
      results.push({
        key: t.key, marker, id: String(newId), action: 'created', status: 'draft', edited: false,
        pendingActivation: true, activatable: validateMandatoryFields([], [], t.content).isValid, version: meta.version,
      })
      continue
    }

    const lib = existing.libraryTemplate || {}
    let action: SeedAction = 'exists'
    const untouched = !lib.edited && !lib.activatedAt && existing.status === 'draft'
    if (untouched && meta.version > (lib.version ?? 1)) {
      await collection.updateOne(
        { _id: existing._id, customerId, 'libraryTemplate.edited': false, status: 'draft' },
        {
          $set: {
            name: encrypted.name, description: encrypted.description, content: encrypted.content,
            userFields: encrypted.userFields, updatedAt: now,
            'libraryTemplate.version': meta.version, 'libraryTemplate.contentHash': hash,
            'libraryTemplate.category': meta.category, 'libraryTemplate.notes': meta.notes,
            'libraryTemplate.accountVariables': meta.accountVariables,
            'libraryTemplate.customClinicVariables': meta.customClinicVariables,
            'libraryTemplate.fields': meta.fields,
          },
        }
      )
      action = 'updated'
    }
    results.push({
      key: t.key, marker, id: String(existing._id), action, status: existing.status || 'draft',
      edited: !!lib.edited, pendingActivation: isPendingActivation(existing),
      activatable: validateMandatoryFields([], [], t.content).isValid,
      version: action === 'updated' ? meta.version : (lib.version ?? 1),
    })
  }
  return results
}

/** Compact status of every library contract (archived included) of a customer. */
export async function listLibrary(customerId: string, platform?: string) {
  const collection = await getContractsCollection()
  const q: any = { customerId, type: 'contract', 'libraryTemplate.id': { $type: 'string' } }
  if (platform) q['libraryTemplate.platform'] = platform
  const docs = await collection
    .find(q, { projection: { content: 0, userFields: 0, signedPdfBuffer: 0 } })
    .toArray()
  return docs.map((d: any) => ({
    key: d.libraryTemplate.key,
    platform: d.libraryTemplate.platform,
    marker: d.libraryTemplate.id,
    id: String(d._id),
    name: d.name,
    status: d.status || 'draft',
    version: d.libraryTemplate.version ?? 1,
    edited: !!d.libraryTemplate.edited,
    editedAt: d.libraryTemplate.editedAt ?? null,
    activatedAt: d.libraryTemplate.activatedAt ?? null,
    pendingActivation: isPendingActivation(d),
  }))
}
