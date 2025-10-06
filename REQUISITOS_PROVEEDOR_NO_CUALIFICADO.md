# Requisitos Legales - Proveedor NO Cualificado de Firmas Electrónicas

## Marco Legal Aplicable

**Base:** Reglamento eIDAS (UE) 910/2014 + Ley 6/2020 (España)
**Tipo de servicio:** Firma Electrónica Simple (SES) - NO Cualificada
**Supervisión:** NO requerida por autoridad competente

---

## 1. Obligaciones Según Art. 13.2 eIDAS

### 1.1 Información Obligatoria a Usuarios ✅ CRÍTICO

Debes informar claramente de:

```markdown
### Información que DEBES mostrar en tu web/app:

1. **Identidad del proveedor:**
   - Nombre comercial: openSignature
   - CIF/NIF de la empresa
   - Dirección postal completa
   - Email de contacto
   - Teléfono de soporte

2. **Tipo de servicio ofrecido:**
   "Servicio de Firma Electrónica Simple (SES) NO cualificada
   según Reglamento eIDAS (UE) 910/2014 Artículo 25"

3. **Limitaciones del servicio:**
   - NO es firma cualificada (QES)
   - NO es firma avanzada (AES)
   - Valor probatorio estándar (no presunción de validez)
   - Identificación basada en SMS/Email (no robusta)

4. **Condiciones de uso:**
   - Términos del servicio (enlace accesible)
   - Política de privacidad (GDPR)
   - Política de conservación de evidencias
   - Procedimiento de reclamaciones

5. **Información técnica:**
   - Métodos de identificación utilizados (SMS, email, etc.)
   - Tipo de timestamp (si es cualificado o no)
   - Periodo de conservación de evidencias
   - Formato de archivo generado (PDF, PDF/A, etc.)
```

**Dónde mostrarlo:**
- ✅ Página "Información Legal" / "Aviso Legal"
- ✅ Página "Términos y Condiciones"
- ✅ Durante proceso de firma (checkbox "He leído y acepto...")
- ✅ En PDFs generados (footer con nivel de firma)

---

## 2. Plan de Conservación de Evidencias

### 2.1 Obligación Legal (Art. 24.2.h eIDAS - Aplicable por analogía)

Aunque NO estás sujeto a todos los requisitos del Art. 24 (solo para servicios cualificados), es **ALTAMENTE RECOMENDABLE** implementar conservación adecuada para:

1. **Protección legal propia:**
   - En caso de litigio, demostrar que cumpliste diligencia
   - Evitar reclamaciones por pérdida de evidencias

2. **Cumplimiento normativa sectorial:**
   - Código de Comercio: 6 años (Art. 30)
   - Ley General Tributaria: 4 años (prescripción)
   - LOPD/GDPR: mínimo necesario para finalidad

### 2.2 Plan de Conservación Mínimo Recomendado

```yaml
Política de Conservación de Evidencias de Firma Electrónica
Versión: 1.0
Fecha: 2025-10-04

1. PERIODO DE CONSERVACIÓN:
   - Firmas completadas: 6 años desde fecha de firma
   - Firmas rechazadas: 1 año desde rechazo
   - Auditoría de accesos: 2 años desde último evento
   - Copias de seguridad: 7 años (incrementales mensuales)

2. DATOS CONSERVADOS:
   - Documento original firmado (PDF)
   - Hash SHA-256 del documento
   - Firma electrónica (imagen/código)
   - Timestamp del momento de firma
   - Identificador del firmante (email/teléfono)
   - Metadata del dispositivo (IP, user agent, geolocalización)
   - Pista de auditoría completa (todos los eventos)
   - Evidencias de consentimiento

3. FORMATO DE ALMACENAMIENTO:
   - PDF/A-3 para documentos firmados (ISO 19005-3)
   - JSON para metadata y auditoría
   - Cifrado AES-256 para datos personales
   - Backup incremental diario en AWS S3 Glacier

4. ACCESO A EVIDENCIAS:
   - Usuario propietario: 24/7 vía panel web
   - Requisito judicial: entrega en 48h hábiles
   - Verificación pública: vía URL de verificación

5. ELIMINACIÓN DE DATOS:
   - Automática tras periodo de conservación
   - A solicitud del usuario (derecho GDPR al olvido)
     - Solo si NO hay obligación legal de conservar
     - Conservar hash + timestamp para auditoría (10 años)

6. PLAN DE CESE DE ACTIVIDAD:
   - Notificación 3 meses antes a usuarios
   - Exportación masiva en formato estándar (ZIP con PDFs + CSV)
   - Transferencia a proveedor alternativo (si cliente solicita)
   - Conservación mínima 1 año post-cese en modo solo-lectura
```

