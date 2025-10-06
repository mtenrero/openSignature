# Registro de Proveedores NO Cualificados en España (eIDAS)

## Resumen Ejecutivo

**Pregunta:** ¿Puedo registrarme como proveedor eIDAS NO cualificado en España?

**Respuesta Corta:** **SÍ, es posible pero NO obligatorio.**

**Respuesta Detallada:**
- ✅ Existe un registro VOLUNTARIO para proveedores NO cualificados
- ❌ NO es obligatorio registrarse (Art. 17 eIDAS)
- ⚠️ El registro NO te convierte en proveedor cualificado
- 🟢 Estar registrado puede dar mayor credibilidad (pero sin valor legal adicional)

---

## 1. Marco Legal - Tres Categorías de Proveedores en España

Según la normativa española de implementación del Reglamento eIDAS, existen **3 categorías** de prestadores de servicios electrónicos de confianza (PSEC):

### Categoría 1: Proveedores Cualificados Registrados ✅ OBLIGATORIO

```
┌─────────────────────────────────────────────────────┐
│  PRESTADORES CUALIFICADOS (QTSPs)                   │
├─────────────────────────────────────────────────────┤
│  Servicios: QES, AES, Sello cualificado, etc.      │
│  Registro: OBLIGATORIO en SETSI                     │
│  Supervisión: PREVIA y continua                     │
│  Auditoría: Anual obligatoria ETSI 319 401          │
│  TSL: Incluidos en Lista de Confianza española      │
│  Ejemplos: FNMT, ANF, Camerfirma, etc.              │
└─────────────────────────────────────────────────────┘
```

**NO pueden existir servicios cualificados NO registrados.**

### Categoría 2: Proveedores NO Cualificados Registrados ✅ VOLUNTARIO (TU OPCIÓN)

```
┌─────────────────────────────────────────────────────┐
│  PRESTADORES NO CUALIFICADOS REGISTRADOS            │
├─────────────────────────────────────────────────────┤
│  Servicios: SES, timestamps NO cualificados, etc.   │
│  Registro: VOLUNTARIO en SETSI                      │
│  Supervisión: Posterior y reactiva (solo si denuncias)│
│  Auditoría: NO obligatoria                          │
│  TSL: Pueden aparecer (marcados como NO cualif.)    │
│  Beneficios:                                         │
│    ✅ Mayor credibilidad ante clientes              │
│    ✅ Publicación en web del Ministerio             │
│    ✅ Menor riesgo de supervisión reactiva          │
│    ⚠️  PERO sin valor legal adicional               │
└─────────────────────────────────────────────────────┘
```

**Este es tu caso si decides registrarte.**

### Categoría 3: Proveedores NO Cualificados NO Registrados ✅ LEGAL

```
┌─────────────────────────────────────────────────────┐
│  PRESTADORES NO CUALIFICADOS NO REGISTRADOS         │
├─────────────────────────────────────────────────────┤
│  Servicios: SES, servicios de confianza básicos     │
│  Registro: NO requerido                             │
│  Supervisión: Reactiva solo si incumplimiento       │
│  Auditoría: NO obligatoria                          │
│  TSL: NO aparecen en listas oficiales               │
│  Obligaciones:                                       │
│    ✅ Cumplir Art. 13 eIDAS (info a usuarios)       │
│    ✅ Notificar incidentes de seguridad (Art. 19.2) │
│    ✅ Responsabilidad civil por daños (Art. 13.1)   │
└─────────────────────────────────────────────────────┘
```

**Este es tu caso si NO te registras (perfectamente legal).**

---

## 2. Marco Legal del Registro Voluntario

### 2.1 Base Legal

**Reglamento eIDAS - Art. 17.4:**
> Los Estados miembros podrán incluir información sobre prestadores de servicios de confianza no cualificados en las listas de confianza, junto con información relativa a los servicios de confianza no cualificados que prestan, **indicando claramente que no son cualificados** de conformidad con el presente Reglamento.

**Ley 6/2020 (España) - Reguladora de servicios de confianza:**
> Establece el registro de Prestadores de Servicios Electrónicos de Confianza (PSEC) gestionado por SETSI (ahora bajo el Ministerio para la Transformación Digital).

### 2.2 Autoridad Competente en España

**Nombre:** Secretaría de Estado de Telecomunicaciones e Infraestructuras Digitales (SETSI)
**Ahora:** Integrada en el Ministerio para la Transformación Digital y de la Función Pública

