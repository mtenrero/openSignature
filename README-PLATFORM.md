# oSign.EU - Plataforma de Firma Digital

Una plataforma completa de firma digital construida con Next.js, PouchDB/CouchDB, NextAuth y Auth0.

## 🚀 Características

- ✅ **Firma Digital Segura**: Implementación completa de firma digital con validación
- ✅ **Base de Datos Offline-First**: PouchDB para sincronización automática con CouchDB
- ✅ **Autenticación con Auth0**: Sistema de autenticación seguro y escalable
- ✅ **APIs RESTful**: Endpoints completos para contratos, firmas y usuarios
- ✅ **SSR y CSR**: Server-Side Rendering donde es posible, llamadas API desde cliente
- ✅ **Interfaz Moderna**: UI construida con Mantine
- ✅ **Middleware de Autenticación**: Protección automática de rutas

## 📋 Requisitos Previos

- Node.js 18+
- CouchDB (local o remoto)
- Cuenta de Auth0
- npm o yarn

## 🛠️ Configuración

### 1. Instalar Dependencias

```bash
npm install
```

### 2. Configurar CouchDB

Asegúrate de tener CouchDB corriendo. Para desarrollo local:

```bash
# Instalar CouchDB (macOS con Homebrew)
brew install couchdb

# Iniciar CouchDB
brew services start couchdb

# Crear bases de datos
curl -X PUT http://localhost:5984/oSign.EU_users
curl -X PUT http://localhost:5984/oSign.EU_contracts
curl -X PUT http://localhost:5984/oSign.EU_signatures
curl -X PUT http://localhost:5984/oSign.EU_templates
```

### 3. Configurar Auth0