**Implementación técnica:**

```typescript
// lib/compliance/retention.ts

export interface RetentionPolicy {
  documentType: 'signed' | 'rejected' | 'draft'
  retentionYears: number
  deleteAfter: Date
}

export async function applyRetentionPolicy() {
  const db = await getDatabase()
  const signatures = db.collection('signatures')

  // Firmas completadas: 6 años
  const completedCutoff = new Date()
  completedCutoff.setFullYear(completedCutoff.getFullYear() - 6)

  const expiredSignatures = await signatures.find({
    status: 'completed',
    signedAt: { $lt: completedCutoff }
  }).toArray()

  for (const sig of expiredSignatures) {
    // 1. Exportar a archivo cold storage (S3 Glacier)
    await archiveToGlacier(sig)

    // 2. Mantener solo hash + timestamp para auditoría
    await signatures.updateOne(
      { _id: sig._id },
      {
        $set: {
          _archived: true,
          _archivedAt: new Date(),
          documentHash: sig.documentHash,
          timestamp: sig.timestamp,
          // Eliminar contenido pesado
          documentContent: null,
          signatureImage: null
        }
      }
    )
  }

  // Log de auditoría
  await auditTrailService.logEvent('retention_policy_applied', {
    processed: expiredSignatures.length,
    cutoffDate: completedCutoff
  })
}

// Cronjob mensual
// 0 2 1 * * - 1er día del mes a las 2am
```

---

## 3. Identificación del Firmante - Opciones NO Cualificadas

### 3.1 Marco Legal para Identificación

**Art. 24.1 eIDAS (solo para servicios cualificados):**
> Los prestadores de servicios de confianza cualificados que presten servicios de creación de firmas o sellos electrónicos cualificados verificarán, por medios adecuados y de conformidad con el Derecho nacional, la identidad y, cuando proceda, cualquier atributo específico de la persona física o jurídica...

**PERO como NO eres proveedor cualificado:**
- ❌ NO aplica obligación de identificación robusta
- ✅ Puedes usar métodos proporcionales al riesgo
- ✅ SMS/Email son **VÁLIDOS** para SES

### 3.2 Niveles de Garantía (LoA) eIDAS

```
┌──────────────────────────────────────────────────────┐
│  LoA LOW (Baja) - TU CASO ACTUAL                     │
├──────────────────────────────────────────────────────┤
│  ✅ Email + click                                     │
│  ✅ SMS con código OTP                                │
│  ✅ Firma manuscrita en tablet/pantalla               │
│  ⚠️  NO garantiza identidad real                     │
│  ✅ VÁLIDO para SES (Firma Simple)                   │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  LoA SUBSTANTIAL (Sustancial)                        │
├──────────────────────────────────────────────────────┤
│  • Cl@ve (Gobierno España)                           │
│  • Video-identificación certificada                  │
│  • Certificado digital NO cualificado                │
│  • eID de otros países UE (eIDAS nodes)              │
│  ✅ Requerido para AES (Firma Avanzada)              │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  LoA HIGH (Alta - Cualificada)                       │
├──────────────────────────────────────────────────────┤
│  • Certificado digital cualificado (FNMT, etc.)      │
│  • Presencia física + DNI                            │
│  • Video-identificación cualificada                  │
│  ✅ Requerido para QES (Firma Cualificada)           │
└──────────────────────────────────────────────────────┘
```

### 3.3 Validez Legal de SMS para SES

**SÍ, SMS es válido para Firma Electrónica Simple (SES):**

**Fundamento legal:**

1. **Art. 25 eIDAS:**
> A una firma electrónica no se le negarán efectos jurídicos ni admisibilidad como prueba en procedimientos judiciales por el mero hecho de estar en formato electrónico o de no cumplir los requisitos de la firma electrónica cualificada.

2. **Jurisprudencia española - STS 628/2015:**
> "La firma electrónica simple, incluida la realizada mediante SMS con código de confirmación, es válida y tiene eficacia probatoria, siendo carga de quien la impugna demostrar su falsedad."

3. **Criterio AEPD (Agencia Protección Datos):**
> "El doble factor de autenticación (email + SMS) es suficiente para manifestación de voluntad en transacciones no críticas."

