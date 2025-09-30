import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface ContractGenerationRequest {
  description: string
  variables: Array<{
    name: string
    type: string
    placeholder?: string
  }>
  dynamicFields: Array<{
    name: string
    type: string
    required?: boolean
  }>
  existingContent?: string
  mode?: 'generate' | 'adapt'
}

export interface ContractGenerationResponse {
  content: string
  suggestedDynamicFields: Array<{
    name: string
    type: 'text' | 'textarea' | 'number' | 'email' | 'phone' | 'checkbox' | 'date'
    required: boolean
    placeholder?: string
  }>
  title: string
  description: string
  contractType?: string
  needsMoreInfo?: string[]
}

export function createSystemPrompt(): string {
  return `Eres un experto legal especializado en la elaboración de contratos legalmente vinculantes según la legislación española. Tu tarea es generar contratos completos y jurídicamente válidos basados en las instrucciones del usuario, utilizando como base templates y modelos de contratos estándar.

CONTEXTO TÉCNICO:
- Sistema de firma digital oSign.EU para España
- Variables del sistema: Se referencian como {{variable:nombreVariable}}
- Campos dinámicos: Se referencian como {{dynamic:nombreCampo}}
- Formato de respuesta: JSON estricto

VARIABLES DISPONIBLES DEL SISTEMA (sin valores, solo nombres):
Las variables representan información del emisor del contrato y siempre están disponibles:
- {{variable:fecha}} - Fecha actual automática
- {{variable:miNombre}} - Nombre del emisor
- {{variable:miDireccion}} - Dirección del emisor  
- {{variable:miTelefono}} - Teléfono del emisor
- {{variable:miIdentificacionFiscal}} - NIF/CIF del emisor
- {{variable:miEmail}} - Email del emisor
- {{variable:miCuentaBancaria}} - Cuenta bancaria del emisor

CAMPOS DINÁMICOS PREDETERMINADOS:
Siempre incluir estos campos obligatorios para cumplimiento legal:
- {{dynamic:clientName}} - Nombre completo del cliente/firmante
- {{dynamic:clientTaxId}} - NIF/DNI/CIF del cliente

BIBLIOTECA DE TEMPLATES DE CONTRATOS ESTÁNDAR:

1. CONTRATO DE SERVICIOS PROFESIONALES:
- Consultorías, asesorías, servicios técnicos
- Cláusulas: objeto del servicio, duración, retribución, entregables, confidencialidad, propiedad intelectual
- Campos cliente típicos: dirección, sector empresa, persona contacto

2. CONTRATO DE DESARROLLO SOFTWARE:
- Aplicaciones, webs, sistemas, mantenimiento
- Cláusulas: especificaciones técnicas, cronograma, soporte, licencias, código fuente
- Campos cliente típicos: requerimientos técnicos, plataformas objetivo

3. CONTRATO DE PRESTACIÓN DE SERVICIOS:
- Servicios generales, limpieza, mantenimiento, seguridad
- Cláusulas: periodicidad, materiales, personal, responsabilidades
- Campos cliente típicos: horarios, ubicación del servicio

4. CONTRATO DE COMPRAVENTA:
- Bienes muebles, equipos, productos
- Cláusulas: entrega, garantías, riesgo, inspección, devoluciones
- Campos cliente típicos: dirección entrega, condiciones especiales

5. CONTRATO DE ARRENDAMIENTO/ALQUILER:
- Locales, equipos, vehículos
- Cláusulas: duración, renta, fianza, uso permitido, mantenimiento
- Campos cliente típicos: referencias, uso previsto

6. CONTRATO DE DISTRIBUCIÓN/COMERCIALIZACIÓN:
- Productos, territorial, exclusividad
- Cláusulas: territorio, objetivos, marketing, comisiones
- Campos cliente típicos: zona geográfica, experiencia comercial

7. CONTRATO DE FORMACIÓN/CAPACITACIÓN:
- Cursos, talleres, certificaciones
- Cláusulas: programa, duración, certificados, materiales
- Campos cliente típicos: nivel conocimientos, modalidad preferida

8. CONTRATO DE LICENCIA:
- Software, marcas, patentes, uso tecnología
- Cláusulas: alcance licencia, restricciones, royalties
- Campos cliente típicos: uso previsto, volumen

LÓGICA DE IDENTIFICACIÓN DE TEMPLATES:
1. Analiza las palabras clave en la descripción del usuario
2. Identifica el tipo de contrato más cercano de los templates disponibles
3. Utiliza la estructura y cláusulas del template como base
4. Adapta el contenido específico según la descripción del usuario
5. Incluye todas las cláusulas estándar del tipo de contrato identificado

CRITERIOS PARA CAMPOS DINÁMICOS VS INFORMACIÓN FALTANTE:
🔴 NO crear campos dinámicos para:
- Información que debe proporcionar la empresa (duración del contrato, jurisdicción, condiciones específicas, tarifas, penalizaciones, etc.)
- Datos técnicos o legales del servicio/producto
- Términos comerciales definidos por la empresa
- Información corporativa o empresarial

✅ SÍ crear campos dinámicos SOLO para:
- Información personal del cliente/firmante (nombre, identificación, contacto, dirección)
- Datos específicos del cliente que varían por cada firma
- Información específica del servicio que proporciona el cliente (direcciones de entrega, horarios, especificaciones del cliente)
- Preferencias del cliente (checkbox para aceptar términos específicos)

⚠️ REGLA CRÍTICA - NO DUPLICAR INFORMACIÓN:
- Si una información se pide en "needsMoreInfo", NO crear campo dinámico para lo mismo
- Si se proporciona información en Q&A, incluirla directamente en el contrato, NO como campo dinámico
- Los campos dinámicos son EXCLUSIVAMENTE para datos que el cliente/firmante debe proporcionar al firmar

COMPORTAMIENTO ROBUSTO:
1. Identifica el template de contrato más apropiado basado en la descripción
2. Si faltan datos empresariales esenciales, pregunta en "needsMoreInfo"
3. Genera un contrato completo basado en el template identificado
4. Solo crea campos dinámicos para información genuina del cliente/firmante
5. Incluye todas las cláusulas estándar del tipo de contrato

FORMATO DE RESPUESTA (JSON válido):
{
  "title": "Título descriptivo del contrato",
  "description": "Breve descripción del propósito",
  "content": "Contenido HTML del contrato - MANTÉN CONCISO pero completo, usar <p> para párrafos y <br> para saltos",
  "contractType": "Tipo de contrato identificado del template",
  "suggestedDynamicFields": [
    {
      "name": "nombreCampo",
      "type": "text|textarea|number|email|phone|checkbox|date",
      "required": true|false,
      "placeholder": "Texto de ayuda opcional"
    }
  ],
  "needsMoreInfo": [
    "¿Cuál es la duración del contrato?",
    "¿Cuál es el precio o tarifa del servicio?"
  ]
}

IMPORTANTE PARA EL CONTENIDO:
- Mantén el contenido del contrato CONCISO pero legalmente completo
- Usa estructuras claras con <p> para párrafos
- Evita repeticiones innecesarias
- Incluye las cláusulas esenciales del template identificado
- NO incluyas opciones múltiples en el mismo contrato (elige la más apropiada)
- ELIMINAR COMPLETAMENTE cualquier línea de firma manuscrita, espacios para firmas, o referencias a "firma en todas las hojas"
- NO incluir texto como "Por___ Por___", líneas de guiones para firmar, o cualquier elemento de firma física
- El sistema usa firma digital, por lo que NO se requieren elementos de firma manuscrita

INSTRUCCIONES DE GENERACIÓN:
1. IDENTIFICA el template de contrato más apropiado
2. ANALIZA la descripción para identificar información faltante esencial EMPRESARIAL
3. GENERA un contrato completo basado en el template, con todas sus cláusulas estándar
4. USA variables {{variable:X}} para información del emisor
5. USA {{dynamic:clientName}} y {{dynamic:clientTaxId}} obligatoriamente
6. AÑADE campos dinámicos SOLO para datos genuinos del cliente/firmante
7. SI faltan datos empresariales críticos, lista en "needsMoreInfo"
8. ELIMINA COMPLETAMENTE cualquier elemento de firma manuscrita (líneas, espacios, "Por___", etc.)

INSTRUCCIONES DE ADAPTACIÓN (cuando se proporciona contenido existente):
1. ANALIZA el contrato existente para identificar su tipo y estructura
2. IDENTIFICA información del emisor (nombres, direcciones, etc.) y reemplázala con variables {{variable:X}}
3. IDENTIFICA información del cliente/firmante y reemplázala con campos dinámicos {{dynamic:X}}
4. CONVIERTE el formato a HTML estructurado con párrafos <p> y listas
5. MANTÉN todo el contenido legal original pero adaptado al formato del sistema
6. AGREGA cláusulas faltantes según el template identificado (si es necesario)
7. ASEGURA que cumple con los requisitos legales españoles
8. SUGIERE campos dinámicos apropiados basados en la información del cliente encontrada

REQUISITOS LEGALES ESPAÑA:
- Identificación completa de las partes (nombres, NIF/DNI)
- Objeto del contrato claramente definido según el template
- Condiciones y obligaciones específicas del tipo de contrato
- Cláusulas de resolución y incumplimiento estándar
- Jurisdicción y ley aplicable española
- Lugar y fecha de firma
- Todas las cláusulas típicas del tipo de contrato identificado

IMPORTANTE:
- SIEMPRE basar el contrato en uno de los templates estándar identificados
- NO duplicar información entre needsMoreInfo y campos dinámicos
- Distinguir claramente entre datos de la empresa vs datos del cliente
- Generar contratos completos y profesionales basados en templates probados
- Incluir todas las cláusulas estándar del tipo de contrato
- Respuesta únicamente en JSON válido
- Contenido en HTML con párrafos <p> y listas <ul>/<ol>
- Cláusulas numeradas y bien estructuradas según el template
- Lenguaje jurídico apropiado pero comprensible
- Adaptado específicamente a legislación española`
}

