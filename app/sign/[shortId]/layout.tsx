'use client'

import React, { useEffect, useState, createContext, useContext, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Container, Center, Stack, Title, Text, Loader, Alert } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'

// Create context for sign data
export const SignDataContext = createContext<{
  signData: any
  shortId: string
  accessKey: string
} | null>(null)

export const useSignData = () => {
  const context = useContext(SignDataContext)
  if (!context) {
    throw new Error('useSignData must be used within SignDataContext.Provider')
  }
  return context
}

interface SignLayoutProps {
  children: React.ReactNode
}

function SignLayoutContent({ children }: SignLayoutProps) {
  const params = useParams()
  const searchParams = useSearchParams()
  const [signData, setSignData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  const shortId = params.shortId as string
  const accessKey = searchParams.get('a')

  useEffect(() => {
    const validateAndLoadSignRequest = async () => {
      if (!shortId) {
        setError('ID de solicitud no válido')
        setLoading(false)
        return
      }

      if (!accessKey) {
        setError('Código de acceso requerido')
        setLoading(false)
        return
      }

      try {
        const response = await fetch(`/api/sign-requests/${shortId}?a=${accessKey}`)
        
        if (!response.ok) {
          const errorData = await response.json()
          setError(errorData.error || 'Error al cargar la solicitud de firma')
          setLoading(false)
          return
        }

        const data = await response.json()
        console.log('[DEBUG] Frontend received data:', data)
        console.log('[DEBUG] data.authorized:', data.authorized)
        setSignData(data)
        console.log('[DEBUG] Setting loading to false')
        setLoading(false)
        
      } catch (err) {
        console.error('Error loading sign request:', err)
        setError('Error de conexión. Por favor, verifica tu conexión a internet.')
      } finally {
        setLoading(false)
      }
    }

    validateAndLoadSignRequest()
  }, [shortId, accessKey])

  if (loading) {
    return (
      <Container size="sm" py="xl">
        <Center>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Title size="1.2rem">
              Cargando solicitud de firma...
            </Title>
            <Text ta="center" c="dimmed">
              Por favor espera mientras validamos tu solicitud
            </Text>
          </Stack>
        </Center>
      </Container>
    )
  }

  console.log('[DEBUG] Checking authorization:', { error, signData: signData, authorized: signData?.authorized })
  
  if (error || !signData?.authorized) {
    return (
      <Container size="sm" py="xl">
        <Center>
          <Stack align="center" gap="md" ta="center">
            <IconAlertTriangle size={48} color="var(--mantine-color-red-6)" />
            <Title size="1.5rem" c="red">
              Acceso no autorizado
            </Title>
            <Text c="dimmed" maw={400}>
              {error || 'No tienes permisos para acceder a esta solicitud de firma.'}
            </Text>
            <Text size="xs" c="dimmed" mt="md">
              Si crees que esto es un error, verifica que el enlace sea correcto y que no haya expirado.
            </Text>
          </Stack>
        </Center>
      </Container>
    )
  }

  // Provide the sign data through context
  return (
    <SignDataContext.Provider value={{ signData, shortId, accessKey }}>
      {children}
    </SignDataContext.Provider>
  )
}

export default function SignLayout({ children }: SignLayoutProps) {
  return (
    <Suspense fallback={
      <Container>
        <Center style={{ minHeight: '100vh' }}>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Title size="1.5rem">
              Cargando firma...
            </Title>
          </Stack>
        </Center>
      </Container>
    }>
      <SignLayoutContent>{children}</SignLayoutContent>
    </Suspense>
  )
}