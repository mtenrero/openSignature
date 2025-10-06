# Contexto eIDAS - Compliance openSignature

## Última actualización: 2025-10-04

---

## 1. Estado Actual del Proyecto

### Tipo de Proveedor
- **Categoría:** Proveedor NO Cualificado de Servicios de Confianza
- **Servicios ofrecidos:** Firma Electrónica Simple (SES) - Art. 25 eIDAS
- **Registro SETSI:** NO registrado aún (legal sin registro según Art. 17.1 eIDAS)
- **Decisión:** Operar sin registro inicialmente, comunicar en 6-12 meses

### Marco Legal Aplicable
- **Reglamento eIDAS:** (UE) 910/2014
- **Ley española:** Ley 6/2020, de 11 de noviembre (BOE-A-2020-14046)
- **Nivel de firma:** SES (Simple Electronic Signature)
- **Validez legal:** Art. 25 eIDAS - Válida pero sin presunción de validez

---

## 2. Decisiones Clave Tomadas

### 2.1 NO Certificarse como Proveedor Cualificado
**Razón:**
- Coste: 30.000-100.000€/año (vs 0€ para NO cualificado)
- No necesario para SES
- Flexibilidad operativa
- Mismo valor legal de firmas SES registrado o no

### 2.2 Métodos de Identificación Válidos para SES
**Decisión:** SMS + Email es SUFICIENTE
**Base legal:**
- Art. 25 eIDAS: SES no requiere identificación robusta
- Jurisprudencia española (STS 628/2015): SMS válido para SES
- Solo AES/QES requieren identificación robusta (Cl@ve, certificados, etc.)

**Implementación:**
- SMS con código OTP (6 dígitos, 5 min expiración)
- Email confirmación
- Doble factor recomendado
- Registro completo en auditoría

### 2.3 Timestamp OpenTSA
**Decisión:** OpenTSA es válido para SES (aunque NO cualificado)
**Base legal:**
- Art. 42 eIDAS solo exige timestamp cualificado para QES
- OpenTSA implementa RFC 3161 real
- NO está en TSL europea → NO cualificado
- PERO válido para SES

**Acción requerida:**
- ✅ Confirmar implementación RFC 3161 real (no simulación)
- ✅ Marcar explícitamente como "NO cualificado" en PDFs
- ✅ Disclaimer: "Timestamp NO cualificado - Válido para SES"

### 2.4 Registro SETSI
**Decisión:** Comunicar voluntariamente en 6-12 meses
**Coste:** 0€ (GRATUITO según Ley 6/2020 Art. 10)
**Razón de esperar:**
- Validar producto/mercado primero
- Mayor flexibilidad operativa inicial
- Legal operar sin registro (Art. 17.1 eIDAS)
- Comunicar cuando tengamos >50 clientes B2B

**Cuándo comunicar:**
- Si >50 clientes B2B activos
- Si contratos con Administraciones Públicas
- Si competencia se registra
- Si clientes lo solicitan

---

## 3. Obligaciones Legales Mínimas (Proveedor NO Cualificado)

### 3.1 Art. 13.2 eIDAS - Información a Usuarios
**Obligatorio mostrar en web:**
- Identidad del proveedor (CIF, razón social, domicilio, contacto)
- Tipo de servicio: "SES NO cualificada"
- Limitaciones: NO es AES/QES, identificación SMS/Email, timestamp NO cualificado
- Términos del servicio
- Política de privacidad (GDPR)
- Política de conservación de evidencias

**Estado:** ⚠️ PENDIENTE implementar

### 3.2 Art. 19.2 eIDAS - Notificación Incidentes
**Obligatorio:**
- Notificar a SETSI incidentes de seguridad "impacto significativo"
- Plazo: 24 horas
- Afecta a: usuarios >100, data leak, servicio down >24h

**Estado:** ⚠️ PENDIENTE implementar protocolo

