import {
  getMissingContentFields,
  extractDynamicFieldNames,
  extractSignerInfo,
} from '@/lib/contractUtils'

describe('extractDynamicFieldNames', () => {
  it('extracts {{dynamic:foo}} placeholders', () => {
    const names = extractDynamicFieldNames(
      'Hola {{dynamic:clientName}}, NIF {{dynamic:clientTaxId}}.'
    )
    expect(names).toEqual(expect.arrayContaining(['clientName', 'clientTaxId']))
  })

  it('extracts bracket [field] placeholders', () => {
    const names = extractDynamicFieldNames('Producto [productName] precio [amount]')
    expect(names).toEqual(expect.arrayContaining(['productName', 'amount']))
  })
})

describe('getMissingContentFields', () => {
  const content =
    '<p>{{dynamic:clientName}} con NIF {{dynamic:clientTaxId}} contrata {{dynamic:productName}}.</p>'

  it('returns fields detected in content but not in userFields', () => {
    const missing = getMissingContentFields(content, [
      { id: '1', name: 'clientName', type: 'name', required: true },
      { id: '2', name: 'clientTaxId', type: 'text', required: true },
    ])
    expect(missing.map((f) => f.name)).toEqual(['productName'])
  })

  it('excludes account variable names ({{variable:X}})', () => {
    const c = 'Empresa {{variable:clinicName}} firma con {{dynamic:clientName}}'
    const missing = getMissingContentFields(c, [], [])
    expect(missing.find((f) => f.name === 'clinicName')).toBeUndefined()
    expect(missing.find((f) => f.name === 'clientName')).toBeDefined()
  })

  it('excludes internal vars fecha/fechaHora', () => {
    const c = '[fecha] [fechaHora] {{dynamic:clientName}}'
    const missing = getMissingContentFields(c, [], [])
    expect(missing.map((f) => f.name)).not.toContain('fecha')
    expect(missing.map((f) => f.name)).not.toContain('fechaHora')
  })

  // ⚠️ BUG #2: getMissingContentFields hardcodes required: true for all
  // detected fields. Additional/optional fields the partner did not pre-fill
  // become mandatory for the signer, even when they should not be.
  //
  // Expected (post-fix) behavior: only the well-known mandatory fields
  // (clientName, clientTaxId) default to required:true. The rest default to
  // required:false unless explicitly defined in userFields.
  it('REGRESSION: optional fields detected from content should NOT default to required:true', () => {
    const missing = getMissingContentFields(content, [
      { id: '1', name: 'clientName', type: 'name', required: true },
      { id: '2', name: 'clientTaxId', type: 'text', required: true },
    ])
    const product = missing.find((f) => f.name === 'productName')
    expect(product).toBeDefined()
    expect(product!.required).toBe(false)
  })

  it('mandatory predefined fields detected from content keep required:true', () => {
    // If clientName appears in content but userFields is empty, it must remain required
    const missing = getMissingContentFields(
      '<p>{{dynamic:clientName}} {{dynamic:clientTaxId}}</p>',
      []
    )
    const clientName = missing.find((f) => f.name === 'clientName')
    const clientTaxId = missing.find((f) => f.name === 'clientTaxId')
    expect(clientName?.required).toBe(true)
    expect(clientTaxId?.required).toBe(true)
  })
})

describe('extractSignerInfo', () => {
  it('maps dynamicFieldValues to top-level signer fields', () => {
    const info = extractSignerInfo({
      clientName: 'Ada Lovelace',
      clientTaxId: '12345678A',
      clientEmail: 'ada@example.com',
      clientPhone: '+34600000000',
      productName: 'Plan Pro',
    })
    expect(info.clientName).toBe('Ada Lovelace')
    expect(info.clientTaxId).toBe('12345678A')
    expect(info.clientEmail).toBe('ada@example.com')
    expect(info.clientPhone).toBe('+34600000000')
    expect(info.allFields.productName).toBe('Plan Pro')
  })
})
