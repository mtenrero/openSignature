'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

export interface SignatureDetails {
  id: string
  type: 'signature' | 'request'
  contractId: string
  contractName: string
  contractContent?: string
  signerName?: string
  signerEmail?: string
  signerPhone?: string
  clientName?: string
  clientTaxId?: string
  signatureType?: string
  status: string
  signedAt?: string
  createdAt: string
  expiresAt?: string
  signatureUrl?: string
  shortId?: string
  accessKey?: string
  emailTracking?: { emailsSent?: number }
  [k: string]: any
}

/** Same endpoints as before: the (full) request list, then the (full) signatures list, then the contract. */
export function useSignatureDetail(id: string) {
  const { data: session, status: sessionStatus } = useSession()
  const [details, setDetails] = useState<SignatureDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const userId = session?.user?.id
  const customerId = (session as any)?.customerId

  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (!userId) {
      setError('Usuario no autenticado')
      setLoading(false)
      return
    }
    if (!customerId) {
      setError('Customer ID no encontrado en la sesión')
      setLoading(false)
      return
    }
    if (!id) return

    let cancelled = false
    const run = async () => {
      try {
        setLoading(true)
        let data: any = null
        const requestResponse = await fetch(`/api/signature-requests?full=true`)
        if (requestResponse.ok) {
          data = (await requestResponse.json()).requests?.find((r: any) => r.id === id)
          if (data) data.type = 'request'
        }
        if (!data) {
          const sigResponse = await fetch(`/api/signatures?full=true`)
          if (sigResponse.ok) {
            data = (await sigResponse.json()).signatures?.find((s: any) => s.id === id)
            if (data) data.type = 'signature'
          }
        }
        if (!data) {
          if (!cancelled) setError('Solicitud de firma no encontrada')
          return
        }
        const contractResponse = await fetch(`/api/contracts/${data.contractId}`)
        if (contractResponse.ok) {
          const body = await contractResponse.json()
          const c = body.contract ?? body // GET /api/contracts/:id returns the contract itself
          data.contractName = c?.name || data.contractName
          data.contractContent = c?.content
        }
        if (!cancelled) setDetails(data)
      } catch (err) {
        console.error('Error fetching signature details:', err)
        if (!cancelled) setError('Error al cargar los detalles')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [id, userId, customerId, sessionStatus])

  return { details, loading: loading || sessionStatus === 'loading', error }
}
