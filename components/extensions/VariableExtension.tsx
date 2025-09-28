import { Node, mergeAttributes, ReactNodeViewRenderer } from '@tiptap/react'
import React from 'react'
import { NodeViewWrapper, ReactNodeViewProps } from '@tiptap/react'

interface VariableAttributes {
  variableName: string
  variableType: string
}

const VariableComponent: React.FC<ReactNodeViewProps> = ({ node }) => {
  const { variableName, variableType } = node.attrs

  const getVariableIcon = (type: string) => {
    switch (type) {
      case 'email': return '📧'
      case 'number': return '🔢'
      case 'date': return '📅'
      case 'name': return '👤'
      case 'address': return '📍'
      case 'phone': return '📞'
      case 'taxId': return '🆔'
      case 'text': return '📝'
      default: return '📝'
    }
  }

  return (
    <NodeViewWrapper 
      className="variable-node" 
      as="span" 
      style={{ display: 'inline' }}
      contentEditable={false}
    >
      <span
        className="variable-badge"
        contentEditable={false}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: '#f3e5f5',
          border: '2px solid #9c27b0',
          borderRadius: '20px',
          padding: '4px 12px',
          margin: '2px 4px',
          fontSize: '14px',
          fontWeight: '600',
          color: '#7c3aed',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          cursor: 'default',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '16px' }}>{getVariableIcon(variableType)}</span>
        <span>{variableName}</span>
      </span>
    </NodeViewWrapper>
  )
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    variable: {
      insertVariable: (attributes: VariableAttributes) => ReturnType
    }
  }
}

export const VariableExtension = Node.create({
  name: 'variable',

  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      variableName: {
        default: '',
        parseHTML: element => element.getAttribute('data-variable-name'),
        renderHTML: attributes => ({
          'data-variable-name': attributes.variableName,
        }),
      },
      variableType: {
        default: 'text',
        parseHTML: element => element.getAttribute('data-variable-type'),
        renderHTML: attributes => ({
          'data-variable-type': attributes.variableType,
        }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-variable-name]',
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    // Get attributes from the node
    const variableName = node?.attrs?.variableName || HTMLAttributes['data-variable-name']
    const variableType = node?.attrs?.variableType || HTMLAttributes['data-variable-type'] || 'text'
    
    // Don't render if variableName is undefined or empty
    if (!variableName || variableName === 'undefined') {
      return ['span', {}, '']
    }
    
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-variable-name': variableName,
        'data-variable-type': variableType,
      }),
      // Keep inner text consistent with convertInternalToHTML for stable comparisons
      `${variableName}`,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(VariableComponent)
  },

  addCommands() {
    return {
      insertVariable:
        (attributes: VariableAttributes) =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs: attributes,
            })
            .run()
        },
    }
  },
})