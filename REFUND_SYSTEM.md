# Sistema de Reembolsos para Solicitudes No Firmadas

Este documento explica el funcionamiento del sistema automático de reembolsos cuando solicitudes de firma se archivan o expiran sin ser firmadas.

## 📋 Resumen del Sistema

Cuando una solicitud de firma **NO firmada** se archiva o expira, el sistema devuelve automáticamente:

- ✅ **Uso del contrato** (si se usó del límite mensual)
- ✅ **Costo del contrato extra** (si se pagó por contrato adicional) → al monedero de bonos
- ✅ **Solicitudes de firma** → al contador mensual disponible
- ❌ **SMS enviados NO se devuelven** (se consumen definitivamente)

## 🏗️ Arquitectura del Sistema

### Archivos Principales

1. **`/lib/subscription/refundSystem.ts`** - Sistema principal de reembolsos
2. **`/app/api/contracts/[id]/archive/route.ts`** - API para archivar contratos
3. **`/app/api/signature-requests/[id]/archive/route.ts`** - API para archivar solicitudes
4. **`/app/api/subscription/refunds/route.ts`** - API para consultar reembolsos
5. **`/app/api/cron/process-refunds/route.ts`** - Cron job para expiraciones automáticas

### Base de Datos

#### Colección: `refund_transactions`
```typescript
{
  _id: ObjectId,
  customerId: string,
  type: 'contract_refund' | 'signature_refund' | 'extra_contract_refund',
  refundAmount?: number, // En céntimos, para reembolsos al monedero
  contractId?: string,
  signatureRequestId?: string,
  reason: 'archived_unsigned' | 'expired_unsigned' | 'cancelled_unsigned',
  refundedAt: Date,
  month: string, // "2024-01"
  details: {
    originalUsageType: 'monthly_allowance' | 'extra_paid',
    signatureType?: 'email' | 'sms' | 'local' | 'tablet',
    smsSent?: number // SMS que sí se enviaron (no reembolsables)
  }
}
```

## 🔄 Flujo de Reembolsos

### 1. Reembolso de Contratos

```typescript
// Cuando se archiva un contrato sin firmar
await RefundSystem.processContractRefund(contractId, 'archived_unsigned')
```

**Lógica:**
- Si el contrato estaba dentro del límite mensual → Se devuelve al contador mensual
- Si era un contrato extra pagado → Se reembolsa el costo al monedero (0.50€ o 0.40€ según plan)

### 2. Reembolso de Solicitudes de Firma

```typescript
// Cuando se archiva una solicitud sin firmar
await RefundSystem.processSignatureRefund(signatureRequestId, 'archived_unsigned')
```

**Lógica por tipo:**

#### Email
- Si estaba dentro del límite mensual → Se devuelve al contador
- Si era extra pagada → Se reembolsa al monedero (0.10€ o 0.08€ según plan)

#### SMS
- **SMS enviados: NO se reembolsan** (se consumen definitivamente)
- SMS no enviados: Se reembolsan al monedero (0.07€)

#### Local/Tablet
- Generalmente dentro del límite (ilimitadas en planes pagos)
- Si era extra pagada → Se reembolsa al monedero

### 3. Expiración Automática

```typescript
// Cron job diario para procesar expiraciones
await RefundSystem.processExpiredRefunds()
```

- Busca contratos y solicitudes de más de 30 días sin firmar
- Los marca como expirados
- Procesa automáticamente los reembolsos

## 📊 Integración con Sistema de Uso

### Uso Ajustado con Reembolsos

```typescript
// Obtener uso real considerando reembolsos
const adjustedUsage = await UsageTracker.getAdjustedUsageData(customerId)

// Resultado incluye:
{
  contractsCreated: 8, // 10 creados - 2 reembolsados
  emailSignaturesSent: 18, // 20 enviadas - 2 reembolsadas
  refundsApplied: {
    contracts: 2,
    signatures: 2,
    walletRefunds: 120 // 1.20€ en céntimos
  }
}
```

