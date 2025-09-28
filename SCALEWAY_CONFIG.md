# 🔧 Configuración de Scaleway Email

## Variables de Entorno Requeridas

Para que el sistema de email funcione correctamente, necesitas añadir las siguientes variables a tu archivo `.env.local`:

```env
# Scaleway Transactional Email Configuration
SCALEWAY_KEY_ID=your_scaleway_access_key_id
SCALEWAY_KEY_SECRET=your_scaleway_secret_key
SCALEWAY_PROJECT_ID=your_scaleway_project_id
SCALEWAY_REGION=fr-par

# Optional: Company name for emails
COMPANY_NAME=Tu Empresa
```

## ⚠️ Variable Faltante

**PROBLEMA ACTUAL**: Falta la variable `SCALEWAY_PROJECT_ID` en tu configuración.

Esta variable es **requerida** por la API de Scaleway para enviar emails.

## 🔍 Cómo Obtener tu Project ID

1. **Accede a la Consola de Scaleway**: https://console.scaleway.com
2. **Ve a tu Dashboard**: El Project ID se muestra en la parte superior
3. **O ve a Project Settings**: En la pestaña "Project settings" encontrarás el Project ID
4. **Copia el ID**: Tiene formato similar a: `11111111-2222-3333-4444-555555555555`

## 📝 Configuración Completa Ejemplo

```env
# Scaleway Configuration
SCALEWAY_KEY_ID=SCWAKIXXXXXXXXXXXXXXXXXXX
SCALEWAY_KEY_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SCALEWAY_PROJECT_ID=11111111-2222-3333-4444-555555555555
SCALEWAY_REGION=fr-par

# Email Configuration
COMPANY_NAME=OpenSignature
```

## ✅ Verificación de Configuración

Una vez que añadas las variables, puedes verificar la configuración ejecutando:

```bash
node scripts/test-email.js
```

## 🌐 Configuración del Dominio

**IMPORTANTE**: Para que los emails se envíen correctamente, debes:

1. **Verificar el dominio** `osign.eu` en la consola de Scaleway
2. **Configurar registros DNS**:
   - SPF record
   - DKIM records
3. **Activar la verificación** en Scaleway Console

## 📧 Endpoint API Utilizado

La integración usa el endpoint oficial de Scaleway:
```
POST https://api.scaleway.com/transactional-email/v1alpha1/regions/fr-par/emails
```

## 🚨 Error Actual

```
[Scaleway Email] Error response: { message: 'Not Found' }
```

Este error indica que falta el `SCALEWAY_PROJECT_ID` o que el dominio no está verificado.

---

**Próximo paso**: Añade `SCALEWAY_PROJECT_ID=tu_project_id` a tu `.env.local` y reinicia el servidor.