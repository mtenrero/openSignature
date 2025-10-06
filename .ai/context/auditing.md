# Guía de Auditoría para Firma Electrónica Simple (SES) - eIDAS 2.0

## Última actualización: 2025-01-27

---

## 1. Marco Legal y Normativo

### Normativa Aplicable
- **Reglamento eIDAS:** (UE) 910/2014 - Artículo 25 (Firma Electrónica Simple)
- **Ley española:** Ley 6/2020, de 11 de noviembre (BOE-A-2020-14046)
- **Tipo de firma:** SES (Simple Electronic Signature) - NO cualificada
- **Proveedor:** NO cualificado de servicios de confianza

### Requisitos de Auditoría para SES
Según el Artículo 25 eIDAS, las firmas electrónicas simples tienen **validez legal** pero **sin presunción de validez**. Por tanto, la auditoría debe proporcionar evidencias suficientes para demostrar:
1. **Integridad del documento** (no modificado)
2. **Identificación del firmante** (método utilizado)
3. **Consentimiento inequívoco** (intención de firmar)
4. **Timestamp de la firma** (momento exacto)
5. **Integridad de la auditoría** (cadena de evidencias)

---

## 2. Puntos de Auditoría Obligatorios

### 2.1 Creación de Solicitud de Firma

**Evento:** `solicitud_firma_creada`

**Datos a auditar:**
```typescript
{
  timestamp: Date,
  action: 'solicitud_firma_creada',
  actor: {
    id: string,           // ID del usuario que crea la solicitud
    type: 'user',
    identifier: string    // Email o identificador del usuario
  },
  resource: {
    type: 'contract',
    id: string,           // ID del contrato
    name: string          // Nombre del contrato
  },
  details: {
    signatureRequestId: string,
    shortId: string,      // ID corto para acceso
    signatureType: string, // 'email', 'sms', 'local', 'tablet', 'qr'
    signerName: string,
    signerEmail: string,
    signerPhone: string,
    clientName: string,
    clientTaxId: string,
    expiresAt: Date
  },
  metadata: {
    ipAddress: string,    // IP del creador
    userAgent: string,    // Navegador/dispositivo
    session: string       // ID de sesión
  }
}
```

**Implementación actual:**
- ✅ Registrado en `app/api/signature-requests/route.ts` línea 272-301
- ✅ Registrado en `app/api/sign-requests/route.ts` línea 127-153
- ✅ IP capturada mediante `extractClientIP(request)`
- ✅ Timestamp cualificado aplicado

### 2.2 Acceso al Contrato para Firma

**Evento:** `document_accessed`

**Datos a auditar:**
```typescript
{
  timestamp: Date,
  action: 'document_accessed',
  actor: {
    id: string,           // ID del firmante
    type: 'user',
    identifier: string    // Email del firmante
  },
  resource: {
    type: 'document',
    id: string,           // ID del contrato
    name: string          // Nombre del documento
  },
  details: {
    documentHash: string, // Hash SHA-256 del documento
    documentSize: number, // Tamaño en bytes
    accessMethod: 'web_interface',
    accessKey: string,    // Código de acceso utilizado
    contractSnapshot: object // Snapshot inmutable del contrato
  },
  metadata: {
    ipAddress: string,    // IP del firmante
    userAgent: string,    // Navegador/dispositivo
    deviceMetadata: object, // Metadatos del dispositivo
    session: string       // ID de sesión de firma
  }
}
```

**Implementación actual:**
- ✅ Registrado en `lib/auditTrail.ts` línea 181-197
- ✅ Hash del documento capturado
- ✅ Metadatos del dispositivo incluidos
- ✅ IP y User-Agent registrados

### 2.3 Identificación del Firmante

**Evento:** `signer_identified`

**Datos a auditar:**
```typescript
{
  timestamp: Date,
  action: 'signer_identified',
  actor: {
    id: string,           // ID del firmante
    type: 'user',
    identifier: string    // Email del firmante
  },
  resource: {
    type: 'contract',
    id: string            // ID del contrato
  },
  details: {
    signerName: string,   // Nombre completo
    signerTaxId: string,  // DNI/CIF (si proporcionado)
    signerEmail: string,   // Email de contacto
    signerPhone: string,   // Teléfono (si SMS)
    identificationMethod: string, // 'sms', 'email', 'local', etc.
    verificationCode: string,     // Código OTP (hash)
    verificationSentAt: Date,     // Momento de envío
    verificationVerifiedAt: Date   // Momento de verificación
  },
  metadata: {
    ipAddress: string,     // IP durante identificación
    userAgent: string,    // Navegador/dispositivo
    deviceMetadata: object,
    session: string
  }
}
```