### 3.3 Plan de Conservación (Recomendado, no obligatorio)
**Decisión:** Implementar 6 años
**Base legal:**
- Código de Comercio: 6 años (documentos mercantiles)
- Ley General Tributaria: 4 años (prescripción)
- eIDAS: No obligatorio para NO cualificados

**Política:**
- Firmas completadas: 6 años
- Firmas rechazadas: 1 año
- Formato: PDF/A-3
- Backup: AWS S3 Glacier
- Plan de cese: Notificación 3 meses + exportación

**Estado:** ⚠️ PENDIENTE documentar y publicar

---

## 4. Gaps Críticos Identificados

### 4.1 GAP CRÍTICO #1: Timestamp Simulado
**Problema actual:**
```typescript
// lib/eidas/timestampClient.ts - LÍNEA 130-148
async getQualifiedTimestamp(documentHash: string): Promise<{
  value: Date
  source: string
  token?: string
  verified: boolean
}> {
  try {
    const timestampServer = 'http://timestamp.digicert.com'

    // ❌ PROBLEMA: No implementa RFC 3161 real
    const timestamp = new Date() // Timestamp local

    return {
      value: timestamp,
      source: timestampServer,
      verified: true  // ❌ Falso positivo
    }
  }
}
```

**Acción requerida:**
- Implementar RFC 3161 verdadero con OpenTSA
- Eliminar fallback a timestamp local
- Marcar como "verified: false" si falla TSA

**Prioridad:** 🔴 CRÍTICA
**Coste:** 2.000€ desarrollo
**Plazo:** 1-3 meses

### 4.2 GAP #2: Información Legal Incompleta
**Problema:**
- No hay página "Información Legal eIDAS" en web
- PDFs no incluyen disclaimer nivel de firma
- No se especifica que timestamp es NO cualificado

**Acción requerida:**
- Crear página `/legal/eidas-info`
- Actualizar footer PDFs con disclaimer
- Añadir sección en términos del servicio

**Prioridad:** 🔴 CRÍTICA
**Coste:** 1.000€ desarrollo
**Plazo:** 1 mes

### 4.3 GAP #3: Plan de Conservación No Documentado
**Problema:**
- Política de conservación no está documentada
- No hay plan de cese de actividad
- Usuarios no saben cuánto tiempo se conservan datos

**Acción requerida:**
- Documentar política conservación 6 años
- Plan de cese de actividad
- Publicar en web
- Implementar cronjob limpieza automática

**Prioridad:** 🟠 ALTA
**Coste:** 1.500€
**Plazo:** 2-3 meses

---

## 5. Roadmap de Cumplimiento

### FASE 1: Ahora - 3 meses (CRÍTICO - 4.500€)

**Objetivo:** Cumplimiento mínimo eIDAS como proveedor NO cualificado

- [ ] **Implementar RFC 3161 real con OpenTSA** (2.000€)
  - Sustituir simulación por implementación verdadera
  - Guardar token completo
  - Marcar como "NO cualificado"

- [ ] **Información legal completa** (1.000€)
  - Página `/legal/eidas-info`
  - Disclaimer en PDFs generados
  - Actualizar términos del servicio

- [ ] **Plan conservación documentado** (1.500€)
  - Política 6 años
  - Plan de cese
  - Publicar en web
  - Cronjob limpieza

**Total Fase 1:** 4.500€

### FASE 2: 3-6 meses (ALTA - 3.000€)

**Objetivo:** Mejoras operativas y seguridad

- [ ] **Protocolo notificación incidentes** (500€)
  - Código detección incidentes
  - Email automatizado a SETSI
  - Notificación usuarios

- [ ] **Doble factor SMS + Email** (1.000€)
  - Confirmación por ambos canales
  - Logging completo
  - Email post-firma

- [ ] **Seguro RC profesional** (500-2.000€/año)
  - Cobertura 100.000€ mínimo
  - Protección reclamaciones

