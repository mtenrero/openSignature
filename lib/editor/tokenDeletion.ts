// Field tokens ({{variable:name}} / {{dynamic:name}}) are stored as plain text and
// only decorated as badges. Without help, Backspace/Delete chip away one character
// at a time (e.g. removing just the closing "}}"). This helper finds the full token
// range that a single keystroke should remove so the editor can delete it atomically.

export interface TokenRange {
  start: number
  end: number
}

// Matches a complete field token. Kept in sync with FieldStylingExtension /
// RichTextEditor insertion format.
const TOKEN_RE = /\{\{(?:variable|dynamic):[^}]+\}\}/g

/**
 * Given the text of the cursor's block and the cursor offset within it, return the
 * range of the field token that should be removed by a Backspace ('backward') or
 * Delete ('forward'), or null if no token is adjacent to the cursor.
 *
 *  - backward: cursor sits just AFTER the token's closing braces, or anywhere inside it.
 *  - forward:  cursor sits at the token's opening braces, or anywhere inside it.
 *
 * A cursor exactly before a token (backward) or exactly after it (forward) returns
 * null, so normal single-character deletion of surrounding text is preserved.
 */
export function findTokenDeletionRange(
  text: string,
  offset: number,
  direction: 'backward' | 'forward'
): TokenRange | null {
  if (!text) return null

  TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOKEN_RE.exec(text)) !== null) {
    const start = match.index
    const end = start + match[0].length

    if (direction === 'backward') {
      if (offset > start && offset <= end) return { start, end }
    } else {
      if (offset >= start && offset < end) return { start, end }
    }
  }

  return null
}