**Implementación actual:**
- ✅ Registrado en `lib/auditTrail.ts` línea 199-218
- ✅ Método de identificación capturado
- ✅ Datos del firmante registrados
- ⚠️ **GAP:** Códigos OTP no se auditan (solo hash)

### 2.4 Verificación de Consentimiento

**Evento:** `consent_verified`

**Datos a auditar:**
```typescript
{
  timestamp: Date,
  action: 'consent_verified',
  actor: {
    id: string,           // ID del firmante
    type: 'user',
    identifier: string    // Email del firmante
  },
  resource: {
    type: 'contract',
    id: string            // ID del contrato
  },
  details: {
    consentGiven: boolean,     // Consentimiento explícito
    intentToBind: boolean,     // Intención de vincularse
    agreement: string,         // Texto del acuerdo
    disclaimerRead: boolean,   // Disclaimer leído
    termsAccepted: boolean,    // Términos aceptados
    privacyPolicyAccepted: boolean // Política de privacidad aceptada
  },
  evidence: {
    consent: boolean,      // Evidencia de consentimiento
    intent: boolean,       // Evidencia de intención
    agreement: string      // Texto del acuerdo
  },
  metadata: {
    ipAddress: string,     // IP durante consentimiento
    userAgent: string,    // Navegador/dispositivo
    session: string
  }
}
```

**Implementación actual:**
- ✅ Registrado en `lib/auditTrail.ts` línea 220-241
- ✅ Consentimiento e intención capturados
- ⚠️ **GAP:** No se verifica lectura de disclaimer
- ⚠️ **GAP:** No se capturan términos específicos

### 2.5 Introducción de Datos Opcionales

**Evento:** `optional_data_provided`

**Datos a auditar:**
```typescript
{
  timestamp: Date,
  action: 'optional_data_provided',
  actor: {
    id: string,           // ID del firmante
    type: 'user',
    identifier: string    // Email del firmante
  },
  resource: {
    type: 'contract',
    id: string            // ID del contrato
  },
  details: {
    fieldName: string,    // Nombre del campo
    fieldValue: string,   // Valor proporcionado (hash si sensible)
    fieldType: string,    // Tipo de campo
    isRequired: boolean,   // Si era obligatorio
    validationPassed: boolean, // Si pasó validación
    providedAt: Date      // Momento de introducción
  },
  metadata: {
    ipAddress: string,    // IP durante introducción
    userAgent: string,    // Navegador/dispositivo
    session: string
  }
}
```

**Implementación actual:**
- ❌ **GAP CRÍTICO:** No se audita introducción de datos opcionales
- ❌ **GAP:** No se registra validación de campos
- ❌ **GAP:** No se captura momento de introducción

### 2.6 Creación de la Firma

**Evento:** `signature_created`

**Datos a auditar:**
```typescript
{
  timestamp: Date,
  action: 'signature_created',
  actor: {
    id: string,           // ID del firmante
    type: 'user',
    identifier: string    // Email del firmante
  },
  resource: {
    type: 'signature',
    id: string            // ID de la firma
  },
  details: {
    signatureMethod: string,      // Método de firma
    signatureDuration: number,     // Tiempo en crear firma (ms)
    signaturePoints: number,      // Puntos de firma (si tablet)
    documentViewDuration: number, // Tiempo viendo documento (ms)
    interactionEventsCount: number, // Eventos de interacción
    signatureHash: string,       // Hash de la firma
    signatureImage: string,       // Imagen de firma (base64 hash)
    signatureCoordinates: object  // Coordenadas de firma
  },
  metadata: {
    ipAddress: string,    // IP durante firma
    userAgent: string,    // Navegador/dispositivo
    deviceMetadata: object,
    session: string
  }
}
```

**Implementación actual:**
- ✅ Registrado en `lib/auditTrail.ts` línea 243-262
- ✅ Método y duración capturados
- ✅ Eventos de interacción contados
- ⚠️ **GAP:** Hash de firma no se audita
- ⚠️ **GAP:** Coordenadas de firma no se auditan

### 2.7 Verificación de Integridad del Documento

**Evento:** `document_integrity_verified`