**Web oficial:**
- https://avance.digital.gob.es/es-es/Servicios/FirmaElectronica/Paginas/Prestadores.aspx
- Sede electrónica: https://sede.serviciosmin.gob.es/prestadores/

**Contacto:**
- Email: registro.prestadores@mineco.es (puede haber cambiado)
- Teléfono: 91 XXX XX XX (verificar en web oficial actualizada)

---

## 3. Procedimiento de Registro Voluntario (NO Cualificados)

### 3.1 ⚠️ IMPORTANTE: Información Limitada Pública

**Según mi investigación:**
- ✅ El registro voluntario EXISTE (confirmado por Art. 17.4 eIDAS y búsquedas web)
- ❌ NO hay procedimiento público detallado en la web del Ministerio
- ⚠️ La información se centra en proveedores CUALIFICADOS (obligatorios)

**Esto sugiere:**
- El registro de NO cualificados es poco común
- Probablemente requiere contacto directo con SETSI
- NO hay formulario automatizado online

### 3.2 Procedimiento Estimado (Basado en Marco Legal)

**PASO 1: Preparación de Documentación**

Documentos probables requeridos:
```
1. Solicitud formal de inscripción (carta motivada)
   - Identificación de la empresa (CIF, razón social)
   - Domicilio fiscal y social
   - Representante legal

2. Descripción detallada de servicios NO cualificados
   - Tipo: "Firma Electrónica Simple (SES)"
   - Métodos: SMS, Email, firma manuscrita digital
   - Tecnologías: Hash SHA-256, timestamp OpenTSA
   - Volumen estimado: XX firmas/mes

3. Declaración de cumplimiento eIDAS
   - Art. 13: Información a usuarios
   - Art. 19.2: Notificación de incidentes
   - GDPR: Protección datos personales

4. Información técnica (opcional pero recomendado)
   - Arquitectura del sistema
   - Medidas de seguridad (cifrado, backups)
   - Plan de continuidad de negocio
   - Política de conservación de evidencias

5. Seguros (opcional)
   - Seguro RC profesional (recomendado 100.000€+)
```

**PASO 2: Contacto con SETSI**

```
Opción A: Email
- Destinatario: registro.prestadores@mineco.es
- Asunto: "Solicitud de Registro como Proveedor NO Cualificado - [Nombre Empresa]"
- Adjuntos: Documentación del Paso 1

Opción B: Sede Electrónica
- Web: https://sede.serviciosmin.gob.es
- Buscar: "Registro PSEC" o "Prestadores servicios confianza"
- Certificado digital requerido para firma

Opción C: Teléfono
- Llamar a Secretaría de Estado para consultar procedimiento exacto
- Solicitar documentación/formularios específicos
```

**PASO 3: Evaluación (Supervisión Ligera)**

Para NO cualificados:
- ⚠️ **NO hay evaluación de conformidad previa** (Art. 17 eIDAS)
- ⚠️ **NO hay auditoría obligatoria**
- ✅ SETSI puede solicitar aclaraciones o documentación adicional
- ✅ Verificación administrativa básica (empresa existe, CIF válido, etc.)

**PASO 4: Publicación en Lista**

Si se acepta la solicitud:
- ✅ Publicación en web del Ministerio
- ✅ Mención en TSL española (sección "No Cualificados")
- ⚠️ CON DISCLAIMER: "Proveedor NO cualificado según eIDAS"

**PASO 5: Mantenimiento del Registro**

Obligaciones posteriores:
- 📋 Notificar cambios sustanciales (cambio servicios, domicilio, etc.)
- 🚨 Notificar incidentes de seguridad (Art. 19.2 eIDAS - OBLIGATORIO)
- 🔄 Renovación periódica (si existe - verificar con SETSI)

---

## 4. Costes Estimados

### 4.1 Costes Oficiales (Gobierno)

**Registro de proveedor NO cualificado:**
- **Coste oficial:** Probablemente 0€ (tasa administrativa mínima o gratuito)
- **Base:** No hay supervisión previa ni auditoría obligatoria
- ⚠️ **Verificar con SETSI** - pueden existir tasas simbólicas

**Comparación con cualificado:**
- Registro cualificado: ~5.000-10.000€ (auditoría de conformidad)
- Supervisión anual: ~3.000-5.000€
- **Total cualificado: 30.000-100.000€/año**

