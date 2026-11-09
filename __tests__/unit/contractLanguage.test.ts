/**
 * Casillas del contrato: se imprimen como SÍ/NO (español) o YES/NO (inglés), según el idioma del
 * contrato, en la vista previa y en el PDF. Antes aparecían como «true» / «false».
 */
import {
  asBoolean, booleanLabel, detectContractLanguage, formatFieldValue, normalizeLanguage, resolveContractLanguage,
} from '@/lib/contractLanguage'
import { processContractContent } from '@/lib/contractUtils'

describe('normalizeLanguage', () => {
  it('reconoce es/en con variantes y rechaza el resto', () => {
    for (const v of ['es', 'ES', 'es-ES', 'es_MX', ' español ', 'Spanish', 'castellano']) expect(normalizeLanguage(v)).toBe('es')
    for (const v of ['en', 'EN', 'en-US', 'en_GB', 'English', 'inglés', 'ingles']) expect(normalizeLanguage(v)).toBe('en')
    for (const v of ['fr', 'de-DE', '', '   ', null, undefined, 5, {}]) expect(normalizeLanguage(v)).toBeNull()
  })
})

describe('asBoolean / booleanLabel / formatFieldValue', () => {
  it('acepta booleanos y el texto true/false sin distinguir mayúsculas ni espacios', () => {
    expect(asBoolean(true)).toBe(true)
    expect(asBoolean(false)).toBe(false)
    expect(asBoolean('true')).toBe(true)
    expect(asBoolean(' FALSE ')).toBe(false)
    expect(asBoolean('True')).toBe(true)
  })
  it('no toma por casilla nada más', () => {
    for (const v of ['yes', 'sí', '1', '0', '', '—', 'truee', 1, 0, null, undefined, {}, []]) expect(asBoolean(v)).toBeNull()
  })
  it('etiquetas por idioma', () => {
    expect(booleanLabel(true, 'es')).toBe('SÍ')
    expect(booleanLabel(false, 'es')).toBe('NO')
    expect(booleanLabel(true, 'en')).toBe('YES')
    expect(booleanLabel(false, 'en')).toBe('NO')
  })
  it('formatFieldValue cambia solo las casillas', () => {
    expect(formatFieldValue('true', 'es')).toBe('SÍ')
    expect(formatFieldValue('false', 'en')).toBe('NO')
    expect(formatFieldValue(true, 'en')).toBe('YES')
    expect(formatFieldValue('Ada Lovelace', 'es')).toBe('Ada Lovelace')
    expect(formatFieldValue('—', 'en')).toBe('—')
    expect(formatFieldValue(undefined, 'es')).toBe('')
    expect(formatFieldValue(42, 'es')).toBe('42')
  })
})

describe('detectContractLanguage / resolveContractLanguage', () => {
  const ES = '<p>El cliente declara que acepta el presente contrato y que los datos de la clínica son correctos.</p>'
  const EN = '<p>The client declares that this agreement is accepted and that the data of the clinic are correct.</p>'
  it('deduce el idioma del texto', () => {
    expect(detectContractLanguage(ES)).toBe('es')
    expect(detectContractLanguage(EN)).toBe('en')
  })
  it('ignora etiquetas y marcadores {{...}}', () => {
    expect(detectContractLanguage('<p>{{dynamic:the}} {{dynamic:and}} {{dynamic:of}}</p><p>El contrato de la clínica</p>')).toBe('es')
  })
  it('sin texto o sin palabras reconocibles, español', () => {
    for (const v of [undefined, null, '', '   ', '<p></p>', '1234 5678', 5]) expect(detectContractLanguage(v)).toBe('es')
  })
  it('el idioma indicado manda sobre el del texto', () => {
    expect(resolveContractLanguage({ language: 'en', content: ES })).toBe('en')
    expect(resolveContractLanguage({ language: 'es', content: EN })).toBe('es')
    expect(resolveContractLanguage({ content: EN })).toBe('en')
    expect(resolveContractLanguage({ language: 'fr', content: EN })).toBe('en') // no válido: se deduce
    expect(resolveContractLanguage({ content: EN }, 'es')).toBe('es') // explícito de la llamada
    expect(resolveContractLanguage(null)).toBe('es')
    expect(resolveContractLanguage(undefined)).toBe('es')
  })
})

