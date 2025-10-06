import { NextRequest, NextResponse } from 'next/server'
import { getSignatureRequestsCollection } from '@/lib/db/mongodb'
import { ObjectId } from 'mongodb'
import crypto from 'crypto'
import { getCombinedAuditTrail } from '@/lib/audit/integration'

export const runtime = 'nodejs'

// GET /api/verify-integrity/[id] - Verify document integrity (PUBLIC - no auth required)
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const signatureId = params.id

    // Validate ID format
    if (!signatureId || !ObjectId.isValid(signatureId)) {
      return NextResponse.json(
        { error: 'ID de firma inválido' },
        { status: 400 }
      )
    }

    // Get signature request from database
    const collection = await getSignatureRequestsCollection()
    const signatureRequest = await collection.findOne({
      _id: new ObjectId(signatureId),
      status: 'signed'
    })

    if (!signatureRequest) {
      return NextResponse.json(
        { error: 'Firma no encontrada o no ha sido completada' },
        { status: 404 }
      )
    }

    // Helper function for deterministic JSON stringify (sorted keys) - same as used in signature creation
    const deterministicStringify = (obj: any): string => {
      if (obj === null) return 'null'
      if (typeof obj !== 'object') return JSON.stringify(obj)
      if (Array.isArray(obj)) return '[' + obj.map(deterministicStringify).join(',') + ']'

      const keys = Object.keys(obj).sort()
      const pairs = keys.map(key => {
        const value = deterministicStringify(obj[key])
        return JSON.stringify(key) + ':' + value
      })
      return '{' + pairs.join(',') + '}'
    }

    // Recalculate hash from stored data
    let recalculatedHash = ''
    let hashVerification = {
      isValid: false,
      originalHash: '',
      recalculatedHash: '',
      message: ''
    }

    try {
      if (signatureRequest.hashData) {
        // If we have the original hash data, use it to recalculate using deterministic stringify
        recalculatedHash = crypto
          .createHash('sha256')
          .update(deterministicStringify(signatureRequest.hashData))
          .digest('hex')

        hashVerification = {
          isValid: recalculatedHash === signatureRequest.documentHash,
          originalHash: signatureRequest.documentHash || 'No disponible',
          recalculatedHash: recalculatedHash,
          message: recalculatedHash === signatureRequest.documentHash
            ? '✅ La integridad del documento está verificada. El documento no ha sido alterado.'
            : '❌ ALERTA: El hash no coincide. El documento podría haber sido alterado.'
        }
      } else {
        // Fallback for older signatures without hashData
        const contractContent = signatureRequest.contractSnapshot?.content || ''
        const dynamicFieldValues = signatureRequest.dynamicFieldValues || {}

        // Try to recreate with available data using deterministic stringify
        const fallbackHashData = {
          contractContent: contractContent,
          dynamicFieldValues: dynamicFieldValues
        }

        recalculatedHash = crypto
          .createHash('sha256')
          .update(deterministicStringify(fallbackHashData))
          .digest('hex')

        hashVerification = {
          isValid: false,
          originalHash: signatureRequest.signatureMetadata?.documentHash || 'No disponible',
          recalculatedHash: recalculatedHash,
          message: '⚠️ Verificación parcial: Esta firma se creó con una versión anterior del sistema.'
        }
      }
    } catch (error) {
      console.error('Error calculating hash:', error)
      hashVerification = {
        isValid: false,
        originalHash: signatureRequest.documentHash || signatureRequest.signatureMetadata?.documentHash || 'No disponible',
        recalculatedHash: 'Error al calcular',
        message: '❌ Error al verificar la integridad del documento'
      }
    }

    // Verify audit trail integrity - Use combined audit trail (new + old system)
    let auditIntegrity = {
      isSealed: false,
      sealedAt: null,
      recordsCount: 0,
      message: '',
      events: [] as any[]
    }

    try {
      // Determine which audit trail to use (check multiple locations)
      let auditTrailToUse = signatureRequest.auditTrail

      // Priority 1: Check if using auditRecords field (newest format)
      if (signatureRequest.auditRecords && Array.isArray(signatureRequest.auditRecords)) {
        auditTrailToUse = signatureRequest.auditRecords
      }
      // Priority 2: Check if audit trail is in metadata (newer signatures)
      else if (signatureRequest.metadata?.auditTrail?.trail?.records) {
        auditTrailToUse = signatureRequest.metadata.auditTrail
      }

      // Get combined audit trail from both new and old audit systems
      const combinedTrail = await getCombinedAuditTrail({
        signRequestId: signatureRequest._id.toString(),
        contractId: signatureRequest.contractId,
        oldAuditTrail: auditTrailToUse,
        accessLogs: signatureRequest.accessLogs
      })

      // Format events for display
      const formattedEvents = combinedTrail.map((record: any) => ({
        timestamp: record.timestamp,
        action: record.action,
        actor: record.actor || 'Sistema',
        details: record.details || {},
        ipAddress: record.ipAddress || 'No disponible',
        userAgent: record.userAgent || 'No disponible'
      }))

      auditIntegrity = {
        isSealed: signatureRequest.auditSealedAt ? true : false,
        sealedAt: signatureRequest.auditSealedAt,
        recordsCount: formattedEvents.length,
        message: signatureRequest.auditSealedAt
          ? '✅ La auditoría está sellada y es inmutable'
          : '⚠️ La auditoría no está sellada',
        events: formattedEvents
      }
    } catch (error) {
      console.error('Error getting combined audit trail, using fallback:', error)

      // Fallback: Combine audit trail and access logs from old system
      let allAuditRecords = []

      // First, add access logs if they exist
      if (signatureRequest.accessLogs && Array.isArray(signatureRequest.accessLogs)) {
        allAuditRecords = [...signatureRequest.accessLogs]
      }

      if (signatureRequest.auditTrail) {
        // Handle both new format (with .trail.records) and old format (direct array)
        let auditRecords = []

        if (signatureRequest.auditTrail.trail?.records) {
          // New format from auditTrailService
          auditRecords = signatureRequest.auditTrail.trail.records
        } else if (signatureRequest.auditTrail.records) {
          // New format with direct records array
          auditRecords = signatureRequest.auditTrail.records
        } else if (Array.isArray(signatureRequest.auditTrail)) {
          // Legacy format - direct array of events
          auditRecords = signatureRequest.auditTrail
        }

        // Combine with access logs
        allAuditRecords = [...allAuditRecords, ...auditRecords]

        // Format events for display
        const formattedEvents = allAuditRecords.map((record: any) => {
          // Handle both new structured format and legacy format
          if (record.action && record.timestamp) {
            return {
              timestamp: record.timestamp,
              action: record.action,
              actor: record.actor?.identifier || record.ipAddress || 'Sistema',
              details: record.details || {},
              ipAddress: record.metadata?.ipAddress || record.ipAddress || 'No disponible',
              userAgent: record.metadata?.userAgent || record.userAgent || 'No disponible'
            }
          }
          // Legacy format compatibility
          return {
            timestamp: record.timestamp || new Date(),
            action: record.action || 'evento_registrado',
            actor: record.ipAddress || 'Sistema',
            details: record.details || record,
            ipAddress: record.ipAddress || 'No disponible',
            userAgent: record.userAgent || 'No disponible'
          }
        })

        auditIntegrity = {
          isSealed: signatureRequest.auditSealedAt ? true : false,
          sealedAt: signatureRequest.auditSealedAt,
          recordsCount: allAuditRecords.length,
          message: signatureRequest.auditSealedAt
            ? '✅ La auditoría está sellada y es inmutable'
            : '⚠️ La auditoría no está sellada',
          events: formattedEvents
        }
      }
    }

    // Compile complete integrity report
    const integrityReport = {
      signatureId: signatureRequest._id.toString(),
      status: 'verified',
      timestamp: new Date().toISOString(),
      
      // Document Information
      document: {
        name: signatureRequest.contractSnapshot?.name || 'Contrato',
        id: signatureRequest.contractId,
        signedAt: signatureRequest.signedAt,
        hasSnapshot: !!signatureRequest.contractSnapshot,
        snapshotIntegrity: signatureRequest.contractSnapshot ? 'preserved' : 'not_available'
      },
      
      // Hash Verification
      hashVerification: hashVerification,
      
      // Signer Information
      signer: {
        name: signatureRequest.signerInfo?.clientName || signatureRequest.signerInfo?.name || 'No disponible',
        taxId: signatureRequest.signerInfo?.clientTaxId || signatureRequest.signerInfo?.taxId || 'No disponible',
        email: signatureRequest.signerInfo?.clientEmail || signatureRequest.signerInfo?.email || signatureRequest.signerEmail || 'No disponible',
        method: signatureRequest.signerInfo?.method || signatureRequest.signatureMethod || 'ELECTRONIC',
        ipAddress: signatureRequest.signatureMetadata?.ipAddress || 'No disponible',
        userAgent: signatureRequest.signatureMetadata?.userAgent || 'No disponible'
      },
      
      // Audit Trail
      auditTrail: auditIntegrity,
      
      // Dynamic Fields (what was filled in the form)
      dynamicFields: signatureRequest.dynamicFieldValues || {},
      
      // Overall Integrity Assessment
      overallIntegrity: {
        score: calculateIntegrityScore(hashVerification.isValid, auditIntegrity.isSealed, !!signatureRequest.contractSnapshot),
        level: getIntegrityLevel(hashVerification.isValid, auditIntegrity.isSealed),
        isValid: hashVerification.isValid && auditIntegrity.isSealed,
        recommendations: getRecommendations(hashVerification.isValid, auditIntegrity.isSealed, signatureRequest)
      },
      
      // Legal Compliance
      compliance: {
        eidas: true,
        article: '25',
        level: 'SES - Simple Electronic Signature',
        validity: 'Esta firma tiene validez legal según el Reglamento eIDAS (UE) 910/2014'
      }
    }

    return NextResponse.json(integrityReport)

  } catch (error) {
    console.error('Error verifying integrity:', error)
    return NextResponse.json(
      { error: 'Error al verificar la integridad' },
      { status: 500 }
    )
  }
}

