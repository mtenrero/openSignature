# 🎯 Unificación de APIs de Firma - oSign.EU

## ✅ Estado: Completado

Esta documentación describe la unificación de los endpoints de firma para crear una API más limpia, consistente y lógica.

---

## 📋 Estructura Final (Nueva y Limpia)

### **Workflow de Firmas**

```
📦 Solicitudes de Firma (Workflow Management)
├── GET    /api/signature-requests              # Lista solicitudes pendientes
├── POST   /api/signature-requests              # Crea nueva solicitud
├── GET    /api/signature-requests/{id}         # Ver solicitud específica
├── PATCH  /api/signature-requests/{id}         # Actualizar (resend, etc.)
├── DELETE /api/signature-requests/{id}         # Eliminar solicitud
├── POST   /api/signature-requests/{id}/archive # Archivar con reembolso
│
├── 🔓 Endpoints Públicos (requieren access key)
├── GET    /api/signature-requests/{id}/sign?a={key}  # Ver contrato para firmar
├── PUT    /api/signature-requests/{id}/sign?a={key}  # Completar firma
└── GET    /api/signature-requests/{id}/pdf?a={key}   # Descargar PDF firmado

📦 Firmas Completadas (Resultados Finales)
├── GET    /api/signatures                      # Lista todas las firmas completadas
└── POST   /api/signatures                      # Crear firma (server-to-server)
```

---

## ⚠️ Endpoints Deprecados (Mantienen compatibilidad)

Los siguientes endpoints siguen funcionando pero están marcados como **DEPRECATED** en el OpenAPI:

```
❌ [DEPRECATED] /api/sign-requests                # Usar /api/signature-requests
❌ [DEPRECATED] /api/sign-requests/{shortId}      # Usar /api/signature-requests/{id}/sign
❌ [DEPRECATED] /api/sign-requests/{shortId}/pdf  # Usar /api/signature-requests/{id}/pdf
```

**Motivo de deprecación:** Inconsistencia en nombres y duplicación de funcionalidad.

**Compatibilidad:** Los endpoints legacy seguirán funcionando indefinidamente mediante redirects internos.

---

## 🔄 Cambios Implementados

### 1. **Nuevos Endpoints Creados**

#### `/api/signature-requests/{id}/sign/route.ts`
- **GET**: Ver contrato para firmar (público con access key)
- **PUT**: Completar firma (público con access key)
- **Acepta**: ObjectId o shortId
- **Comportamiento**: Redirect interno a `/api/sign-requests/{shortId}` para compatibilidad

#### `/api/signature-requests/{id}/pdf/route.ts`
- **GET**: Descargar PDF firmado (público con access key)
- **Acepta**: ObjectId o shortId
- **Comportamiento**: Redirect interno a `/api/sign-requests/{shortId}/pdf`

### 2. **OpenAPI Actualizado**

- ✅ Nuevos endpoints documentados con descripciones completas
- ✅ Tags añadidos: `Signature Workflow`
- ✅ Endpoints legacy marcados como `deprecated: true`
- ✅ Ejemplos de uso actualizados

### 3. **Compatibilidad Mantenida**

- ✅ URLs antiguas siguen funcionando (no hay breaking changes)
- ✅ UI existente no requiere cambios (usa shortId que funciona en ambos)
- ✅ Links de email/SMS siguen válidos

---

## 📊 Antes vs Después

### **Antes (Confuso)**

```
❓ /api/signatures          # ¿Solicitudes o completadas?
❓ /api/signature-requests  # ¿Qué diferencia con signatures?
❓ /api/sign-requests       # ¿Otro tipo de solicitud?
```

### **Después (Claro)**

```
✅ /api/signatures                    # Firmas COMPLETADAS (resultados)
✅ /api/signature-requests            # Solicitudes PENDIENTES (workflow)
✅ /api/signature-requests/{id}/sign  # Firmar (público)
✅ /api/signature-requests/{id}/pdf   # Descargar (público)
```

---

## 🎯 Conceptos Clave

### **Signature Request (Solicitud)**
- **Estado**: pending, sent, expired, signed
- **Propósito**: Gestionar el workflow de firma
- **Contiene**: contractId, signerEmail/Phone, shortId, accessKey
- **Ciclo de vida**: Creada → Enviada → Firmada/Expirada

### **Signature (Firma)**
- **Estado**: completed
- **Propósito**: Almacenar el resultado final
- **Contiene**: signature (base64), metadata, auditTrail, timestamp
- **Ciclo de vida**: Creada cuando se completa una Signature Request

---

## 🔐 Autenticación por Endpoint