describe('processContractContent: casillas como SÍ/NO o YES/NO', () => {
  const ES = '<p>El cliente acepta recibir comunicaciones: {{dynamic:aceptaComunicaciones}} y el uso de imágenes: {{dynamic:aceptaImagenes}} según el contrato.</p>'
  const EN = '<p>The client agrees to receive messages: {{dynamic:acceptsMessages}} and the use of images: {{dynamic:acceptsImages}} as this agreement states.</p>'
  const text = (html: string) => html.replace(/<[^>]*>/g, '')

  it('español (deducido): «true»/«false» como texto salen SÍ / NO, también en el PDF', () => {
    for (const forPdf of [false, true]) {
      const out = text(processContractContent(ES, {}, { aceptaComunicaciones: 'true', aceptaImagenes: 'false' }, { forPdf }))
      expect(out).toContain('comunicaciones: SÍ y')
      expect(out).toContain('imágenes: NO según')
      expect(out).not.toMatch(/true|false/i)
    }
  })

  it('inglés (deducido): YES / NO', () => {
    const out = text(processContractContent(EN, {}, { acceptsMessages: 'true', acceptsImages: 'false' }))
    expect(out).toContain('messages: YES and')
    expect(out).toContain('images: NO as')
    expect(out).not.toMatch(/true|false|SÍ/i)
  })

  it('el idioma indicado manda sobre el del texto', () => {
    const out = text(processContractContent(ES, {}, { aceptaComunicaciones: 'true', aceptaImagenes: 'false' }, { language: 'en' }))
    expect(out).toContain('comunicaciones: YES y')
    expect(out).toContain('imágenes: NO según')
    const out2 = text(processContractContent(EN, {}, { acceptsMessages: 'true', acceptsImages: 'false' }, { language: 'es' }))
    expect(out2).toContain('messages: SÍ and')
  })

  it('los booleanos reales también (ya no «✓ Aceptado» / «☐ No aceptado»)', () => {
    const out = text(processContractContent(ES, {}, { aceptaComunicaciones: true, aceptaImagenes: false }))
    expect(out).toContain('SÍ')
    expect(out).toContain('NO')
    expect(out).not.toMatch(/Aceptado|aceptado/)
  })

  it('mayúsculas y espacios en el valor no importan', () => {
    const out = text(processContractContent(ES, {}, { aceptaComunicaciones: ' TRUE ', aceptaImagenes: 'False' }))
    expect(out).toContain('comunicaciones: SÍ y')
    expect(out).toContain('imágenes: NO según')
  })

  it('un texto normal no se toca y una casilla sin valor sigue como estaba (en blanco en el PDF)', () => {
    const c = '<p>Nombre {{dynamic:clientName}}; casilla {{dynamic:aceptaX}}; el contrato de la clínica.</p>'
    expect(text(processContractContent(c, {}, { clientName: 'Ada', aceptaX: 'true' }))).toContain('Nombre Ada; casilla SÍ;')
    expect(text(processContractContent(c, {}, { clientName: 'Ada' }, { forPdf: true }))).toContain('casilla ;')
    expect(text(processContractContent(c, {}, { clientName: 'Ada' }))).toContain('[aceptaX]')
  })

  it('también en los formatos antiguos {{campo}} y [campo]', () => {
    const c = '<p>El contrato de la clínica: {{acepta}} y [acepta2] con el cliente.</p>'
    const out = text(processContractContent(c, {}, { acepta: 'true', acepta2: 'false' }))
    expect(out).toContain('clínica: SÍ y NO con')
  })

  it('una variable de la cuenta con el texto «true» no se cambia (solo los campos del firmante)', () => {
    const out = text(processContractContent('<p>{{variable:flag}} del contrato de la clínica</p>', { flag: 'true' }, {}))
    expect(out).toContain('true')
  })
})