// Helper functions
function calculateIntegrityScore(hashValid: boolean, auditSealed: boolean, hasSnapshot: boolean): number {
  let score = 0
  if (hashValid) score += 40
  if (auditSealed) score += 30
  if (hasSnapshot) score += 30
  return score
}

function getIntegrityLevel(hashValid: boolean, auditSealed: boolean): string {
  if (hashValid && auditSealed) return 'HIGH'
  if (hashValid || auditSealed) return 'MEDIUM'
  return 'LOW'
}

function getRecommendations(hashValid: boolean, auditSealed: boolean, signatureRequest: any): string[] {
  const recommendations = []
  
  if (!hashValid) {
    recommendations.push('⚠️ El hash del documento no coincide. Investigue posibles alteraciones.')
  }
  
  if (!auditSealed) {
    recommendations.push('⚠️ La auditoría no está sellada. El rastro de auditoría podría ser modificado.')
  }
  
  if (!signatureRequest.contractSnapshot) {
    recommendations.push('⚠️ No hay snapshot del contrato. Use versiones más recientes del sistema.')
  }
  
  if (recommendations.length === 0) {
    recommendations.push('✅ El documento mantiene su integridad completa.')
    recommendations.push('✅ Todos los controles de seguridad están activos.')
  }
  
  return recommendations
}