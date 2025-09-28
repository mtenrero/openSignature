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
  Textarea,
  Alert,
  Loader,
  Box,
  CopyButton,
  Tooltip,
  Menu
} from '@mantine/core'
import {
  IconKey,
  IconPlus,
  IconCopy,
  IconTrash,
  IconDots,
  IconCheck,
  IconAlertTriangle,
  IconEye,
  IconEyeOff,
  IconRefresh
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface ApiKey {
  id: string
  name: string
  description?: string
  clientId: string
  clientSecret?: string
  scopes: string[]
  status: 'active' | 'inactive'
  createdAt: string
  lastUsed?: string
  usageCount: number
}

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [createModalOpened, setCreateModalOpened] = useState(false)
  const [deleteModalOpened, setDeleteModalOpened] = useState(false)
  const [keyToDelete, setKeyToDelete] = useState<ApiKey | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [newKeyData, setNewKeyData] = useState({
    name: '',
    description: '',
    scopes: ['read:contracts', 'write:contracts', 'read:signatures', 'write:signatures']
  })
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<{
    clientId: string
    clientSecret: string
    name: string
  } | null>(null)
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})

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
        const response = await fetch('/api/auth0/api-keys')
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
    try {
      setCreating(true)

      const response = await fetch('/api/auth0/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newKeyData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al crear API Key')
      }

      const result = await response.json()

      // Store the newly created key data to show the secret
      setNewlyCreatedKey({
        clientId: result.clientId,
        clientSecret: result.clientSecret,
        name: result.name
      })

      // Add to the list (without secret for security)
      setApiKeys(prev => [...prev, {
        ...result,
        clientSecret: undefined // Don't store secret in state
      }])

      setCreateModalOpened(false)
      setNewKeyData({ name: '', description: '', scopes: ['read:contracts', 'write:contracts', 'read:signatures', 'write:signatures'] })

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

      const response = await fetch(`/api/auth0/api-keys/${keyToDelete.id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al eliminar API Key')
      }

      setApiKeys(prev => prev.filter(key => key.id !== keyToDelete.id))
      setDeleteModalOpened(false)
      setKeyToDelete(null)

      notifications.show({
        title: 'API Key eliminada',
        message: `Se ha eliminado exitosamente la API Key "${keyToDelete.name}"`,
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

  const toggleSecretVisibility = (keyId: string) => {
    setShowSecrets(prev => ({
      ...prev,
      [keyId]: !prev[keyId]
    }))
  }

  const getStatusBadge = (status: string) => {
    return status === 'active'
      ? <Badge color="green" variant="light">Activa</Badge>
      : <Badge color="red" variant="light">Inactiva</Badge>
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
              Gestiona las claves de API para acceso M2M (Machine-to-Machine) a tu cuenta
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
              Las API Keys te permiten integrar aplicaciones externas con oSign.eu de forma segura.
              Utiliza autenticación M2M (Machine-to-Machine) basada en OAuth 2.0 con Auth0.
            </Text>
            <Text size="sm">
              • <strong>Client ID:</strong> Identificador público de tu aplicación
              • <strong>Client Secret:</strong> Clave secreta (solo se muestra una vez al crearla)
              • <strong>Scopes:</strong> Permisos específicos que tiene la API Key
            </Text>
          </Stack>
        </Alert>

        {/* Show newly created key secret */}
        {newlyCreatedKey && (
          <Alert color="green" variant="light" icon={<IconCheck size={16} />}>
            <Stack gap="md">
              <Text size="sm" fw={500}>
                ✅ API Key "{newlyCreatedKey.name}" creada exitosamente
              </Text>
              <Text size="sm" c="orange" fw={500}>
                ⚠️ Guarda estas credenciales ahora. El Client Secret no se volverá a mostrar por seguridad.
              </Text>

              <Box>
                <Text size="sm" fw={500} mb="xs">Client ID:</Text>
                <Group gap="xs">
                  <Text size="sm" ff="monospace" bg="gray.1" p="xs" style={{ borderRadius: 4, flex: 1 }}>
                    {newlyCreatedKey.clientId}
                  </Text>
                  <CopyButton value={newlyCreatedKey.clientId}>
                    {({ copied, copy }) => (
                      <Tooltip label={copied ? 'Copiado!' : 'Copiar'} withArrow>
                        <ActionIcon color={copied ? 'teal' : 'gray'} onClick={copy}>
                          {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                </Group>
              </Box>

              <Box>
                <Text size="sm" fw={500} mb="xs">Client Secret:</Text>
                <Group gap="xs">
                  <Text size="sm" ff="monospace" bg="gray.1" p="xs" style={{ borderRadius: 4, flex: 1 }}>
                    {newlyCreatedKey.clientSecret}
                  </Text>
                  <CopyButton value={newlyCreatedKey.clientSecret}>
                    {({ copied, copy }) => (
                      <Tooltip label={copied ? 'Copiado!' : 'Copiar'} withArrow>
                        <ActionIcon color={copied ? 'teal' : 'gray'} onClick={copy}>
                          {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                </Group>
              </Box>

              <Button
                variant="subtle"
                size="xs"
                onClick={() => setNewlyCreatedKey(null)}
              >
                Entendido, ocultar credenciales
              </Button>
            </Stack>
          </Alert>
        )}

        {/* API Keys Table */}
        {apiKeys.length === 0 ? (
          <Card shadow="sm" padding="xl" radius="md" withBorder>
            <Stack align="center" gap="md">
              <IconKey size={48} color="var(--mantine-color-gray-4)" />
              <Title size="1.5rem" c="dimmed">
                No hay API Keys
              </Title>
              <Text c="dimmed" ta="center">
                Crea tu primera API Key para comenzar a integrar aplicaciones externas con oSign.eu
              </Text>
              <Button leftSection={<IconPlus size={18} />} onClick={() => setCreateModalOpened(true)}>
                Crear Primera API Key
              </Button>
            </Stack>
          </Card>
        ) : (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nombre</Table.Th>
                  <Table.Th>Client ID</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Creada</Table.Th>
                  <Table.Th>Último Uso</Table.Th>
                  <Table.Th>Usos</Table.Th>
                  <Table.Th>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {apiKeys.map((apiKey) => (
                  <Table.Tr key={apiKey.id}>
                    <Table.Td>
                      <Stack gap="xs">
                        <Text fw={500}>{apiKey.name}</Text>
                        {apiKey.description && (
                          <Text size="xs" c="dimmed">{apiKey.description}</Text>
                        )}
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Text size="sm" ff="monospace">
                          {showSecrets[apiKey.id] ? apiKey.clientId : `${apiKey.clientId.substring(0, 8)}...`}
                        </Text>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          onClick={() => toggleSecretVisibility(apiKey.id)}
                        >
                          {showSecrets[apiKey.id] ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                        </ActionIcon>
                        <CopyButton value={apiKey.clientId}>
                          {({ copied, copy }) => (
                            <Tooltip label={copied ? 'Copiado!' : 'Copiar Client ID'} withArrow>
                              <ActionIcon size="sm" color={copied ? 'teal' : 'gray'} onClick={copy}>
                                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </CopyButton>
                      </Group>
                    </Table.Td>
                    <Table.Td>{getStatusBadge(apiKey.status)}</Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatDate(apiKey.createdAt)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {apiKey.lastUsed ? formatDate(apiKey.lastUsed) : 'Nunca'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{apiKey.usageCount || 0}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Menu shadow="md" width={200}>
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray">
                            <IconDots size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<IconRefresh size={14} />}
                            onClick={() => {
                              // TODO: Implement regenerate secret
                              notifications.show({
                                title: 'Función no disponible',
                                message: 'La regeneración de secretos estará disponible próximamente',
                                color: 'orange'
                              })
                            }}
                          >
                            Regenerar Secret
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item
                            leftSection={<IconTrash size={14} />}
                            color="red"
                            onClick={() => {
                              setKeyToDelete(apiKey)
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
          </Card>
        )}

        {/* Usage Examples */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <Title size="1.2rem">Ejemplo de Uso</Title>
            <Text size="sm" c="dimmed">
              Una vez que tengas tu Client ID y Client Secret, puedes usar la API de oSign.eu:
            </Text>

            <Box>
              <Text size="sm" fw={500} mb="xs">1. Obtener token de acceso:</Text>
              <Text size="xs" ff="monospace" bg="gray.1" p="md" style={{ borderRadius: 4, overflow: 'auto' }}>
{`curl -X POST https://vetcontrol-pro.eu.auth0.com/oauth/token \\
  -H "Content-Type: application/json" \\
  -d '{
    "client_id": "TU_CLIENT_ID",
    "client_secret": "TU_CLIENT_SECRET",
    "audience": "https://osign.eu",
    "grant_type": "client_credentials"
  }'`}
              </Text>
            </Box>

            <Box>
              <Text size="sm" fw={500} mb="xs">2. Usar la API:</Text>
              <Text size="xs" ff="monospace" bg="gray.1" p="md" style={{ borderRadius: 4, overflow: 'auto' }}>
{`curl -X GET https://osign.eu/api/contracts \\
  -H "Authorization: Bearer TU_ACCESS_TOKEN" \\
  -H "Content-Type: application/json"`}
              </Text>
            </Box>
          </Stack>
        </Card>

        {/* Create API Key Modal */}
        <Modal
          opened={createModalOpened}
          onClose={() => {
            setCreateModalOpened(false)
            setNewKeyData({ name: '', description: '', scopes: ['read:contracts', 'write:contracts', 'read:signatures', 'write:signatures'] })
          }}
          title="Crear Nueva API Key"
          centered
          size="md"
        >
          <Stack gap="md">
            <TextInput
              label="Nombre de la API Key"
              placeholder="Mi aplicación externa"
              value={newKeyData.name}
              onChange={(event) => setNewKeyData(prev => ({ ...prev, name: event.target.value }))}
              required
            />

            <Textarea
              label="Descripción (opcional)"
              placeholder="Descripción de para qué se usará esta API Key"
              value={newKeyData.description}
              onChange={(event) => setNewKeyData(prev => ({ ...prev, description: event.target.value }))}
              rows={3}
            />

            <Alert color="blue" variant="light">
              <Text size="sm">
                <strong>Permisos incluidos:</strong> Lectura y escritura de contratos y firmas.
                Los permisos específicos se pueden ajustar posteriormente desde Auth0 Dashboard.
              </Text>
            </Alert>

            <Group justify="flex-end" gap="sm">
              <Button
                variant="subtle"
                onClick={() => {
                  setCreateModalOpened(false)
                  setNewKeyData({ name: '', description: '', scopes: ['read:contracts', 'write:contracts', 'read:signatures', 'write:signatures'] })
                }}
                disabled={creating}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreateApiKey}
                loading={creating}
                leftSection={<IconKey size={16} />}
                disabled={!newKeyData.name.trim()}
              >
                {creating ? 'Creando...' : 'Crear API Key'}
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
          title="Confirmar eliminación"
          centered
          size="md"
        >
          <Stack gap="md">
            <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
              <Text size="sm">
                Esta acción no se puede deshacer. La API Key será eliminada permanentemente y
                cualquier aplicación que la use dejará de funcionar inmediatamente.
              </Text>
            </Alert>

            {keyToDelete && (
              <Box>
                <Text size="sm" c="dimmed" mb="xs">
                  API Key a eliminar:
                </Text>
                <Text fw={600} size="md">
                  {keyToDelete.name}
                </Text>
                {keyToDelete.description && (
                  <Text size="sm" c="dimmed" mt="xs">
                    {keyToDelete.description}
                  </Text>
                )}
                <Text size="xs" c="dimmed" mt="xs">
                  Client ID: {keyToDelete.clientId}
                </Text>
              </Box>
            )}

            <Group justify="flex-end" gap="sm">
              <Button
                variant="subtle"
                onClick={() => {
                  setDeleteModalOpened(false)
                  setKeyToDelete(null)
                }}
                disabled={deleting}
              >
                Cancelar
              </Button>
              <Button
                color="red"
                onClick={handleDeleteApiKey}
                loading={deleting}
                leftSection={<IconTrash size={16} />}
              >
                {deleting ? 'Eliminando...' : 'Eliminar API Key'}
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  )
}