**Datos a auditar:**
```typescript
{
  timestamp: Date,
  action: 'document_integrity_verified',
  actor: {
    id: 'system',
    type: 'system',
    identifier: 'audit-service'
  },
  resource: {
    type: 'document',
    id: string,           // ID del contrato
    name: string          // Nombre del documento
  },
  details: {
    documentHash: string,     // Hash SHA-256 del documento
    algorithm: 'SHA-256',     // Algoritmo utilizado
    verified: boolean,        // Si la verificación pasó
    verificationMethod: 'cryptographic_hash',
    originalSize: number,     // Tamaño original
    currentSize: number,      // Tamaño actual
    modificationsDetected: boolean // Si se detectaron modificaciones
  },
  metadata: {
    ipAddress: 'system',
    userAgent: 'audit-service'
  }
}
```

**Implementación actual:**
- ✅ Registrado en `lib/auditTrail.ts` línea 264-280
- ✅ Hash y algoritmo capturados
- ✅ Verificación automática implementada
- ⚠️ **GAP:** No se compara tamaño original vs actual

### 2.8 Aplicación de Timestamp Cualificado

**Evento:** `qualified_timestamp_applied`

**Datos a auditar:**
```typescript
{
  timestamp: Date,
  action: 'qualified_timestamp_applied',
  actor: {
    id: 'system',
    type: 'system',
    identifier: 'timestamp-service'
  },
  resource: {
    type: 'signature',
    id: string            // ID de la firma
  },
  details: {
    timestampValue: Date,     // Valor del timestamp
    tsaUrl: string,          // URL del TSA
    verified: boolean,       // Si está verificado
    serialNumber: string,    // Número de serie del token
    token: string,          // Token completo (base64)
    documentHash: string,    // Hash del documento timestampado
    algorithm: 'RFC-3161',   // Algoritmo del timestamp
    isQualified: boolean     // Si es cualificado (false para SES)
  },
  metadata: {
    ipAddress: 'system',
    userAgent: 'timestamp-service'
  }
}
```

**Implementación actual:**
- ✅ Timestamp aplicado en múltiples puntos
- ✅ URL del TSA capturada
- ✅ Token almacenado
- ⚠️ **GAP:** No se audita como evento específico
- ⚠️ **GAP:** No se marca explícitamente como NO cualificado

### 2.9 Sellado de la Auditoría

**Evento:** `audit_trail_sealed`

**Datos a auditar:**
```typescript
{
  timestamp: Date,
  action: 'audit_trail_sealed',
  actor: {
    id: 'system',
    type: 'system',
    identifier: 'audit-service'
  },
  resource: {
    type: 'contract',
    id: string            // ID del contrato
  },
  details: {
    reason: 'Signature completed - trail sealed for integrity',
    recordsCount: number,  // Número de registros
    rootHash: string,     // Hash raíz de la auditoría
    sealedAt: Date,       // Momento del sellado
    integrityVerified: boolean // Si la integridad se verificó
  },
  metadata: {
    ipAddress: 'system',
    userAgent: 'audit-service'
  }
}
```

**Implementación actual:**
- ✅ Implementado en `lib/auditTrail.ts` línea 288-316
- ✅ Hash raíz calculado
- ✅ Sellado automático tras firma
- ✅ Verificación de integridad incluida

---

## 3. Captura de IP y Metadatos de Dispositivo

### 3.1 Extracción de IP

**Implementación actual:**
```typescript
// Función extractClientIP utilizada en múltiples endpoints
function extractClientIP(request: NextRequest): string {
  return request.headers.get('x-forwarded-for') || 
         request.headers.get('x-real-ip') || 
         request.headers.get('cf-connecting-ip') || 
         'unknown'
}
```

**Puntos de captura:**
- ✅ Creación de solicitud de firma
- ✅ Acceso al contrato
- ✅ Identificación del firmante
- ✅ Creación de firma
- ✅ Descarga de PDF

### 3.2 Metadatos de Dispositivo

**Estructura actual:**
```typescript
interface DeviceMetadata {
  ipAddress: string
  userAgent: string
  timestamp: string
  screenResolution?: string
  timezone?: string
  language?: string
  platform?: string
  browser?: string
  deviceType?: string
}
```

**Implementación:**
- ✅ Capturado en `lib/deviceMetadata.ts`
- ✅ Incluido en auditoría de firma
- ✅ Almacenado en metadatos de firma

---

## 4. Inclusión en PDF Generado

### 4.1 Página de Verificación de Auditoría

**Implementación actual:**
- ✅ Página dedicada en `lib/pdf/signedContractGenerator.ts` línea 251-254
- ✅ Función `addAuditTrailVerificationPage()` implementada
- ✅ Verificación de integridad incluida

