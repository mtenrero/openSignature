'use client'

import { useState } from 'react'
import type { SignatureRow } from '../../lib/signatures/listModel'

export interface WizardState {
  contractId: string
  method: 'email' | 'sms'
  prefill: { values: { [k: string]: string }; lockedFields: string[]; signatureRequestId?: string }
}

/**
 * "Solicitar por Email/SMS" on an existing request: seeds the wizard from the ORIGINAL request so the NIF,
 * identity and custom fields carry over. Existing recipient => PATCH resend; otherwise a new POST.
 * (Moved verbatim from the old list page; S3 replaces it.)
 */
export function useRequestAgain() {
  const [wizard, setWizard] = useState<WizardState | null>(null)

  const open = async (firma: SignatureRow, method: 'email' | 'sms') => {
    const values: { [k: string]: string } = {}
    try {
      const reqResp = await fetch(`/api/signature-requests/${firma.id}`)
      if (reqResp.ok) {
        const original = (await reqResp.json())?.request?.dynamicFieldValues
        if (original && typeof original === 'object') {
          Object.entries(original).forEach(([k, v]) => {
            if (v !== null && v !== undefined) values[k] = String(v)
          })
        }
      }
    } catch (seedErr) {
      console.warn('Could not seed dynamic values from original request:', seedErr)
    }
    const name = firma.signerName || firma.clientName
    if (name) values.clientName = name
    const recipient = method === 'email' ? firma.signerEmail : firma.signerPhone
    if (recipient) values[method === 'email' ? 'clientEmail' : 'clientPhone'] = recipient
    const canResend = !!recipient
    setWizard({
      contractId: firma.contractId as string,
      method,
      prefill: {
        values,
        lockedFields: canResend ? Object.keys(values).filter((k) => values[k]) : [],
        signatureRequestId: canResend ? firma.id : undefined,
      },
    })
  }

  return { wizard, open, close: () => setWizard(null) }
}