- [ ] **Consulta informal SETSI** (0€)
  - Email consulta procedimiento
  - Estimar beneficios reales registro

**Total Fase 2:** 2.000-3.500€

### FASE 3: 6-12 meses (MEDIA - 2.000-7.000€)

**Objetivo:** Considerar registro SETSI

**Condiciones para registrar:**
- ✅ >50 clientes B2B activos
- ✅ Facturación >100.000€/año
- ✅ Contratos con AAPP
- ✅ Solicitudes específicas clientes

**Si se cumplen 3+:**
- [ ] Preparar comunicación SETSI (0€ oficial)
- [ ] Documentación técnica completa
- [ ] Consultoría legal (opcional: 1.000-3.000€)
- [ ] Enviar comunicación Art. 10 Ley 6/2020

**Total Fase 3:** 0-7.000€ (según asesoría)

### FASE 4: 24+ meses (OPCIONAL - 30.000-100.000€/año)

**Objetivo:** Upgrade a proveedor cualificado (solo si mercado lo demanda)

**Requisitos:**
- ✅ Clientes requieren AES/QES
- ✅ Facturación >500.000€/año
- ✅ Recursos para auditoría anual

**Inversión:**
- Garantía económica: 1.500.000€
- Seguro RC: 1.500.000€/año
- Auditoría anual: 10.000€
- Desarrollo AES: 15.000€
- Integración Cl@ve: 5.000€

**Total Fase 4:** 30.000-100.000€/año

---

## 6. Matriz de Cumplimiento Actual

| Requisito eIDAS | Obligatorio | Estado | Prioridad | Plazo |
|-----------------|-------------|--------|-----------|-------|
| **Art. 13.2** - Info usuarios | ✅ SÍ | ❌ Pendiente | 🔴 CRÍTICA | 1 mes |
| **Art. 19.2** - Notif. incidentes | ✅ SÍ | ❌ Pendiente | 🟠 ALTA | 3 meses |
| **Art. 10 Ley 6/2020** - Comunicar SETSI | ✅ SÍ (3 meses) | ⏸️ Pospuesto | 🟡 MEDIA | 6-12 meses |
| **Art. 25** - Efectos jurídicos SES | ✅ Cumple | ✅ OK | - | - |
| **Art. 42** - Timestamp cualificado | ❌ NO (solo QES) | ⚠️ Simulado | 🔴 CRÍTICA | 1-3 meses |
| Plan conservación | ❌ NO obligatorio | ❌ Pendiente | 🟠 ALTA | 2-3 meses |
| GDPR | ✅ SÍ | ✅ OK | - | - |

**Nivel cumplimiento actual: 4/10**
**Nivel cumplimiento post-Fase 1: 8/10**

---

## 7. Disclaimer Legal Requerido

### 7.1 Para Web (Página Legal)

```html
<section id="eidas-compliance">
  <h2>Información del Proveedor de Servicios de Confianza</h2>

  <h3>Identidad del Proveedor</h3>
  <ul>
    <li>Nombre comercial: openSignature</li>
    <li>Razón social: [Tu Empresa S.L.]</li>
    <li>CIF: [B-XXXXXXXX]</li>
    <li>Domicilio: [Dirección completa]</li>
    <li>Email: legal@opensignature.com</li>
    <li>Teléfono: +34 XXX XXX XXX</li>
  </ul>

  <h3>Tipo de Servicio</h3>
  <p>
    Proveedor <strong>NO cualificado</strong> de servicios electrónicos
    de confianza según Reglamento eIDAS (UE) 910/2014.
  </p>
  <p>
    Servicios: <strong>Firma Electrónica Simple (SES)</strong> - Artículo 25 eIDAS
  </p>

  <h3>Limitaciones del Servicio</h3>
  <ul>
    <li>❌ NO es firma electrónica cualificada (QES)</li>
    <li>❌ NO es firma electrónica avanzada (AES)</li>
    <li>⚠️ Identificación: SMS/Email (no robusta)</li>
    <li>⚠️ Timestamp: NO cualificado (OpenTSA - RFC 3161)</li>
    <li>✅ Validez legal: Artículo 25 eIDAS (valor probatorio estándar)</li>
  </ul>

  <h3>Estado de Registro</h3>
  <p>
    Este proveedor NO está registrado en la Secretaría de Estado de
    Telecomunicaciones (SETSI). Esto es legal según Art. 17.1 eIDAS -
    Los proveedores NO cualificados no están sujetos a supervisión previa
    ni registro obligatorio.
  </p>

  <h3>Conservación de Evidencias</h3>
  <p>
    Las evidencias de firma se conservan durante <strong>6 años</strong>
    desde la fecha de firma, conforme al Código de Comercio español.
  </p>
  <p>
    <a href="/legal/conservacion">Ver Política de Conservación completa</a>
  </p>
</section>
```