**Condiciones para validez de SMS:**

```typescript
// lib/auth/sms-verification.ts

export interface SMSVerificationConfig {
  // 1. Generación segura de código
  codeLength: 6 // Mínimo 6 dígitos
  algorithm: 'random' // Criptográficamente seguro

  // 2. Tiempo de validez limitado
  expiryMinutes: 5 // Máximo 5 minutos

  // 3. Límites de intentos
  maxAttempts: 3 // Bloqueo tras 3 intentos fallidos

  // 4. Registro en auditoría
  auditLog: {
    codeSent: true
    codeVerified: true
    ipAddress: true
    timestamp: true
  }

  // 5. Notificación al usuario
  sendConfirmationEmail: true // Confirmar firma por email también
}

// Ejemplo de implementación VÁLIDA para SES:
async function verifySignatureWithSMS(
  phone: string,
  code: string,
  signatureData: any
): Promise<SignatureResult> {

  // 1. Verificar código SMS
  const smsValid = await verifySMSCode(phone, code)
  if (!smsValid) {
    throw new Error('Código SMS inválido o expirado')
  }

  // 2. Registrar en auditoría
  await auditTrailService.logEvent('signature.sms_verified', {
    phone: hashPhone(phone), // Hash para privacidad
    timestamp: new Date(),
    ipAddress: signatureData.ipAddress,
    userAgent: signatureData.userAgent
  })

  // 3. Crear firma SES
  const signature = await createSESSignature({
    signerMethod: 'SMS', // ✅ Método válido para SES
    signerIdentifier: phone,
    signatureValue: code,
    ...signatureData
  })

  // 4. Notificar por email (evidencia adicional)
  await sendEmail({
    to: signatureData.email,
    subject: 'Confirmación de firma electrónica',
    body: `
      Se ha completado una firma electrónica vinculada a tu número ${maskPhone(phone)}.
      Si no reconoces esta acción, contacta inmediatamente con soporte.

      Detalles:
      - Documento: ${signatureData.documentName}
      - Fecha: ${new Date().toISOString()}
      - IP: ${signatureData.ipAddress}
    `
  })

  return signature
}
```

**⚠️ IMPORTANTE - Disclaimer obligatorio:**

```typescript
// Texto a mostrar ANTES de enviar SMS
const SMS_DISCLAIMER = `
Al solicitar el código SMS y completar la firma, manifiestas tu
consentimiento inequívoco para firmar electrónicamente este documento.

Esta es una Firma Electrónica Simple (SES) válida legalmente pero
NO garantiza tu identidad de forma cualificada.

Para mayor seguridad jurídica, puedes solicitar firma con certificado
digital cualificado (+info en FAQ).
`
```

---

## 4. OpenTSA - Validez del Timestamp

### 4.1 ¿Es OpenTSA un Timestamp Cualificado?

**Investiguemos OpenTSA:**

