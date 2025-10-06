'use client'

import React, { useState, useEffect } from 'react'
import {
  Container,
  Title,
  Text,
  Button,
  Card,
  Stack,
  Group,
  Badge,
  ActionIcon,
  Table,
  Modal,
  TextInput,
  Alert,
  Loader,
  Box,
  CopyButton,
  Tooltip,
  Menu,
  Code
} from '@mantine/core'
import {
  IconKey,
  IconPlus,
  IconCopy,
  IconTrash,
  IconDots,
  IconCheck,
  IconAlertTriangle
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface ApiKey {
  id: string
  name: string
  keyPreview: string
  createdAt: string
  lastUsedAt?: string
}

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [createModalOpened, setCreateModalOpened] = useState(false)
  const [deleteModalOpened, setDeleteModalOpened] = useState(false)
  const [keyToDelete, setKeyToDelete] = useState<ApiKey | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<{
    apiKey: string
    name: string
  } | null>(null)

  const { data: session, status } = useSession()
  const router = useRouter()

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  // Fetch API keys
  useEffect(() => {
    const fetchApiKeys = async () => {
      if (status !== 'authenticated') return

      try {
        setLoading(true)
        const response = await fetch('/api/settings/api-keys')
        if (!response.ok) {
          throw new Error('Error al cargar API Keys')
        }
        const data = await response.json()
        setApiKeys(data.apiKeys || [])
      } catch (error) {
        console.error('Error fetching API keys:', error)
        notifications.show({
          title: 'Error',
          message: 'No se pudieron cargar las API Keys',
          color: 'red',
        })
      } finally {
        setLoading(false)
      }
    }

    fetchApiKeys()
  }, [status])

  const handleCreateApiKey = async () => {
    if (!newKeyName.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Por favor ingresa un nombre para la API Key',
        color: 'red',
      })
      return
    }

    try {
      setCreating(true)

      const response = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: newKeyName.trim() })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al crear API Key')
      }

      const result = await response.json()

      // Store the newly created key to show it once
      setNewlyCreatedKey({
        apiKey: result.apiKey,
        name: result.name
      })

      // Refresh the list
      const listResponse = await fetch('/api/settings/api-keys')
      if (listResponse.ok) {
        const data = await listResponse.json()
        setApiKeys(data.apiKeys || [])
      }

      setCreateModalOpened(false)
      setNewKeyName('')

      notifications.show({
        title: 'API Key creada',
        message: `Se ha creado exitosamente la API Key "${result.name}"`,
        color: 'green',
      })

    } catch (error) {
      console.error('Error creating API key:', error)
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'No se pudo crear la API Key',
        color: 'red',
      })
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteApiKey = async () => {
    if (!keyToDelete) return

    try {
      setDeleting(true)

      const response = await fetch(`/api/settings/api-keys?id=${keyToDelete.id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al eliminar API Key')
      }

      // Remove from list
      setApiKeys(prev => prev.filter(key => key.id !== keyToDelete.id))

      setDeleteModalOpened(false)
      setKeyToDelete(null)

      notifications.show({
        title: 'API Key eliminada',
        message: 'La API Key ha sido eliminada exitosamente',
        color: 'green',
      })

    } catch (error) {
      console.error('Error deleting API key:', error)
      notifications.show({
        title: 'Error',
        message: error instanceof Error ? error.message : 'No se pudo eliminar la API Key',
        color: 'red',
      })
    } finally {
      setDeleting(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (status === 'loading' || loading) {
    return (
      <Container size="xl">
        <Stack align="center" justify="center" style={{ minHeight: '400px' }}>
          <Loader size="lg" />
          <Text size="lg" c="dimmed">Cargando API Keys...</Text>
        </Stack>
      </Container>
    )
  }

  if (status === 'unauthenticated') {
    return null // Will redirect
  }

  return (
    <Container size="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Box>
            <Title size="2rem" fw={700}>API Keys</Title>
            <Text c="dimmed" mt="xs">
              Gestiona las claves de API para acceso programático a tu cuenta
            </Text>
          </Box>
          <Button
            size="lg"
            leftSection={<IconPlus size={18} />}
            onClick={() => setCreateModalOpened(true)}
          >
            Nueva API Key
          </Button>
        </Group>

        {/* Info Alert */}
        <Alert color="blue" variant="light" icon={<IconKey size={16} />}>
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              ¿Qué son las API Keys?
            </Text>
            <Text size="sm">
              Las API Keys te permiten acceder a la API de oSign.eu desde tus aplicaciones, scripts o integraciones.
            </Text>
            <Text size="sm">
              • <strong>Permanentes:</strong> No expiran automáticamente<br/>
              • <strong>Seguras:</strong> Puedes revocarlas en cualquier momento<br/>
              • <strong>Simples:</strong> Solo usa <Code>Authorization: Bearer TU_API_KEY</Code>
            </Text>
          </Stack>
        </Alert>

        {/* Show newly created key */}
        {newlyCreatedKey && (
          <Alert color="green" variant="light" icon={<IconCheck size={16} />}>
            <Stack gap="md">
              <Text size="sm" fw={500}>
                ✅ API Key "{newlyCreatedKey.name}" creada exitosamente
              </Text>
              <Text size="sm" c="orange" fw={500}>
                ⚠️ Guarda esta clave ahora. No se volverá a mostrar por seguridad.
              </Text>

              <Box>
                <Text size="sm" fw={500} mb="xs">Tu API Key:</Text>
                <Group gap="xs">
                  <Code style={{ flex: 1, padding: '12px', fontSize: '13px' }}>
                    {newlyCreatedKey.apiKey}
                  </Code>
                  <CopyButton value={newlyCreatedKey.apiKey}>
                    {({ copied, copy }) => (
                      <Tooltip label={copied ? 'Copiado!' : 'Copiar'} withArrow>
                        <ActionIcon color={copied ? 'teal' : 'gray'} onClick={copy} size="lg">
                          {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                </Group>
              </Box>

              <Box>
                <Text size="sm" fw={500} mb="xs">Ejemplo de uso:</Text>
                <Code block style={{ fontSize: '12px' }}>
                  {`curl -H "Authorization: Bearer ${newlyCreatedKey.apiKey}" \\
  https://osign.eu/api/contracts`}
                </Code>
              </Box>

              <Button
                variant="light"
                size="sm"
                onClick={() => setNewlyCreatedKey(null)}
              >
                Entendido, cerrar
              </Button>
            </Stack>
          </Alert>
        )}

        {/* API Keys Table */}
        <Card>
          {apiKeys.length === 0 ? (
            <Stack align="center" justify="center" py="xl">
              <IconKey size={48} stroke={1.5} color="gray" />
              <Text size="lg" fw={500} c="dimmed">
                No tienes API Keys todavía
              </Text>
              <Text size="sm" c="dimmed">
                Crea una API Key para empezar a usar la API
              </Text>
              <Button
                mt="md"
                leftSection={<IconPlus size={16} />}
                onClick={() => setCreateModalOpened(true)}
              >
                Crear primera API Key
              </Button>
            </Stack>
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nombre</Table.Th>
                  <Table.Th>API Key</Table.Th>
                  <Table.Th>Creada</Table.Th>
                  <Table.Th>Último uso</Table.Th>
                  <Table.Th></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {apiKeys.map((key) => (
                  <Table.Tr key={key.id}>
                    <Table.Td>
                      <Text fw={500}>{key.name}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Code>{key.keyPreview}</Code>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {formatDate(key.createdAt)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {key.lastUsedAt ? (
                        <Text size="sm" c="dimmed">
                          {formatDate(key.lastUsedAt)}
                        </Text>
                      ) : (
                        <Badge size="sm" color="gray" variant="light">
                          Nunca usada
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Menu position="bottom-end">
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray">
                            <IconDots size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<IconTrash size={14} />}
                            color="red"
                            onClick={() => {
                              setKeyToDelete(key)
                              setDeleteModalOpened(true)
                            }}
                          >
                            Eliminar
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>

        {/* Create Modal */}
        <Modal
          opened={createModalOpened}
          onClose={() => {
            setCreateModalOpened(false)
            setNewKeyName('')
          }}
          title="Crear nueva API Key"
          size="md"
        >
          <Stack>
            <TextInput
              label="Nombre"
              placeholder="Ej: Mi aplicación"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              required
              description="Un nombre descriptivo para identificar esta API Key"
            />

            <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
              <Text size="sm">
                La API Key se mostrará <strong>una sola vez</strong> después de crearla.
                Asegúrate de copiarla y guardarla en un lugar seguro.
              </Text>
            </Alert>

            <Group justify="flex-end" mt="md">
              <Button
                variant="subtle"
                onClick={() => {
                  setCreateModalOpened(false)
                  setNewKeyName('')
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreateApiKey}
                loading={creating}
                leftSection={<IconPlus size={16} />}
              >
                Crear API Key
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          opened={deleteModalOpened}
          onClose={() => {
            setDeleteModalOpened(false)
            setKeyToDelete(null)
          }}
          title="Eliminar API Key"
          size="md"
        >
          <Stack>
            <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
              <Text size="sm">
                ¿Estás seguro que deseas eliminar la API Key <strong>"{keyToDelete?.name}"</strong>?
              </Text>
              <Text size="sm" mt="xs">
                Esta acción no se puede deshacer. Cualquier aplicación que use esta clave dejará de funcionar.
              </Text>
            </Alert>

            <Group justify="flex-end" mt="md">
              <Button
                variant="subtle"
                onClick={() => {
                  setDeleteModalOpened(false)
                  setKeyToDelete(null)
                }}
              >
                Cancelar
              </Button>
              <Button
                color="red"
                onClick={handleDeleteApiKey}
                loading={deleting}
                leftSection={<IconTrash size={16} />}
              >
                Eliminar
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  )
}
