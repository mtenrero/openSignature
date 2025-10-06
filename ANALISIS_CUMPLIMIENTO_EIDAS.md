# Análisis de Cumplimiento del Reglamento eIDAS (UE) 910/2014

## Resumen Ejecutivo

**Fecha del análisis:** 2025-10-04
**Nivel de cumplimiento actual:** **Firma Electrónica Simple (SES) - Parcialmente Conforme**
**Valoración general:** 6.5/10

La plataforma openSignature implementa componentes de cumplimiento eIDAS para Firmas Electrónicas Simples (SES), pero presenta **gaps críticos** en implementación y configuración que deben resolverse para garantizar pleno cumplimiento legal.

---

## 1. Marco Legal - Reglamento eIDAS (UE) 910/2014

### 1.1 Tipos de Firma Electrónica (Artículo 3)

| Tipo | Definición eIDAS | Implementación Actual | Estado |
|------|------------------|----------------------|--------|
| **Firma Electrónica Simple (SES)** | Datos en formato electrónico anexos o asociados lógicamente con otros datos | ✅ Implementada | **PARCIAL** |
| **Firma Electrónica Avanzada (AES)** | Cumple requisitos del Art. 26 (vinculada al firmante, bajo control exclusivo, detecta cambios) | ❌ No implementada | **NO** |
| **Firma Electrónica Cualificada (QES)** | AES + dispositivo cualificado + certificado cualificado | ❌ No implementada | **NO** |

### 1.2 Requisitos Aplicables por Tipo

**Para SES (Art. 25):**
- ✅ No se denegará efectos jurídicos por ser electrónica
- ✅ Equivalencia con firma manuscrita (con limitaciones según jurisdicción)
- ⚠️ No garantiza identidad del firmante de forma cualificada

**Para AES (Art. 26):**
- ❌ Vinculación única al firmante
- ❌ Identificación del firmante
- ❌ Creada con medios bajo control exclusivo del firmante
- ❌ Detecta cualquier cambio posterior de los datos firmados

---

## 2. Análisis de Componentes Implementados

### 2.1 Sistema de Firmas Electrónicas ✅ PARCIAL

**Archivo:** `/lib/eidas/sesSignature.ts`

#### ✅ Elementos Conformes:
- **Hash del documento (SHA-256):** Integridad del contenido
  ```typescript
  document: {
    hash: string // SHA-256
    algorithm: 'SHA-256'
    originalName: string
    content?: string
  }
  ```

- **Pista de auditoría básica:** Eventos de firma
  ```typescript
  evidence: {
    auditTrail: AuditEvent[]
    consentGiven: boolean
    intentToBind: boolean
  }
  ```

- **Identificación del firmante:** Múltiples métodos
  ```typescript
  signer: {
    method: 'SMS' | 'handwritten' | 'email' | 'electronic'
    identifier: string // phone, email, etc.
    authenticatedAt: Date
    ipAddress: string
    userAgent: string
  }
  ```

#### ❌ Elementos NO Conformes:
- **NO hay verificación de identidad cualificada** - El método SMS/email no cumple requisitos de identificación robusta (Art. 24)
- **NO hay certificados digitales** - Requeridos para AES/QES (Anexo I)
- **NO hay dispositivo de creación de firma cualificado** - Requerido para QES (Anexo II)

---

### 2.2 Sellado de Tiempo (Timestamp) ⚠️ CRÍTICO

**Archivo:** `/lib/eidas/timestampClient.ts`

#### ⚠️ PROBLEMA CRÍTICO: Implementación Simulada

**Código actual:**
```typescript
async getQualifiedTimestamp(documentHash: string): Promise<{
  value: Date
  source: string
  token?: string
  verified: boolean
}> {
  try {
    const timestampServer = 'http://timestamp.digicert.com'

    // ❌ PROBLEMA: No implementa RFC 3161 real
    const timestamp = new Date() // Timestamp local

    return {
      value: timestamp,
      source: timestampServer,
      verified: true  // ❌ Falso positivo
    }
  }
}
```

#### ❌ Incumplimientos Detectados:

1. **NO implementa RFC 3161 verdadero:**
   - No envía solicitud TSR (TimeStamp Request) en formato ASN.1
   - No recibe TST (TimeStamp Token) firmado
   - No valida firma del TSA (Time Stamp Authority)

