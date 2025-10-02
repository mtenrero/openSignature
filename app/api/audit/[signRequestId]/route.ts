import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import {
  getAuditTrail,
  getAuditSummary,
  verifyAuditIntegrity
} from '@/lib/audit/service'

export const runtime = 'nodejs'

/**
 * GET /api/audit/[signRequestId]
 * Obtiene el audit trail completo de una solicitud de firma
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ signRequestId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const params = await context.params
    const { signRequestId } = params
    const url = new URL(request.url)
    const format = url.searchParams.get('format') || 'summary'

    // Verificar que el usuario tiene acceso a esta solicitud
    // TODO: Implementar verificación de ownership

    if (format === 'full') {
      // Audit trail completo
      const trail = await getAuditTrail(signRequestId)
      return NextResponse.json(trail)
    }

    if (format === 'summary') {
      // Resumen estructurado
      const summary = await getAuditSummary(signRequestId)
      return NextResponse.json(summary)
    }

    if (format === 'verify') {
      // Verificar integridad
      const verification = await verifyAuditIntegrity(signRequestId)
      return NextResponse.json(verification)
    }

    return NextResponse.json(
      { error: 'Invalid format. Use: summary, full, or verify' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error getting audit trail:', error)

    if (error instanceof Error && error.message === 'No audit trail found') {
      return NextResponse.json(
        { error: 'Audit trail not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
