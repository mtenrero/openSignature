# 🏗️ Estructura de APIs - oSign.EU

## 📊 Vista General

```
oSign.EU API
│
├── 📝 Contracts (Contratos)
│   ├── GET    /api/contracts                  # Lista contratos
│   ├── POST   /api/contracts                  # Crear contrato
│   ├── GET    /api/contracts/{id}             # Ver contrato
│   ├── PUT    /api/contracts/{id}             # Actualizar contrato
│   └── DELETE /api/contracts/{id}             # Eliminar contrato
│
├── ✍️  Signature Requests (Solicitudes de Firma)
│   ├── GET    /api/signature-requests         # Lista solicitudes
│   ├── POST   /api/signature-requests         # Crear solicitud
│   ├── GET    /api/signature-requests/{id}    # Ver solicitud
│   ├── PATCH  /api/signature-requests/{id}    # Actualizar solicitud
│   ├── DELETE /api/signature-requests/{id}    # Eliminar solicitud
│   ├── POST   /api/signature-requests/{id}/archive  # Archivar
│   │
│   └── 🔓 Public Endpoints (con access key)
│       ├── GET /api/signature-requests/{id}/sign?a={key}  # Ver para firmar
│       ├── PUT /api/signature-requests/{id}/sign?a={key}  # Completar firma
│       └── GET /api/signature-requests/{id}/pdf?a={key}   # Descargar PDF
│
└── ✅ Signatures (Firmas Completadas)
    ├── GET    /api/signatures                 # Lista firmas
    └── POST   /api/signatures                 # Crear firma (S2S)
```

---

## 🎯 Flujo de Trabajo Completo

### 1️⃣ **Crear Contrato**
```http
POST /api/contracts
Authorization: Bearer osk_...

{
  "name": "Contrato de Servicio",
  "content": "<html>...</html>"
}
```

### 2️⃣ **Crear Solicitud de Firma**
```http
POST /api/signature-requests
Authorization: Bearer osk_...

{
  "contractId": "507f1f77bcf86cd799439011",
  "signatureType": "email",
  "signerEmail": "cliente@example.com"
}

Response:
{
  "signatureUrl": "https://osign.eu/sign/abc123?a=xyz789"
}
```

### 3️⃣ **Cliente Firma (Público)**
```http
PUT /api/signature-requests/abc123/sign?a=xyz789

{
  "signature": "data:image/png;base64,..."
}
```

### 4️⃣ **Verificar Firma Completada**
```http
GET /api/signatures?contractId=507f1f77bcf86cd799439011
Authorization: Bearer osk_...
```

---

## 🔑 Tipos de Autenticación

| Tipo | Header | Uso | Expira |
|------|--------|-----|---------|
| **API Key** | `Bearer osk_...` | M2M, Integraciones | ❌ Nunca |
| **JWT Token** | `Bearer eyJ...` | M2M con Auth0 | ✅ 24h |
| **Session** | Cookies | UI Web | ✅ Session |
| **Access Key** | Query `?a=...` | Links públicos | ✅ 7 días |

---

## 📌 Diferencias Clave

### **Signature Request vs Signature**

| Concepto | Signature Request | Signature |
|----------|------------------|-----------|
| **Estado** | pending, sent, signed, expired | completed |
| **Propósito** | Gestionar workflow | Almacenar resultado |
| **Acceso** | Privado (API Key) + Público (access key) | Solo privado |
| **Contiene** | shortId, signerEmail, status | signature (image), auditTrail, timestamp |
| **Ciclo** | Temporal (expira) | Permanente |

---

## 🚀 Parámetros Opcionales

### **Parámetro `full=true`**

Por defecto, los endpoints de listado excluyen campos pesados:

```http
# Listado ligero (por defecto)
GET /api/contracts
Response: [{ id, name, status, ... }]  # Sin content

# Listado completo
GET /api/contracts?full=true
Response: [{ id, name, status, content, htmlContent, ... }]
```

**Campos excluidos por defecto:**
- **Contracts**: `content`, `htmlContent`, `signedPdfBuffer`
- **Signatures**: `signature`, `metadata.auditTrail`, `metadata.dynamicFieldValues`

---

## 📝 Ejemplos Prácticos

### **Crear y Enviar Firma por Email**

```bash
# 1. Crear contrato
CONTRACT_ID=$(curl -X POST https://osign.eu/api/contracts \
  -H "Authorization: Bearer osk_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"Mi Contrato","content":"<html>...</html>"}' \
  | jq -r '.id')

# 2. Crear solicitud de firma
SIGN_URL=$(curl -X POST https://osign.eu/api/signature-requests \
  -H "Authorization: Bearer osk_..." \
  -H "Content-Type: application/json" \
  -d "{
    \"contractId\":\"$CONTRACT_ID\",
    \"signatureType\":\"email\",
    \"signerEmail\":\"cliente@example.com\",
    \"signerName\":\"Juan Pérez\"
  }" | jq -r '.signatureUrl')

echo "Link de firma: $SIGN_URL"
# Email enviado automáticamente con el link
```

### **Verificar Estado de Firma**

```bash
# Listar solicitudes pendientes
curl https://osign.eu/api/signature-requests?status=pending \
  -H "Authorization: Bearer osk_..."

# Listar firmas completadas
curl https://osign.eu/api/signatures?contractId=$CONTRACT_ID \
  -H "Authorization: Bearer osk_..."
```

---

## ⚠️ Deprecated Endpoints

Los siguientes endpoints seguirán funcionando pero no se recomiendan para nuevo desarrollo:

```
❌ /api/sign-requests              → Use /api/signature-requests
❌ /api/sign-requests/{shortId}    → Use /api/signature-requests/{id}/sign
❌ /api/sign-requests/{shortId}/pdf → Use /api/signature-requests/{id}/pdf
```

---

## 🔒 Seguridad

### **Access Keys**

- Generadas automáticamente al crear signature request
- Formato: Base64 de 6 caracteres
- Expiran con la solicitud (por defecto 7 días)
- Solo válidas para esa solicitud específica
- Incluidas en signatureUrl automáticamente

### **API Keys**

- Formato: `osk_` + 64 caracteres hex
- No expiran (permanentes hasta revocación)
- Pueden rastrearse: `lastUsedAt`
- Gestionables desde: `/settings/api-keys`

---

## 📖 Más Información

- **OpenAPI Spec**: `/api/openapi`
- **Documentación Completa**: `/docs/api`
- **Unificación de APIs**: `API-UNIFICATION.md`

---

**Versión:** 1.0.0
**Última actualización:** 2025-10-03
