# OAuth2 Testing Guide

## Resumen

Este proyecto implementa un **proxy transparente OAuth2** usando el grant type `client_credentials` para autenticación M2M (machine-to-machine). El endpoint actúa como proxy directo a Auth0, delegando completamente la gestión de credenciales.

## Arquitectura

### Flujo Transparente (Actual)

```
Cliente → /api/oauth/token (Proxy) → Auth0 → Token
```

1. **Clientes OAuth** - Gestionados directamente en Auth0
2. **Token Endpoint** - `/api/oauth/token` - Proxy transparente a Auth0
3. **Validación** - Delegada completamente a Auth0

**Ventajas:**
- ✅ Sin gestión de credenciales en la aplicación
- ✅ Credenciales 100% gestionadas por Auth0
- ✅ Más simple y seguro
- ✅ Un único punto de verdad (Auth0)

## Pruebas Manuales

### 1. Crear un cliente OAuth en Auth0

Crea tus credenciales M2M directamente en Auth0:

1. Ve a Auth0 Dashboard → Applications → Create Application
2. Selecciona "Machine to Machine Applications"
3. Selecciona tu API (audience)
4. Configura los scopes/permisos necesarios
5. Guarda el `Client ID` y `Client Secret`

### 2. Solicitar un token de acceso

#### Usando form-urlencoded (recomendado para OAuth2):

```bash
curl -X POST http://localhost:3000/api/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=TU_AUTH0_CLIENT_ID&client_secret=TU_AUTH0_CLIENT_SECRET"
```

#### Usando JSON:

```bash
curl -X POST http://localhost:3000/api/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "TU_AUTH0_CLIENT_ID",
    "client_secret": "TU_AUTH0_CLIENT_SECRET",
    "audience": "https://osign.eu"
  }'
```

#### Con audience y scope personalizados:

```bash
curl -X POST http://localhost:3000/api/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "TU_AUTH0_CLIENT_ID",
    "client_secret": "TU_AUTH0_CLIENT_SECRET",
    "audience": "https://osign.eu",
    "scope": "read:contracts write:contracts"
  }'
```

Respuesta esperada:

```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 86400,
  "scope": "read:contracts write:contracts"
}
```

### 3. Usar el token

```bash
curl http://localhost:3000/api/contracts \
  -H "Authorization: Bearer TU_ACCESS_TOKEN"
```

## Script de Prueba Automatizado

### Configuración

1. Configura las variables de entorno en `.env.local`:

```bash
# Credenciales de Auth0 M2M Application
TEST_CLIENT_ID=tu_auth0_client_id
TEST_CLIENT_SECRET=tu_auth0_client_secret
BASE_URL=http://localhost:3000

# Configuración de Auth0
AUTH0_DOMAIN=tu-tenant.auth0.com
AUTH0_API_IDENTIFIER=https://osign.eu
```

2. Ejecuta el script:

```bash
npm run test:oauth
```

El script ejecutará:
- ✅ Solicitud de token con form-urlencoded
- ✅ Solicitud de token con JSON
- ✅ Uso del token en endpoint protegido
- ✅ Validación de credenciales inválidas
- ✅ Validación de grant type no soportado

## Tests Unitarios

### Ejecutar todos los tests:

```bash
npm test
```

### Ejecutar solo tests de OAuth:

```bash
npm test oauth
```

### Tests con cobertura:

```bash
npm run test:coverage
```

### Tests en modo watch:

```bash
npm run test:watch
```

## Estructura de Tests

```
__tests__/
├── api/
│   └── oauth/
│       └── token.test.ts       # Tests del proxy transparente
└── lib/
    └── auth/
        └── oauth.test.ts        # Tests de funciones helper (opcional)
```

### Cobertura de Tests

Los tests cubren:

#### Token Endpoint - Proxy Transparente (`token.test.ts`)
- ✅ Content-Type handling (form-urlencoded, JSON)
- ✅ Validación de parámetros requeridos
- ✅ Validación de grant types
- ✅ Proxy directo a Auth0 con credenciales del cliente
- ✅ Soporte para audience personalizado
- ✅ Soporte para scopes
- ✅ Manejo de errores de Auth0
- ✅ Validación de configuración

## Casos de Uso Comunes

### 1. Integración con aplicación externa

```javascript
// En tu aplicación cliente
async function getAccessToken() {
  const response = await fetch('https://osign.eu/api/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.AUTH0_CLIENT_ID,      // De Auth0 M2M App
      client_secret: process.env.AUTH0_CLIENT_SECRET, // De Auth0 M2M App
      audience: 'https://osign.eu'
    })
  })

  const data = await response.json()
  return data.access_token
}

// Usar el token
const token = await getAccessToken()
const contracts = await fetch('https://osign.eu/api/contracts', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
```

### 2. Node.js/TypeScript Backend

```typescript
import axios from 'axios'

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope?: string
}

async function getOSignToken(): Promise<string> {
  const response = await axios.post<TokenResponse>(
    'https://osign.eu/api/oauth/token',
    {
      grant_type: 'client_credentials',
      client_id: process.env.AUTH0_CLIENT_ID,
      client_secret: process.env.AUTH0_CLIENT_SECRET,
      audience: 'https://osign.eu'
    },
    {
      headers: { 'Content-Type': 'application/json' }
    }
  )

  return response.data.access_token
}
```

