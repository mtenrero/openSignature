'use client'

import React, { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { FieldStylingExtension } from './extensions/FieldStylingExtension'
import { FieldStylingGlobal } from './FieldStylingGlobal'
import { Box, Button, Group, Text, ActionIcon, Tooltip } from '@mantine/core'
import {
  IconBold,
  IconItalic,
  IconList,
  IconListNumbers,
  IconQuote,
  IconPlus
} from '@tabler/icons-react'

import { DynamicField, UserField } from './dataTypes/Contract'

interface RichTextEditorProps {
  content: string
  onChange: (content: string) => void
  variables?: DynamicField[]
  dynamicFields: UserField[]
  onInsertField: (fieldName: string, isUserField?: boolean, fieldType?: string) => void
  /** Opens the "add dynamic field" modal so the user can request info from the signer. */
  onAddField?: () => void
}

// Content is stored verbatim ({{variable:X}} / {{dynamic:X}} + HTML); styling is
// handled by decorations, so no conversion is needed.
const convertInternalToHTML = (internalContent: string = '') => internalContent || ''
const convertHTMLToInternal = (htmlContent: string = '') => htmlContent || ''

export function RichTextEditor({ content, onChange, variables = [], dynamicFields, onInsertField, onAddField }: RichTextEditorProps) {
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
    content: convertInternalToHTML(content),
    editable: true,
    immediatelyRender: false,
    enableInputRules: true,
    enablePasteRules: true,
    autofocus: false,
    onUpdate: ({ editor }) => {
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
      const convertedContent = convertInternalToHTML(content)

      if (currentInternal !== content || currentHTML !== convertedContent) {
        requestAnimationFrame(() => {
          if (editor && !editor.isDestroyed) {
            editor.commands.setContent(convertedContent, { emitUpdate: false })
          }
        })
      }
    }
  }, [content, variables, dynamicFields]) // editor intentionally excluded to prevent loops

  // Force decoration update when variables or dynamicFields change
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
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
      default: return '📝'
    }
  }

  const insertField = (fieldName: string, isUserField: boolean = false, isVariable: boolean = false) => {
    onInsertField(fieldName, isUserField, isVariable ? 'variable' : undefined)
    const token = isVariable ? `{{variable:${fieldName}}} ` : `{{dynamic:${fieldName}}} `
    editor.chain().focus().insertContent(token).run()
  }

  return (
    <Box>
      <FieldStylingGlobal />

      {/* Formatting toolbar — compact, always visible */}
      <Box
        data-testid="editor-toolbar"
        style={{ borderBottom: '1px solid var(--mantine-color-gray-3)', paddingBottom: 8, marginBottom: 12 }}
      >
        <Group gap={4} wrap="wrap">
          <Tooltip label="Negrita">
            <ActionIcon aria-label="Negrita" variant={editor.isActive('bold') ? 'filled' : 'subtle'} onClick={() => editor.chain().focus().toggleBold().run()}>
              <IconBold size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Cursiva">
            <ActionIcon aria-label="Cursiva" variant={editor.isActive('italic') ? 'filled' : 'subtle'} onClick={() => editor.chain().focus().toggleItalic().run()}>
              <IconItalic size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Lista">
            <ActionIcon aria-label="Lista" variant={editor.isActive('bulletList') ? 'filled' : 'subtle'} onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <IconList size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Lista numerada">
            <ActionIcon aria-label="Lista numerada" variant={editor.isActive('orderedList') ? 'filled' : 'subtle'} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <IconListNumbers size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Cita">
            <ActionIcon aria-label="Cita" variant={editor.isActive('blockquote') ? 'filled' : 'subtle'} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
              <IconQuote size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Box>

      {/* Available fields — at the TOP, wrapping to as many lines as needed (auto height) */}
      {(variables.length > 0 || dynamicFields.length > 0 || !!onAddField) && (
        <Box data-testid="field-palette" mb="md">
          <Group justify="space-between" align="center" mb={8} wrap="wrap" gap="xs">
            <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.04em' }}>
              Campos disponibles
            </Text>
            {onAddField && (
              <Button
                size="xs"
                variant="light"
                color="blue"
                leftSection={<IconPlus size={14} />}
                onClick={onAddField}
              >
                Añadir campo
              </Button>
            )}
          </Group>

          {variables.length > 0 && (
            <Group gap={6} wrap="wrap" align="center" mb={dynamicFields.length > 0 ? 8 : 0}>
              <Text size="xs" fw={600} c="violet" style={{ whiteSpace: 'nowrap' }}>Variables</Text>
              {variables.map(variable => (
                <Tooltip key={variable.id} label={`Insertar ${variable.name}`} withArrow>
                  <Button
                    size="xs"
                    variant="light"
                    color="violet"
                    leftSection={<span style={{ fontSize: 13 }}>{getVariableIcon(variable.type)}</span>}
                    onClick={() => insertField(variable.name, false, true)}
                    style={{ fontWeight: 600 }}
                  >
                    {variable.name}
                  </Button>
                </Tooltip>
              ))}
            </Group>
          )}

          {dynamicFields.length > 0 && (
            <Group gap={6} wrap="wrap" align="center">
              <Text size="xs" fw={600} c="blue" style={{ whiteSpace: 'nowrap' }}>Firmante</Text>
              {dynamicFields.map(field => (
                <Tooltip key={field.id} label={`Insertar ${field.label || field.name}`} withArrow>
                  <Button
                    size="xs"
                    variant="light"
                    color="blue"
                    leftSection={<span style={{ fontSize: 13 }}>{getFieldIcon(field.type)}</span>}
                    onClick={() => insertField(field.name, false)}
                    style={{ fontWeight: 600 }}
                  >
                    {field.label || field.name}
                    {field.required && <span style={{ color: 'var(--mantine-color-red-7)', marginLeft: 4 }}>*</span>}
                  </Button>
                </Tooltip>
              ))}
            </Group>
          )}

          <Text size="xs" c="dimmed" mt={8}>
            Pulsa un campo para insertarlo. Las <Text span c="violet" fw={600}>variables</Text> se rellenan con los datos de tu cuenta; los <Text span c="blue" fw={600}>campos del firmante</Text> los completa quien firma.
          </Text>
        </Box>
      )}

      {/* Editor — field badge styling is injected globally by <FieldStylingGlobal /> */}
      <Box
        data-testid="editor-surface"
        style={{
          border: '1px solid var(--mantine-color-gray-3)',
          borderRadius: 8,
          padding: 'clamp(12px, 3vw, 16px)',
          minHeight: 'clamp(260px, 40vh, 400px)',
        }}
      >
        <EditorContent editor={editor} />
      </Box>
    </Box>
  )
}