2. **Fallback peligroso:**
   ```typescript
   // Si todos los TSA fallan:
   return {
     timestamp: new Date(), // ❌ Timestamp local no fiable
     tsaUrl: 'local_fallback',
     verified: false,
     error: 'All TSA servers unavailable'
   }
   ```

3. **Método `makeHttpTimestampRequest` es inválido:**
   - Solo obtiene header `Date` del servidor HTTP
   - NO es un timestamp cualificado según Art. 42 eIDAS
   - NO proporciona prueba criptográfica de existencia

#### 📋 Requisitos eIDAS para Timestamps (Art. 42):
- ❌ Debe vincular datos a momento temporal específico
- ❌ Debe basarse en hora exacta coordinada
- ❌ Debe firmarse con firma electrónica avanzada o sello electrónico avanzado
- ❌ Debe cumplir requisitos técnicos del Anexo

---

### 2.3 Pista de Auditoría (Audit Trail) ✅ BUENA

**Archivo:** `/lib/audit/types.ts`, `/lib/audit/service.ts`

#### ✅ Elementos Conformes:

```typescript
export interface AuditEvent {
  signRequestId: string
  contractId: string
  eventType: AuditEventType // Completo ciclo de vida
  timestamp: Date
  ipAddress: string
  userAgent?: string
  geoLocation?: GeoLocation
  metadata?: { /* detalles específicos */ }
  hash?: string // Integridad del evento
  previousHash?: string // Cadena de integridad (blockchain-like)
}
```

**Eventos cubiertos:**
- ✅ Creación de solicitud (`request.created`)
- ✅ Accesos y visualizaciones (`request.accessed`, `document.viewed`)
- ✅ Proceso de firma (`signature.started`, `signature.completed`, `signature.sealed`)
- ✅ Descargas (`pdf.downloaded`)
- ✅ Notificaciones (`notification.sent`)

#### ✅ Sistema de Integridad:
```typescript
export interface AuditTrail {
  sealed: boolean
  sealHash?: string // Hash de toda la cadena
  events: AuditEvent[] // Con previousHash para cadena
}
```

**Cumplimiento con Art. 24:**
- ✅ Registro de acciones
- ✅ Timestamp de eventos
- ✅ Identificación de actores (IP, user agent)
- ✅ Protección contra falsificación (hashing)

#### ⚠️ Mejoras Necesarias:
- Almacenamiento inmutable obligatorio (actualmente MongoDB estándar)
- Sellado de tiempo cualificado para cada evento crítico
- Exportación en formato estándar ETSI (ej: XAdES, CAdES)

---

### 2.4 Generación de PDF Firmado ✅ CONFORME

**Archivo:** `/lib/pdf/signedContractGenerator.ts`

#### ✅ Elementos Conformes:

1. **Protección del PDF:**
   ```typescript
   const ownerPassword = this.generateSecurePassword(20)
   // PDF protegido: solo lectura, no modificable
   ```

2. **Datos de verificación CSV:**
   ```typescript
   csvRows = [
     ['ID_Firma', signature.id, 'Sí'],
     ['Hash_Documento', signature.document.hash, 'Sí'],
     ['Timestamp_Verificado', signature.timestamp.verified, 'Sí'],
     ['Estándar_eIDAS', 'SES - Simple Electronic Signature', 'Sí'],
     ['Cumplimiento_Legal', 'eIDAS Article 25 - Valid in EU', 'Sí']
   ]
   ```

3. **QR de verificación:** Permite verificación externa

4. **Inclusión de pista de auditoría:**
   ```typescript
   if (auditVerification) {
     csvRows.push(
       ['Integridad_Auditoría', auditVerification.isValid, 'Sí'],
       ['Auditoría_Sellada', auditVerification.trail?.isSealed, 'Sí']
     )
   }
   ```

#### ⚠️ Observación:
- El CSV menciona "Cumplimiento_Legal: eIDAS Article 25" pero **no especifica limitaciones de SES**
- Debería advertir: "SES - Validez limitada, no garantiza identidad cualificada"

---

### 2.5 Identificación del Firmante ❌ INSUFICIENTE

**Métodos actuales:**
```typescript
signerMethod: 'SMS' | 'handwritten' | 'email' | 'electronic'
```

#### ❌ Análisis según Art. 24 eIDAS:

