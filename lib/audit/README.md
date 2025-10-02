# Sistema de Auditoría Completo para Firmas Electrónicas

## 📋 Resumen

Sistema completo de auditoría que cumple con **eIDAS** y garantiza la trazabilidad total del proceso de firma electrónica, desde la creación hasta la verificación post-firma.

## 🎯 Funcionalidades

### ✅ Eventos Registrados

#### Ciclo de Vida
- ✅ **Creación de solicitud** - Con datos pre-rellenados si existen
- ✅ **Envío de solicitud** - Canal (email, SMS, QR, etc.) y destinatario
- ✅ **Reenvíos** - Fecha, canal, motivo
- ✅ **Archivado/Eliminación** - Trazabilidad completa

#### Accesos y Visualizaciones
- ✅ **Acceso al proceso de firma** - IP, ubicación geográfica (GeoIP), user agent
- ✅ **Visualización del documento** - Cada acceso registrado
- ✅ **Tiempo de visualización** - Duración de cada sesión

#### Proceso de Firma
- ✅ **Inicio de firma** - Timestamp exacto
- ✅ **Campos rellenados** - Todos los datos introducidos por el firmante
- ✅ **Firma completada** - IP, ubicación, método (dibujada/escrita/subida)
- ✅ **Sellado criptográfico** - Hash de integridad de toda la cadena

#### Post-Firma
- ✅ **Descargas de PDF** - Cada descarga con IP y ubicación
- ✅ **Verificaciones de integridad** - Resultado de cada verificación
- ✅ **Certificados descargados** - Trazabilidad completa

### 🔐 Integridad Criptográfica

#### Cadena de Hash
Cada evento incluye:
- `hash`: SHA-256 del evento actual
- `previousHash`: Hash del evento anterior
- Esto crea una cadena inmutable de eventos

#### Sellado
Cuando se completa la firma:
1. Se calcula un `sealHash` de toda la cadena de eventos
2. Se marca como `sealed: true`
3. Cualquier modificación posterior invalidaría el sello

#### Verificación
```typescript
const verification = await verifyAuditIntegrity(signRequestId)
// {
//   valid: true,
//   errors: []
// }
```

### 🌍 Geolocalización

Cada evento incluye ubicación geográfica:
```typescript
{
  ip: "192.168.1.1",
  country: "ES",
  region: "Madrid",
  city: "Madrid",
  timezone: "Europe/Madrid",
  ll: [40.4168, -3.7038] // latitude, longitude
}
```

## 📊 Estructura de Datos

### AuditEvent
```typescript
{
  signRequestId: string
  contractId: string
  eventType: 'request.created' | 'request.sent' | 'request.accessed' | ...
  timestamp: Date
  ipAddress: string
  userAgent?: string
  geoLocation?: {
    ip: string
    country?: string
    region?: string
    city?: string
    timezone?: string
    ll?: [number, number]
  }
  metadata?: {
    channel?: 'email' | 'sms' | 'qr' | 'local' | 'tablet' | 'whatsapp'
    recipient?: string
    fieldsData?: Record<string, any>
    signatureData?: string
    signatureMethod?: 'drawn' | 'typed' | 'uploaded'
    // ... más datos específicos
  }
  hash?: string
  previousHash?: string
}
```

### AuditSummary
```typescript
{
  created: {
    timestamp: Date
    by: string
    defaultData?: Record<string, any>
  }
  sent?: {
    timestamp: Date
    channel: SignatureChannel
    recipient: string
    attempts: number
  }
  resends: Array<{
    timestamp: Date
    channel: SignatureChannel
    recipient: string
    reason?: string
  }>
  accesses: Array<{
    timestamp: Date
    ip: string
    location?: GeoLocation
    userAgent?: string
  }>
  signature?: {
    startedAt?: Date
    completedAt: Date
    ip: string
    location?: GeoLocation
    fieldsData?: Record<string, any>
    signatureMethod?: 'drawn' | 'typed' | 'uploaded'
  }
  sealed?: {
    timestamp: Date
    hash: string
    ip: string
  }
  downloads: Array<{
    timestamp: Date
    ip: string
    location?: GeoLocation
    format: 'pdf' | 'certificate'
  }>
  verifications: Array<{
    timestamp: Date
    ip: string
    result: 'valid' | 'invalid' | 'tampered'
  }>
}
```

