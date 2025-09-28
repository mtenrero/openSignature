# Checklist de Configuración Auth0 para API Keys

## ✅ Pasos Necesarios en Auth0 Dashboard

### 1. Verificar la Aplicación M2M para Management API

Ve a **Auth0 Dashboard > Applications > Machine to Machine Applications**

Busca la aplicación con estas credenciales:
- **Client ID**: `etlntQXTiTfjN3QZCZquoPtk1FzrmpWe`
- **Client Secret**: `NEZyYaAPIxEP1FgSmN12rtSiZeXvG_r9fmyBQp1hPS4VpSMg6a3nYK2j-bEPdi5w`

**✨ Importante**: Esta aplicación debe estar autorizada para la **Auth0 Management API v2**

### 2. Scopes Requeridos para Management API

La aplicación M2M debe tener estos scopes:
- ✅ `read:clients`
- ✅ `create:clients`
- ✅ `delete:clients`
- ✅ `update:clients`
- ✅ `read:client_grants`
- ✅ `create:client_grants`
- ✅ `delete:client_grants`

### 3. Crear API en Auth0 (si no existe)

Ve a **Auth0 Dashboard > APIs** y crea/verifica:

- **Name**: oSign.eu API
- **Identifier**: `https://osign.eu.api`
- **Signing Algorithm**: RS256

### 4. Configurar Scopes en la API

En la API creada, agregar estos scopes:

```json
{
  "read:contracts": "Leer contratos",
  "write:contracts": "Crear y modificar contratos",
  "read:signatures": "Leer solicitudes de firma",
  "write:signatures": "Crear solicitudes de firma"
}
```

## 🔧 Variables de Entorno Actuales

Según tu `.env.local`:

```bash
# ✅ Configuración Principal
AUTH0_DOMAIN=vetcontrol-pro.eu.auth0.com
AUTH0_CLIENT_ID=wjDLjNSHttdiTYo88paMnATC6d3tLTsV
AUTH0_CLIENT_SECRET=InI_zJeHn_YRWosL8ULfgIpx34ap_nYRwfeVbq9WRix-xzOE7S7oFWBiI6TpYCFE
AUTH0_ISSUER=https://vetcontrol-pro.eu.auth0.com/

# ✅ Management API (CRÍTICO para API Keys)
AUTH0_MANAGEMENT_CLIENT_ID=etlntQXTiTfjN3QZCZquoPtk1FzrmpWe
AUTH0_MANAGEMENT_CLIENT_SECRET=NEZyYaAPIxEP1FgSmN12rtSiZeXvG_r9fmyBQp1hPS4VpSMg6a3nYK2j-bEPdi5w

# ✅ API Identifier (NUEVO - agregado)
AUTH0_API_IDENTIFIER=https://osign.eu.api
```

## 🐛 Debugging

Para debuggear problemas, revisa los logs del servidor que mostrarán:

```
Getting management API token with: {
  domain: 'vetcontrol-pro.eu.auth0.com',
  clientId: 'PRESENT',
  clientSecret: 'PRESENT'
}
```

Si ves errores, los posibles problemas son:

1. **403 Forbidden**: La aplicación M2M no tiene permisos suficientes
2. **401 Unauthorized**: Credenciales incorrectas
3. **404 Not Found**: Domain incorrecto

## 🧪 Probar Configuración

Puedes probar manualmente la configuración:

```bash
curl -X POST https://vetcontrol-pro.eu.auth0.com/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "etlntQXTiTfjN3QZCZquoPtk1FzrmpWe",
    "client_secret": "NEZyYaAPIxEP1FgSmN12rtSiZeXvG_r9fmyBQp1hPS4VpSMg6a3nYK2j-bEPdi5w",
    "audience": "https://vetcontrol-pro.eu.auth0.com/api/v2/",
    "grant_type": "client_credentials"
  }'
```

Deberías recibir un `access_token` en la respuesta.

## 📋 Próximos Pasos

1. ✅ Refrescar la página `/settings/api-keys`
2. ✅ Revisar logs del servidor para errores específicos
3. ✅ Verificar configuración en Auth0 Dashboard
4. ✅ Probar creación de API Key