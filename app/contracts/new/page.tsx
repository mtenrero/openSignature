'use client'

import React, { useState } from 'react'
import { Container, Title, Button, Card, TextInput, Textarea, Stack, Group, Text, Checkbox, Select, Divider, Alert } from '@mantine/core'
import { IconPlus, IconArrowLeft } from '@tabler/icons-react'
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
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Group>
            <Button
              variant="subtle"
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => router.push('/contracts')}
            >
              Volver a Mis Contratos
            </Button>
            <div>
              <Title size="2rem" fw={700}>
                Crear Nuevo Contrato
              </Title>
              <Text size="sm" c="dimmed">
                Crea un contrato desde cero con configuración personalizada
              </Text>
            </div>
          </Group>
        </Group>


        {/* Contract Basic Info */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Title size="1.2rem" fw={600} mb="md">
            Información Básica del Contrato
          </Title>
          <Stack gap="md">
            <TextInput
              label="Nombre del contrato"
              placeholder="Ej: Contrato de Servicios Profesionales"
              value={contractName}
              onChange={(event) => setContractName(event.target.value)}
              required
            />
            <Textarea
              label="Descripción (opcional)"
              placeholder="Breve descripción del contrato"
              value={contractDescription}
              onChange={(event) => setContractDescription(event.target.value)}
              minRows={2}
            />
          </Stack>
        </Card>

        {/* Contract Parameters */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Title size="1.2rem" fw={600} mb="md">
            Parámetros del Contrato
          </Title>
          <Stack gap="md">
            <Checkbox
              label="Requerir doble firma por SMS (mayor garantía legal)"
              description={isSMSDisabled ? "SMS está deshabilitado en la configuración del sistema" : "El firmante recibirá un código por SMS además de la firma digital"}
              checked={parameters.requireDoubleSignatureSMS && !isSMSDisabled}
              disabled={isSMSDisabled}
              onChange={(event) => setParameters({
                ...parameters,
                requireDoubleSignatureSMS: event.currentTarget.checked
              })}
            />

          </Stack>
        </Card>



        {/* Create Button */}
        <Group justify="center">
          <Button
            size="lg"
            leftSection={<IconPlus size={20} />}
            onClick={handleCreateContract}
            disabled={!contractName.trim()}
            loading={creating}
          >
            Crear Contrato
          </Button>
        </Group>

        {/* Help Card */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Title size="1.2rem" fw={600} mb="md">
            Información Importante
          </Title>
          <Stack gap="sm">
            <Text size="sm">
              • El contrato se creará completamente vacío, sin contenido ni campos predefinidos
            </Text>
            <Text size="sm">
              • Podrás agregar campos dinámicos y campos de usuario en el editor
            </Text>
            <Text size="sm">
              • Los campos dinámicos se configuran en tu panel de configuración
            </Text>
            <Text size="sm">
              • Los campos de usuario permiten recopilar información del firmante
            </Text>
            <Text size="sm" fw={600} c="red">
              • IMPORTANTE: Para activar el contrato y solicitar firmas, deberás agregar los campos obligatorios: Nombre del cliente y NIF del cliente
            </Text>
            <Text size="sm">
              • Estos campos obligatorios aseguran el cumplimiento legal y la correcta identificación del firmante
            </Text>
          </Stack>
        </Card>
      </Stack>
    </Container>
  )
}