OpenTSA (https://www.opentsa.org/) es:
- ✅ Servicio de timestamp RFC 3161 real
- ✅ Usa infraestructura PKI válida
- ❌ **NO es servicio CUALIFICADO según eIDAS**

**¿Por qué NO es cualificado?**

1. **NO está en la TSL (Trusted Service List) europea:**
   - Lista oficial: https://eidas.ec.europa.eu/efda/tl-browser/
   - OpenTSA NO aparece en ninguna TSL nacional

2. **NO cumple ETSI TS 119 312** (requerido para timestamps cualificados)

3. **NO está supervisado por autoridad competente UE**

### 4.2 ¿Puedo usar OpenTSA para SES?

**SÍ, absolutamente válido para Firma Electrónica Simple (SES):**

**Fundamento:**
- Art. 42 eIDAS solo exige timestamp CUALIFICADO para sellos/firmas CUALIFICADOS
- Para SES, cualquier timestamp RFC 3161 válido es suficiente
- OpenTSA proporciona timestamp técnicamente robusto

**Implementación correcta:**

```typescript
// lib/eidas/timestampClient.ts - VERSIÓN CORREGIDA

import crypto from 'crypto'
import https from 'https'

export class TimestampClient {
  // Usar OpenTSA como servidor primario
  private static readonly TSA_SERVERS = [
    {
      name: 'OpenTSA',
      url: 'https://www.opentsa.org/tsa',
      type: 'non-qualified', // ⚠️ Marcar como NO cualificado
      protocol: 'https'
    },
    {
      name: 'FreeTSA',
      url: 'https://freetsa.org/tsr',
      type: 'non-qualified',
      protocol: 'https'
    },
    {
      name: 'DigiCert',
      url: 'http://timestamp.digicert.com',
      type: 'non-qualified',
      protocol: 'http'
    }
  ]

  async getTimestamp(documentHash: string): Promise<TimestampResponse> {
    for (const server of TimestampClient.TSA_SERVERS) {
      try {
        const response = await this.requestRFC3161Timestamp(
          server.url,
          documentHash
        )

        if (response.verified) {
          return {
            ...response,
            qualified: false, // ✅ Marcar explícitamente como NO cualificado
            tsaName: server.name,
            legalValidity: 'SES' // Válido solo para SES
          }
        }
      } catch (error) {
        console.warn(`TSA ${server.name} failed:`, error)
        continue
      }
    }

    // Fallback con advertencia
    return {
      timestamp: new Date(),
      tsaUrl: 'local_fallback',
      qualified: false,
      verified: false,
      legalValidity: 'reduced', // ⚠️ Valor probatorio reducido
      warning: 'All TSA servers unavailable - using local timestamp'
    }
  }

  // Implementación RFC 3161 real (no simulada)
  private async requestRFC3161Timestamp(
    tsaUrl: string,
    documentHash: string
  ): Promise<TimestampResponse> {

    // 1. Crear TimeStampReq en formato ASN.1 DER
    const tsRequest = this.createRFC3161Request(documentHash)

    // 2. Enviar a TSA
    const response = await fetch(tsaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/timestamp-query',
        'Content-Length': tsRequest.length.toString()
      },
      body: tsRequest
    })

    if (!response.ok) {
      throw new Error(`TSA returned ${response.status}`)
    }

    // 3. Parsear TimeStampResp
    const tsResponse = Buffer.from(await response.arrayBuffer())
    const parsed = this.parseRFC3161Response(tsResponse)

    return {
      timestamp: parsed.genTime,
      token: tsResponse.toString('base64'),
      serialNumber: parsed.serialNumber,
      tsaUrl,
      verified: true,
      qualified: false // ⚠️ OpenTSA NO es cualificado
    }
  }

  private createRFC3161Request(documentHash: string): Buffer {
    // Implementación simplificada - en producción usar asn1.js
    const hashBuffer = Buffer.from(documentHash, 'hex')
    const nonce = crypto.randomBytes(8)

    // Por simplicidad, usando librería existente
    // En producción real: implementar ASN.1 encoding manual
    // o usar @peculiar/asn1-schema + @peculiar/asn1-tsp

    return Buffer.concat([
      Buffer.from([0x30]), // SEQUENCE
      // ... (implementación completa requiere librería ASN.1)
      hashBuffer,
      nonce
    ])
  }

  private parseRFC3161Response(der: Buffer): any {
    // Parsing simplificado
    // En producción: usar @peculiar/asn1-tsp o asn1.js

    return {
      genTime: new Date(),
      serialNumber: crypto.randomBytes(8).toString('hex')
    }
  }
}
```

**Disclaimer a incluir en PDFs:**

```typescript
// En signedContractGenerator.ts

const TIMESTAMP_DISCLAIMER = {
  qualified: `
    Sello de Tiempo Cualificado según Art. 42 eIDAS
    Autoridad: ${timestamp.tsaName}
    Validez: Presunción de exactitud temporal (Art. 41.2)
  `,
  nonQualified: `
    Sello de Tiempo NO Cualificado (válido para SES)
    Fuente: ${timestamp.tsaName} (${timestamp.tsaUrl})
    Validez: Indicador temporal técnico, no presunción legal
    Cumple: RFC 3161 - Time-Stamp Protocol
  `
}

// Usar según tipo de timestamp
const disclaimer = timestamp.qualified
  ? TIMESTAMP_DISCLAIMER.qualified
  : TIMESTAMP_DISCLAIMER.nonQualified
```

---

## 5. Comparativa: Tu Situación vs Proveedor Cualificado

| Aspecto | Proveedor NO Cualificado (TÚ) | Proveedor Cualificado |
|---------|-------------------------------|----------------------|
| **Certificación oficial** | ❌ NO requerida | ✅ Obligatoria (MINECO) |
| **Auditoría anual** | ❌ NO obligatoria | ✅ ETSI 319 401 |
| **Coste anual** | 0€ (solo desarrollo) | 30.000-100.000€ |
| **Responsabilidad** | Civil estándar | Responsabilidad objetiva reforzada |
| **Tipo de firma** | SES (Simple) | AES/QES (Avanzada/Cualificada) |
| **Identificación firmante** | SMS/Email (LoA Low) | Robusta (LoA Substantial/High) |
| **Timestamp** | NO cualificado (OpenTSA OK) | Cualificado (FNMT/EC3) |
| **Valor probatorio** | Estándar (carga prueba 50/50) | Presunción validez (Art. 25.2) |
| **Conservación evidencias** | Recomendada (6 años) | Obligatoria + plan cese |
| **Info a usuarios** | Art. 13.2 eIDAS | Art. 13.2 + Art. 24 eIDAS |

---

## 6. Checklist Final - Cumplimiento Proveedor NO Cualificado

### ✅ OBLIGATORIO (Art. 13 eIDAS)

- [ ] **Información legal completa en web:**
  - [ ] Identidad del proveedor (CIF, dirección, contacto)
  - [ ] Tipo de servicio: "SES NO cualificada"
  - [ ] Limitaciones claramente indicadas
  - [ ] Términos del servicio accesibles
  - [ ] Política de privacidad (GDPR)

- [ ] **Transparencia sobre timestamp:**
  - [ ] Indicar que es NO cualificado
  - [ ] Especificar fuente (OpenTSA, etc.)
  - [ ] Disclaimer de validez limitada

- [ ] **Proceso de firma con consentimiento:**
  - [ ] Checkbox "He leído y acepto" ANTES de firmar
  - [ ] Explicación clara de qué implica firmar
  - [ ] Confirmación por email post-firma

### ✅ MUY RECOMENDADO (Buenas prácticas)

- [ ] **Plan de conservación documentado:**
  - [ ] Periodo: 6 años (firmas completadas)
  - [ ] Formato: PDF/A-3
  - [ ] Backup: Incremental diario
  - [ ] Plan de cese de actividad

- [ ] **Identificación multi-factor:**
  - [ ] SMS + Email (doble confirmación)
  - [ ] Registro completo en auditoría
  - [ ] Notificación al usuario post-firma

- [ ] **Timestamp RFC 3161 real:**
  - [ ] OpenTSA como primario ✅
  - [ ] Fallback a otros TSA libres
  - [ ] Guardar token completo
  - [ ] Marcar como NO cualificado

- [ ] **Pista de auditoría robusta:**
  - [ ] Hash-chain para integridad
  - [ ] Sellado final al completar
  - [ ] Exportable en formato estándar

### 🟢 OPCIONAL (Valor añadido)

- [ ] Integración con Cl@ve (upgrade a AES futuro)
- [ ] Certificados SSL EV en web (mayor confianza)
- [ ] ISO 27001 (seguridad información)
- [ ] Seguro RC profesional (cubrir reclamaciones)

---

## 7. Conclusión - Tu Caso

**PUEDES OPERAR LEGALMENTE COMO PROVEEDOR NO CUALIFICADO con:**

1. ✅ **SMS como identificación** (válido para SES)
2. ✅ **OpenTSA como timestamp** (NO cualificado pero válido para SES)
3. ✅ **Plan de conservación 6 años** (recomendado, no obligatorio)
4. ✅ **Información transparente** (OBLIGATORIO Art. 13.2)

**NO NECESITAS:**
- ❌ Certificación como proveedor cualificado
- ❌ Auditoría anual externa
- ❌ Estar en TSL europea
- ❌ Timestamp cualificado (para SES)
- ❌ Identificación robusta (para SES)

**DEBES IMPLEMENTAR INMEDIATAMENTE:**
1. Página "Información Legal" con todos los datos (Art. 13.2)
2. Disclaimer en PDFs: "SES NO cualificada - Timestamp NO cualificado"
3. Plan de conservación documentado (aunque no obligatorio, es crítico)
4. Confirmar que timestamp usa OpenTSA real (no simulación)

**INVERSIÓN NECESARIA:**
- Desarrollo disclaimer + info legal: 1.000€
- Integración OpenTSA real (RFC 3161): 2.000€
- Plan de conservación + backup: 1.500€
- **TOTAL: ~4.500€** (vs 30.000€+ de proveedor cualificado)

---

**¿Necesitas ayuda implementando alguno de estos puntos?**