| Endpoint | Auth Requerida | Tipo |
|----------|---------------|------|
| `GET /api/signature-requests` | ✅ API Key / JWT / Session | Privado |
| `POST /api/signature-requests` | ✅ API Key / JWT / Session | Privado |
| `GET /api/signature-requests/{id}` | ✅ API Key / JWT / Session | Privado |
| `GET /api/signature-requests/{id}/sign` | ⚠️ Access Key (query param) | Público |
| `PUT /api/signature-requests/{id}/sign` | ⚠️ Access Key (query param) | Público |
| `GET /api/signature-requests/{id}/pdf` | ⚠️ Access Key (query param) | Público |
| `GET /api/signatures` | ✅ API Key / JWT / Session | Privado |

---

## 🧪 Ejemplos de Uso

### **Crear Solicitud de Firma**

```bash
# Nuevo endpoint (recomendado)
curl -X POST https://osign.eu/api/signature-requests \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contractId": "507f1f77bcf86cd799439011",
    "signatureType": "email",
    "signerEmail": "cliente@example.com",
    "signerName": "Juan Pérez"
  }'

# Response:
{
  "success": true,
  "id": "507f1f77bcf86cd799439012",
  "shortId": "abc123xyz",
  "signatureUrl": "https://osign.eu/sign/abc123xyz?a=xYz789",
  "status": "pending"
}
```

### **Firmar Contrato (Público)**

```bash
# Nuevo endpoint unificado (recomendado)
curl -X PUT 'https://osign.eu/api/signature-requests/abc123xyz/sign?a=xYz789' \
  -H "Content-Type: application/json" \
  -d '{
    "signature": "data:image/png;base64,iVBORw0KGgo...",
    "dynamicFieldValues": {
      "nombre": "Juan Pérez",
      "dni": "12345678A"
    }
  }'

# También funciona con ObjectId:
curl -X PUT 'https://osign.eu/api/signature-requests/507f1f77bcf86cd799439012/sign?a=xYz789' \
  -H "Content-Type: application/json" \
  -d '{ ... }'
```

### **Descargar PDF Firmado**

```bash
# Nuevo endpoint (recomendado)
curl 'https://osign.eu/api/signature-requests/abc123xyz/pdf?a=xYz789' \
  --output contrato-firmado.pdf

# También funciona con ObjectId:
curl 'https://osign.eu/api/signature-requests/507f1f77bcf86cd799439012/pdf?a=xYz789' \
  --output contrato-firmado.pdf
```

---

## 🚀 Migración para Clientes Existentes

### **¿Necesito actualizar mi código?**

**NO** - Los endpoints legacy siguen funcionando indefinidamente.

### **¿Debo migrar?**

**SÍ (recomendado)** - Para usar la estructura más limpia y moderna:

| Endpoint Legacy | Nuevo Endpoint |
|----------------|----------------|
| `GET /api/sign-requests/{shortId}?a={key}` | `GET /api/signature-requests/{shortId}/sign?a={key}` |
| `PUT /api/sign-requests/{shortId}?a={key}` | `PUT /api/signature-requests/{shortId}/sign?a={key}` |
| `GET /api/sign-requests/{shortId}/pdf?a={key}` | `GET /api/signature-requests/{shortId}/pdf?a={key}` |

**Nota:** Los nuevos endpoints también aceptan ObjectId además de shortId.

---

## 📁 Archivos Creados/Modificados

### **Nuevos Archivos:**
1. `app/api/signature-requests/[id]/sign/route.ts` - Endpoint unificado para firmar
2. `app/api/signature-requests/[id]/pdf/route.ts` - Endpoint unificado para PDF
3. `API-UNIFICATION.md` - Esta documentación

### **Archivos Modificados:**
1. `app/api/openapi/route.ts` - OpenAPI actualizado con nueva estructura
2. Todos los endpoints principales ya actualizados con autenticación unificada

### **Archivos Mantenidos (Legacy):**
- `app/api/sign-requests/route.ts` - Mantiene compatibilidad
- `app/api/sign-requests/[shortId]/route.ts` - Mantiene compatibilidad
- `app/api/sign-requests/[shortId]/pdf/route.ts` - Mantiene compatibilidad

---

## ✅ Checklist de Implementación

- [x] Analizar estructura actual y redundancias
- [x] Diseñar nueva estructura unificada
- [x] Crear nuevos endpoints con redirects internos
- [x] Actualizar OpenAPI con deprecation warnings
- [x] Mantener compatibilidad total con endpoints legacy
- [x] Verificar que UI no se rompe
- [x] Build exitoso sin errores
- [x] Documentación completa

---

## 🎉 Beneficios de la Unificación

1. **Claridad**: Nombres consistentes y lógicos
2. **Simplicidad**: Estructura más fácil de entender
3. **Escalabilidad**: Base sólida para futuras funcionalidades
4. **Compatibilidad**: No rompe código existente
5. **Documentación**: OpenAPI más limpio y profesional

---

## 📞 Soporte

Para preguntas sobre la nueva estructura de API:
- 📧 Email: api@osign.eu
- 📖 Documentación: https://osign.eu/docs/api
- 🔗 OpenAPI Spec: https://osign.eu/api/openapi

---

**Última actualización:** 2025-10-03
**Versión API:** 1.0.0