### 4.2 Costes Indirectos (Tu Empresa)

```
Preparación solicitud:
├── Consultoría legal (opcional): 1.000-3.000€
├── Documentación técnica: 500-1.500€ (si externo)
├── Seguro RC profesional: 500-2.000€/año (recomendado)
└── Tiempo interno: 20-40 horas de gestión

TOTAL ESTIMADO: 2.000-7.000€ (primera vez)
ANUAL: 500-2.000€ (mantenimiento)
```

---

## 5. Beneficios vs Desventajas del Registro

### 5.1 ✅ Beneficios de Registrarte

#### 1. Mayor Credibilidad Comercial
```
"Proveedor registrado en el Ministerio para la Transformación Digital"
```
- ✅ Apareces en web oficial del Gobierno
- ✅ Los clientes pueden verificarte en sede.serviciosmin.gob.es
- ✅ Mayor confianza en procesos de contratación pública/privada
- ⚠️ PERO sigue siendo NO cualificado (valor legal igual)

#### 2. Protección Ante Reclamaciones
- ✅ Demuestras diligencia proactiva (registrarte voluntariamente)
- ✅ Menor probabilidad de supervisión reactiva por denuncias
- ✅ En juicio: "Estoy registrado como proveedor eIDAS en SETSI"

#### 3. Diferenciación Competitiva
- ✅ Único en tu sector (pocos NO cualificados se registran)
- ✅ Sello de calidad percibido (aunque no legal)
- ✅ Argumentación comercial: "Transparencia y compromiso eIDAS"

#### 4. Acceso a Información Oficial
- ✅ Posible comunicación directa con SETSI
- ✅ Actualizaciones normativas prioritarias
- ✅ Participación en consultas públicas

### 5.2 ❌ Desventajas de Registrarte

#### 1. Visibilidad Pública
- ❌ Tus datos aparecen en web pública del Ministerio
- ❌ Competidores pueden analizarte
- ❌ Mayor escrutinio de clientes/usuarios

#### 2. Obligaciones de Notificación
- ❌ Debes notificar incidentes de seguridad (Art. 19.2 ya aplica sin registro, pero con registro es más visible)
- ❌ Cambios en servicios deben comunicarse a SETSI
- ❌ Actualizaciones de datos corporativos

#### 3. Mayor Expectativa de Cumplimiento
- ❌ Si estás registrado, se espera mayor rigor
- ❌ En caso de incumplimiento, SETSI puede actuar más fácilmente
- ❌ Responsabilidad moral aumentada

#### 4. Coste y Tiempo
- ❌ Proceso de registro (20-40 horas)
- ❌ Mantenimiento anual (actualizaciones)
- ❌ Posibles consultas/solicitudes de SETSI

### 5.3 🤔 Análisis Coste-Beneficio

```
┌────────────────────────────────────────────────────────────┐
│  ¿DEBERÍAS REGISTRARTE?                                    │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  SÍ, si:                                                    │
│  ✅ Buscas contratos con Administraciones Públicas         │
│  ✅ Tus clientes son empresas grandes (compliance)         │
│  ✅ Quieres diferenciarte de competencia                   │
│  ✅ Planeas escalar a servicios cualificados (futuro)      │
│  ✅ Tienes recursos para gestionar el registro             │
│                                                             │
│  NO, si:                                                    │
│  ❌ Eres startup/PYME pequeña con recursos limitados       │
│  ❌ Clientes no valoran el registro (B2C principalmente)   │
│  ❌ Quieres mantener bajo perfil regulatorio               │
│  ❌ Aún estás validando el producto/mercado                │
│  ❌ El coste-tiempo no justifica el beneficio comercial    │
└────────────────────────────────────────────────────────────┘
```

---

## 6. Alternativa: Operar SIN Registro (Legal)

### 6.1 Marco Legal para NO Registrados

**Art. 17.1 eIDAS:**
> Los prestadores de servicios de confianza **no cualificados** no están sujetos a actividades de supervisión previas.

**Art. 13.1 eIDAS:**
> Los prestadores de servicios de confianza que prestan servicios de confianza **no cualificados** serán responsables de los daños causados intencionadamente o por negligencia...

**Traducción:**
- ✅ Puedes operar SIN registrarte
- ✅ Solo responsabilidad civil estándar
- ✅ Supervisión reactiva (solo si hay denuncias)