### 7.2 Para PDFs Generados

```typescript
// Footer en signedContractGenerator.ts
const PDF_DISCLAIMER = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INFORMACIÓN LEGAL - FIRMA ELECTRÓNICA

Tipo de firma: Firma Electrónica Simple (SES)
Reglamento: eIDAS (UE) 910/2014 - Artículo 25
Proveedor: openSignature (NO cualificado)

CARACTERÍSTICAS:
✓ Validez legal en la Unión Europea
✓ Identificación mediante: ${signatureMethod} (SMS/Email)
✓ Timestamp: ${timestamp.source} (NO cualificado - RFC 3161)
✓ Hash documento: SHA-256
✓ Conservación evidencias: 6 años

LIMITACIONES:
⚠ NO es firma cualificada (QES) ni avanzada (AES)
⚠ Valor probatorio estándar (no presunción de validez)
⚠ Identificación no robusta (suficiente para SES)

Para mayor seguridad jurídica, solicite firma con certificado digital
cualificado o Cl@ve.

Más información: https://opensignature.com/legal/eidas-info
Verificación: https://opensignature.com/verify/${signatureId}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`
```

### 7.3 Durante Proceso de Firma

```typescript
// Modal antes de enviar SMS
const CONSENT_DISCLAIMER = `
Al solicitar el código SMS y completar la firma, manifiestas tu
consentimiento inequívoco para firmar electrónicamente este documento.

IMPORTANTE - LEE ANTES DE CONTINUAR:

Esta es una Firma Electrónica Simple (SES) válida legalmente según
el Reglamento eIDAS (UE) 910/2014, Artículo 25.

✓ Tiene validez legal en toda la Unión Europea
✓ Equivalencia con firma manuscrita (con matices jurisdiccionales)

PERO:
⚠ NO garantiza tu identidad de forma cualificada
⚠ Valor probatorio estándar (carga de prueba compartida)
⚠ Identificación mediante SMS (no robusta)
⚠ Timestamp NO cualificado

Para mayor seguridad jurídica en transacciones críticas, considera:
- Firma con certificado digital cualificado
- Firma con Cl@ve (Gobierno de España)
- Presencia física ante notario

¿Deseas continuar con la firma electrónica simple?

[ ] He leído y entiendo las limitaciones de la firma SES
[ ] Acepto los Términos del Servicio
[ ] Acepto la Política de Privacidad

[CANCELAR]  [CONTINUAR CON FIRMA]
`
```

---

## 8. Comunicación SETSI (Plantilla)

**Archivo:** Template preparado en `/COSTES_REGISTRO_SETSI.md`

**Cuándo enviar:**
- Dentro de 3 meses desde inicio actividad
- O cuando se cumplan condiciones (>50 clientes B2B)

**Destinatario:**
- Email: firma.electronica@mineco.es
- Sede: https://sede.serviciosmin.gob.es

**Coste:** 0€ (GRATUITO)

**Plazo respuesta:** 3 meses (silencio administrativo positivo)

---

## 9. Contactos Útiles

### Autoridad Competente España
- **Nombre:** Secretaría de Estado de Digitalización e IA (SETSI)
- **Ministerio:** Asuntos Económicos y Transformación Digital
- **Web:** https://avance.digital.gob.es/es-es/Servicios/FirmaElectronica
- **Email:** firma.electronica@mineco.es
- **Sede:** https://sede.serviciosmin.gob.es/prestadores/

### Proveedores TSA Cualificados España
- FNMT (Fábrica Nacional Moneda y Timbre): https://www.sede.fnmt.gob.es
- EC3 (Agència Catalana Certificació): https://www.aoc.cat
- Izenpe (País Vasco): https://www.izenpe.eus
- ANF AC: https://www.anf.es

### Recursos Técnicos
- OpenTSA (TSA NO cualificado): https://www.opentsa.org
- FreeTSA: https://www.freetsa.org
- RFC 3161 spec: https://www.ietf.org/rfc/rfc3161.txt

### Normativa
- Reglamento eIDAS: https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:32014R0910
- Ley 6/2020: https://www.boe.es/diario_boe/txt.php?id=BOE-A-2020-14046
- TSL europea: https://eidas.ec.europa.eu/efda/tl-browser/

---

## 10. Presupuesto Total Estimado

### Inversión Inicial (Año 1)

```
FASE 1 - Cumplimiento Crítico (Mes 1-3):
├─ RFC 3161 real OpenTSA: 2.000€
├─ Información legal completa: 1.000€
├─ Plan conservación: 1.500€
└─ Subtotal Fase 1: 4.500€

