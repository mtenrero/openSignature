# Vercel Cron Jobs - Verificación de Pagos SEPA

Este documento explica cómo está configurado el sistema de verificación periódica de pagos SEPA usando Vercel Cron Jobs.

## 📋 Configuración

### 1. Archivo `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/check-pending-payments",
      "schedule": "0 */6 * * *"
    }
  ],
  "functions": {
    "app/api/cron/check-pending-payments/route.ts": {
      "maxDuration": 300
    }
  }
}
```

### 2. Endpoint del Cron Job

- **Ruta**: `/api/cron/check-pending-payments`
- **Método**: `GET` (para Vercel Cron), `POST` (para pruebas manuales)
- **Frecuencia**: Cada 6 horas (`0 */6 * * *`)
- **Timeout**: 5 minutos máximo

### 3. Variables de Entorno

Añadir en Vercel Dashboard > Project > Settings > Environment Variables:

```bash
CRON_SECRET=your-secure-secret-for-cron-jobs
```

## 🔧 Funcionamiento

### Verificación de Seguridad

El endpoint verifica que la petición sea legítima mediante:

1. **User-Agent de Vercel**: `vercel-cron`
2. **Authorization Header**: `Bearer ${CRON_SECRET}` (opcional)
3. **Modo Development**: Permite todas las peticiones en desarrollo

### Proceso de Verificación

1. **Busca pagos pendientes** que no han sido verificados en las últimas 6 horas
2. **Consulta Stripe** para obtener el estado actual de cada payment intent
3. **Actualiza estados** según la respuesta de Stripe:
   - `succeeded` → Confirma el pago y actualiza wallet
   - `processing` → Marca como "en proceso"
   - `requires_payment_method` / `canceled` → Marca como fallido y reversa créditos
   - **Expirado** (>14 días) → Marca como expirado y reversa créditos

### Logging

Todos los logs incluyen el prefijo `[VERCEL CRON]` para facilitar el filtrado en Vercel Functions logs.

## 🧪 Pruebas

### Prueba Local

```bash
# Ejecutar script de prueba
node test-vercel-cron.js

# O llamar directamente
curl http://localhost:3000/api/cron/check-pending-payments

# Prueba manual (POST)
curl -X POST http://localhost:3000/api/cron/check-pending-payments
```

### Prueba en Producción

```bash
# Con autorización
curl -H "Authorization: Bearer your-cron-secret" \
     https://your-app.vercel.app/api/cron/check-pending-payments
```

## 📊 Monitoreo

### En Vercel Dashboard

1. **Functions** → Ver logs del cron job
2. **Analytics** → Verificar ejecuciones exitosas
3. **Settings** → **Crons** → Ver programación y estado

### Logs a Buscar

```
🔄 [VERCEL CRON] Starting periodic check
✅ [VERCEL CRON] Pending payments check completed
🎉 [VERCEL CRON] X SEPA payments were confirmed!
⚠️ [VERCEL CRON] X SEPA payments failed
❌ [VERCEL CRON] Errors encountered
```

## 🔄 Configuración de Frecuencia

Para cambiar la frecuencia, editar `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/check-pending-payments",
      "schedule": "0 */4 * * *"  // Cada 4 horas
    }
  ]
}
```

### Formatos de Schedule (Cron Expression)

- `0 */6 * * *` - Cada 6 horas
- `0 */4 * * *` - Cada 4 horas
- `0 8,20 * * *` - A las 8:00 y 20:00 cada día
- `0 */2 * * *` - Cada 2 horas
- `0 0 * * *` - Todos los días a medianoche

## 🚀 Despliegue

1. **Commit** los cambios incluyendo `vercel.json`
2. **Push** a la rama principal
3. **Vercel autodespliega** y configura los cron jobs automáticamente
4. **Verificar** en Vercel Dashboard que el cron aparece en Settings > Crons

## 🔒 Seguridad

### Recomendaciones

1. **Usar CRON_SECRET** en producción
2. **Monitoring** de logs para detectar ejecuciones no autorizadas
3. **Rate limiting** si es necesario (Vercel lo maneja automáticamente)

### Headers de Seguridad

```typescript
// El endpoint verifica automáticamente:
const isVercelCron = userAgent?.includes('vercel-cron')
const hasValidAuth = cronSecret && authHeader === `Bearer ${cronSecret}`
```

## 📈 Métricas

El endpoint devuelve métricas detalladas:

```json
{
  "success": true,
  "results": {
    "checked": 5,
    "updated": 2,
    "confirmed": 1,
    "failed": 0,
    "errorCount": 0
  },
  "message": "[VERCEL CRON] Checked 5 payments: 1 confirmed, 0 failed"
}
```

## 🆘 Troubleshooting

### Problema: Cron no se ejecuta

1. Verificar que `vercel.json` esté en la raíz del proyecto
2. Verificar syntax del cron expression
3. Revisar Vercel Dashboard > Settings > Crons

### Problema: 401 Unauthorized

1. Verificar `CRON_SECRET` en variables de entorno
2. Verificar que el endpoint detecta `vercel-cron` en User-Agent

### Problema: Timeout

1. Aumentar `maxDuration` en `vercel.json`
2. Optimizar consultas a base de datos
3. Procesar pagos en lotes más pequeños

## 🔗 Enlaces Útiles

- [Vercel Cron Jobs Documentation](https://vercel.com/docs/cron-jobs)
- [Cron Expression Generator](https://crontab.guru/)
- [Vercel Functions Logs](https://vercel.com/docs/functions/logs)