### 6.2 Obligaciones Mínimas (Sin Registro)

#### Obligatorio según eIDAS:

**1. Art. 13.2 - Información a usuarios:**
```html
<!-- Ejemplo para tu web -->
<section id="informacion-legal-eidas">
  <h2>Información del Proveedor de Servicios de Confianza</h2>

  <h3>Identidad del Proveedor</h3>
  <ul>
    <li>Nombre comercial: openSignature</li>
    <li>Razón social: [Tu Empresa S.L.]</li>
    <li>CIF: [B-XXXXXXXX]</li>
    <li>Domicilio: [Calle X, CP, Ciudad]</li>
    <li>Email: legal@opensignature.com</li>
    <li>Teléfono: +34 XXX XXX XXX</li>
  </ul>

  <h3>Tipo de Servicio</h3>
  <p>
    Proveedor NO cualificado de servicios electrónicos de confianza
    según Reglamento eIDAS (UE) 910/2014.
  </p>
  <p>
    Servicios ofrecidos: Firma Electrónica Simple (SES) - Art. 25 eIDAS
  </p>

  <h3>Limitaciones del Servicio</h3>
  <ul>
    <li>❌ NO es firma electrónica cualificada (QES)</li>
    <li>❌ NO es firma electrónica avanzada (AES)</li>
    <li>⚠️ Identificación mediante SMS/Email (no robusta)</li>
    <li>⚠️ Timestamp NO cualificado (OpenTSA - RFC 3161)</li>
    <li>✅ Validez legal según Art. 25 eIDAS (valor probatorio estándar)</li>
  </ul>

  <h3>Estado de Registro</h3>
  <p>
    Este proveedor NO está registrado como Prestador de Servicios
    Electrónicos de Confianza (PSEC) en SETSI.

    Esto es legal según Art. 17 eIDAS - Los proveedores NO cualificados
    no están sujetos a supervisión previa ni registro obligatorio.
  </p>

  <h3>Términos y Condiciones</h3>
  <p><a href="/terminos">Términos del Servicio</a></p>
  <p><a href="/privacidad">Política de Privacidad (GDPR)</a></p>
  <p><a href="/conservacion">Política de Conservación de Evidencias</a></p>
</section>
```

**2. Art. 19.2 - Notificación de incidentes de seguridad:**
```typescript
// Protocolo de notificación obligatorio
async function notifySecurityIncident(incident: SecurityIncident) {
  // 1. Evaluar si es "impacto significativo"
  const isSignificant = incident.affectedUsers > 100 ||
                        incident.dataLeaked ||
                        incident.serviceDownHours > 24

  if (isSignificant) {
    // 2. Notificar a SETSI en 24h
    await sendEmail({
      to: 'incidentes.setsi@mineco.es', // Verificar email actual
      subject: '[INCIDENTE SEGURIDAD] openSignature - Proveedor NO cualificado',
      body: `
        Fecha incidente: ${incident.date}
        Tipo: ${incident.type}
        Impacto: ${incident.impact}
        Usuarios afectados: ${incident.affectedUsers}
        Medidas correctivas: ${incident.actions}
      `
    })

    // 3. Notificar a usuarios afectados (GDPR)
    await notifyAffectedUsers(incident)

    // 4. Log interno
    await auditLog('security_incident_notified_setsi', incident)
  }
}
```

**3. GDPR - Protección de datos personales:**
- ✅ Base de datos cifrada
- ✅ Política de privacidad conforme
- ✅ Consentimiento explícito usuarios
- ✅ Derecho al olvido implementado

---

## 7. Recomendación para openSignature

### 7.1 Análisis de Tu Situación

**Tu perfil:**
- Startup/PYME en fase de crecimiento
- Servicios: SES (Firma Electrónica Simple)
- Tecnología: SMS, Email, timestamp OpenTSA (NO cualificado)
- Clientes potenciales: B2B y B2C

### 7.2 Recomendación: **NO registrarse (por ahora)**

**Razones:**

#### 1. Fase de Validación de Producto
- ✅ Aún estás ajustando el producto/servicio
- ✅ El registro añade rigidez innecesaria
- ✅ Mejor validar PMF (Product-Market Fit) primero

#### 2. Coste-Beneficio Desfavorable (Etapa Actual)
```
Coste: 2.000-7.000€ + 20-40h gestión
Beneficio: Credibilidad comercial marginal

ROI esperado: Negativo en fase inicial
```

