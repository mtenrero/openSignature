'use client'

import React, { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Extension } from '@tiptap/core'
import { FieldStylingExtension } from './extensions/FieldStylingExtension'
import { FieldStylingGlobal } from './FieldStylingGlobal'
import { Box, Button, Group, Text, Badge, ActionIcon, Tooltip } from '@mantine/core'
import {
  IconBold,
  IconItalic,
  IconUnderline,
  IconList,
  IconListNumbers,
  IconQuote,
  IconVariable,
  IconMail,
  IconHash,
  IconCalendar,
  IconUser,
  IconFileText,
  IconPhone,
  IconMapPin
} from '@tabler/icons-react'

import { DynamicField, UserField } from './dataTypes/Contract'

interface RichTextEditorProps {
  content: string
  onChange: (content: string) => void
  variables?: DynamicField[]
  dynamicFields: UserField[]
  onInsertField: (fieldName: string, isUserField?: boolean, fieldType?: string) => void
}

// Simple approach: just return content as-is, let CSS handle the styling
const convertInternalToHTML = (internalContent: string = '') => {
  return internalContent || ''
}

// Simple approach: return content as-is since we're not converting anything
const convertHTMLToInternal = (htmlContent: string = '') => {
  return htmlContent || ''
}

export function RichTextEditor({ content, onChange, variables = [], dynamicFields, onInsertField }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Escribe el contenido de tu contrato aquí...',
      }),
      FieldStylingExtension.configure({
        variables: variables || [],
        dynamicFields: dynamicFields || []
      }),
    ],
    content: convertInternalToHTML(content, variables || [], dynamicFields || []),
    editable: true,
    immediatelyRender: false,
    enableInputRules: true,
    enablePasteRules: true,
    autofocus: false,
    onUpdate: ({ editor }) => {
      // Convert HTML back to internal format before saving
      const htmlContent = editor.getHTML()
      const internalContent = convertHTMLToInternal(htmlContent)
      onChange(internalContent)
    },
  })

  // Update content when it changes from outside
  useEffect(() => {
    if (editor && content) {
      const currentHTML = editor.getHTML()
      const currentInternal = convertHTMLToInternal(currentHTML)
      const convertedContent = convertInternalToHTML(content, variables || [], dynamicFields || [])

      // Update only when internal differs, or when variables/dynamicFields changed the visual HTML
      if (currentInternal !== content || currentHTML !== convertedContent) {
        requestAnimationFrame(() => {
          if (editor && !editor.isDestroyed) {
            editor.commands.setContent(convertedContent, { emitUpdate: false })
          }
        })
      }
    }
  }, [content, variables, dynamicFields]) // Remove editor from dependencies to prevent loops

  // Force decoration update when variables or dynamicFields change
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      // console.log('RichTextEditor: Forcing view update due to variables/fields change')
      // Force the view to update decorations by triggering a state update
      requestAnimationFrame(() => {
        const { tr } = editor.state
        editor.view.dispatch(tr)
      })
    }
  }, [variables, dynamicFields, editor])

  if (!editor) {
    return null
  }

  const getFieldIcon = (type: string) => {
    switch (type) {
      case 'email': return '📧'
      case 'number': return '🔢'
      case 'date': return '📅'
      case 'name': return '👤'
      case 'address': return '📍'
      case 'phone': return '📞'
      case 'taxId': return '🆔'
      case 'accept': return '✅'
      default: return '📝'
    }
  }

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

  const getUserFieldIcon = (type: string) => {
    switch (type) {
      case 'email': return '📧'
      case 'number': return '🔢'
      case 'phone': return '📞'
      case 'accept': return '☑️'
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
      case 'taxId': return '#3f51b5'
      case 'accept': return '#4caf50'
      default: return '#9e9e9e'
    }
  }

  // Purple themed colors for variables (account settings)
  const getVariableColor = (type: string) => {
    return '#f3e5f5' // Light purple background for all variables
  }

  const getVariableBorderColor = (type: string) => {
    return '#9c27b0' // Purple border for all variables
  }

  const getUserFieldColor = (type: string) => {
    switch (type) {
      case 'email': return '#bbdefb'
      case 'number': return '#e1bee7'
      case 'phone': return '#b2dfdb'
      case 'accept': return '#c8e6c9'
      default: return '#f5f5f5'
    }
  }

  const getUserFieldBorderColor = (type: string) => {
    switch (type) {
      case 'email': return '#1976d2'
      case 'number': return '#7b1fa2'
      case 'phone': return '#00796b'
      case 'accept': return '#388e3c'
      default: return '#757575'
    }
  }

  const generateFieldHTML = (field: DynamicField) => {
    const icon = getFieldIcon(field.type)
    const bgColor = getFieldColor(field.type)
    const borderColor = getFieldBorderColor(field.type)
    const displayName = field.name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())

    return `
      <span class="dynamic-field-badge" data-field="${field.name}" data-type="${field.type}"
            style="
              display: inline-flex;
              align-items: center;
              gap: 6px;
              background: ${bgColor};
              border: 2px solid ${borderColor};
              border-radius: 20px;
              padding: 4px 12px;
              margin: 2px 4px;
              font-size: 14px;
              font-weight: 600;
              color: #333;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              transition: all 0.2s ease;
              cursor: default;
              white-space: nowrap;
            ">
        <span class="field-icon" style="font-size: 16px;">${icon}</span>
        <span class="field-label">${displayName}</span>
        ${field.required ? '<span class="required-star" style="color: #d32f2f; font-weight: bold;">*</span>' : ''}
      </span>
    `
  }

  const generateVariableHTML = (variable: DynamicField) => {
    const icon = getVariableIcon(variable.type)
    const bgColor = getVariableColor(variable.type)
    const borderColor = getVariableBorderColor(variable.type)
    const displayName = variable.name

    return `
      <span class="variable-badge" data-variable="${variable.name}" data-type="${variable.type}"
            style="
              display: inline-flex;
              align-items: center;
              gap: 6px;
              background: ${bgColor};
              border: 2px solid ${borderColor};
              border-radius: 20px;
              padding: 4px 12px;
              margin: 2px 4px;
              font-size: 14px;
              font-weight: 600;
              color: #7c3aed;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              transition: all 0.2s ease;
              cursor: default;
              white-space: nowrap;
            ">
        <span class="field-icon" style="font-size: 16px;">${icon}</span>
        <span class="field-label">${displayName}</span>
      </span>
    `
  }

  const insertField = (fieldName: string, isUserField: boolean = false, isVariable: boolean = false) => {
    onInsertField(fieldName, isUserField, isVariable ? 'variable' : undefined)

    if (isVariable) {
      // Insert variable as plain text
      editor.chain().focus().insertContent(`{{variable:${fieldName}}} `).run()
    } else {
      // Insert dynamic field as plain text
      editor.chain().focus().insertContent(`{{dynamic:${fieldName}}} `).run()
    }
  }

  return (
    <Box>
      <FieldStylingGlobal />
      {/* Toolbar */}
      <Box style={{ borderBottom: '1px solid var(--mantine-color-gray-3)', paddingBottom: '8px', marginBottom: '16px' }}>
        <Group gap="xs">
          <Tooltip label="Negrita">
            <ActionIcon
              variant={editor.isActive('bold') ? 'filled' : 'subtle'}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <IconBold size={16} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Cursiva">
            <ActionIcon
              variant={editor.isActive('italic') ? 'filled' : 'subtle'}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <IconItalic size={16} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Lista">
            <ActionIcon
              variant={editor.isActive('bulletList') ? 'filled' : 'subtle'}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <IconList size={16} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Lista numerada">
            <ActionIcon
              variant={editor.isActive('orderedList') ? 'filled' : 'subtle'}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <IconListNumbers size={16} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Cita">
            <ActionIcon
              variant={editor.isActive('blockquote') ? 'filled' : 'subtle'}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
              <IconQuote size={16} />
            </ActionIcon>
          </Tooltip>

          <Box style={{ width: '1px', height: '24px', backgroundColor: 'var(--mantine-color-gray-3)', margin: '0 8px' }} />

          {/* Account Variables */}
          {variables && variables.length > 0 && (
            <>
              <Text size="sm" fw={500} c="purple">Variables:</Text>
              {variables.map(variable => (
                <Tooltip key={variable.id} label={`Insertar variable ${variable.name}`}>
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<span style={{ fontSize: '14px' }}>{getVariableIcon(variable.type)}</span>}
                    onClick={() => insertField(variable.name, false, true)}
                    style={{
                      backgroundColor: getVariableColor(variable.type),
                      border: `1px solid ${getVariableBorderColor(variable.type)}`,
                      color: '#7c3aed',
                      fontWeight: '600'
                    }}
                  >
                    {variable.name}
                  </Button>
                </Tooltip>
              ))}
              <Box style={{ width: '1px', height: '24px', backgroundColor: 'var(--mantine-color-gray-3)', margin: '0 8px' }} />
            </>
          )}

          <Text size="sm" fw={500} c="blue">Campos dinámicos:</Text>
          {dynamicFields?.map(field => (
            <Tooltip key={field.id} label={`Insertar campo dinámico ${field.label || field.name}`}>
              <Button
                size="xs"
                variant="light"
                leftSection={<span style={{ fontSize: '14px' }}>{getFieldIcon(field.type)}</span>}
                onClick={() => insertField(field.name, false)}
                style={{
                  backgroundColor: getFieldColor(field.type),
                  border: `1px solid ${getFieldBorderColor(field.type)}`,
                  color: '#333',
                  fontWeight: '600'
                }}
              >
                {field.label || field.name}
                {field.required && <span style={{ color: '#d32f2f', marginLeft: '4px' }}>*</span>}
              </Button>
            </Tooltip>
          ))}

          {dynamicFields && dynamicFields.some(f => f.type === 'accept' || f.type === 'phone' || f.type === 'email') && (
            <>
              <Box style={{ width: '1px', height: '24px', backgroundColor: 'var(--mantine-color-gray-3)', margin: '0 8px' }} />
              <Text size="sm" fw={500} c="dimmed">Campos de usuario:</Text>
              {dynamicFields.filter(f => f.type === 'accept' || f.type === 'phone' || f.type === 'email').map(field => (
                <Tooltip key={field.id} label={`Insertar campo de usuario ${field.label}`}>
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<span style={{ fontSize: '14px' }}>{getUserFieldIcon(field.type)}</span>}
                    onClick={() => insertField(field.name, true)}
                    style={{
                      backgroundColor: getUserFieldColor(field.type),
                      border: `1px solid ${getUserFieldBorderColor(field.type)}`,
                      color: '#333',
                      fontWeight: '600'
                    }}
                  >
                    {field.label}
                    {field.required && <span style={{ color: '#d32f2f', marginLeft: '4px' }}>*</span>}
                  </Button>
                </Tooltip>
              ))}
            </>
          )}
        </Group>
      </Box>

      {/* Editor */}
      <Box
        style={{
          border: '1px solid var(--mantine-color-gray-3)',
          borderRadius: '8px',
          padding: '16px',
          minHeight: '400px',
          '& .ProseMirror': {
            outline: 'none',
            '& p': {
              margin: '0 0 1em 0',
              '&:last-child': {
                marginBottom: 0,
              },
            },
            // Field styling with maximum CSS specificity
            '& .ProseMirror .field-variable-styled': {
              display: 'inline-flex !important',
              alignItems: 'center !important',
              backgroundColor: '#f3e5f5 !important',
              border: '2px solid #9c27b0 !important',
              borderRadius: '16px !important',
              padding: '4px 10px !important',
              fontSize: '13px !important',
              fontWeight: '600 !important',
              color: '#7c3aed !important',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1) !important',
              whiteSpace: 'nowrap !important',
              position: 'relative !important',
            },

            '& .ProseMirror .field-dynamic-styled': {
              display: 'inline-flex !important',
              alignItems: 'center !important',
              backgroundColor: '#e3f2fd !important',
              border: '2px solid #2196f3 !important',
              borderRadius: '16px !important',
              padding: '4px 10px !important',
              fontSize: '13px !important',
              fontWeight: '600 !important',
              color: '#1565c0 !important',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1) !important',
              whiteSpace: 'nowrap !important',
              position: 'relative !important',
            },

            // Icons with maximum specificity
            '& .ProseMirror .field-variable-styled::before': {
              content: '"🔮" !important',
              fontSize: '14px !important',
              marginRight: '4px !important',
            },
            '& .ProseMirror .field-type-email::before': {
              content: '"📧" !important',
            },
            '& .ProseMirror .field-type-date::before': {
              content: '"📅" !important',
            },
            '& .ProseMirror .field-type-text::before': {
              content: '"📝" !important',
            },
          },
        }}
      >
        <EditorContent editor={editor} />
      </Box>

      {/* Field Legend */}
      <Box mt="md">
        <Text size="sm" fw={500} mb="xs">Campos disponibles:</Text>

        {/* Account Variables */}
        {variables && variables.length > 0 && (
          <>
            <Text size="xs" fw={500} c="purple" mb="xs">Variables de la cuenta:</Text>
            <Group gap="xs" mb="sm">
              {variables.map(variable => (
                <div
                  key={variable.id}
                  onClick={() => insertField(variable.name, false, true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: getVariableColor(variable.type),
                    border: `2px solid ${getVariableBorderColor(variable.type)}`,
                    borderRadius: '20px',
                    padding: '6px 14px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#7c3aed',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  }}
                >
                  <span style={{ fontSize: '16px' }}>{getVariableIcon(variable.type)}</span>
                  <span>{variable.name}</span>
                </div>
              ))}
            </Group>
          </>
        )}

        {/* Dynamic Fields */}
        {dynamicFields && dynamicFields.length > 0 && (
          <>
            <Text size="xs" fw={500} c="blue" mb="xs">Campos dinámicos:</Text>
            <Group gap="xs" mb="sm">
              {dynamicFields.map(field => (
                <div
                  key={field.id}
                  onClick={() => insertField(field.name, false)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: getFieldColor(field.type),
                    border: `2px solid ${getFieldBorderColor(field.type)}`,
                    borderRadius: '20px',
                    padding: '6px 14px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#333',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  }}
                >
                  <span style={{ fontSize: '16px' }}>{getFieldIcon(field.type)}</span>
                  <span>{field.label || field.name}</span>
                  {field.required && <span style={{ color: '#d32f2f', fontWeight: 'bold', marginLeft: '2px' }}>*</span>}
                </div>
              ))}
            </Group>
          </>
        )}

        {/* User Fields */}
        {dynamicFields && dynamicFields.some(f => f.type === 'accept' || f.type === 'phone' || f.type === 'email') && (
          <>
            <Text size="xs" fw={500} c="dimmed" mb="xs">Campos de usuario:</Text>
            <Group gap="xs" mb="sm">
              {dynamicFields.filter(f => f.type === 'accept' || f.type === 'phone' || f.type === 'email').map(field => (
                <div
                  key={field.id}
                  onClick={() => insertField(field.name, true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: getUserFieldColor(field.type),
                    border: `2px solid ${getUserFieldBorderColor(field.type)}`,
                    borderRadius: '20px',
                    padding: '6px 14px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#333',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  }}
                >
                  <span style={{ fontSize: '16px' }}>{getUserFieldIcon(field.type)}</span>
                  <span>{field.label}</span>
                  {field.required && <span style={{ color: '#d32f2f', fontWeight: 'bold', marginLeft: '2px' }}>*</span>}
                </div>
              ))}
            </Group>
          </>
        )}

        <Text size="xs" c="dimmed" mt="xs">
          * Campos obligatorios. Las <span style={{ color: '#7c3aed', fontWeight: '600' }}>variables</span> se obtienen de tu configuración de cuenta. Los <span style={{ color: '#2563eb', fontWeight: '600' }}>campos dinámicos</span> requieren input del firmante.
        </Text>
      </Box>
    </Box>
  )
}