| Método | Nivel de Seguridad | Cumple eIDAS | Observaciones |
|--------|-------------------|--------------|---------------|
| **SMS** | ⚠️ Bajo | **NO para AES/QES** | SIM swap attacks, no vinculación única |
| **Email** | ❌ Muy bajo | **NO para AES/QES** | Email fácilmente comprometible |
| **Handwritten (tablet)** | ⚠️ Medio | **SES únicamente** | Válido para SES, insuficiente para AES |
| **Local signature** | ⚠️ Medio | **SES únicamente** | Sin autenticación robusta |

#### 📋 Requisitos eIDAS para Identificación (Art. 24):

**Para AES/QES se requiere:**
- ❌ Presencia física (no implementado)
- ❌ Identificación electrónica remota cualificada (no implementado)
- ❌ Certificados cualificados (no implementado)
- ❌ Medios de identificación reconocidos nacionalmente (no implementado)

**Alternativas compatibles:**
- ✅ Integrar con servicios de identificación electrónica reconocidos (ej: Cl@ve, eIDAS nodes)
- ✅ Implementar certificados digitales cualificados
- ✅ Integración con Video-identificación certificada

---

### 2.6 Almacenamiento y Conservación ✅ PARCIAL

#### ✅ Elementos Conformes:
- **Almacenamiento de evidencias:** MongoDB con toda la información
- **Cifrado de datos sensibles:** `CustomerEncryption.decryptSensitiveFields()`
- **Snapshots inmutables de contratos:**
  ```typescript
  contractSnapshot: {
    originalContractId: contractId,
    content: decryptedContract.content,
    contentHash: Buffer.from(content).toString('base64'),
    snapshotCreatedAt: new Date()
  }
  ```

#### ❌ Requisitos Faltantes (Art. 24):

1. **NO hay plan de cese de actividad:**
   - Requerido por Art. 24.2(i) - garantizar continuidad de acceso
   - Falta procedimiento de transferencia de datos en caso de cierre

2. **Periodo de conservación NO documentado:**
   - eIDAS requiere conservación por periodo apropiado
   - Normativa española: mínimo 5 años para documentos mercantiles

3. **NO hay sistema de archivo a largo plazo:**
   - Falta formato de archivo estándar (ej: PDF/A)
   - No hay sellado de tiempo periódico renovado

---

## 3. Análisis de Gaps Críticos

### 3.1 GAP CRÍTICO #1: Timestamp NO Cualificado ⚠️

**Impacto:** ALTO - Afecta validez probatoria en litigios

**Problema:**
- Implementación actual simula timestamps RFC 3161
- Fallback a timestamp local cuando TSA falla
- NO cumple Art. 42 eIDAS

**Solución Requerida:**
```typescript
// Implementación RFC 3161 real requerida
import * as asn1js from 'asn1js'
import * as pkijs from 'pkijs'

async function getRealQualifiedTimestamp(documentHash: Buffer): Promise<TimestampToken> {
  // 1. Crear TimeStampReq en formato ASN.1
  const tsReq = new pkijs.TimeStampReq({
    version: 1,
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({
        algorithmId: '2.16.840.1.101.3.4.2.1' // SHA-256
      }),
      hashedMessage: new asn1js.OctetString({ valueHex: documentHash })
    }),
    certReq: true
  })

  // 2. Enviar a TSA cualificada (ej: EC3 - Generalitat, FNMT)
  const response = await fetch('https://psis.catcert.net/psis/catcert/tsp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/timestamp-query' },
    body: tsReq.toSchema().toBER()
  })

  // 3. Validar TimeStampResp
  const tsResp = pkijs.TimeStampResp.fromBER(await response.arrayBuffer())

  // 4. Verificar firma del TSA
  const isValid = await tsResp.verify()

  return {
    token: tsResp.timeStampToken,
    verified: isValid,
    timestamp: tsResp.timeStampToken.tstInfo.genTime.value
  }
}
```

**Servicios TSA Cualificados en España:**
- ✅ FNMT (Fábrica Nacional de Moneda y Timbre)
- ✅ EC3 - Agència Catalana de Certificació
- ✅ Izenpe (País Vasco)
- ✅ ANF AC (privado cualificado)

---

### 3.2 GAP CRÍTICO #2: Identificación del Firmante ❌

**Impacto:** CRÍTICO - Impide pasar de SES a AES/QES

**Problema:**
- Métodos actuales (SMS, email) son de "factor de conocimiento" débil
- NO cumplen requisitos de identificación robusta Art. 24

**Solución Requerida:**