### 4.2 Contenido de la Página de Auditoría

**Elementos incluidos:**
1. **Resumen de eventos** - Lista cronológica de eventos
2. **Verificación de integridad** - Estado de la cadena de hashes
3. **Metadatos de firma** - IP, dispositivo, timestamp
4. **Hash raíz** - Para verificación externa
5. **Información legal** - Disclaimer SES y limitaciones

### 4.3 Formato de Exportación

**Estructura actual:**
```typescript
interface AuditTrailExport {
  trail: AuditTrail
  verification: {
    isValid: boolean
    issues: string[]
  }
  exportFormat: 'eIDAS-Audit-Trail-v1.0'
  exportedAt: Date
}
```

---

## 5. Gaps Identificados y Acciones Requeridas

### 5.1 Gaps Críticos

| Gap | Descripción | Prioridad | Coste | Plazo |
|-----|-------------|-----------|-------|-------|
| **Datos opcionales** | No se audita introducción de campos opcionales | 🔴 CRÍTICA | 1.000€ | 1 mes |
| **Hash de firma** | No se audita hash de la imagen de firma | 🔴 CRÍTICA | 500€ | 2 semanas |
| **Disclaimer** | No se verifica lectura de disclaimer | 🟠 ALTA | 800€ | 3 semanas |
| **Timestamp evento** | Timestamp no se audita como evento específico | 🟠 ALTA | 300€ | 1 semana |
| **Coordenadas firma** | No se auditan coordenadas de firma | 🟡 MEDIA | 400€ | 2 semanas |

### 5.2 Acciones Inmediatas (Sprint 1-2)

#### Sprint 1 (Semana 1-2)
- [ ] **Implementar auditoría de datos opcionales**
  - Capturar evento `optional_data_provided`
  - Registrar validación de campos
  - Incluir en PDF de verificación

- [ ] **Auditar hash de firma**
  - Calcular hash SHA-256 de imagen de firma
  - Registrar en evento `signature_created`
  - Incluir en verificación de integridad

#### Sprint 2 (Semana 3-4)
- [ ] **Verificar lectura de disclaimer**
  - Capturar evento `disclaimer_read`
  - Requerir confirmación explícita
  - Incluir en evidencia de consentimiento

- [ ] **Auditar timestamp como evento**
  - Crear evento `qualified_timestamp_applied`
  - Marcar explícitamente como NO cualificado
  - Incluir token completo en auditoría

### 5.3 Mejoras Adicionales (Sprint 3-4)

#### Sprint 3 (Semana 5-6)
- [ ] **Auditar coordenadas de firma**
  - Capturar posición X,Y de firma
  - Registrar en evento `signature_created`
  - Incluir en metadatos de firma

- [ ] **Mejorar verificación de integridad**
  - Comparar tamaño original vs actual
  - Detectar modificaciones del documento
  - Incluir en evento `document_integrity_verified`

#### Sprint 4 (Semana 7-8)
- [ ] **Optimizar PDF de auditoría**
  - Mejorar formato de eventos
  - Incluir códigos QR de verificación
  - Añadir firma digital del PDF

---

## 6. Cumplimiento Legal eIDAS

### 6.1 Artículo 25 eIDAS - SES

**Requisitos cumplidos:**
- ✅ **Validez legal** - Firma tiene efectos jurídicos
- ✅ **Integridad** - Documento no modificado
- ✅ **Identificación** - Método de identificación registrado
- ✅ **Consentimiento** - Intención de firmar capturada
- ✅ **Timestamp** - Momento de firma registrado

**Limitaciones aceptadas:**
- ⚠️ **Sin presunción de validez** - Carga de prueba compartida
- ⚠️ **Identificación no robusta** - SMS/Email suficiente para SES
- ⚠️ **Timestamp NO cualificado** - OpenTSA válido para SES

### 6.2 Evidencias de Cumplimiento

**Documentación requerida:**
1. **Cadena de auditoría completa** - Desde creación hasta sellado
2. **Verificación de integridad** - Hash del documento y auditoría
3. **Metadatos de firma** - IP, dispositivo, timestamp
4. **Evidencia de consentimiento** - Intención inequívoca de firmar
5. **Información legal** - Disclaimer de limitaciones SES

**Almacenamiento:**
- **Período:** 6 años (Código de Comercio español)
- **Formato:** PDF/A-3 con auditoría incluida
- **Backup:** AWS S3 Glacier
- **Acceso:** Propietario del contrato + firmante