### Facturación Precisa

El sistema de facturación considera automáticamente los reembolsos:
- Los reembolsos de límite mensual no afectan la factura
- Los reembolsos de extras se restan del total a cobrar
- Los reembolsos al monedero se acreditan inmediatamente

## 🛠️ APIs Disponibles

### Archivar Contrato
```bash
POST /api/contracts/{id}/archive
{
  "reason": "manual_archive" | "expired" | "cancelled"
}
```

### Archivar Solicitud de Firma
```bash
POST /api/signature-requests/{id}/archive
{
  "reason": "manual_archive" | "expired" | "cancelled"
}
```

### Consultar Reembolsos
```bash
GET /api/subscription/refunds?month=2024-01
```

### Procesar Expiraciones (Cron)
```bash
POST /api/cron/process-refunds
Authorization: Bearer {CRON_SECRET}
```

## ⚙️ Configuración

### Variables de Entorno
```bash
# Para el cron job de expiraciones
CRON_SECRET=your-secure-cron-secret
```

### Configuración de Expiraciones
```typescript
// En refundSystem.ts - línea ~248
const expirationDate = new Date(currentDate.getTime() - (30 * 24 * 60 * 60 * 1000)) // 30 días
```

## 📈 Monitoreo y Logs

### Logs del Sistema
```bash
[REFUND] Contract refund processed for 60f1b2c3..., type: monthly_allowance
[REFUND] SMS signature refund processed for 60f1b2c4..., SMS sent: 1, refund: 0
[CRON] Expired refunds processed: 5 contracts, 12 signatures
```

### Métricas Disponibles
- Total de reembolsos por mes
- Reembolsos por tipo (contrato/firma)
- Cantidad reembolsada al monedero
- SMS enviados vs. no enviados

## 🔍 Casos de Uso

### Ejemplo 1: Usuario Plan PYME
- Límite: 15 contratos, 150 emails
- Crea 18 contratos (3 extras a 0.50€)
- Envía 160 emails (10 extras a 0.10€)
- Archiva 2 contratos sin firmar (1 normal + 1 extra)
- Archiva 5 emails sin firmar (3 normales + 2 extras)

**Resultado:**
- 1 contrato devuelto al límite mensual
- 0.50€ reembolsado al monedero (1 contrato extra)
- 3 emails devueltos al límite mensual
- 0.20€ reembolsado al monedero (2 emails extras)

### Ejemplo 2: SMS No Firmado
- Usuario envía SMS de firma
- SMS se entrega correctamente al teléfono
- Destinatario no firma
- Solicitud se archiva

**Resultado:**
- SMS NO se reembolsa (0.07€ se mantiene cobrado)
- Solo se registra que el SMS fue enviado exitosamente

## 🚨 Consideraciones Importantes

1. **SMS Enviados:** Una vez enviado un SMS, el costo NO se reembolsa, aunque no se firme
2. **Doble Procesamiento:** El sistema previene reembolsos duplicados verificando transacciones existentes
3. **Límites Mensuales:** Los reembolsos solo afectan el mes en curso
4. **Auditoría:** Todas las transacciones de reembolso se registran para auditoría
5. **Monedero Virtual:** Los reembolsos monetarios van al monedero de bonos del usuario

## 🧪 Testing

### Pruebas Manuales
```bash
# Crear contrato y archivarlo
curl -X POST /api/contracts/123/archive -d '{"reason":"manual_archive"}'

# Verificar reembolso
curl /api/subscription/refunds
```

### Pruebas de Expiración
```bash
# Ejecutar proceso de expiraciones
curl -X POST /api/cron/process-refunds -H "Authorization: Bearer ${CRON_SECRET}"
```

## 📝 Notas de Desarrollo

- El sistema usa imports dinámicos para evitar dependencias circulares
- Los reembolsos se procesan de forma asíncrona para mejor rendimiento
- La integración con el monedero virtual es automática
- El sistema es compatible con todos los planes de suscripción existentes