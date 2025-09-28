import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

interface FieldStylingOptions {
  variables: Array<{ name: string; type: string }>;
  dynamicFields: Array<{ name: string; type: string; required?: boolean; label?: string }>;
}

export const FieldStylingExtension = Extension.create<FieldStylingOptions>({
  name: 'fieldStyling',

  addOptions() {
    return {
      variables: [],
      dynamicFields: []
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('fieldStyling'),
        props: {
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