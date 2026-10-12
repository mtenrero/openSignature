'use client'

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { IconPencil, IconTrash } from '@tabler/icons-react'
import { FieldStylingExtension, type FieldTapInfo } from './extensions/FieldStylingExtension'
import { FieldStylingGlobal } from './FieldStylingGlobal'
import { EditorToolbar } from './contract-editor/EditorToolbar'
import { FieldPalettePanel, FieldPaletteSheet, type PaletteKind } from './contract-editor/FieldPaletteSheet'
import { ActionSheet } from './ui/ActionSheet'

import { DynamicField, UserField } from './dataTypes/Contract'

interface RichTextEditorProps {
  content: string
  onChange: (content: string) => void
  variables?: DynamicField[]
  dynamicFields: UserField[]
  onInsertField: (fieldName: string, isUserField?: boolean, fieldType?: string) => void
  /** Opens the "add dynamic field" sheet so the user can request info from the signer. */
  onAddField?: () => void
  /** Tap on a signer-field badge → "Editar campo". */
  onEditField?: (fieldName: string) => void
}

export interface RichTextEditorHandle {
  /** Insert a {{variable:X}} / {{dynamic:X}} token at the caret (end of the document if never focused). */
  insertToken: (name: string, kind: PaletteKind) => void
}

// Content is stored verbatim ({{variable:X}} / {{dynamic:X}} + HTML); styling is
// handled by decorations, so no conversion is needed.
const convertInternalToHTML = (internalContent: string = '') => internalContent || ''
const convertHTMLToInternal = (htmlContent: string = '') => htmlContent || ''

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(
  { content, onChange, variables = [], dynamicFields, onInsertField, onAddField, onEditField },
  ref
) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [tapped, setTapped] = useState<FieldTapInfo | null>(null)
  const touched = useRef(false)
  // The extension is created once; route taps through a ref so it always calls the latest handler.
  const tapRef = useRef<(info: FieldTapInfo) => void>(() => {})
  tapRef.current = (info) => setTapped(info)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Escribe el contenido de tu contrato aquí...',
      }),
      FieldStylingExtension.configure({
        variables: variables || [],
        dynamicFields: dynamicFields || [],
        onFieldTap: (info) => tapRef.current(info),
      }),
    ],
    content: convertInternalToHTML(content),
    editable: true,
    immediatelyRender: false,
    enableInputRules: true,
    enablePasteRules: true,
    autofocus: false,
    editorProps: {
      attributes: {
        'aria-label': 'Contenido del contrato',
        autocapitalize: 'sentences',
        spellcheck: 'true',
      },
    },
    onFocus: () => {
      touched.current = true
    },
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

  const insertToken = (name: string, kind: PaletteKind) => {
    if (!editor) return
    const token = kind === 'variable' ? `{{variable:${name}}} ` : `{{dynamic:${name}}} `
    // Never focused yet (typical on a phone): append instead of inserting at the top of the document.
    editor.chain().focus(touched.current ? undefined : 'end').insertContent(token).run()
  }

  useImperativeHandle(ref, () => ({ insertToken }))

  if (!editor) {
    return null
  }

  const insertField = (fieldName: string, kind: PaletteKind) => {
    onInsertField(fieldName, false, kind === 'variable' ? 'variable' : undefined)
    insertToken(fieldName, kind)
  }

  const tappedField = tapped && tapped.category === 'dynamic' ? dynamicFields.find((f) => f.name === tapped.name) : undefined
  const tappedLabel = tapped
    ? tapped.category === 'variable'
      ? `Variable: ${tapped.name}`
      : `Campo: ${tappedField?.label || tapped.name}`
    : undefined
  const isPredefined = ['clientName', 'clientTaxId', 'clientPhone', 'clientEmail'].includes(tapped?.name || '')

  const paletteProps = { variables, fields: dynamicFields, onInsert: insertField }

  return (
    <div>
      <FieldStylingGlobal />

      <div className="os-editor-grid">
        <div style={{ minWidth: 0 }}>
          <EditorToolbar editor={editor} onOpenPalette={() => setPaletteOpen(true)} hideInsertFromMd />

          {/* Editor — field badge styling is injected globally by <FieldStylingGlobal /> */}
          <div data-testid="editor-surface" className="os-editor-surface">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* >= md: the palette stays beside the document */}
        <div className="os-palette-col" style={{ minWidth: 0 }}>
          <FieldPalettePanel {...paletteProps} onAddField={onAddField} />
        </div>
      </div>

      {/* < md: "Insertar campo" opens this bottom sheet */}
      <FieldPaletteSheet
        opened={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        {...paletteProps}
        onInsert={(name, kind) => {
          setPaletteOpen(false)
          insertField(name, kind)
        }}
        onAddField={
          onAddField
            ? () => {
                setPaletteOpen(false)
                onAddField()
              }
            : undefined
        }
      />

      {/* Tap on a badge (no hover on touch): edit / remove */}
      <ActionSheet
        opened={!!tapped}
        onClose={() => setTapped(null)}
        title={tappedLabel}
        items={[
          ...(tapped?.category === 'dynamic' && onEditField && tappedField && !isPredefined
            ? [{
                key: 'edit',
                label: 'Editar campo',
                icon: <IconPencil size={20} />,
                onClick: () => onEditField(tapped.name),
              }]
            : []),
          {
            key: 'remove',
            label: 'Quitar del texto',
            color: 'red' as const,
            icon: <IconTrash size={20} />,
            onClick: () => {
              if (tapped && !editor.isDestroyed) editor.chain().deleteRange({ from: tapped.from, to: tapped.to }).run()
            },
          },
        ]}
      />
    </div>
  )
})