## 🚀 Uso

### Registrar un Evento

```typescript
import { logAuditEvent } from '@/lib/audit/service'

// Durante la creación de la solicitud
await logAuditEvent({
  signRequestId: 'req_123',
  contractId: 'contract_456',
  eventType: 'request.created',
  userId: 'user_789',
  metadata: {
    fieldsData: { nombre: 'Juan', dni: '12345678A' }
  }
})

// Durante el envío
await logAuditEvent({
  signRequestId: 'req_123',
  contractId: 'contract_456',
  eventType: 'request.sent',
  request, // NextRequest para extraer IP y user agent
  metadata: {
    channel: 'email',
    recipient: 'juan@example.com'
  }
})

// Al acceder al documento
await logAuditEvent({
  signRequestId: 'req_123',
  contractId: 'contract_456',
  eventType: 'request.accessed',
  request
})

// Al completar la firma
await logAuditEvent({
  signRequestId: 'req_123',
  contractId: 'contract_456',
  eventType: 'signature.completed',
  request,
  metadata: {
    signatureData: 'base64...',
    signatureMethod: 'drawn',
    fieldsData: { /* datos del formulario */ }
  }
})
```

### Sellar el Audit Trail

```typescript
import { sealAuditTrail } from '@/lib/audit/service'

// Después de completar la firma
const sealHash = await sealAuditTrail({
  signRequestId: 'req_123',
  contractId: 'contract_456',
  request
})
```

### Obtener el Audit Trail

```typescript
import { getAuditTrail, getAuditSummary } from '@/lib/audit/service'

// Trail completo (todos los eventos)
const trail = await getAuditTrail('req_123')

// Resumen estructurado
const summary = await getAuditSummary('req_123')
```

### Verificar Integridad

```typescript
import { verifyAuditIntegrity } from '@/lib/audit/service'

const verification = await verifyAuditIntegrity('req_123')
if (!verification.valid) {
  console.error('Audit trail comprometido:', verification.errors)
}
```

### Incluir en PDF

```typescript
import { generateAuditTrailText, generateAuditSections } from '@/lib/audit/pdf-formatter'

const summary = await getAuditSummary('req_123')

// Texto plano para PDF
const auditText = generateAuditTrailText(summary)

// Secciones estructuradas
const sections = generateAuditSections(summary)

// Footer corto
const footer = generateAuditFooter(summary)
```

## 🔌 API Endpoints

### GET /api/audit/[signRequestId]

Consultar audit trail:

```bash
# Resumen estructurado (por defecto)
GET /api/audit/req_123?format=summary

# Trail completo
GET /api/audit/req_123?format=full

# Verificar integridad
GET /api/audit/req_123?format=verify
```

Respuestas:

```typescript
// format=summary
{
  created: { timestamp, by, defaultData },
  sent: { timestamp, channel, recipient },
  accesses: [...],
  signature: { completedAt, ip, location, ... },
  sealed: { timestamp, hash },
  downloads: [...],
  verifications: [...]
}

// format=full
{
  signRequestId: "req_123",
  contractId: "contract_456",
  events: [...],
  createdAt: Date,
  signedAt: Date,
  sealedAt: Date,
  totalAccesses: 5,
  totalDownloads: 2,
  sealed: true,
  sealHash: "abc123..."
}

// format=verify
{
  valid: true,
  errors: []
}
```

## 📝 Integración en Endpoints Existentes

### 1. Creación de Solicitud
```typescript
// POST /api/signature-requests
await logAuditEvent({
  signRequestId,
  contractId,
  eventType: 'request.created',
  userId: session.user.id,
  metadata: {
    fieldsData: defaultFieldValues
  }
})
```

### 2. Envío de Solicitud
```typescript
// Después de enviar email/SMS
await logAuditEvent({
  signRequestId,
  contractId,
  eventType: 'request.sent',
  metadata: {
    channel: 'email',
    recipient: signerEmail
  }
})
```

### 3. Acceso al Documento
```typescript
// GET /api/sign-requests/[shortId]
await logAuditEvent({
  signRequestId,
  contractId,
  eventType: 'request.accessed',
  request
})
```

