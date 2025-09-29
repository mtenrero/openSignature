import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { generateContract, calculateTokenUsage, calculateCost } from '@/lib/openai'
import { AICollections } from '@/lib/db/aiCollections'
import { UsageTracker } from '@/lib/subscription/usage'
import { UsageAuditService } from '@/lib/usage/usageAudit'
import { auth0UserManager } from '@/lib/auth/userManagement'
import {
  getDatabase,
  mongoHelpers,
  CustomerEncryption
} from '@/lib/db/mongodb'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 })
    }

    // @ts-ignore - customerId is a custom property
    const customerId = session.customerId as string
    const userId = session.user.id
    
    if (!customerId) {
      return NextResponse.json(
        { error: 'Customer ID not found in session' },
        { status: 401 }
      )
    }

    // Validate OpenAI token
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 500 }
      )
    }

    const { description, existingContent, mode } = await request.json()
    
    if (!description || typeof description !== 'string' || description.trim().length < 5) {
      return NextResponse.json(
        { error: 'Description is required and must be at least 5 characters' },
        { status: 400 }
      )
    }

    // Validate adapt mode
    if (mode === 'adapt' && (!existingContent || existingContent.trim().length < 20)) {
      return NextResponse.json(
        { error: 'Existing content is required for adaptation mode and must be substantial' },
        { status: 400 }
      )
    }

    // Check subscription limits for AI usage
    try {
      const subscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(userId)
      if (subscriptionInfo) {
        const canGenerate = await UsageTracker.canPerformAction(
          customerId,
          subscriptionInfo.limits,
          'ai_generation'
        )

        if (!canGenerate.allowed) {
          return NextResponse.json({
            error: canGenerate.reason || 'Has alcanzado el límite de generaciones de IA para tu plan',
            errorCode: 'AI_LIMIT_EXCEEDED',
            upgradeRequired: true
          }, { status: 403 })
        }
      }
    } catch (error) {
      console.error('Error checking AI usage limits:', error)
      // Continue with generation if subscription check fails to avoid blocking users
    }

    console.log(`[AI CONTRACT] Generating contract for customer ${customerId}: "${description}"`)

    // Fetch current variables directly from database (server-side)
    let variables: any[] = []
    try {
      const db = await getDatabase()
      const collection = db.collection('variables')

      // Default variables template
      const defaultVariablesTemplate = [
        {
          id: '2',
          name: 'miNombre',
          type: 'name',
          required: true,
          placeholder: '',
          enabled: true
        },
        {
          id: '3',
          name: 'miDireccion',
          type: 'address',
          required: true,
          placeholder: '',
          enabled: true
        },
        {
          id: '4',
          name: 'miTelefono',
          type: 'phone',
          required: false,
          placeholder: '',
          enabled: true
        },
        {
          id: '5',
          name: 'miIdentificacionFiscal',
          type: 'taxId',
          required: true,
          placeholder: '',
          enabled: true
        },
        {
          id: '6',
          name: 'miEmail',
          type: 'email',
          required: false,
          placeholder: '',
          enabled: true
        },
        {
          id: '7',
          name: 'miCuentaBancaria',
          type: 'text',
          required: false,
          placeholder: '',
          enabled: false
        }
      ]

      // Try to find existing variables for this customer
      let variableDoc = await collection.findOne({ customerId: customerId, type: 'variables' })

      if (!variableDoc) {
        // Use default variables if none exist
        variables = [
          // Internal variables (always first)
          {
            id: '1',
            name: 'fecha',
            type: 'date',
            required: true,
            placeholder: 'Fecha y hora actual',
            enabled: true,
            internal: true
          },
          // Default database variables
          ...defaultVariablesTemplate
        ]
      } else {
        // Decrypt and use existing variables
        const decrypted = CustomerEncryption.decryptSensitiveFields(variableDoc, customerId)
        const cleanDoc = mongoHelpers.cleanDocument(decrypted)

        variables = [
          // Internal variables (always first)
          {
            id: '1',
            name: 'fecha',
            type: 'date',
            required: true,
            placeholder: 'Fecha y hora actual',
            enabled: true,
            internal: true
          },
          // Database variables
          ...(cleanDoc.variables || [])
        ]
      }
    } catch (error) {
      console.warn('Could not fetch account variables from database, using defaults:', error)
      variables = [
        { name: 'fecha', type: 'date' },
        { name: 'miNombre', type: 'name' },
        { name: 'miDireccion', type: 'address' },
        { name: 'miTelefono', type: 'phone' },
        { name: 'miIdentificacionFiscal', type: 'taxId' },
        { name: 'miEmail', type: 'email' }
      ]
    }

    // Default dynamic fields that exist in the system
    const existingDynamicFields = [
      { name: 'clientName', type: 'text', required: true },
      { name: 'clientTaxId', type: 'text', required: true }
    ]

    // Generate contract with AI
    const aiResponse = await generateContract({
      description: description.trim(),
      variables: variables.map(v => ({ name: v.name, type: v.type, placeholder: v.placeholder })),
      dynamicFields: existingDynamicFields,
      existingContent: existingContent?.trim(),
      mode: mode || 'generate'
    })

    // Calculate token usage and cost
    const inputText = description + JSON.stringify(variables) + JSON.stringify(existingDynamicFields)
    const outputText = JSON.stringify(aiResponse)
    
    const inputTokens = await calculateTokenUsage(inputText)
    const outputTokens = await calculateTokenUsage(outputText)
    const totalTokens = inputTokens + outputTokens
    const estimatedCost = calculateCost(inputTokens, outputTokens)

    const processingTime = Date.now() - startTime

    console.log(`[AI CONTRACT] Generated successfully. Tokens: ${totalTokens}, Cost: $${estimatedCost.toFixed(4)}, Time: ${processingTime}ms`)

    // Log audit trail (encrypted)
    AICollections.logContractGeneration({
      customerId,
      userId,
      requestType: 'contract_generation',
      userDescription: description.trim(),
      generatedContent: aiResponse.content,
      generatedTitle: aiResponse.title,
      variables: variables.map(v => ({ name: v.name, type: v.type })),
      suggestedDynamicFields: aiResponse.suggestedDynamicFields,
      success: true,
      modelUsed: 'gpt-4o-mini',
      processingTimeMs: processingTime
    }).catch(error => {
      console.error('Failed to log audit trail:', error)
    })

    // Log usage tracking (unencrypted)
    AICollections.logUsage({
      customerId,
      userId,
      requestType: 'contract_generation',
      modelUsed: 'gpt-4o-mini',
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCost,
      success: true,
      processingTimeMs: processingTime
    }).catch(error => {
      console.error('Failed to log usage tracking:', error)
    })

    // Record AI generation in usage audit system
    try {
      const subscriptionInfo = await auth0UserManager.getUserSubscriptionInfo(userId)
      const planId = subscriptionInfo?.plan?.id || 'free'

      // AI generation cost is usually 0 for included usage, charged for extras
      const cost = 0 // Free plan typically has limited but free AI usage

      await UsageAuditService.recordAiGeneration({
        customerId,
        userId,
        aiPrompt: description.trim(),
        aiTokens: totalTokens,
        planId,
        cost,
        metadata: {
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
          userAgent: request.headers.get('user-agent'),
          apiCall: true,
          estimatedCost: estimatedCost,
          processingTimeMs: processingTime,
          modelUsed: 'gpt-4o-mini'
        }
      })
    } catch (auditError) {
      console.error('Error recording AI generation audit:', auditError)
      // Don't fail the AI generation if audit fails
    }

    return NextResponse.json({
      success: true,
      data: {
        ...aiResponse,
        metadata: {
          tokensUsed: totalTokens,
          estimatedCost,
          processingTimeMs: processingTime
        }
      }
    })

  } catch (error) {
    const processingTime = Date.now() - startTime
    
    console.error('Error generating AI contract:', error)
    
    // Log failed attempt
    try {
      const session = await auth()
      if (session?.user?.id) {
        // @ts-ignore
        const customerId = session.customerId as string
        const userId = session.user.id
        
        if (customerId) {
          AICollections.logContractGeneration({
            customerId,
            userId,
            requestType: 'contract_generation',
            userDescription: '',
            generatedContent: '',
            generatedTitle: '',
            variables: [],
            suggestedDynamicFields: [],
            success: false,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            modelUsed: 'gpt-4o-mini',
            processingTimeMs: processingTime
          }).catch(logError => {
            console.error('Failed to log failed attempt:', logError)
          })
        }
      }
    } catch (sessionError) {
      console.error('Could not log failed attempt:', sessionError)
    }
    
    // Return user-friendly error
    let errorMessage = 'Error generating contract'
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        errorMessage = 'AI service configuration error'
      } else if (error.message.includes('quota')) {
        errorMessage = 'AI service temporarily unavailable'
      } else if (error.message.includes('JSON')) {
        errorMessage = 'Error processing AI response'
      } else {
        errorMessage = 'Error generating contract'
      }
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}