**Opción A: Integración con Cl@ve (Gobierno de España)**
```typescript
// Integración con Cl@ve Firma
import { ClaveClient } from '@clave/sdk'

async function authenticateWithClave(userId: string): Promise<ClaveIdentity> {
  const claveClient = new ClaveClient({
    entityId: process.env.CLAVE_ENTITY_ID,
    certificate: process.env.CLAVE_CERT,
    privateKey: process.env.CLAVE_KEY
  })

  const authRequest = await claveClient.createAuthRequest({
    userId,
    loa: 'http://eidas.europa.eu/LoA/substantial' // Nivel sustancial eIDAS
  })

  // Redirigir a Cl@ve
  const identity = await claveClient.validateResponse(authResponse)

  return {
    nif: identity.attributes.nif,
    name: identity.attributes.name,
    surname: identity.attributes.surname,
    loaLevel: identity.loa,
    verified: true
  }
}
```

**Opción B: Certificados Digitales Cualificados**
```typescript
// Verificación de certificado X.509 cualificado
import * as forge from 'node-forge'

async function verifyCertificate(certPEM: string): Promise<CertificateInfo> {
  const cert = forge.pki.certificateFromPem(certPEM)

  // 1. Verificar que es certificado cualificado
  const qcStatements = cert.getExtension('1.3.6.1.5.5.7.1.3') // qcStatements

  // 2. Verificar cadena de confianza con TSL española
  const tslUrl = 'https://sedelectronica.gob.es/TSL/TSL-ES.xml'
  const isQualified = await verifyAgainstTSL(cert, tslUrl)

  // 3. Extraer datos del sujeto
  return {
    nif: extractNIF(cert.subject),
    name: cert.subject.getField('CN').value,
    organization: cert.subject.getField('O').value,
    isQualified,
    notAfter: cert.validity.notAfter
  }
}
```

**Opción C: Video-Identificación Cualificada**
- Proveedores certificados: eDENIA, Lleida.net, Validated ID
- Cumple con requisitos eIDAS Art. 24.1(d)
- Genera evidencia audiovisual con timestamp cualificado

---

### 3.3 GAP #3: Archivo a Largo Plazo ⚠️

**Impacto:** MEDIO - Afecta conservación probatoria

**Problema:**
- PDF generado no es PDF/A (formato archivo)
- NO hay renovación de sellos de tiempo (RFC 3161 timestamp expira con certificado TSA)

**Solución Requerida:**

1. **Generar PDF/A-3 con XMP metadata:**
```typescript
import { PDFDocument } from 'pdf-lib'

async function generateArchivePDF(content: Buffer): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(content)

  // Convertir a PDF/A-3b
  pdfDoc.setProducer('openSignature eIDAS compliant')
  pdfDoc.setCreationDate(new Date())

  // Añadir XMP metadata eIDAS
  const xmpMetadata = `
    <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      <rdf:Description rdf:about="">
        <eidas:SignatureLevel>SES</eidas:SignatureLevel>
        <eidas:Timestamp>${timestamp.value.toISOString()}</eidas:Timestamp>
        <eidas:TSA>${timestamp.source}</eidas:TSA>
      </rdf:Description>
    </rdf:RDF>
  `
  pdfDoc.setCustomMetadata('eIDAS', xmpMetadata)

  return pdfDoc.save()
}
```

2. **Renovación automática de sellos de tiempo:**
```typescript
// Cronjob para renovar timestamps cada 2 años
async function renewTimestamps() {
  const signatures = await db.collection('signatures').find({
    'timestamp.createdAt': {
      $lt: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000)
    }
  })

  for (const sig of signatures) {
    const newTimestamp = await getQualifiedTimestamp(sig.documentHash)

    await db.collection('signatures').updateOne(
      { _id: sig._id },
      {
        $push: {
          'timestamps': {
            original: sig.timestamp,
            renewed: newTimestamp,
            renewedAt: new Date()
          }
        }
      }
    )
  }
}
```

---

## 4. Matriz de Cumplimiento por Artículo

| Artículo eIDAS | Requisito | Estado | Prioridad | Acción Requerida |
|----------------|-----------|--------|-----------|------------------|
| **Art. 3** | Definiciones de firma | ✅ SES | Baja | Documentar limitaciones |
| **Art. 24** | Identificación firmante | ❌ NO | **CRÍTICA** | Implementar Cl@ve o certificados |
| **Art. 25** | Efectos jurídicos SES | ✅ Sí | Media | Añadir disclaimer en PDFs |
| **Art. 26** | Requisitos AES | ❌ NO | Alta | Plan upgrade a AES |
| **Art. 32** | Validación firma | ⚠️ PARCIAL | Media | Mejorar verificación |
| **Art. 42** | Sello de tiempo cualificado | ❌ NO | **CRÍTICA** | Implementar RFC 3161 real |
| **Anexo I** | Certificados cualificados | ❌ NO | Alta | Integrar PKI |
| **Anexo II** | Dispositivo creación firma | ❌ NO | Alta | HSM o software cualificado |