FASE 2 - Mejoras Operativas (Mes 3-6):
├─ Protocolo incidentes: 500€
├─ Doble factor SMS+Email: 1.000€
├─ Seguro RC profesional: 1.500€
└─ Subtotal Fase 2: 3.000€

FASE 3 - Registro SETSI (Mes 6-12):
├─ Comunicación oficial: 0€ (GRATIS)
├─ Consultoría legal (opcional): 2.000€
└─ Subtotal Fase 3: 0-2.000€

TOTAL AÑO 1: 7.500-9.500€
```

### Costes Recurrentes (Anual)

```
Infraestructura:
├─ AWS S3 Glacier (backup): 600-1.200€/año
├─ SSL/TLS certificados: 0-200€/año
└─ Subtotal infraestructura: 600-1.400€/año

Seguros:
├─ RC profesional: 1.500€/año
└─ Subtotal seguros: 1.500€/año

Mantenimiento:
├─ Actualización legal: 500€/año
├─ Renovación timestamps: 0€ (automático)
└─ Subtotal mantenimiento: 500€/año

TOTAL RECURRENTE: 2.600-3.400€/año
```

### Comparación con Alternativas

```
Opción A: NO cualificado SIN registro (tu plan actual)
├─ Año 1: 7.500€
├─ Anual: 2.600€
└─ Legal: 100% ✅

Opción B: NO cualificado CON registro
├─ Año 1: 7.500€ (mismo)
├─ Anual: 2.600€ (mismo)
├─ Beneficio: +credibilidad
└─ Legal: 100% ✅

