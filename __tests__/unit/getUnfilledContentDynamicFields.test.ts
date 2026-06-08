/**
 * Unit tests for getUnfilledContentDynamicFields — drives the sign flow's rule
 * that any dynamic field used in the contract content but still empty must be
 * collected from the signer before the review step.
 */
import { getUnfilledContentDynamicFields } from '@/lib/contractUtils'

const CONTENT =
  '<p>{{variable:clinicName}} atiende a {{dynamic:clientName}} (NIF {{dynamic:clientTaxId}}), ' +
  'mascota {{dynamic:Nombre del animal}}.</p>'

describe('getUnfilledContentDynamicFields', () => {
  it('returns the content dynamic fields that have no value', () => {
    const r = getUnfilledContentDynamicFields(CONTENT, { clientName: 'Ada', clientTaxId: '123A' }, ['clinicName'])
    expect(r).toEqual(['Nombre del animal'])
  })

  it('returns empty when every content dynamic field is filled', () => {
    const r = getUnfilledContentDynamicFields(
      CONTENT,
      { clientName: 'Ada', clientTaxId: '123A', 'Nombre del animal': 'Rex' },
      ['clinicName'],
    )
    expect(r).toEqual([])
  })

  it('excludes account variables and internal vars', () => {
    const r = getUnfilledContentDynamicFields(
      '<p>{{variable:clinicName}} {{dynamic:fecha}} {{dynamic:clientName}}</p>',
      {},
      ['clinicName'],
    )
    expect(r).toContain('clientName')
    expect(r).not.toContain('clinicName')
    expect(r).not.toContain('fecha')
  })

  it('treats whitespace-only strings as empty and booleans as filled', () => {
    expect(getUnfilledContentDynamicFields('<p>{{dynamic:a}}</p>', { a: '   ' })).toEqual(['a'])
    expect(getUnfilledContentDynamicFields('<p>{{dynamic:a}}</p>', { a: true })).toEqual([])
  })

  it('returns empty for empty content', () => {
    expect(getUnfilledContentDynamicFields('', {})).toEqual([])
  })
})