#### 3. Flexibilidad Operativa
- ✅ Sin registro, más fácil pivotar servicios
- ✅ Sin obligación de notificar cambios a SETSI
- ✅ Menor carga administrativa

#### 4. Cumplimiento Legal Igual
- ✅ Operar sin registro es 100% legal (Art. 17 eIDAS)
- ✅ Valor legal de las firmas: IGUAL (SES)
- ✅ Responsabilidad: IGUAL (Art. 13.1)

### 7.3 Roadmap Sugerido

```
┌─────────────────────────────────────────────────────────┐
│  FASE 1: AHORA - NO Registrado (6-12 meses)             │
├─────────────────────────────────────────────────────────┤
│  Objetivo: Validar producto y mercado                   │
│                                                          │
│  Acciones:                                               │
│  1. ✅ Implementar info legal completa (Art. 13.2)      │
│  2. ✅ Corregir timestamp (OpenTSA real, no simulado)   │
│  3. ✅ Plan de conservación documentado                 │
│  4. ✅ Protocolo notificación incidentes                │
│  5. ✅ Operar legalmente SIN registro                   │
│                                                          │
│  Coste: 4.500€ (desarrollo + infraestructura)           │
│  Beneficio: Cumplimiento pleno + flexibilidad           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  FASE 2: 12-24 meses - Considerar Registro              │
├─────────────────────────────────────────────────────────┤
│  Condiciones para registrarte:                          │
│                                                          │
│  SI cumples 3+ de estos criterios:                      │
│  ✅ >100 clientes activos B2B                           │
│  ✅ Contratos con Administraciones Públicas             │
│  ✅ Facturación >100.000€/año del servicio              │
│  ✅ Competencia registrada en tu nicho                  │
│  ✅ Solicitudes específicas de clientes                 │
│                                                          │
│  ENTONCES: Registrarte como proveedor NO cualificado    │
│                                                          │
│  Coste: 2.000-7.000€                                    │
│  Beneficio: Diferenciación + credibilidad B2B           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  FASE 3: 24+ meses - Upgrade a Cualificado (OPCIONAL)   │
├─────────────────────────────────────────────────────────┤
│  Solo si demanda de mercado justifica:                  │
│                                                          │
│  ✅ Clientes requieren AES/QES (firma avanzada)         │
│  ✅ Facturación >500.000€/año                           │
│  ✅ Recursos para auditoría anual                       │
│                                                          │
│  Coste: 30.000-100.000€/año                             │
│  Beneficio: Servicios cualificados (mayor precio)       │
└─────────────────────────────────────────────────────────┘
```

---

## 8. Checklist de Acción Inmediata

### ✅ HACER AHORA (Sin registro)

- [ ] **Crear página "Información Legal eIDAS":**
  - [ ] Identidad completa del proveedor (CIF, dirección, contacto)
  - [ ] Tipo de servicio: "SES NO cualificada"
  - [ ] Disclaimer: "NO registrado en SETSI (legal según Art. 17)"
  - [ ] Limitaciones: Timestamp NO cualificado, identificación SMS/Email

- [ ] **Implementar timestamp OpenTSA real:**
  - [ ] Sustituir simulación por RFC 3161 verdadero
  - [ ] Marcar como "NO cualificado" en PDFs
  - [ ] Guardar token completo en base de datos

- [ ] **Plan de conservación documentado:**
  - [ ] 6 años para firmas completadas
  - [ ] Formato PDF/A-3
  - [ ] Plan de cese de actividad
  - [ ] Publicar en web

- [ ] **Protocolo notificación incidentes:**
  - [ ] Código para detectar incidentes significativos
  - [ ] Email automatizado a SETSI (si aplica)
  - [ ] Notificación a usuarios (GDPR)

### 🟡 CONSIDERAR (6-12 meses)

- [ ] **Evaluar registro SETSI:**
  - [ ] Si tienes >50 clientes B2B
  - [ ] Si aparecen licitaciones públicas
  - [ ] Si competencia se registra

- [ ] **Contactar SETSI informalmente:**
  - [ ] Email consulta sobre procedimiento
  - [ ] Estimar costes reales
  - [ ] Entender beneficios prácticos

### 🟢 FUTURO (24+ meses)

