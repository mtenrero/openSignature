'use client'

import React from 'react'
import { ActionIcon, Alert, Button, SegmentedControl, Stack, Text, Textarea } from '@mantine/core'
import { IconRobot, IconSparkles, IconX } from '@tabler/icons-react'
import { AdaptiveSheet } from '../ui/AdaptiveSheet'

/** Dismissible banner, only for empty contracts. The AI form itself lives in a sheet. */
export function AiGenerateBanner({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  return (
    <Alert
      icon={<IconSparkles size={20} />}
      title="Genera el contrato con IA"
      color="blue"
      variant="light"
      mb="sm"
      data-testid="ai-banner"
      withCloseButton={false}
    >
      <Text size="sm" mb="xs">Describe el contrato y la IA redactará el texto, las variables y los campos del firmante.</Text>
      <Button leftSection={<IconRobot size={18} />} onClick={onStart} style={{ minHeight: 44 }}>
        Generar con IA
      </Button>
      <ActionIcon
        variant="subtle"
        color="gray"
        size={44}
        aria-label="Descartar sugerencia de IA"
        onClick={onDismiss}
        style={{ position: 'absolute', top: 4, right: 4 }}
      >
        <IconX size={18} />
      </ActionIcon>
    </Alert>
  )
}

export interface AiGenerateSheetProps {
  opened: boolean
  onClose: () => void
  mode: 'generate' | 'adapt'
  onModeChange: (m: 'generate' | 'adapt') => void
  description: string
  onDescriptionChange: (v: string) => void
  existingContract: string
  onExistingContractChange: (v: string) => void
  generating: boolean
  onGenerate: () => void
}

export function AiGenerateSheet(p: AiGenerateSheetProps) {
  const adapt = p.mode === 'adapt'
  const disabled = (!p.description.trim() && !adapt) || (adapt && !p.existingContract.trim()) || p.generating
  return (
    <AdaptiveSheet
      opened={p.opened}
      onClose={p.onClose}
      title="Generación asistida por IA"
      size="lg"
      fullScreenOnMobile
      footer={
        <Button
          size="md"
          fullWidth
          leftSection={<IconSparkles size={20} />}
          onClick={p.onGenerate}
          disabled={disabled}
          loading={p.generating}
          style={{ minHeight: 44 }}
        >
          {p.generating
            ? (adapt ? 'Adaptando contrato...' : 'Generando contrato...')
            : (adapt ? 'Adaptar Contrato con IA' : 'Generar Contrato con IA')}
        </Button>
      }
    >
      <Stack gap="md">
        <SegmentedControl
          value={p.mode}
          onChange={(value) => p.onModeChange(value as 'generate' | 'adapt')}
          data={[
            { label: 'Generar desde cero', value: 'generate' },
            { label: 'Adaptar existente', value: 'adapt' },
          ]}
          fullWidth
          aria-label="Modo de generación"
        />

        {adapt && (
          <Textarea
            label="Pega aquí el contenido del contrato existente"
            placeholder="Pega aquí el texto completo del contrato que quieres adaptar al formato del sistema..."
            value={p.existingContract}
            onChange={(e) => p.onExistingContractChange(e.target.value)}
            minRows={6}
            maxRows={12}
            autosize
            required
          />
        )}

        <Textarea
          label={adapt ? 'Describe qué adaptaciones necesitas (opcional)' : 'Describe el contrato que necesitas'}
          placeholder={adapt
            ? 'Ej: Convierte este contrato al formato del sistema, adapta las cláusulas de pago, agrega campos para datos del cliente...'
            : 'Ej: Contrato de servicios de consultoría tecnológica con cláusulas de confidencialidad, plazos de entrega, forma de pago mensual y penalizaciones por retraso...'}
          value={p.description}
          onChange={(e) => p.onDescriptionChange(e.target.value)}
          minRows={adapt ? 3 : 4}
          maxRows={8}
          autosize
          required={!adapt}
        />

        <Alert color="blue" variant="light">
          <Text size="sm" fw={600}>{adapt ? 'La IA adaptará el contrato:' : 'La IA incluirá automáticamente:'}</Text>
          <Text size="sm" component="div">
            {adapt ? (
              <>
                • Convertirá información del emisor a variables del sistema<br />
                • Identificará y creará campos dinámicos para datos del cliente<br />
                • Adaptará el formato a HTML estructurado<br />
                • Mantendrá todo el contenido legal original<br />
                • Agregará cláusulas faltantes según estándares españoles
              </>
            ) : (
              <>
                • Variables de tu cuenta (nombre, dirección, NIF, etc.)<br />
                • 4 campos predefinidos del firmante (nombre, NIF, SMS, mail)<br />
                • Estructura legal española con cláusulas de cumplimiento<br />
                • Campos dinámicos adicionales según el tipo de contrato
              </>
            )}
          </Text>
        </Alert>
      </Stack>
    </AdaptiveSheet>
  )
}

export interface AiQuestionsSheetProps {
  opened: boolean
  onClose: () => void
  questions: string[]
  answers: Record<string, string>
  onAnswer: (question: string, value: string) => void
  generating: boolean
  onComplete: () => void
}

export function AiQuestionsSheet(p: AiQuestionsSheetProps) {
  return (
    <AdaptiveSheet
      opened={p.opened}
      onClose={p.onClose}
      title="Información adicional requerida"
      size="lg"
      fullScreenOnMobile
      footer={
        <Button
          fullWidth
          color="orange"
          leftSection={<IconSparkles size={20} />}
          onClick={p.onComplete}
          disabled={p.questions.some((q) => !p.answers[q]?.trim()) || p.generating}
          loading={p.generating}
          style={{ minHeight: 44 }}
        >
          {p.generating ? 'Completando contrato...' : 'Completar Contrato con la Información'}
        </Button>
      }
    >
      <Stack gap="md">
        <Alert color="orange" variant="light">
          <Text size="sm">
            La IA generó un contrato base, pero necesita información adicional para completarlo correctamente.
            Por favor responde las siguientes preguntas:
          </Text>
        </Alert>
        {p.questions.map((question, index) => (
          <Textarea
            key={index}
            label={`${index + 1}. ${question}`}
            placeholder="Escribe tu respuesta aquí..."
            value={p.answers[question] || ''}
            onChange={(e) => p.onAnswer(question, e.target.value)}
            minRows={2}
            autosize
            required
          />
        ))}
      </Stack>
    </AdaptiveSheet>
  )
}
