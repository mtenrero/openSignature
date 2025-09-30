import { auth } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import ClientSwagger from './ClientSwagger'

export default async function ApiDocsPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/login')
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginBottom: 16 }}>OpenSignature API</h1>
      <p style={{ marginBottom: 8 }}>
        Autenticación: sesión de usuario o API Key mediante cabecera Authorization Bearer.
      </p>
      <ClientSwagger url="/api/openapi" />

      <section style={{ marginTop: 32 }}>
        <h2>Guías rápidas</h2>
        <ol style={{ lineHeight: 1.8 }}>
          <li>
            Crear contrato: POST <code>/api/contracts</code> con <code>{'{ name, content }'}</code>
          </li>
          <li>
            Solicitar firma: POST <code>/api/signature-requests</code> con <code>{'{ contractId, signatureType, signerEmail|signerPhone }'}</code>
          </li>
          <li>
            Enviar al firmante el <code>signatureUrl</code> devuelto
          </li>
          <li>
            Ver estado: GET <code>/api/signature-requests?contractId=...</code>
          </li>
          <li>
            Descargar PDF firmado: GET público <code>/api/sign-requests/{'{shortId}'}/pdf?a={'{accessKey}'}</code>
          </li>
        </ol>
      </section>
    </div>
  )
}


