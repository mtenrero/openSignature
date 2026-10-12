'use client'

import React, { useEffect, useReducer, useState } from 'react'
import { ActionIcon, Button } from '@mantine/core'
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconItalic,
  IconList,
  IconListNumbers,
  IconPlus,
  IconQuote,
} from '@tabler/icons-react'
import type { Editor } from '@tiptap/react'
import { useIsMobile } from '../../lib/ui/useIsMobile'
import { useKeyboardInset } from '../../lib/ui/useKeyboardOpen'

export interface EditorToolbarProps {
  editor: Editor | null
  /** Opens the field palette sheet ("Insertar campo"). */
  onOpenPalette: () => void
  /** Hide the "Insertar campo" button when the palette is already visible beside the editor. */
  hideInsertFromMd?: boolean
}

/**
 * Formatting toolbar: one horizontally scrollable row of 44px controls (aria-label on each, no Tooltip-only labels).
 * Sticky under the page header; on phones it jumps above the soft keyboard (visualViewport) while the editor has focus.
 */
export function EditorToolbar({ editor, onOpenPalette, hideInsertFromMd }: EditorToolbarProps) {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const [focused, setFocused] = useState(false)
  const isMobile = useIsMobile()
  const { open, inset } = useKeyboardInset()

  useEffect(() => {
    if (!editor) return
    const onTx = () => rerender()
    const onFocus = () => setFocused(true)
    const onBlur = () => setFocused(false)
    editor.on('transaction', onTx)
    editor.on('focus', onFocus)
    editor.on('blur', onBlur)
    return () => {
      editor.off('transaction', onTx)
      editor.off('focus', onFocus)
      editor.off('blur', onBlur)
    }
  }, [editor])

  const fixed = isMobile && open && focused
  const active = (name: string) => !!editor?.isActive(name)
  const run = (fn: (chain: ReturnType<Editor['chain']>) => { run: () => boolean }) => () => {
    if (editor) fn(editor.chain().focus()).run()
  }

  const marks: Array<{ key: string; label: string; icon: React.ReactNode; on: boolean; disabled?: boolean; onClick: () => void }> = [
    { key: 'bold', label: 'Negrita', icon: <IconBold size={20} />, on: active('bold'), onClick: run((c) => c.toggleBold()) },
    { key: 'italic', label: 'Cursiva', icon: <IconItalic size={20} />, on: active('italic'), onClick: run((c) => c.toggleItalic()) },
    { key: 'bullet', label: 'Lista', icon: <IconList size={20} />, on: active('bulletList'), onClick: run((c) => c.toggleBulletList()) },
    { key: 'ordered', label: 'Lista numerada', icon: <IconListNumbers size={20} />, on: active('orderedList'), onClick: run((c) => c.toggleOrderedList()) },
    { key: 'quote', label: 'Cita', icon: <IconQuote size={20} />, on: active('blockquote'), onClick: run((c) => c.toggleBlockquote()) },
    { key: 'undo', label: 'Deshacer', icon: <IconArrowBackUp size={20} />, on: false, disabled: !editor?.can().undo(), onClick: run((c) => c.undo()) },
    { key: 'redo', label: 'Rehacer', icon: <IconArrowForwardUp size={20} />, on: false, disabled: !editor?.can().redo(), onClick: run((c) => c.redo()) },
  ]

  return (
    <>
      {fixed ? <div className="os-etb-spacer" aria-hidden="true" /> : null}
      <div
        data-testid="editor-toolbar"
        role="toolbar"
        aria-label="Formato del texto"
        className={`os-etb${fixed ? ' os-etb--fixed' : ''}`}
        style={fixed ? ({ '--os-etb-bottom': `${inset}px` } as React.CSSProperties) : undefined}
        // Keep the caret/selection in the editor when a control is pressed.
        onMouseDown={(e) => e.preventDefault()}
      >
        <Button
          variant="light"
          leftSection={<IconPlus size={18} />}
          onClick={onOpenPalette}
          className="os-etb__insert"
          hiddenFrom={hideInsertFromMd ? 'md' : undefined}
          aria-label="Insertar campo"
        >
          Insertar campo
        </Button>
        <span className="os-etb__sep" aria-hidden="true" />
        {marks.map((m) => (
          <ActionIcon
            key={m.key}
            aria-label={m.label}
            title={m.label}
            aria-pressed={['bold', 'italic', 'bullet', 'ordered', 'quote'].includes(m.key) ? m.on : undefined}
            variant={m.on ? 'filled' : 'subtle'}
            color={m.on ? undefined : 'gray'}
            disabled={m.disabled}
            onClick={m.onClick}
          >
            {m.icon}
          </ActionIcon>
        ))}
      </div>
    </>
  )
}