Opción C: Proveedor cualificado
├─ Año 1: 60.000-80.000€
├─ Anual: 30.000-50.000€
├─ Beneficio: QES/AES
└─ ROI: Solo si mercado lo demanda
```

---

## 11. Métricas de Decisión

### Cuándo Registrarse en SETSI (Checklist)

Registrarse si cumples **3 o más**:
- [ ] >50 clientes B2B activos
- [ ] >100.000€ facturación anual del servicio
- [ ] Contratos con Administraciones Públicas en pipeline
- [ ] Competencia directa está registrada
- [ ] Clientes solicitan específicamente estar registrado
- [ ] Licitaciones requieren estar en TSL
- [ ] Plan de certificación cualificada en 12 meses

**Estado actual:** 0/7 cumplidos → NO registrar aún

### Cuándo Upgrade a Cualificado (Checklist)

Upgrade si cumples **4 o más**:
- [ ] >100 clientes enterprise (>1000 empleados)
- [ ] >500.000€ facturación anual servicio firma
- [ ] Clientes requieren explícitamente AES/QES
- [ ] Margen >40% (soportar 30-50k€/año coste)
- [ ] Equipo >5 personas (gestión compliance)
- [ ] Sector regulado (banca, salud, legal)
- [ ] Contratos públicos críticos (defensa, justicia)

**Estado actual:** 0/7 cumplidos → NO upgrade

---

## 12. Próximos Pasos Inmediatos

### Sprint 1 (Semana 1-2) - CRÍTICO

- [ ] Revisar implementación actual timestampClient.ts
- [ ] Diseñar arquitectura RFC 3161 real con OpenTSA
- [ ] Crear página `/legal/eidas-info` estructura
- [ ] Documentar política conservación 6 años

### Sprint 2 (Semana 3-4) - CRÍTICO

- [ ] Implementar RFC 3161 verdadero
- [ ] Marcar timestamps como "NO cualificado"
- [ ] Eliminar fallback timestamp local
- [ ] Testing exhaustivo timestamp real

### Sprint 3 (Semana 5-6) - ALTA

- [ ] Implementar disclaimer en PDFs generados
- [ ] Actualizar signedContractGenerator.ts
- [ ] Crear página legal completa
- [ ] Testing compliance end-to-end

### Sprint 4 (Semana 7-8) - ALTA

- [ ] Publicar política conservación en web
- [ ] Implementar cronjob limpieza automática (6 años)
- [ ] Protocolo notificación incidentes
- [ ] Documentación técnica completa

---

## 13. Riesgos Identificados

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| **Impugnación timestamp simulado** | Alta | Alto | Implementar RFC 3161 real (Fase 1) |
| **Sanción por no comunicar SETSI** | Baja | Medio | Comunicar en 6-12 meses (gratis) |
| **Rechazo judicial firma SES** | Media-Baja | Alto | Disclaimer claro + evidencias robustas |
| **Pérdida evidencias (sin backup)** | Media | Crítico | Plan conservación + S3 Glacier |
| **Incidente seguridad no notificado** | Baja | Alto | Protocolo automático Art. 19.2 |
| **Cliente requiere AES/QES** | Media | Medio | Roadmap upgrade Fase 4 (si demanda) |

---

## 14. Conclusiones Estratégicas

### Decisión: Proveedor NO Cualificado (Correcto)

✅ **Ventajas:**
- Ahorro 30.000-100.000€/año vs cualificado
- Flexibilidad operativa
- Legal 100% según Art. 17.1 eIDAS
- Mismo valor legal firmas SES
- Sin auditorías obligatorias

⚠️ **Compromisos:**
- Implementar compliance mínimo (4.500€)
- Disclaimer claro limitaciones
- No ofrecer AES/QES (solo SES)

### Decisión: Comunicar SETSI en 6-12 meses (Correcto)

✅ **Ventajas:**
- Tiempo validar producto/mercado
- Coste 0€ cuando se haga
- Flexibilidad cambiar servicios
- Legal operar sin registro ahora

⚠️ **Compromisos:**
- Hacerlo cuando >50 clientes B2B
- Plazo legal: 3 meses desde inicio actividad
- Riesgo sanción bajo pero existe

### Inversión Recomendada

**Mínimo viable:** 4.500€ (Fase 1)
**Recomendado:** 7.500€ (Fase 1+2)
**Con registro:** 9.500€ (Fase 1+2+3)

**Prioridad absoluta:** Fase 1 (compliance crítico)

---

**Documento de contexto generado:** 2025-10-04
**Próxima revisión:** Tras implementar Fase 1 o cuando alcance 50 clientes B2B
**Responsable:** Equipo openSignature
