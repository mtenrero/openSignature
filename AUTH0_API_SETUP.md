# Configuración de API Keys M2M con Auth0

Este documento explica cómo configurar Auth0 para permitir el uso de API Keys Machine-to-Machine (M2M) con oSign.eu.

## 1. Configuración en Auth0 Dashboard

### Crear API en Auth0

1. Ve a Auth0 Dashboard > APIs
2. Crea una nueva API:
   - **Name**: oSign.eu API
   - **Identifier**: `https://osign.eu.api`
   - **Signing Algorithm**: RS256

### Configurar Scopes

En la API creada, define los siguientes scopes:

```json
{
  "read:contracts": "Leer contratos",
  "write:contracts": "Crear y modificar contratos",
  "read:signatures": "Leer solicitudes de firma",
  "write:signatures": "Crear solicitudes de firma",
  "read:profile": "Leer información del perfil",
  "write:profile": "Modificar información del perfil"
}
```

### Configurar Machine-to-Machine Application

1. Ve a Applications > Machine to Machine Applications
2. Autoriza tu aplicación principal para acceder a la Management API v2
3. Concede los siguientes scopes para la Management API:
   - `read:clients`
   - `create:clients`
   - `delete:clients`
   - `update:clients`
   - `read:client_grants`
   - `create:client_grants`
   - `delete:client_grants`

## 2. Variables de Entorno

Asegúrate de tener estas variables configuradas:

```bash
# Auth0 Configuration
AUTH0_DOMAIN=tu-dominio.auth0.com
AUTH0_CLIENT_ID=tu_client_id
AUTH0_CLIENT_SECRET=tu_client_secret
AUTH0_API_IDENTIFIER=https://osign.eu.api

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=tu_nextauth_secret
```

## 3. Uso de las API Keys

### Crear API Key

Desde la interfaz web:
1. Ve a Perfil > API Keys
2. Haz clic en "Nueva API Key"
3. Proporciona nombre y descripción
4. Guarda el Client ID y Client Secret (el secret solo se muestra una vez)

### Autenticación M2M

#### 1. Obtener Token de Acceso

```bash
curl -X POST https://vetcontrol-pro.eu.auth0.com/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "TU_CLIENT_ID",
    "client_secret": "TU_CLIENT_SECRET",
    "audience": "https://osign.eu.api",
    "grant_type": "client_credentials"
  }'
```

Respuesta:
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 86400
}
```

#### 2. Usar la API

```bash
curl -X GET https://osign.eu/api/contracts/m2m-example \
  -H "Authorization: Bearer TU_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

## 4. Endpoints Disponibles

### Contratos

#### Listar Contratos
```http
GET /api/contracts/m2m-example
Authorization: Bearer {access_token}
```

Query parameters:
- `status`: draft, active, signed, archived, all
- `limit`: número de resultados (default: 10)
- `skip`: número de resultados a saltar (default: 0)

#### Crear Contrato
```http
POST /api/contracts/m2m-example
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "name": "Mi Contrato",
  "description": "Descripción del contrato",
  "content": "<p>Contenido HTML del contrato</p>"
}
```

### Firmas

*Próximamente: endpoints para gestión de solicitudes de firma*

## 5. Scopes y Permisos

| Scope | Descripción | Endpoints |
|-------|-------------|-----------|
| `read:contracts` | Leer contratos | GET /api/contracts/* |
| `write:contracts` | Crear/modificar contratos | POST, PUT, PATCH /api/contracts/* |
| `read:signatures` | Leer solicitudes de firma | GET /api/signatures/* |
| `write:signatures` | Crear solicitudes de firma | POST /api/signatures/* |

## 6. Seguridad

### Mejores Prácticas

1. **Almacenamiento Seguro**: Nunca hardcodees las credenciales en tu código
2. **Rotación de Secrets**: Rota regularmente los client secrets
3. **Scopes Mínimos**: Solo solicita los scopes que realmente necesitas
4. **HTTPS**: Siempre usa HTTPS en producción
5. **Monitoreo**: Revisa regularmente el uso de las API Keys

### Regenerar Secret

Para regenerar el client secret de una API Key:

```http
PUT /api/auth0/api-keys/{client_id}
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "action": "regenerate_secret"
}
```

## 7. Limitaciones y Consideraciones

1. **Rate Limiting**: Auth0 aplica límites de velocidad según tu plan
2. **Token Expiration**: Los tokens M2M expiran (típicamente 24 horas)
3. **Auditoría**: Todos los usos se registran para auditoría
4. **Billing**: Las llamadas M2M pueden contar hacia tu límite de MAU

## 8. Troubleshooting

### Error: "Invalid token"
- Verifica que el token no haya expirado
- Confirma que el audience sea correcto
- Revisa que el cliente tenga los scopes necesarios

### Error: "Insufficient scope"
- Verifica que el token incluya los scopes requeridos
- Confirma que el client grant esté configurado correctamente

### Error: "Client not found"
- Verifica que el client_id sea correcto
- Confirma que el cliente no haya sido eliminado

## 9. Ejemplo Completo

```bash
#!/bin/bash

# Variables
AUTH0_DOMAIN="vetcontrol-pro.eu.auth0.com"
CLIENT_ID="tu_client_id"
CLIENT_SECRET="tu_client_secret"
API_BASE="https://osign.eu/api"

# 1. Obtener token
TOKEN_RESPONSE=$(curl -s -X POST "https://$AUTH0_DOMAIN/oauth/token" \
  -H "Content-Type: application/json" \
  -d "{
    \"client_id\": \"$CLIENT_ID\",
    \"client_secret\": \"$CLIENT_SECRET\",
    \"audience\": \"https://osign.eu.api\",
    \"grant_type\": \"client_credentials\"
  }")

ACCESS_TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.access_token')

# 2. Listar contratos
curl -X GET "$API_BASE/contracts/m2m-example" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json"

# 3. Crear contrato
curl -X POST "$API_BASE/contracts/m2m-example" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Contrato API Test",
    "description": "Contrato creado via API",
    "content": "<h1>Contrato de Prueba</h1><p>Este contrato fue creado usando la API M2M.</p>"
  }'
```

Para más información, consulta la [documentación de Auth0](https://auth0.com/docs/get-started/authentication-and-authorization-flow/client-credentials-flow).