1. Crea una aplicación en [Auth0](https://auth0.com)
2. Configura los siguientes parámetros:
   - **Application Type**: Regular Web Application
   - **Allowed Callback URLs**: `http://localhost:3000/api/auth/callback/auth0`
   - **Allowed Logout URLs**: `http://localhost:3000`

### 4. Variables de Entorno

Crea un archivo `.env.local` en la raíz del proyecto (consulta `env-example.txt` para ver todas las opciones disponibles):

```env
# NextAuth Configuration
NEXTAUTH_SECRET=tu-nextauth-secret-aqui
NEXTAUTH_URL=http://localhost:3000

# Auth0 Configuration
AUTH0_CLIENT_ID=tu-auth0-client-id
AUTH0_CLIENT_SECRET=tu-auth0-client-secret
AUTH0_ISSUER=https://tu-dominio.auth0.com

# CouchDB Configuration
COUCHDB_URL=http://localhost:5984
COUCHDB_USERNAME=admin
COUCHDB_PASSWORD=password

# Application Configuration
BRAND=oSign.EU
NODE_ENV=development
NEXT_PUBLIC_APP_NAME=oSign.EU
```

**Variables importantes:**

- `NEXTAUTH_SECRET`: Clave secreta para NextAuth (genera una segura para producción)
- `NEXTAUTH_URL`: URL de tu aplicación
- `AUTH0_*`: Credenciales de tu aplicación Auth0
- `COUCHDB_URL`: URL de tu servidor CouchDB
- `COUCHDB_USERNAME/PASSWORD`: Credenciales opcionales para CouchDB autenticado
- `BRAND`: Nombre de tu aplicación
- `NEXT_PUBLIC_APP_NAME`: Nombre público de la aplicación (accesible desde el cliente)

### 5. Configurar Variables de Entorno

Ejecuta el script de configuración interactiva:

```bash
npm run setup
```

Este comando te guiará a través de la configuración de todas las variables de entorno necesarias.

### 6. Inicializar CouchDB

Si usas CouchDB local, inicializa las bases de datos:

```bash
npm run init-db
```

### 7. Ejecutar la Aplicación

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`

## 📁 Estructura del Proyecto

```
├── app/                          # Next.js App Router
│   ├── api/                      # APIs REST
│   │   ├── auth/[...nextauth]/   # NextAuth endpoints
│   │   ├── contracts/            # APIs de contratos
│   │   └── signatures/           # APIs de firmas
│   ├── auth/                     # Páginas de autenticación
│   ├── contracts/                # Páginas de contratos
│   ├── dashboard/                # Dashboard principal
│   └── firmas/                   # Páginas de firmas
├── components/                   # Componentes reutilizables
├── lib/                          # Utilidades y configuración
│   ├── auth/                     # Configuración de NextAuth
│   └── db/                       # Configuración de PouchDB
├── middleware.ts                 # Middleware de autenticación
└── config.example.js            # Ejemplo de configuración
```

## 🔧 APIs Disponibles

### Contratos
- `GET /api/contracts` - Listar contratos del usuario
- `POST /api/contracts` - Crear nuevo contrato
- `GET /api/contracts/[id]` - Obtener contrato específico
- `PUT /api/contracts/[id]` - Actualizar contrato
- `DELETE /api/contracts/[id]` - Eliminar contrato

### Firmas
- `GET /api/signatures` - Listar firmas del usuario
- `POST /api/signatures` - Crear nueva firma

## 🗄️ Esquemas de Base de Datos

### Contratos
```javascript
{
  _id: "contract_123",
  name: "Contrato de Servicios",
  description: "Descripción del contrato",
  content: "<p>Contenido HTML</p>",
  dynamicFields: [...],
  userFields: [...],
  parameters: {
    requireDoubleSignatureSMS: false,
    collectDataTiming: "before"
  },
  status: "draft|signed|completed",
  userId: "user_456",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  type: "contract"
}
```

### Firmas
```javascript
{
  _id: "signature_789",
  contractId: "contract_123",
  signature: "data:image/png;base64,...",
  status: "completed",
  userAgent: "Mozilla/5.0...",
  ipAddress: "192.168.1.1",
  location: {...},
  metadata: {...},
  userId: "user_456",
  createdAt: "2024-01-01T00:00:00Z",
  type: "signature"
}
```

## 🔐 Autenticación

La aplicación usa NextAuth con Auth0:

- **Login**: `/auth/signin`
- **Callback**: `/api/auth/callback/auth0`
- **Logout**: Automático con `signOut()`

## 🚀 Despliegue

### Variables de Entorno para Producción

```env
NEXTAUTH_SECRET=tu-nextauth-secret-produccion
NEXTAUTH_URL=https://tu-dominio.com
AUTH0_CLIENT_ID=tu-client-id-produccion
AUTH0_CLIENT_SECRET=tu-client-secret-produccion
AUTH0_ISSUER=https://tu-dominio.auth0.com
COUCHDB_URL=https://tu-couchdb-remoto.com
NODE_ENV=production
```

### ⚠️ Configuración OBLIGATORIA de Auth0

**IMPORTANTE:** Esta aplicación está configurada para usar **ÚNICAMENTE Auth0** como método de autenticación. No se permiten otros métodos de login.

#### Variables de Entorno REQUERIDAS:
- `AUTH0_CLIENT_ID` - ID del cliente de Auth0
- `AUTH0_CLIENT_SECRET` - Secreto del cliente de Auth0
- `AUTH0_ISSUER` - URL del tenant de Auth0 (ej: `https://tu-dominio.auth0.com`)

#### Comportamiento Automático:
- ✅ **Login automático**: Los usuarios son redirigidos automáticamente a Auth0
- ✅ **Sin opciones alternativas**: No hay formularios de login manual
- ✅ **Validación obligatoria**: La aplicación falla al inicio si Auth0 no está configurado

#### Configuración en Auth0 Dashboard:
1. Ve a tu [Auth0 Dashboard](https://manage.auth0.com)
2. Crea una aplicación de tipo "Regular Web Application"
3. Configura las URLs de callback:
   - **Allowed Callback URLs**:
     - Desarrollo: `http://192.168.1.140:3003/api/auth/callback/auth0`
     - Producción: `https://tu-dominio.com/api/auth/callback/auth0`
   - **Allowed Logout URLs**:
     - Desarrollo: `http://192.168.1.140:3003/`
     - Producción: `https://tu-dominio.com/`
4. Copia el Client ID, Client Secret y Domain

#### ⚠️ IMPORTANTE: URL de Callback
La URL de callback **DEBE** ser exactamente:
```
http://<BASE_URL>/api/auth/callback/auth0
```
Donde `<BASE_URL>` es el valor de `NEXTAUTH_URL` en tus variables de entorno.

### Construir para Producción

```bash
npm run build
npm start
```

## 📝 Desarrollo

### Scripts Disponibles

```bash
npm run setup    # Configurar variables de entorno (interactivo)
npm run init-db  # Inicializar bases de datos de CouchDB
npm run dev      # Iniciar servidor de desarrollo
npm run build    # Construir para producción
npm run start    # Iniciar servidor de producción
npm run lint     # Ejecutar linter
```

### Arquitectura

- **Frontend**: Next.js 13+ con App Router
- **Backend**: APIs REST con Next.js API Routes
- **Base de Datos**: PouchDB + CouchDB
- **Autenticación**: NextAuth + Auth0
- **UI**: Mantine Components
- **Estado**: React hooks + Context

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -am 'Agrega nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.

## 🆘 Soporte

Para soporte técnico, por favor abre un issue en el repositorio de GitHub.

## 🔧 Configuración Avanzada

### Variables de Entorno

La aplicación usa las siguientes variables de entorno:

**NextAuth:**
- `NEXTAUTH_SECRET`: Clave secreta para firmar tokens JWT
- `NEXTAUTH_URL`: URL base de la aplicación

**Auth0:**
- `AUTH0_CLIENT_ID`: ID de cliente de Auth0
- `AUTH0_CLIENT_SECRET`: Secreto de cliente de Auth0
- `AUTH0_ISSUER`: URL del tenant de Auth0

**CouchDB:**
- `COUCHDB_URL`: URL del servidor CouchDB
- `COUCHDB_USERNAME`: Usuario para autenticación (opcional)
- `COUCHDB_PASSWORD`: Contraseña para autenticación (opcional)

**Aplicación:**
- `BRAND`: Nombre de la marca
- `NODE_ENV`: Entorno de ejecución
- `NEXT_PUBLIC_APP_NAME`: Nombre público de la app

### Seguridad

- Nunca commits el archivo `.env.local` al repositorio
- Usa contraseñas seguras para producción
- Configura HTTPS en producción
- Mantén actualizado CouchDB y sus dependencias

### Troubleshooting

**Error de conexión con CouchDB:**
```bash
# Verificar que CouchDB esté ejecutándose
curl http://localhost:5984/

# Si usas autenticación
curl http://admin:password@localhost:5984/
```

**Error de autenticación Auth0:**
- Verifica que las URLs de callback estén configuradas correctamente
- Asegúrate de que el dominio de Auth0 sea correcto
- Revisa que el cliente esté activo

**Problemas con PouchDB:**
- Asegúrate de que no haya conflictos de CORS
- Verifica que las bases de datos existan
- Revisa la configuración de índices

---

**oSign.EU** - Firma digital segura y confiable para todos.
