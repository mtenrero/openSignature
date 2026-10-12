'use client'

import React, { useState, useEffect } from 'react'
import { Container, Text, Button, Stack, Group, Badge, Alert, Code, CopyButton, TextInput } from '@mantine/core'
import { IconKey, IconPlus, IconCopy, IconTrash, IconCheck, IconAlertTriangle } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { PageHeader, Section, AdaptiveSheet, ConfirmSheet, ResponsiveTable, EmptyState, ListSkeleton, StickyActionBar } from '../../../components/ui'

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

  const header = <PageHeader title="API Keys" subtitle="Acceso programático a tu cuenta" back="/more" />

  if (status === 'loading' || loading) {
    return (
      <Container size="md" px="md" data-testid="page-content">
        {header}
        <ListSkeleton rows={3} />
      </Container>
    )
  }

  if (status === 'unauthenticated') {
    return null // Will redirect
  }

  const closeCreate = () => {
    setCreateModalOpened(false)
    setNewKeyName('')
  }

  const deleteBtn = (key: ApiKey) => (
    <Button
      variant="light"
      color="red"
      size="sm"
      leftSection={<IconTrash size={16} />}
      aria-label={`Eliminar API Key ${key.name}`}
      onClick={() => {
        setKeyToDelete(key)
        setDeleteModalOpened(true)
      }}
    >
      Eliminar
    </Button>
  )

  return (
    <Container size="md" px="md" pb="xl" data-testid="page-content">
      {header}
      <Stack gap="xl" mt="md">
        <Alert color="blue" variant="light" icon={<IconKey size={16} />} title="¿Qué son las API Keys?">
          <Stack gap="xs">
            <Text size="sm">Te permiten acceder a la API de oSign.eu desde tus aplicaciones, scripts o integraciones.</Text>
            <Text size="sm">
              • <strong>Permanentes:</strong> no expiran automáticamente<br />
              • <strong>Seguras:</strong> puedes revocarlas en cualquier momento<br />
              • <strong>Simples:</strong> usa la cabecera
            </Text>
            <pre className="os-codeblock" tabIndex={0} aria-label="Cabecera de autorización">Authorization: Bearer TU_API_KEY</pre>
          </Stack>
        </Alert>

        {newlyCreatedKey && (
          <Alert color="green" variant="light" icon={<IconCheck size={16} />} title={`API Key «${newlyCreatedKey.name}» creada`} data-testid="new-key">
            <Stack gap="md">
              <Text size="sm" fw={600}>Guarda esta clave ahora: no se volverá a mostrar por seguridad.</Text>
              <div>
                <Text size="sm" fw={500} mb={4}>Tu API Key</Text>
                <pre className="os-codeblock" tabIndex={0} aria-label="Tu API Key">{newlyCreatedKey.apiKey}</pre>
              </div>
              <CopyButton value={newlyCreatedKey.apiKey}>
                {({ copied, copy }) => (
                  <Button fullWidth color={copied ? 'teal' : undefined} leftSection={copied ? <IconCheck size={18} /> : <IconCopy size={18} />} onClick={copy}>
                    {copied ? 'Copiada' : 'Copiar clave'}
                  </Button>
                )}
              </CopyButton>
              <div>
                <Text size="sm" fw={500} mb={4}>Ejemplo de uso</Text>
                <pre className="os-codeblock" tabIndex={0} aria-label="Ejemplo con curl">{`curl -H "Authorization: Bearer ${newlyCreatedKey.apiKey}" \\
  https://osign.eu/api/contracts`}</pre>
              </div>
              <Button variant="light" fullWidth onClick={() => setNewlyCreatedKey(null)}>Entendido, cerrar</Button>
            </Stack>
          </Alert>
        )}

        <Section title="Tus claves">
          <ResponsiveTable
            testId="api-keys"
            rows={apiKeys}
            rowKey={(k) => k.id}
            caption="API Keys"
            empty={
              <EmptyState
                icon={<IconKey size={32} />}
                title="No tienes API Keys todavía"
                description="Crea una API Key para empezar a usar la API."
                action={<Button leftSection={<IconPlus size={16} />} onClick={() => setCreateModalOpened(true)}>Crear primera API Key</Button>}
              />
            }
            columns={[
              { key: 'name', header: 'Nombre', render: (k) => <Text fw={500}>{k.name}</Text> },
              { key: 'key', header: 'API Key', render: (k) => <Code>{k.keyPreview}</Code> },
              { key: 'created', header: 'Creada', render: (k) => <Text size="sm" c="dimmed">{formatDate(k.createdAt)}</Text> },
              { key: 'used', header: 'Último uso', render: (k) => (k.lastUsedAt ? <Text size="sm" c="dimmed">{formatDate(k.lastUsedAt)}</Text> : <Badge size="sm" color="gray" variant="light">Nunca usada</Badge>) },
              { key: 'actions', header: '', srLabel: 'Acciones', render: deleteBtn },
            ]}
            mobileRender={(k) => (
              <Stack gap={6}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Text fw={600} style={{ minWidth: 0 }}>{k.name}</Text>
                  {k.lastUsedAt ? null : <Badge size="sm" color="gray" variant="light">Nunca usada</Badge>}
                </Group>
                <div className="os-scroll-x"><Code>{k.keyPreview}</Code></div>
                <Text size="sm" c="dimmed">Creada {formatDate(k.createdAt)}{k.lastUsedAt ? ` · Último uso ${formatDate(k.lastUsedAt)}` : ''}</Text>
                <div>{deleteBtn(k)}</div>
              </Stack>
            )}
          />
        </Section>
      </Stack>

      <StickyActionBar aboveTabBar>
        <Button fullWidth leftSection={<IconPlus size={18} />} onClick={() => setCreateModalOpened(true)}>
          Nueva API Key
        </Button>
      </StickyActionBar>

      <AdaptiveSheet
        opened={createModalOpened}
        onClose={closeCreate}
        title="Crear nueva API Key"
        footer={
          <Group grow>
            <Button variant="default" onClick={closeCreate}>Cancelar</Button>
            <Button onClick={handleCreateApiKey} loading={creating} leftSection={<IconPlus size={16} />}>Crear API Key</Button>
          </Group>
        }
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
            <Text size="sm">La API Key se mostrará <strong>una sola vez</strong> después de crearla. Cópiala y guárdala en un lugar seguro.</Text>
          </Alert>
        </Stack>
      </AdaptiveSheet>

      <ConfirmSheet
        opened={deleteModalOpened}
        onClose={() => {
          setDeleteModalOpened(false)
          setKeyToDelete(null)
        }}
        title="Eliminar API Key"
        message={
          <>
            ¿Seguro que quieres eliminar la API Key <strong>«{keyToDelete?.name}»</strong>? Esta acción no se puede deshacer y cualquier aplicación que use esta clave dejará de funcionar.
          </>
        }
        confirmLabel="Eliminar"
        destructive
        loading={deleting}
        onConfirm={handleDeleteApiKey}
      />
    </Container>
  )
}
