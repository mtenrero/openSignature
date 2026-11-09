/**
 * Idioma de un contrato y cómo se muestran en él los valores de las casillas (campos «accept»).
 *
 * Una casilla llega como el texto `'true'` / `'false'` (o como booleano). En el contrato, en la vista
 * previa y en el PDF firmado debe verse «SÍ» / «NO» (español) o «YES» / «NO» (inglés), según el idioma
 * del contrato: el campo `language` del contrato si lo tiene y, si no, el que se deduce de su texto.
 * Lógica pura, sin red, compartida por la vista previa, el firmante y todos los generadores de PDF.
 */

export type ContractLanguage = 'es' | 'en'

export const CONTRACT_LANGUAGES: readonly ContractLanguage[] = ['es', 'en']
export const DEFAULT_CONTRACT_LANGUAGE: ContractLanguage = 'es'

/** `es`, `es-ES`, `ES_es`, `Spanish`/`español`, `en`, `en-US`, `English`/`inglés` → idioma, o null si no se reconoce. */
export function normalizeLanguage(raw: unknown): ContractLanguage | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase().replace('_', '-')
  if (!v) return null
  if (v === 'es' || v.startsWith('es-') || v === 'spanish' || v === 'español' || v === 'espanol' || v === 'castellano') return 'es'
  if (v === 'en' || v.startsWith('en-') || v === 'english' || v === 'inglés' || v === 'ingles') return 'en'
  return null
}

const ES_WORDS = ['el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'en', 'con', 'por', 'para', 'una', 'un', 'se', 'su', 'sus', 'al', 'es', 'como', 'este', 'esta', 'contrato', 'firmante', 'datos', 'cliente', 'declara', 'acepta']
const EN_WORDS = ['the', 'and', 'of', 'to', 'in', 'is', 'that', 'for', 'with', 'by', 'this', 'an', 'are', 'be', 'as', 'on', 'or', 'will', 'shall', 'agree', 'agreement', 'signer', 'data', 'client', 'declares', 'accepts']

const stripHtml = (s: string): string => s.replace(/<[^>]*>/g, ' ').replace(/\{\{[^}]*\}\}/g, ' ').replace(/&[a-z]+;/gi, ' ')

/**
 * Idioma del texto de un contrato por recuento de palabras vacías de cada idioma. Sin texto o en
 * empate, español (el idioma por defecto del servicio).
 */
export function detectContractLanguage(content: unknown): ContractLanguage {
  if (typeof content !== 'string' || !content.trim()) return DEFAULT_CONTRACT_LANGUAGE
  const words = stripHtml(content).toLowerCase().match(/[a-záéíóúüñ]+/g) || []
  if (words.length === 0) return DEFAULT_CONTRACT_LANGUAGE
  const es = new Set(ES_WORDS)
  const en = new Set(EN_WORDS)
  let scoreEs = 0
  let scoreEn = 0
  for (const w of words) {
    if (es.has(w)) scoreEs += 1
    if (en.has(w)) scoreEn += 1
  }
  return scoreEn > scoreEs ? 'en' : 'es'
}

/** Idioma de un contrato: el suyo si está definido y es válido; si no, el que se deduce del texto. */
export function resolveContractLanguage(contract: { language?: unknown; content?: unknown } | null | undefined, explicit?: unknown): ContractLanguage {
  return normalizeLanguage(explicit) || normalizeLanguage(contract?.language) || detectContractLanguage(contract?.content)
}

/** `true`/`false` o el texto `'true'`/`'false'` (sin distinguir mayúsculas ni espacios) → booleano; otra cosa → null. */
export function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (v === 'true') return true
  if (v === 'false') return false
  return null
}

const LABELS: Record<ContractLanguage, { yes: string; no: string }> = {
  es: { yes: 'SÍ', no: 'NO' },
  en: { yes: 'YES', no: 'NO' },
}

/** «SÍ» / «NO» (español) o «YES» / «NO» (inglés). */
export function booleanLabel(value: boolean, lang: ContractLanguage): string {
  return value ? LABELS[lang].yes : LABELS[lang].no
}

/** Valor de un campo tal como se imprime: las casillas como SÍ/NO (YES/NO); el resto, su texto. */
export function formatFieldValue(value: unknown, lang: ContractLanguage): string {
  const b = asBoolean(value)
  return b === null ? String(value ?? '') : booleanLabel(b, lang)
}
