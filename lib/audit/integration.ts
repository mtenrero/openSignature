/**
 * Integración entre el sistema antiguo de auditoría y el nuevo
 * Migra gradualmente del auditTrailService al nuevo sistema
 */

import { auditTrailService } from '@/lib/auditTrail'
import { logAuditEvent, getAuditSummary } from './service'
import type { AuditEventType } from './types'

/**
 * Mapeo de acciones del sistema antiguo al nuevo
 */
const ACTION_MAPPING: Record<string, AuditEventType> = {
  'solicitud_creada': 'request.created',
  'solicitud_enviada': 'request.sent',
  'documento_accedido': 'request.accessed',
  'documento_visualizado': 'document.viewed',
  'firma_iniciada': 'signature.started',
  'campos_completados': 'signature.fields_filled',
  'firma_completada': 'signature.completed',
  'firma_sellada': 'signature.sealed',
  'pdf_descargado': 'pdf.downloaded',
  'pdf_verificado': 'pdf.verified',
  'certificado_descargado': 'certificate.downloaded',
  'notificacion_enviada': 'notification.sent',
  'notificacion_fallida': 'notification.failed'
}

/**
 * Migra eventos del sistema antiguo al nuevo
 */
export async function migrateOldAuditTrail(params: {
  signRequestId: string
  contractId: string
  oldAuditTrail: any
}) {
  if (!params.oldAuditTrail?.trail?.records) {
    return
  }

  const { signRequestId, contractId, oldAuditTrail } = params

  // Migrar cada registro del sistema antiguo
  for (const record of oldAuditTrail.trail.records) {
    const eventType = ACTION_MAPPING[record.action] || 'request.accessed'

    try {
      await logAuditEvent({
        signRequestId,
        contractId,
        eventType,
        userId: record.actor?.id,
        metadata: {
          ...record.details,
          // Preservar metadata del sistema antiguo
          _migrated: true,
          _originalAction: record.action
        }
      })
    } catch (error) {
      console.error(`Failed to migrate audit record: ${record.action}`, error)
    }
  }
}

/**
 * Obtiene el audit trail combinado (antiguo + nuevo)
 * Prioritiza el nuevo sistema si existe
 */
export async function getCombinedAuditTrail(params: {
  signRequestId: string
  contractId?: string
  oldAuditTrail?: any
}): Promise<any[]> {
  const { signRequestId, oldAuditTrail } = params

  // Intentar obtener del nuevo sistema primero
  try {
    const summary = await getAuditSummary(signRequestId)

    // Convertir el summary a formato compatible con la UI
    const events: any[] = []

    // 1. Creación
    if (summary.created) {
      events.push({
        action: 'solicitud_creada',
        timestamp: summary.created.timestamp,
        details: {
          createdBy: summary.created.by,
          ...summary.created.defaultData
        }
      })
    }

    // 2. Envío
    if (summary.sent) {
      events.push({
        action: 'solicitud_enviada',
        timestamp: summary.sent.timestamp,
        details: {
          channel: summary.sent.channel,
          recipient: summary.sent.recipient,
          attempts: summary.sent.attempts
        }
      })
    }

    // 3. Reenvíos
    summary.resends.forEach((resend, index) => {
      events.push({
        action: 'solicitud_reenviada',
        timestamp: resend.timestamp,
        details: {
          channel: resend.channel,
          recipient: resend.recipient,
          reason: resend.reason,
          attemptNumber: index + 2
        }
      })
    })

    // 4. Accesos
    summary.accesses.forEach((access, index) => {
      events.push({
        action: 'documento_accedido',
        timestamp: access.timestamp,
        ipAddress: access.ip,
        details: {
          accessNumber: index + 1,
          location: access.location ?
            `${access.location.city || ''}, ${access.location.country || ''}`.trim() :
            undefined,
          userAgent: access.userAgent
        }
      })
    })

    // 5. Firma
    if (summary.signature) {
      if (summary.signature.startedAt) {
        events.push({
          action: 'firma_iniciada',
          timestamp: summary.signature.startedAt,
          ipAddress: summary.signature.ip,
          details: {
            location: summary.signature.location ?
              `${summary.signature.location.city || ''}, ${summary.signature.location.country || ''}`.trim() :
              undefined
          }
        })
      }

      if (summary.signature.fieldsData) {
        events.push({
          action: 'campos_completados',
          timestamp: summary.signature.completedAt,
          ipAddress: summary.signature.ip,
          details: summary.signature.fieldsData
        })
      }

      events.push({
        action: 'firma_completada',
        timestamp: summary.signature.completedAt,
        ipAddress: summary.signature.ip,
        details: {
          method: summary.signature.signatureMethod,
          location: summary.signature.location ?
            `${summary.signature.location.city || ''}, ${summary.signature.location.country || ''}`.trim() :
            undefined
        }
      })
    }

    // 6. Sellado
    if (summary.sealed) {
      events.push({
        action: 'firma_sellada',
        timestamp: summary.sealed.timestamp,
        ipAddress: summary.sealed.ip,
        details: {
          sealHash: summary.sealed.hash
        }
      })
    }

    // 7. Descargas
    summary.downloads.forEach((download, index) => {
      events.push({
        action: 'pdf_descargado',
        timestamp: download.timestamp,
        ipAddress: download.ip,
        details: {
          downloadNumber: index + 1,
          format: download.format,
          location: download.location ?
            `${download.location.city || ''}, ${download.location.country || ''}`.trim() :
            undefined
        }
      })
    })

    // 8. Verificaciones
    summary.verifications.forEach((verification, index) => {
      events.push({
        action: 'pdf_verificado',
        timestamp: verification.timestamp,
        ipAddress: verification.ip,
        details: {
          verificationNumber: index + 1,
          result: verification.result
        }
      })
    })

    // Ordenar por timestamp
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    return events

  } catch (error) {
    console.log('New audit system not available, falling back to old system:', error)

    // Fallback al sistema antiguo
    if (oldAuditTrail?.trail?.records) {
      return oldAuditTrail.trail.records.map((record: any) => ({
        action: record.action,
        timestamp: record.timestamp,
        ipAddress: record.metadata?.ipAddress,
        userAgent: record.metadata?.userAgent,
        details: record.details
      }))
    }

    return []
  }
}

/**
 * Hook para registrar eventos en AMBOS sistemas durante la migración
 */
export async function logDualAudit(params: {
  signRequestId: string
  contractId: string
  oldAction: string
  newEventType: AuditEventType
  request?: Request
  metadata?: any
  userId?: string
}) {
  const { signRequestId, contractId, oldAction, newEventType, request, metadata, userId } = params

  // 1. Registrar en sistema antiguo (auditTrailService)
  try {
    auditTrailService.addAuditRecord({
      resourceId: contractId,
      action: oldAction,
      actor: {
        id: userId || 'anonymous',
        type: 'user',
        identifier: metadata?.ipAddress || 'unknown'
      },
      resource: {
        type: 'document',
        id: contractId,
        name: metadata?.documentName || 'Documento'
      },
      details: metadata || {},
      metadata: {
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
        session: signRequestId
      }
    })
  } catch (error) {
    console.error('Error logging to old audit system:', error)
  }

  // 2. Registrar en sistema nuevo
  try {
    await logAuditEvent({
      signRequestId,
      contractId,
      eventType: newEventType,
      request,
      userId,
      metadata
    })
  } catch (error) {
    console.error('Error logging to new audit system:', error)
  }
}