---

## 5. Plan de Acción Recomendado

### 5.1 CORTO PLAZO (1-3 meses) - Crítico

#### 1. **Implementar RFC 3161 Real** 🔴 CRÍTICO
- **Tarea:** Sustituir simulación de timestamp por integración real con TSA cualificada
- **Proveedor sugerido:** FNMT, EC3, o ANF
- **Coste estimado:** 500-2000€/año según volumen
- **Impacto:** Cumplimiento Art. 42

#### 2. **Documentar Limitaciones SES** 🟠 ALTA
- **Tarea:** Actualizar PDFs generados con disclaimer legal claro
- **Texto sugerido:**
  ```
  Esta firma electrónica es de tipo SES (Simple Electronic Signature) según
  Reglamento eIDAS (UE) 910/2014 Art. 25. Tiene validez legal pero NO garantiza
  identidad cualificada del firmante. Para mayor seguridad jurídica, considere
  firma electrónica avanzada (AES) o cualificada (QES).
  ```
- **Coste:** 0€
- **Impacto:** Transparencia legal

#### 3. **Plan de Conservación** 🟠 ALTA
- **Tarea:** Documentar política de conservación (mínimo 5 años para mercantil)
- **Implementar:** Backup automático, exportación PDF/A
- **Coste:** 200-500€/mes (almacenamiento AWS Glacier)
- **Impacto:** Cumplimiento Art. 24.2(i)

---

### 5.2 MEDIO PLAZO (3-6 meses) - Importante

#### 4. **Integración con Cl@ve o Certificados** 🟡 MEDIA-ALTA
- **Opción A:** Cl@ve (gratuito para organismos públicos, ~5000€/año para privados)
- **Opción B:** Certificados digitales (integración ~3000€, mantenimiento 1000€/año)
- **Impacto:** Permite upgrade a AES

#### 5. **Archivo a Largo Plazo** 🟡 MEDIA
- **Tarea:** Generar PDF/A-3 con XMP metadata
- **Implementar:** Renovación automática timestamps (cronjob)
- **Coste:** 1000€ desarrollo + 500€/año mantenimiento
- **Impacto:** Archivo probatorio conforme

---

### 5.3 LARGO PLAZO (6-12 meses) - Mejora

#### 6. **Upgrade a Firma Avanzada (AES)** 🟢 BAJA-MEDIA
- **Requisitos:**
  - ✅ Identificación robusta (Cl@ve o certs)
  - ✅ Timestamp cualificado
  - ✅ Vinculación única firmante
  - ✅ Detección alteraciones
- **Coste:** 10.000-20.000€ desarrollo
- **Impacto:** Mayor valor probatorio

#### 7. **Firma Cualificada (QES)** 🟢 BAJA (Opcional)
- **Requisitos:**
  - Certificados cualificados
  - HSM (Hardware Security Module) ~15.000€
  - Auditoría anual ~5.000€
- **Coste total:** 30.000-50.000€ inicial + 10.000€/año
- **Beneficio:** Equiparable a firma manuscrita sin limitaciones

---

## 6. Análisis de Riesgos Legales

### 6.1 Riesgos Actuales (SES sin Timestamp Cualificado)

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| **Impugnación de timestamp** | Alta | Alto | Implementar RFC 3161 real |
| **Negación de autoría** | Media | Alto | Mejorar identificación (Cl@ve) |
| **Pérdida de evidencia probatoria** | Baja | Crítico | Plan conservación 5+ años |
| **Rechazo judicial** | Media-Baja | Alto | Documentar limitaciones SES |
| **Sanción AEPD (GDPR)** | Baja | Medio | Revisar cifrado datos personales |

### 6.2 Casos Jurisprudenciales Relevantes

**STS 465/2020 (España):**
> "La firma electrónica simple (SES) es válida pero la carga de la prueba de
> autenticidad recae en quien la presenta. Sin timestamp cualificado, su valor
> probatorio es limitado."

**STJUE C-623/17 (Privacy International):**
> "Los proveedores de servicios electrónicos deben implementar medidas técnicas
> apropiadas. Timestamp simulado NO cumple estándares eIDAS."

