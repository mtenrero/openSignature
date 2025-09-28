import { Node, mergeAttributes, ReactNodeViewRenderer } from '@tiptap/react'
import React from 'react'
import { NodeViewWrapper, ReactNodeViewProps } from '@tiptap/react'

interface DynamicFieldAttributes {
  fieldName: string
  fieldType: string
  required: boolean
}

const DynamicFieldComponent: React.FC<ReactNodeViewProps> = ({ node }) => {
  const { fieldName, fieldType, required } = node.attrs

  const getFieldIcon = (type: string) => {
    switch (type) {
      case 'email': return '📧'
      case 'number': return '🔢'
      case 'date': return '📅'
      case 'name': return '👤'
      case 'address': return '📍'
      case 'phone': return '📞'
      case 'signature': return '✍️'
      default: return '📝'
    }
  }

  const getFieldColor = (type: string) => {
    switch (type) {
      case 'email': return '#e3f2fd'
      case 'number': return '#f3e5f5'
      case 'date': return '#e8f5e8'
      case 'name': return '#fff3e0'
      case 'address': return '#fce4ec'
      case 'phone': return '#e0f2f1'
      case 'signature': return '#f1f8e9'
      default: return '#f5f5f5'
    }
  }

  const getFieldBorderColor = (type: string) => {
    switch (type) {
      case 'email': return '#2196f3'
      case 'number': return '#9c27b0'
      case 'date': return '#4caf50'
      case 'name': return '#ff9800'
      case 'address': return '#e91e63'
      case 'phone': return '#009688'
      case 'signature': return '#8bc34a'
      default: return '#9e9e9e'
    }
  }

  const displayName = fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())

  return (
    <NodeViewWrapper 
      className="dynamic-field-node" 
      as="span" 
      style={{ display: 'inline' }}
      contentEditable={false}
    >
      <span
        className="dynamic-field-badge"
        contentEditable={false}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: getFieldColor(fieldType),
          border: `2px solid ${getFieldBorderColor(fieldType)}`,
          borderRadius: '20px',
          padding: '4px 12px',
          margin: '2px 4px',
          fontSize: '14px',
          fontWeight: '600',
          color: '#333',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          transition: 'all 0.2s ease',
          cursor: 'default',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '16px' }}>{getFieldIcon(fieldType)}</span>
        <span>{displayName}</span>
        {required && <span style={{ color: '#d32f2f', fontWeight: 'bold', marginLeft: '2px' }}>*</span>}
      </span>
    </NodeViewWrapper>
  )
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    dynamicField: {
      insertDynamicField: (attrs: DynamicFieldAttributes) => ReturnType
    }
  }
}

export const DynamicFieldExtension = Node.create({
  name: 'dynamicField',

  group: 'inline',
  
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      fieldName: {
        default: '',
        parseHTML: element => element.getAttribute('data-field-name'),
        renderHTML: attributes => ({
          'data-field-name': attributes.fieldName,
        }),
      },
      fieldType: {
        default: 'text',
        parseHTML: element => element.getAttribute('data-field-type'),
        renderHTML: attributes => ({
          'data-field-type': attributes.fieldType,
        }),
      },
      required: {
        default: false,
        parseHTML: element => element.getAttribute('data-required') === 'true',
        renderHTML: attributes => ({
          'data-required': attributes.required,
        }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-dynamic-field]',
        getAttrs: (element) => {
          if (typeof element === 'string') return false
          const el = element as HTMLElement
          return {
            fieldName: el.getAttribute('data-field-name'),
            fieldType: el.getAttribute('data-field-type'),
            required: el.getAttribute('data-required') === 'true',
          }
        },
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    // Get attributes from the node
    const fieldName = node?.attrs?.fieldName || HTMLAttributes['data-field-name']
    const fieldType = node?.attrs?.fieldType || HTMLAttributes['data-field-type'] || 'text'
    const required = node?.attrs?.required || HTMLAttributes['data-required'] === 'true'
    
    // Don't render if fieldName is undefined or empty
    if (!fieldName || fieldName === 'undefined') {
      return ['span', {}, '']
    }
    
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-dynamic-field': '',
        'data-field-name': fieldName,
        'data-field-type': fieldType,
        'data-required': required,
      }),
      // Keep inner text consistent with convertInternalToHTML for stable comparisons
      `[Campo dinámico: ${fieldName}]`,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(DynamicFieldComponent)
  },

  addCommands() {
    return {
      insertDynamicField:
        (attrs: DynamicFieldAttributes) =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs: attrs,
            })
            .run()
        },
    }
  },

})
