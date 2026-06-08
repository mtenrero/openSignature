import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { DynamicFieldsForm } from '@/components/DynamicFieldsForm'

const renderForm = (props: Partial<React.ComponentProps<typeof DynamicFieldsForm>>) => {
  const onSubmit = jest.fn()
  const onValuesChange = jest.fn()
  const utils = render(
    <MantineProvider>
      <DynamicFieldsForm
        fields={props.fields ?? []}
        values={props.values ?? {}}
        onValuesChange={onValuesChange}
        onSubmit={onSubmit}
        mode={props.mode ?? 'inline'}
        lockedFields={props.lockedFields}
        skipMandatoryValidation={props.skipMandatoryValidation}
        contractName={props.contractName}
      />
    </MantineProvider>
  )
  return { ...utils, onSubmit, onValuesChange }
}

describe('DynamicFieldsForm', () => {
  it('renders required user fields with their labels', () => {
    renderForm({
      fields: [
        { id: '1', name: 'clientName', type: 'name', required: true, label: 'Nombre' } as any,
        { id: '2', name: 'clientTaxId', type: 'text', required: true, label: 'NIF' } as any,
      ],
      values: {},
    })
    expect(screen.getByLabelText(/Nombre/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/NIF/i)).toBeInTheDocument()
  })

  it('marks fields in lockedFields as disabled and shows the pre-provided notice', () => {
    renderForm({
      fields: [
        { id: '1', name: 'clientName', type: 'name', required: true, label: 'Nombre' } as any,
      ],
      values: { clientName: 'Ada Lovelace' },
      lockedFields: ['clientName'],
    })
    const input = screen.getByLabelText(/Nombre/i) as HTMLInputElement
    expect(input).toBeDisabled()
    expect(input.value).toBe('Ada Lovelace')
    expect(screen.getByText(/Este dato fue proporcionado al solicitar la firma/i)).toBeInTheDocument()
  })

  it('blocks submit when a required field is empty', () => {
    const { onSubmit } = renderForm({
      fields: [
        { id: '1', name: 'clientName', type: 'name', required: true, label: 'Nombre' } as any,
        { id: '2', name: 'clientTaxId', type: 'text', required: true, label: 'NIF' } as any,
      ],
      values: { clientName: '', clientTaxId: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Continuar/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits when all required fields are valid', () => {
    const { onSubmit } = renderForm({
      fields: [
        { id: '1', name: 'clientName', type: 'name', required: true, label: 'Nombre' } as any,
        { id: '2', name: 'clientTaxId', type: 'text', required: true, label: 'NIF' } as any,
      ],
      values: { clientName: 'Ada Lovelace', clientTaxId: '12345678A' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Continuar/i }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('respects skipMandatoryValidation: does not show the legal warning even when validation would fail', () => {
    // Plantilla SIN clientName/clientTaxId definidos — validateMandatoryFields fallaría
    renderForm({
      fields: [
        { id: '1', name: 'extra', type: 'text', required: false, label: 'Extra' } as any,
      ],
      values: { extra: 'foo' },
      skipMandatoryValidation: true,
    })
    expect(screen.queryByText(/Campos obligatorios faltantes/i)).not.toBeInTheDocument()
    // The continuar button must be enabled
    const btn = screen.getByRole('button', { name: /Continuar/i })
    expect(btn).not.toBeDisabled()
  })

  it('without skipMandatoryValidation the legal warning appears when required fields are missing from contract definition', () => {
    renderForm({
      fields: [
        { id: '1', name: 'extra', type: 'text', required: false, label: 'Extra' } as any,
      ],
      values: { extra: 'foo' },
    })
    expect(screen.getByText(/Campos obligatorios faltantes/i)).toBeInTheDocument()
  })
})