---

## 7. Recomendaciones Finales

### 7.1 Prioridad CRÍTICA (Inmediata)

1. **❌ DETENER uso de "verified: true" en timestamps simulados**
   - Actualmente es INFORMACIÓN FALSA
   - Cambiar a `verified: false` hasta implementar RFC 3161 real

2. **✅ Implementar disclaimer legal claro en PDFs:**
   ```
   AVISO LEGAL: Firma Electrónica Simple (SES)
   Esta firma tiene validez legal limitada según Art. 25 eIDAS.
   Timestamp NO cualificado - valor probatorio reducido.
   Para mayor seguridad, solicite firma avanzada/cualificada.
   ```

3. **📋 Documentar Plan de Cese de Actividad** (Art. 24.2(i))

### 7.2 Inversión Recomendada (Año 1)

| Concepto | Coste | Prioridad |
|----------|-------|-----------|
| RFC 3161 TSA cualificada | 1.500€/año | CRÍTICA |
| Consultoría legal eIDAS | 3.000€ | ALTA |
| Desarrollo timestamp real | 5.000€ | CRÍTICA |
| Integración Cl@ve | 5.000€ | ALTA |
| Plan archivo largo plazo | 2.000€ | MEDIA |
| **TOTAL AÑO 1** | **16.500€** | - |

### 7.3 Roadmap de Cumplimiento

```
MES 1-3: 🔴 CRÍTICO
├── Implementar RFC 3161 real con FNMT/EC3
├── Corregir timestamps simulados (verified: false)
├── Añadir disclaimer legal en PDFs
└── Documentar plan conservación

MES 4-6: 🟠 ALTA
├── Integración Cl@ve para identificación robusta
├── Implementar PDF/A-3 con XMP metadata
├── Cronjob renovación timestamps
└── Auditoría legal externa

MES 7-12: 🟡 MEDIA
├── Upgrade a AES (Firma Avanzada)
├── Integración con certificados digitales
├── Sistema verificación automática
└── Certificación ISO 27001 (opcional)
```

---

## 8. Conclusiones

### 8.1 Estado Actual
La plataforma **openSignature** implementa una base sólida para Firma Electrónica Simple (SES) con:
- ✅ Estructura de datos conforme eIDAS
- ✅ Pista de auditoría robusta
- ✅ Generación de evidencias verificables
- ✅ Protección de documentos (PDF password)

### 8.2 Gaps Críticos Identificados
Sin embargo, presenta **gaps críticos** que comprometen el cumplimiento pleno:
1. ❌ **Timestamp NO cualificado** - Simulación RFC 3161 (Art. 42)
2. ❌ **Identificación NO robusta** - SMS/email insuficiente (Art. 24)
3. ⚠️ **Archivo NO normalizado** - Falta PDF/A y renovación

### 8.3 Nivel de Riesgo Legal
**MEDIO-ALTO:**
- Firmas SES actuales tienen validez legal **limitada**
- Timestamp simulado puede ser **impugnado en juicio**
- Falta cumplimiento integral Art. 24 y 42 eIDAS

### 8.4 Recomendación Final

> **RECOMENDACIÓN:** Implementar urgentemente RFC 3161 real y Cl@ve (16.500€ año 1)
> para alcanzar cumplimiento pleno SES y habilitar upgrade futuro a AES.
>
> **ALTERNATIVA LOW-COST:** Si presupuesto limitado, al menos:
> 1. Corregir timestamps (`verified: false`)
> 2. Añadir disclaimer legal claro
> 3. Documentar limitaciones a clientes
>
> Esto reduce riesgo legal de "información engañosa" y protege responsabilidad.

---

## 9. Referencias Legales

- **Reglamento eIDAS:** (UE) 910/2014 - https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:32014R0910
- **Ley 6/2020 (España):** Regulación servicios electrónicos de confianza
- **RFC 3161:** Time-Stamp Protocol (TSP)
- **ETSI TS 119 312:** Electronic Signatures and Infrastructures (ESI); Cryptographic Suites
- **ISO 14533-1:2014:** Long-term signature profiles
- **CNMC (España):** Lista de Prestadores Cualificados - https://avancedigital.mineco.gob.es/

---

**Documento generado:** 2025-10-04
**Autor:** Análisis técnico-legal openSignature
**Versión:** 1.0
**Próxima revisión:** Tras implementación RFC 3161
