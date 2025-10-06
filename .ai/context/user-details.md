# Campos Personalizados Predefinidos en Contratos

## Campos Obligatorios por Defecto

Todos los contratos deben incluir por defecto los siguientes campos personalizados predefinidos:

1. **Nombre del firmante** (`clientName`) - **OBLIGATORIO**
2. **NIF del firmante** (`clientTaxId`) - **OBLIGATORIO**
3. **SMS del firmante** (`clientPhone`) - Opcional
4. **Mail del firmante** (`clientEmail`) - Opcional

## Restricciones

- **No se debe poder guardar ni hacer activo un contrato** si no tiene usados los campos:
  - `{{dynamic:clientName}}` - Nombre del firmante
  - `{{dynamic:clientTaxId}}` - NIF del firmante

- La validación se realiza al intentar cambiar el estado del contrato a "active" o "signed"
- Los campos predefinidos **no se pueden eliminar** de la lista de campos dinámicos

## Modal de Envío de Contrato

- El modal de envío de contrato es **igual y homogéneo para todos los tipos de firma**
- El modal mapea los campos predefinidos automáticamente:
  - `signerName` → `clientName`
  - `signerEmail` → `clientEmail`
  - `signerPhone` → `clientPhone`
  - `clientTaxId` → `clientTaxId`
- Se evitan duplicidades mediante la extracción inteligente de datos con `extractSignerInfo()`
- Los datos se aprovechan para auditoría en `auditTrailService.addSignatureAuditTrail()`

## Implementación Completada

### ✅ Archivos Modificados

1. **`/components/dataTypes/Contract.ts`**
   - Añadidas constantes `PREDEFINED_MANDATORY_FIELDS` y `PREDEFINED_OPTIONAL_FIELDS`

2. **`/app/contracts/[id]/edit/page.tsx`**
   - Actualizado `defaultUserFields` para incluir los 4 campos predefinidos
   - Los campos obligatorios se marcan con badge "Obligatorio" y no se pueden eliminar
   - Actualizada la información de ayuda para usuarios
   - Actualizada sección de generación IA

3. **`/app/contracts/new/page.tsx`**
   - Actualizado el texto informativo sobre campos obligatorios

4. **`/lib/contractUtils.ts`**
   - La función `validateMandatoryFields()` ya valida correctamente que `clientName` y `clientTaxId` estén usados en el contenido

5. **`/app/api/contracts/[id]/status/route.ts`**
   - Implementa validación de campos obligatorios antes de activar contrato

6. **`/app/api/signature-requests/route.ts`**
   - Ya mapea correctamente los campos predefinidos en la creación de solicitudes de firma
   - Extrae automáticamente información del firmante con `extractSignerInfo()`

7. **`/lib/auditTrail.ts`**
   - Ya registra correctamente la información del firmante en la auditoría

## Beneficios

- ✅ Cumplimiento legal garantizado con campos obligatorios
- ✅ Mejor auditoría con datos estructurados del firmante
- ✅ Experiencia homogénea para todos los tipos de firma
- ✅ No hay duplicación de datos
- ✅ Los campos están siempre disponibles y no se pueden eliminar accidentalmente