- [ ] **Upgrade a proveedor cualificado:**
  - [ ] Solo si mercado lo demanda
  - [ ] Solo si ROI justifica 30.000€+/año

---

## 9. Contacto con SETSI

### 9.1 Información de Contacto (Verificar Actualización)

**Organismo:** Secretaría de Estado de Telecomunicaciones e Infraestructuras Digitales
**Ministerio:** Para la Transformación Digital y de la Función Pública

**Web oficial:**
- https://avance.digital.gob.es/es-es/Servicios/FirmaElectronica/Paginas/Prestadores.aspx

**Sede electrónica:**
- https://sede.serviciosmin.gob.es/prestadores/

**Email (probable - verificar):**
- registro.prestadores@mineco.es
- firma.electronica@mineco.es

**Teléfono:**
- Centralita Ministerio: +34 91 346 1000 (solicitar extensión SETSI)

### 9.2 Template Email Consulta

```
Para: registro.prestadores@mineco.es
Asunto: Consulta registro proveedor NO cualificado eIDAS

Estimados señores,

Me dirijo a ustedes en representación de [NOMBRE EMPRESA], CIF [X-XXXXXXXX],
para solicitar información sobre el procedimiento de registro VOLUNTARIO
como Prestador de Servicios Electrónicos de Confianza NO CUALIFICADO
según el Reglamento eIDAS (UE) 910/2014 Art. 17.4.

Nuestros servicios:
- Firma Electrónica Simple (SES) - Art. 25 eIDAS
- Identificación mediante SMS/Email
- Timestamp NO cualificado (RFC 3161)

Agradecería información sobre:
1. Procedimiento de registro voluntario para proveedores NO cualificados
2. Documentación requerida
3. Plazos y costes (si existen)
4. Beneficios de estar registrado como NO cualificado
5. Formularios o trámites electrónicos disponibles

Quedamos a su disposición para ampliar información.

Atentamente,
[Nombre]
[Cargo]
[Teléfono]
[Email]
```

---

## 10. Conclusiones Finales

### ✅ Respuestas Clave

**1. ¿Puedo registrarme como NO cualificado?**
→ **SÍ, es posible** (Art. 17.4 eIDAS)

**2. ¿Es obligatorio?**
→ **NO** (Art. 17.1 eIDAS)

**3. ¿Debería registrarme ahora?**
→ **NO recomendado en fase inicial** (mejor validar producto primero)

**4. ¿Es legal operar sin registro?**
→ **100% legal** (proveedores NO cualificados no requieren supervisión previa)

**5. ¿Cuándo registrarme?**
→ **Cuando tengas >50 clientes B2B o contratos públicos** (12-24 meses)

### 📋 Prioridades Inmediatas (Sin Registro)

```
PRIORIDAD 1 (CRÍTICA):
✅ Información legal completa en web (Art. 13.2)
✅ Timestamp OpenTSA real (no simulado)
✅ Disclaimer "NO cualificado" en PDFs

PRIORIDAD 2 (ALTA):
✅ Plan de conservación 6 años documentado
✅ Protocolo notificación incidentes (Art. 19.2)
✅ Doble factor SMS + Email

PRIORIDAD 3 (MEDIA):
🟡 Considerar registro SETSI (6-12 meses)
🟡 Consulta informal con SETSI (email)
🟡 Evaluar seguro RC profesional
```

### 💰 Coste Total Estimado

**Opción A: Operar SIN registro (Recomendado ahora)**
- Desarrollo compliance: 4.500€
- Mantenimiento anual: 1.500€/año
- **Total año 1: 6.000€**

**Opción B: Registrarse como NO cualificado**
- Desarrollo compliance: 4.500€
- Registro SETSI: 2.000-7.000€
- Mantenimiento anual: 2.000-3.000€/año
- **Total año 1: 8.500-14.500€**

**Opción C: Certificarse como Cualificado**
- Desarrollo: 15.000€
- Auditoría inicial: 10.000€
- Registro + supervisión: 5.000€
- Mantenimiento anual: 30.000-50.000€/año
- **Total año 1: 60.000-80.000€**

---

**Recomendación final:** Empieza con **Opción A** (sin registro), cumple todos los requisitos mínimos, y evalúa registro en 12 meses según tracción comercial.

---

**Documento generado:** 2025-10-04
**Versión:** 1.0
**Próxima revisión:** Tras contacto con SETSI o cuando alcances 50+ clientes B2B