export async function generateContract(request: ContractGenerationRequest): Promise<ContractGenerationResponse> {
  try {
    const systemPrompt = createSystemPrompt()
    
    let userPrompt = ''
    
    if (request.mode === 'adapt' && request.existingContent) {
      userPrompt = `
MODO ADAPTACIÓN: Convierte el siguiente contrato existente al formato del sistema oSign.EU.

CONTRATO EXISTENTE:
"${request.existingContent}"

DESCRIPCIÓN ADICIONAL DEL USUARIO:
"${request.description}"

INSTRUCCIONES:
1. Analiza el contrato existente e identifica su tipo
2. Convierte información del emisor a variables {{variable:X}}
3. Convierte información del cliente a campos dinámicos {{dynamic:X}}
4. Mantén todo el contenido legal pero adaptado al formato HTML
5. Agrega campos obligatorios clientName y clientTaxId si no existen
6. Sugiere campos dinámicos apropiados basados en el contenido

Variables disponibles: ${request.variables.map(v => v.name).join(', ')}
Campos existentes: ${request.dynamicFields.map(f => f.name).join(', ')}
`
    } else {
      userPrompt = `
MODO GENERACIÓN: Genera un contrato desde cero basado en la descripción.

DESCRIPCIÓN:
"${request.description}"

Variables disponibles en el sistema: ${request.variables.map(v => v.name).join(', ')}
Campos dinámicos existentes: ${request.dynamicFields.map(f => f.name).join(', ')}

Crea un contrato completo, legalmente válido para España, que incluya los campos obligatorios clientName y clientTaxId, y añade cualquier campo dinámico adicional que consideres necesario para este tipo de contrato.
`
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Cost-effective model as requested
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user', 
          content: userPrompt
        }
      ],
      temperature: 0.3, // Low temperature for consistency
      max_tokens: 8000, // Increased to handle longer contracts
    })

    const response = completion.choices[0]?.message?.content
    if (!response) {
      throw new Error('No response from OpenAI')
    }

    // Clean and parse JSON response
    let parsedResponse: ContractGenerationResponse
    try {
      // Remove markdown code blocks if present
      let cleanResponse = response.trim()

      // Remove ```json at the beginning
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.substring(7)
      }

      // Remove ``` at the end
      if (cleanResponse.endsWith('```')) {
        cleanResponse = cleanResponse.substring(0, cleanResponse.length - 3)
      }

      // Remove any remaining backticks at start/end
      cleanResponse = cleanResponse.replace(/^`+|`+$/g, '').trim()

      // Check if the response seems truncated (missing closing brace)
      const openBraces = (cleanResponse.match(/\{/g) || []).length
      const closeBraces = (cleanResponse.match(/\}/g) || []).length

      if (openBraces > closeBraces) {
        console.warn('Response appears truncated, attempting to fix...')
        // Try to add missing closing braces
        const missingBraces = openBraces - closeBraces
        cleanResponse += '}}'.repeat(missingBraces)
      }

      // Try to fix common JSON issues in the content field
      if (cleanResponse.includes('"content":')) {
        // Find the content field and try to fix unterminated strings
        const contentMatch = cleanResponse.match(/"content":\s*"/)
        if (contentMatch) {
          const contentStart = cleanResponse.indexOf('"content":"') + 11
          const remaining = cleanResponse.substring(contentStart)

          // Look for the end of the content field (where the next JSON field starts)
          const nextFieldMatch = remaining.match(/",\s*"[a-zA-Z]+":/)
          if (!nextFieldMatch) {
            // Content field is not properly closed, try to find a reasonable end
            console.warn('Content field appears unterminated, attempting to truncate and close...')
            // Find last complete sentence or clause
            const lastPeriod = remaining.lastIndexOf('.')
            const lastClause = remaining.lastIndexOf('<br>')
            const cutPoint = Math.max(lastPeriod, lastClause)

            if (cutPoint > 0) {
              const truncatedContent = remaining.substring(0, cutPoint + (lastPeriod > lastClause ? 1 : 4))
              cleanResponse = cleanResponse.substring(0, contentStart) +
                             truncatedContent +
                             '", "suggestedDynamicFields": [], "needsMoreInfo": []}'
            }
          }
        }
      }

      parsedResponse = JSON.parse(cleanResponse)
    } catch (parseError) {
      console.error('Raw AI response length:', response.length)
      console.error('Clean response length:', cleanResponse?.length || 0)
      console.error('Parse error:', parseError)

      // Try a fallback approach - extract what we can
      try {
        const titleMatch = response.match(/"title":\s*"([^"]+)"/)
        const descMatch = response.match(/"description":\s*"([^"]+)"/)
        const contentMatch = response.match(/"content":\s*"(.*?)(?:",\s*"[a-zA-Z]+"|$)/)

        if (titleMatch && contentMatch) {
          console.log('Using fallback JSON parsing...')
          parsedResponse = {
            title: titleMatch[1],
            description: descMatch?.[1] || 'Contrato generado por IA',
            content: contentMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '<br>'),
            suggestedDynamicFields: [
              { name: 'clientName', type: 'text', required: true, placeholder: 'Nombre completo del cliente' },
              { name: 'clientTaxId', type: 'text', required: true, placeholder: 'NIF/DNI/CIF del cliente' }
            ],
            contractType: 'Acuerdo de Confidencialidad',
            needsMoreInfo: []
          }
        } else {
          throw new Error('Could not extract minimum required fields from AI response')
        }
      } catch (fallbackError) {
        console.error('Fallback parsing also failed:', fallbackError)
        throw new Error('Invalid JSON response from AI: ' + parseError)
      }
    }

    // Validate required fields
    if (!parsedResponse.content || !parsedResponse.title) {
      throw new Error('AI response missing required fields')
    }

    // Ensure mandatory fields are included
    if (!parsedResponse.suggestedDynamicFields) {
      parsedResponse.suggestedDynamicFields = []
    }

    // Add mandatory fields if not present
    const hasClientName = parsedResponse.suggestedDynamicFields.some(f => f.name === 'clientName')
    const hasClientTaxId = parsedResponse.suggestedDynamicFields.some(f => f.name === 'clientTaxId')

    if (!hasClientName) {
      parsedResponse.suggestedDynamicFields.unshift({
        name: 'clientName',
        type: 'text',
        required: true,
        placeholder: 'Nombre completo del cliente'
      })
    }

    if (!hasClientTaxId) {
      parsedResponse.suggestedDynamicFields.unshift({
        name: 'clientTaxId', 
        type: 'text',
        required: true,
        placeholder: 'NIF/DNI/CIF del cliente'
      })
    }

    return parsedResponse

  } catch (error) {
    console.error('Error generating contract with OpenAI:', error)
    throw error
  }
}

export async function calculateTokenUsage(text: string): Promise<number> {
  // Rough estimation: 1 token ≈ 4 characters for Spanish text
  return Math.ceil(text.length / 4)
}

export function calculateCost(inputTokens: number, outputTokens: number): number {
  // GPT-4o-mini pricing (as of 2024)
  const INPUT_COST_PER_1K = 0.00015  // $0.150 per 1K tokens
  const OUTPUT_COST_PER_1K = 0.0006  // $0.600 per 1K tokens
  
  const inputCost = (inputTokens / 1000) * INPUT_COST_PER_1K
  const outputCost = (outputTokens / 1000) * OUTPUT_COST_PER_1K
  
  return inputCost + outputCost
}