### 3. Python Backend

```python
import requests
import os

def get_osign_token():
    response = requests.post(
        'https://osign.eu/api/oauth/token',
        json={
            'grant_type': 'client_credentials',
            'client_id': os.getenv('AUTH0_CLIENT_ID'),
            'client_secret': os.getenv('AUTH0_CLIENT_SECRET'),
            'audience': 'https://osign.eu'
        },
        headers={'Content-Type': 'application/json'}
    )

    response.raise_for_status()
    return response.json()['access_token']
```

### 4. Testing en CI/CD

```yaml
# .github/workflows/test.yml
- name: Run OAuth Tests
  run: |
    npm test oauth
  env:
    AUTH0_DOMAIN: ${{ secrets.AUTH0_DOMAIN }}
    AUTH0_API_IDENTIFIER: ${{ secrets.AUTH0_API_IDENTIFIER }}
    TEST_CLIENT_ID: ${{ secrets.AUTH0_M2M_CLIENT_ID }}
    TEST_CLIENT_SECRET: ${{ secrets.AUTH0_M2M_CLIENT_SECRET }}
```

## Parámetros Soportados

| Parámetro | Requerido | Descripción |
|-----------|-----------|-------------|
| `grant_type` | ✅ Sí | Debe ser `client_credentials` |
| `client_id` | ✅ Sí | Client ID de Auth0 M2M Application |
| `client_secret` | ✅ Sí | Client Secret de Auth0 M2M Application |
| `audience` | ❌ No | API Identifier (default: `https://osign.eu`) |
| `scope` | ❌ No | Scopes específicos (deben estar autorizados en Auth0) |

## Troubleshooting

### Error: "invalid_client"
- **Causa:** Credenciales de Auth0 incorrectas
- **Solución:**
  - Verifica el `client_id` y `client_secret` en Auth0 Dashboard
  - Asegúrate de usar credenciales de una M2M Application

### Error: "access_denied"
- **Causa:** El cliente no tiene permisos para el audience solicitado
- **Solución:**
  - Ve a Auth0 Dashboard → Applications → Tu M2M App
  - En la pestaña "APIs", autoriza el API (audience) necesario
  - Configura los scopes requeridos

### Error: "unsupported_grant_type"
- **Causa:** Grant type diferente a `client_credentials`
- **Solución:** Solo se soporta `client_credentials` actualmente

### Error: "Authentication service not configured"
- **Causa:** Falta configuración en el servidor
- **Solución:** Verifica que exista la variable de entorno:
  - `AUTH0_DOMAIN`

### Token expirado
- Los tokens expiran según lo configurado en Auth0 (default: 24h)
- Implementa renovación automática en tu aplicación cliente
- No almacenes tokens por tiempo indefinido

## Configuración del Servidor

Variables de entorno requeridas en el servidor:

```bash
# En .env o .env.local
AUTH0_DOMAIN=tu-tenant.auth0.com
AUTH0_API_IDENTIFIER=https://osign.eu  # Audience por defecto (opcional)
```

## Seguridad

⚠️ **Importante:**

### ✅ Buenas Prácticas
- Nunca expongas el `client_secret` en el frontend
- Usa HTTPS en producción siempre
- Rota las credenciales regularmente en Auth0
- Revoca aplicaciones no utilizadas desde Auth0
- Almacena tokens de forma segura (memoria, no localStorage)
- Usa scopes mínimos necesarios
- Implementa rate limiting en producción

### ❌ Qué NO hacer
- No commits credenciales en el código
- No uses credenciales en JavaScript del navegador
- No compartas credenciales entre aplicaciones
- No uses tokens indefinidamente sin validar expiración

## Diferencias con Otros Flows

### ¿Por qué Client Credentials?

- **Client Credentials**: Para comunicación servidor-a-servidor (M2M)
  - ✅ Tu backend → oSign API
  - ✅ Servicios automatizados
  - ✅ Cron jobs, webhooks

- **Authorization Code**: Para usuarios finales
  - Login interactivo en navegador
  - No aplica para este caso de uso

## Ventajas del Proxy Transparente

1. **Simplicidad**: No gestión de credenciales en tu DB
2. **Seguridad**: Auth0 maneja toda la seguridad
3. **Escalabilidad**: Sin estado en el proxy
4. **Mantenimiento**: Menos código que mantener
5. **Consistencia**: Un único punto de verdad (Auth0)
6. **Flexibilidad**: Soporta todos los features de Auth0

## Referencias

- [RFC 6749 - OAuth 2.0](https://tools.ietf.org/html/rfc6749)
- [OAuth 2.0 Client Credentials Flow](https://oauth.net/2/grant-types/client-credentials/)
- [Auth0 Client Credentials](https://auth0.com/docs/get-started/authentication-and-authorization-flow/client-credentials-flow)
- [Auth0 M2M Applications](https://auth0.com/docs/applications/machine-to-machine)