---

## 7. Implementación Técnica

### 7.1 Estructura de Base de Datos

**Colección: `audit_trails`**
```typescript
interface AuditTrailDocument {
  _id: ObjectId
  resourceId: string        // ID del contrato
  resourceType: 'contract' | 'signature' | 'document'
  records: AuditRecord[]    // Array de eventos
  rootHash: string         // Hash raíz de integridad
  createdAt: Date
  lastModified: Date
  isSealed: boolean
  sealedAt?: Date
  customerId: string        // ID del cliente
  metadata: {
    version: 'eIDAS-Audit-Trail-v1.0'
    algorithm: 'SHA-256'
    tsaUrl: string
  }
}
```

### 7.2 API de Auditoría

**Endpoints requeridos:**
- `GET /api/audit/{contractId}` - Obtener auditoría completa
- `GET /api/audit/{contractId}/verify` - Verificar integridad
- `GET /api/audit/{contractId}/export` - Exportar para evidencia legal
- `POST /api/audit/{contractId}/seal` - Sellar auditoría

### 7.3 Integración con PDF

**Flujo actual:**
1. Firma completada → Auditoría sellada
2. PDF generado → Auditoría incluida
3. Verificación de integridad → Hash raíz verificado
4. Descarga PDF → Auditoría completa incluida

---

## 8. Monitoreo y Alertas

### 8.1 Métricas de Auditoría

**KPIs a monitorear:**
- **Integridad:** % de auditorías con hash válido
- **Completitud:** % de eventos capturados correctamente
- **Tiempo de respuesta:** Latencia de generación de PDF
- **Errores:** Fallos en captura de eventos

### 8.2 Alertas Críticas

**Alertas automáticas:**
- Auditoría con hash inválido
- Eventos faltantes en cadena de auditoría
- Fallo en sellado de auditoría
- Modificaciones detectadas en documento

### 8.3 Logs de Auditoría

**Niveles de log:**
- **INFO:** Eventos de auditoría normales
- **WARN:** Eventos con advertencias
- **ERROR:** Fallos en captura de eventos
- **CRITICAL:** Compromiso de integridad

---

## 9. Plan de Implementación

### 9.1 Fase 1: Gaps Críticos (Mes 1-2)
**Objetivo:** Implementar auditoría completa para SES

**Tareas:**
- [ ] Auditoría de datos opcionales (1.000€)
- [ ] Hash de firma en auditoría (500€)
- [ ] Verificación de disclaimer (800€)
- [ ] Evento de timestamp (300€)

**Total Fase 1:** 2.600€

### 9.2 Fase 2: Mejoras (Mes 3-4)
**Objetivo:** Optimizar auditoría y PDF

**Tareas:**
- [ ] Coordenadas de firma (400€)
- [ ] Mejora verificación integridad (600€)
- [ ] Optimización PDF (800€)
- [ ] Códigos QR verificación (400€)

**Total Fase 2:** 2.200€

### 9.3 Fase 3: Monitoreo (Mes 5-6)
**Objetivo:** Monitoreo y alertas

**Tareas:**
- [ ] Dashboard de auditoría (1.000€)
- [ ] Alertas automáticas (500€)
- [ ] Métricas de cumplimiento (300€)
- [ ] Reportes de integridad (400€)

**Total Fase 3:** 2.200€

**Inversión total:** 7.000€

---

## 10. Conclusiones

### 10.1 Estado Actual
- **Cumplimiento básico:** ✅ Implementado
- **Gaps críticos:** 5 identificados
- **Inversión requerida:** 7.000€
- **Plazo implementación:** 6 meses

### 10.2 Beneficios de la Auditoría Completa
- **Cumplimiento legal:** 100% eIDAS Art. 25
- **Evidencias robustas:** Cadena de auditoría completa
- **Integridad garantizada:** Hash de documento y auditoría
- **Trazabilidad completa:** Desde creación hasta sellado
- **Valor probatorio:** Evidencias para procedimientos judiciales

### 10.3 Riesgos de No Implementar
- **Impugnación de firma:** Falta de evidencias
- **No cumplimiento eIDAS:** Requisitos mínimos no cubiertos
- **Pérdida de confianza:** Clientes requieren auditoría completa
- **Problemas legales:** Evidencias insuficientes en juicios

---

**Documento generado:** 2025-01-27
**Próxima revisión:** Tras implementar Fase 1
**Responsable:** Equipo openSignature
**Aprobación legal:** Pendiente revisión jurídica

