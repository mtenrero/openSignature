'use client'

import React, { useState } from 'react'
import { Container, Button, TextInput, Textarea, Stack, Text, Switch, Accordion } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { PageHeader, Section, StickyActionBar } from '@/components/ui'
import { useRouter } from 'next/navigation'
import { notifications } from '@mantine/notifications'

interface ContractParameters {
  requireDoubleSignatureSMS: boolean
}

export default function NewContractPage() {
  const router = useRouter()
  const [contractName, setContractName] = useState('')
  const [contractDescription, setContractDescription] = useState('')
  const [contractContent, setContractContent] = useState('')
  const [creating, setCreating] = useState(false)
  const [parameters, setParameters] = useState<ContractParameters>({
    requireDoubleSignatureSMS: false
  })

  // Check if SMS is disabled via environment variables
  const isSMSDisabled = process.env.NEXT_PUBLIC_DISABLE_SMS === 'true'
  

  const handleCreateContract = async () => {
    if (!contractName.trim()) {
      notifications.show({
        title: 'Error',
        message: 'El nombre del contrato es obligatorio',
        color: 'red',
      })
      return
    }

    setCreating(true)
    
    try {
      // Create contract object with parameters
      const contractData = {
        name: contractName,
        description: contractDescription,
        content: '', // Empty content by default
        dynamicFields: [],
        userFields: [],
        parameters: {
          ...parameters
        }
      }

      // Call the API to create the contract
      const response = await fetch('/api/contracts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(contractData),
      })

      if (!response.ok) {
        const error = await response.json()

        // Handle subscription limit errors
        if (error.errorCode === 'LIMIT_EXCEEDED') {
          notifications.show({
            title: '🚫 Límite alcanzado',
            message: error.error + (error.extraCost ? ` (Coste extra: ${(error.extraCost / 100).toFixed(2)}€)` : ''),
            color: 'orange',
            autoClose: 8000
          })
          return
        }

        // Handle mandatory fields validation errors
        if (error.requiresMandatoryFields) {
          let errorMessage = error.error
          if (error.missingFields && error.missingFields.length > 0) {
            errorMessage += '\n\nCampos faltantes: ' + error.missingFields.join(', ')
          }
          if (error.warnings && error.warnings.length > 0) {
            errorMessage += '\n\nAdvertencias: ' + error.warnings.join('\n')
          }
          throw new Error(errorMessage)
        }

        throw new Error(error.error || 'Error al crear el contrato')
      }

      const newContract = await response.json()
      
      notifications.show({
        title: 'Éxito',
        message: 'Contrato creado exitosamente. Ahora puedes agregar el contenido y campos necesarios.',
        color: 'green',
      })

      router.push(`/contracts/${newContract.id}/edit`)

    } catch (error) {
      console.error('Error creating contract:', error)
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Error al crear el contrato',
        color: 'red',
        autoClose: 10000, // Keep notification longer for mandatory field errors
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <PageHeader title="Nuevo contrato" subtitle="Crea un contrato desde cero con configuración personalizada" back="/contracts" />
      <Container size="sm" data-testid="page-content" className="os-touch" pb="xl">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (contractName.trim() && !creating) handleCreateContract()
          }}
        >
          <Stack gap="lg">
            <Section title="Información básica">
              <TextInput
                label="Nombre del contrato"
                placeholder="Ej: Contrato de Servicios Profesionales"
                value={contractName}
                onChange={(event) => setContractName(event.target.value)}
                required
                enterKeyHint="next"
              />
              <Textarea
                label="Descripción (opcional)"
                placeholder="Breve descripción del contrato"
                value={contractDescription}
                onChange={(event) => setContractDescription(event.target.value)}
                minRows={3}
                autosize
              />
            </Section>

            <Section title="Parámetros">
              <Switch
                size="md"
                label="Verificación OTP obligatoria"
                description={
                  isSMSDisabled
                    ? 'SMS está deshabilitado en la configuración del sistema'
                    : 'El firmante recibirá un código de verificación temporal (válido 10 min) que deberá introducir antes de firmar'
                }
                checked={parameters.requireDoubleSignatureSMS && !isSMSDisabled}
                disabled={isSMSDisabled}
                onChange={(event) => setParameters({ ...parameters, requireDoubleSignatureSMS: event.currentTarget.checked })}
              />
            </Section>

            <Accordion variant="separated" chevronPosition="right">
              <Accordion.Item value="info">
                <Accordion.Control>Información importante</Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="xs">
                    <Text size="sm">El contrato se creará vacío: añade el contenido y los campos en el editor.</Text>
                    <Text size="sm">Los campos dinámicos se configuran en tu panel de configuración; los campos de usuario recogen información del firmante.</Text>
                    <Text size="sm" fw={600} c="red.7">
                      Todos los contratos incluyen 4 campos del firmante: Nombre, NIF, SMS (opcional) y Mail (opcional). Nombre y NIF son obligatorios y deben usarse en el contenido para activar el contrato.
                    </Text>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </Stack>
          <StickyActionBar>
            <Button
              type="submit"
              leftSection={<IconPlus size={20} />}
              disabled={!contractName.trim()}
              loading={creating}
            >
              Crear Contrato
            </Button>
          </StickyActionBar>
        </form>
      </Container>
    </>
  )
}
