/**
 * Unit tests for getReferencedVariableNames — collects the account variables
 * ({{variable:X}}) that contracts reference, so the settings panel can surface
 * the ones that aren't configured yet.
 */
import { getReferencedVariableNames } from '@/lib/contractUtils'

describe('getReferencedVariableNames', () => {
  it('collects {{variable:X}} names across contents, deduplicated', () => {
    const r = getReferencedVariableNames([
      '<p>{{variable:clinicName}} y {{variable:miNombre}}</p>',
      '<p>{{variable:clinicName}} atiende a {{dynamic:clientName}}</p>',
    ])
    expect(r.sort()).toEqual(['clinicName', 'miNombre'])
  })

  it('excludes internal vars (fecha/fechaHora) and dynamic fields', () => {
    const r = getReferencedVariableNames([
      '<p>{{variable:fecha}} {{variable:fechaHora}} {{variable:clinicName}} {{dynamic:clientName}}</p>',
    ])
    expect(r).toEqual(['clinicName'])
  })

  it('returns empty for content with no account variables', () => {
    expect(getReferencedVariableNames(['', '<p>hola</p>', '<p>{{dynamic:y}}</p>'])).toEqual([])
  })
})
