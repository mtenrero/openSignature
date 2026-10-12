import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { findTokenDeletionRange } from '../../lib/editor/tokenDeletion'

export interface FieldTapInfo {
  name: string
  category: 'variable' | 'dynamic'
  /** Document range of the whole {{...}} token. */
  from: number
  to: number
}

interface FieldStylingOptions {
  variables: Array<{ name: string; type: string }>;
  dynamicFields: Array<{ name: string; type: string; required?: boolean; label?: string }>;
  /** Tap/click on a field badge (touch has no hover): lets the host open an edit/remove sheet. */
  onFieldTap?: (info: FieldTapInfo) => void;
}

export const FieldStylingExtension = Extension.create<FieldStylingOptions>({
  name: 'fieldStyling',

  addOptions() {
    return {
      variables: [],
      dynamicFields: [],
      onFieldTap: undefined,
    }
  },

  // Delete field tokens ({{variable:X}} / {{dynamic:X}}) as a single atomic unit.
  // Without this, Backspace/Delete removes one character at a time, breaking the
  // badge into a partial token (e.g. leaving "{{variable:miNombre").
  addKeyboardShortcuts() {
    const deleteAdjacentToken = (direction: 'backward' | 'forward'): boolean => {
      const { state } = this.editor
      const { selection } = state
      // Only handle a collapsed cursor; let range selections delete normally.
      if (!selection.empty) return false

      const $from = selection.$from
      const parent = $from.parent
      if (!parent.isTextblock) return false

      const range = findTokenDeletionRange(parent.textContent, $from.parentOffset, direction)
      if (!range) return false

      const blockStart = $from.start()
      return this.editor
        .chain()
        .focus()
        .deleteRange({ from: blockStart + range.start, to: blockStart + range.end })
        .run()
    }

    return {
      Backspace: () => deleteAdjacentToken('backward'),
      Delete: () => deleteAdjacentToken('forward'),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('fieldStyling'),
        props: {
          handleClick: (view, pos, event) => {
            const onFieldTap = this.options.onFieldTap
            const el = (event.target as HTMLElement | null)?.closest?.('[data-field-name]') as HTMLElement | null
            if (!onFieldTap || !el) return false
            const name = el.getAttribute('data-field-name') || ''
            const category = el.getAttribute('data-category') === 'variable' ? 'variable' : 'dynamic'
            const $pos = view.state.doc.resolve(pos)
            const parent = $pos.parent
            if (!parent.isTextblock) return false
            // One char per leaf node keeps string offsets aligned with document positions.
            const text = parent.textBetween(0, parent.content.size, undefined, '\ufffc')
            const re = new RegExp(`\\{\\{${category}:\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'g')
            const start = $pos.start()
            let best: { from: number; to: number } | null = null
            let bestDist = Infinity
            let m: RegExpExecArray | null
            while ((m = re.exec(text)) !== null) {
              const from = start + m.index
              const to = from + m[0].length
              const dist = pos < from ? from - pos : pos > to ? pos - to : 0
              if (dist < bestDist) { best = { from, to }; bestDist = dist }
            }
            if (!best) return false
            onFieldTap({ name, category, from: best.from, to: best.to })
            return true
          },
          decorations: (state) => {
            const decorations: Decoration[] = []
            const doc = state.doc
            const { variables, dynamicFields } = this.options

            // console.log('FieldStyling: Processing decorations', { 
            //   variables: variables.length, 
            //   dynamicFields: dynamicFields.length 
            // })

            // Pattern for variables {{variable:name}}
            const variablePattern = /\{\{variable:([^}]+)\}\}/g
            // Pattern for dynamic fields {{dynamic:name}}
            const dynamicPattern = /\{\{dynamic:([^}]+)\}\}/g

            doc.descendants((node, pos) => {
              if (node.isText && node.text) {
                const text = node.text

                // Find variable patterns
                let match
                while ((match = variablePattern.exec(text)) !== null) {
                  const from = pos + match.index
                  const to = from + match[0].length
                  const fieldName = match[1].trim()
                  
                  // console.log('FieldStyling: Found variable', { fieldName, match: match[0], from, to })
                  
                  // Find the variable info
                  const variable = variables.find(v => v.name === fieldName)
                  const fieldType = variable?.type || 'text'
                  
                  decorations.push(
                    Decoration.inline(from, to, {
                      class: `field-variable-styled field-type-${fieldType}`,
                      'data-field-name': fieldName,
                      'data-field-type': fieldType,
                      'data-category': 'variable',
                      'title': `Variable: ${fieldName} (${fieldType})`
                    })
                  )
                }

                // Reset regex
                variablePattern.lastIndex = 0

                // Find dynamic field patterns
                while ((match = dynamicPattern.exec(text)) !== null) {
                  const from = pos + match.index
                  const to = from + match[0].length
                  const fieldName = match[1].trim()
                  
                  // console.log('FieldStyling: Found dynamic field', { fieldName, match: match[0], from, to })
                  
                  // Find the field info
                  const field = dynamicFields.find(f => f.name === fieldName)
                  const fieldType = field?.type || 'text'
                  const isRequired = field?.required || false
                  const fieldLabel = field?.label || fieldName
                  
                  decorations.push(
                    Decoration.inline(from, to, {
                      class: `field-dynamic-styled field-type-${fieldType} ${isRequired ? 'field-required' : ''}`,
                      'data-field-name': fieldName,
                      'data-field-type': fieldType,
                      'data-required': isRequired.toString(),
                      'data-category': 'dynamic',
                      'title': `Campo dinámico: ${fieldLabel} (${fieldType})${isRequired ? ' - Requerido' : ''}`
                    })
                  )
                }

                // Reset regex
                dynamicPattern.lastIndex = 0
              }
            })

            // console.log('FieldStyling: Applying decorations', { count: decorations.length })
            return DecorationSet.create(doc, decorations)
          },
        },
      }),
    ]
  },
})