### 4. Completar Firma
```typescript
// PUT /api/sign-requests/[shortId]
await logAuditEvent({
  signRequestId,
  contractId,
  eventType: 'signature.completed',
  request,
  metadata: {
    signatureData: signature,
    signatureMethod: 'drawn',
    fieldsData: dynamicFieldValues
  }
})

// Sellar inmediatamente
await sealAuditTrail({
  signRequestId,
  contractId,
  request
})
```

### 5. Descarga de PDF
```typescript
// GET /api/sign-requests/[shortId]/pdf
await logAuditEvent({
  signRequestId,
  contractId,
  eventType: 'pdf.downloaded',
  request,
  metadata: {
    downloadFormat: 'pdf'
  }
})
```

## 🎨 Formato PDF

El audit trail se incluye al final del PDF firmado:

```
═══════════════════════════════════════════════════════
           REGISTRO DE AUDITORÍA DE FIRMA ELECTRÓNICA
═══════════════════════════════════════════════════════

1. CREACIÓN DE LA SOLICITUD
─────────────────────────────────────────────────────────
Fecha y hora: lunes, 2 de octubre de 2025, 14:30:15
Creado por: user@example.com
Datos pre-rellenados:
  • nombre: Juan Pérez
  • dni: 12345678A

2. ENVÍO DE LA SOLICITUD
─────────────────────────────────────────────────────────
Fecha y hora: lunes, 2 de octubre de 2025, 14:31:22
Canal: EMAIL
Destinatario: juan@example.com
Intentos de envío: 1

4. ACCESOS AL DOCUMENTO
─────────────────────────────────────────────────────────
Total de accesos: 3

Acceso 1:
  • Fecha y hora: lunes, 2 de octubre de 2025, 15:00:05
  • Dirección IP: 192.168.1.100
  • Ubicación: Madrid, Madrid, ES
  • Navegador: Mozilla/5.0...

5. PROCESO DE FIRMA
─────────────────────────────────────────────────────────
Inicio: lunes, 2 de octubre de 2025, 15:05:12
Completada: lunes, 2 de octubre de 2025, 15:06:45
Método: drawn
Dirección IP: 192.168.1.100
Ubicación: Madrid, Madrid, ES

6. SELLADO CRIPTOGRÁFICO
─────────────────────────────────────────────────────────
Fecha y hora: lunes, 2 de octubre de 2025, 15:06:46
Hash de integridad: a1b2c3d4e5f6...
Dirección IP: 192.168.1.100

═══════════════════════════════════════════════════════
Este registro cumple con el Reglamento eIDAS (UE) Nº 910/2014
y garantiza la integridad del proceso de firma.
═══════════════════════════════════════════════════════
```

## 🔒 Seguridad y Cumplimiento

### eIDAS Compliance
- ✅ Registro completo de eventos
- ✅ Integridad criptográfica (cadena de hash)
- ✅ Sellado temporal inmutable
- ✅ Geolocalización de firmantes
- ✅ Trazabilidad de accesos
- ✅ Evidencia de consentimiento

### RGPD Compliance
- ✅ Datos de ubicación anonimizables
- ✅ Logs con tiempo de retención definido
- ✅ Exportación de datos del usuario
- ✅ Derecho al olvido (tras período legal)

## 📊 Colección MongoDB

```javascript
// Colección: audit_events
{
  _id: ObjectId,
  signRequestId: "req_123",
  contractId: "contract_456",
  userId: "user_789",
  eventType: "signature.completed",
  timestamp: ISODate("2025-10-02T15:06:45Z"),
  ipAddress: "192.168.1.100",
  userAgent: "Mozilla/5.0...",
  geoLocation: {
    ip: "192.168.1.100",
    country: "ES",
    region: "Madrid",
    city: "Madrid",
    timezone: "Europe/Madrid",
    ll: [40.4168, -3.7038]
  },
  metadata: {
    signatureData: "base64...",
    signatureMethod: "drawn",
    fieldsData: { ... }
  },
  hash: "abc123...",
  previousHash: "def456..."
}
```

## 🎯 Roadmap

- [ ] Dashboard de auditoría en tiempo real
- [ ] Exportación a formato estándar (ETSI EN 319 102)
- [ ] Integración con servicios de timestamp externos
- [ ] Alertas de integridad comprometida
- [ ] Reportes de auditoría personalizados
