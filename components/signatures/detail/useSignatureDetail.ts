'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [tick, setTick] = useState(0)
  const silent = useRef(false)
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
    const loadContract = async (data: any) => {
      try {
        const contractResponse = await fetch(`/api/contracts/${data.contractId}`)
        if (contractResponse.ok) {
          const body = await contractResponse.json()
          const c = body.contract ?? body // GET /api/contracts/:id returns the contract itself
          data.contractName = c?.name || data.contractName
          data.contractContent = c?.content
        }
      } catch {
        /* the contract section simply stays empty */
      }
    }
    const fromList = async () => {
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
      return data
    }
    const run = async () => {
      try {
        if (!silent.current) setLoading(true)
        silent.current = false
        // Fast path: GET /api/signature-requests/{id} renders the screen without waiting for the (up to 100
        // row, audit-trail-merging) list. The list then upgrades the details with the combined audit trail.
        let fast: any = null
        try {
          const r = await fetch(`/api/signature-requests/${id}`)
          if (r.ok) {
            const req = (await r.json())?.request
            if (req && String(req.id) === id) fast = { ...req, id, type: 'request', contractName: req.contractSnapshot?.name || req.contractName || 'Contrato' }
          }
        } catch {
          /* fall back to the list below */
        }
        if (fast) {
          await loadContract(fast)
          if (cancelled) return
          setDetails(fast)
          setLoading(false)
          fromList()
            .then((full) => {
              if (cancelled || !full) return
              return loadContract(full).then(() => {
                if (!cancelled) setDetails((cur) => ({ ...(cur ?? {}), ...full, contractContent: full.contractContent ?? cur?.contractContent }))
              })
            })
            .catch(() => {})
          return
        }
        const data = await fromList()
        if (!data) {
          if (!cancelled) setError('Solicitud de firma no encontrada')
          return
        }
        await loadContract(data)
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
  }, [id, userId, customerId, sessionStatus, tick])

  /** Merge fields optimistically, then re-read the request without showing the skeleton. */
  const update = useCallback((patch?: Record<string, any>) => {
    if (patch) setDetails((cur) => (cur ? { ...cur, ...patch } : cur))
    silent.current = true
    setTick((t) => t + 1)
  }, [])

  return { details, loading: loading || sessionStatus === 'loading', error, update }
}
