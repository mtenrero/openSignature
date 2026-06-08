/**
 * Unit tests for findTokenDeletionRange — the logic that lets the contract editor
 * delete a {{variable:X}} / {{dynamic:X}} badge as a single atomic unit instead of
 * chipping away one character (e.g. only the closing "}}").
 */
import { findTokenDeletionRange } from '@/lib/editor/tokenDeletion'

const VAR = 'Hola {{variable:miNombre}}' // token at [5, 26]
const VAR_START = 5
const VAR_END = 26

describe('findTokenDeletionRange — backward (Backspace)', () => {
  it('removes the whole token when the cursor is right after it', () => {
    expect(findTokenDeletionRange(VAR, VAR_END, 'backward')).toEqual({ start: VAR_START, end: VAR_END })
  })

  it('removes the whole token when the cursor is inside it', () => {
    expect(findTokenDeletionRange(VAR, VAR_START + 4, 'backward')).toEqual({ start: VAR_START, end: VAR_END })
  })

  it('does NOT match when the cursor is exactly before the token (normal char delete)', () => {
    expect(findTokenDeletionRange(VAR, VAR_START, 'backward')).toBeNull()
  })

  it('matches when the cursor is right after the closing braces (before a trailing space)', () => {
    // '{{variable:x}} ' → token is [0,14], offset 14 sits between "}}" and the space
    expect(findTokenDeletionRange('{{variable:x}} ', 14, 'backward')).toEqual({ start: 0, end: 14 })
  })

  it('does NOT match when the cursor is past a trailing space', () => {
    expect(findTokenDeletionRange('{{variable:x}} ', 15, 'backward')).toBeNull()
  })
})

describe('findTokenDeletionRange — forward (Delete)', () => {
  const DYN = '{{dynamic:clientName}} fin' // token at [0, 22]

  it('removes the whole token when the cursor is at its start', () => {
    expect(findTokenDeletionRange(DYN, 0, 'forward')).toEqual({ start: 0, end: 22 })
  })

  it('removes the whole token when the cursor is inside it', () => {
    expect(findTokenDeletionRange(DYN, 5, 'forward')).toEqual({ start: 0, end: 22 })
  })

  it('does NOT match when the cursor is exactly after the token (normal char delete)', () => {
    expect(findTokenDeletionRange(DYN, 22, 'forward')).toBeNull()
  })
})

describe('findTokenDeletionRange — misc', () => {
  it('returns null for text with no token', () => {
    expect(findTokenDeletionRange('texto normal', 4, 'backward')).toBeNull()
  })

  it('returns null for empty text', () => {
    expect(findTokenDeletionRange('', 0, 'backward')).toBeNull()
  })

  it('selects the correct token when several are present', () => {
    const text = '{{variable:a}} y {{dynamic:b}}' // [0,14] and [17,30]
    expect(findTokenDeletionRange(text, 30, 'backward')).toEqual({ start: 17, end: 30 })
    expect(findTokenDeletionRange(text, 14, 'backward')).toEqual({ start: 0, end: 14 })
  })

  it('handles a multi-word field name', () => {
    const text = '{{dynamic:Nombre del animal}}'
    expect(findTokenDeletionRange(text, text.length, 'backward')).toEqual({ start: 0, end: text.length })
  })
})
