import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getDatabase } from '@/lib/db/mongodb'

export const runtime = 'nodejs'

async function isAuthorized(request: NextRequest) {
  try {
    const session = await auth()
    if (session?.user?.id) return true
  } catch (_) {}

    // Fallback: allow API key via Authorization: Bearer <key>
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return false
    const db = await getDatabase()
    const collection = db.collection('esign_apikeys')
    const apiKey = await collection.findOne({ _id: token })
    return !!apiKey
  } catch (_) {
    return false
  }
}

function baseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
}

export async function GET(request: NextRequest) {
  const ok = await isAuthorized(request)
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const servers = [{ url: baseUrl() }]

  const openapi = {
    openapi: '3.0.3',
    info: {
      title: 'OpenSignature API',
      version: '1.0.0',
      description:
        'Official, session- or API-key–authenticated endpoints for contracts, signature requests and verification.'
    },
    servers,
    components: {
      securitySchemes: {
        CookieAuth: { type: 'apiKey', in: 'cookie', name: 'authjs.session-token' },
        ApiKeyAuth: { type: 'http', scheme: 'bearer' }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { error: { type: 'string' }, errorCode: { type: 'string' } }
        },
        Contract: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            content: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'signed', 'archived'] }
          },
          required: ['id', 'name', 'status']
        },
        SignatureRequest: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            shortId: { type: 'string' },
            contractId: { type: 'string' },
            signatureType: { type: 'string', enum: ['email', 'sms', 'local', 'tablet', 'qr'] },
            status: { type: 'string' },
            signatureUrl: { type: 'string' }
          }
        },
        SignRequestPublic: {
          type: 'object',
          properties: {
            authorized: { type: 'boolean' },
            signRequest: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                shortId: { type: 'string' },
                status: { type: 'string' }
              }
            },
            contract: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                content: { type: 'string' }
              }
            }
          }
        }
      }
    },
    security: [{ CookieAuth: [] }],
    paths: {
      '/api/status': {
        get: {
          summary: 'Health check',
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/contracts': {
        get: {
          summary: 'List contracts',
          security: [{ CookieAuth: [] }],
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'skip', in: 'query', schema: { type: 'integer', default: 0 } }
          ],
          responses: {
            '200': {
              description: 'Contracts',
              content: { 'application/json': { schema: { type: 'object', properties: { contracts: { type: 'array', items: { $ref: '#/components/schemas/Contract' } }, total: { type: 'integer' }, hasMore: { type: 'boolean' } } } } }
            },
            '401': { description: 'Unauthorized' }
          }
        },
        post: {
          summary: 'Create contract',
          security: [{ CookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    content: { type: 'string' }
                  },
                  required: ['name']
                }
              }
            }
          },
          responses: { '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Contract' } } } }, '401': { description: 'Unauthorized' } }
        }
      },
      '/api/signature-requests': {
        get: {
          summary: 'List signature requests',
          security: [{ CookieAuth: [] }],
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'contractId', in: 'query', schema: { type: 'string' } }
          ],
          responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } }
        },
        post: {
          summary: 'Create signature request',
          security: [{ CookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    contractId: { type: 'string' },
                    signatureType: { type: 'string', enum: ['email', 'sms', 'local', 'tablet', 'qr'] },
                    signerName: { type: 'string' },
                    signerEmail: { type: 'string' },
                    signerPhone: { type: 'string' }
                  },
                  required: ['contractId', 'signatureType']
                }
              }
            }
          },
          responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } }
        }
      },
      '/api/signature-requests/{id}': {
        get: {
          summary: 'Get signature request',
          security: [{ CookieAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } }
        },
        patch: {
          summary: 'Update signature request (archive/resend)',
          security: [{ CookieAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { action: { type: 'string', enum: ['archive', 'resend'] } } } } } },
          responses: { '200': { description: 'OK' } }
        },
        delete: {
          summary: 'Delete/discard signature request',
          security: [{ CookieAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/signature-requests/{id}/archive': {
        post: {
          summary: 'Archive signature request and process refund if applicable',
          security: [{ CookieAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/sign-requests': {
        get: {
          summary: 'List sign requests (legacy/internal)',
          security: [{ CookieAuth: [] }],
          responses: { '200': { description: 'OK' } }
        },
        post: {
          summary: 'Create sign request (legacy/internal)',
          security: [{ CookieAuth: [] }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { contractId: { type: 'string' }, recipientEmail: { type: 'string' }, recipientPhone: { type: 'string' } }, required: ['contractId'] } } } },
          responses: { '201': { description: 'Created' } }
        }
      },
      '/api/sign-requests/{shortId}': {
        get: {
          summary: 'Validate and get sign request details (public)',
          parameters: [
            { name: 'shortId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'a', in: 'query', required: true, schema: { type: 'string' }, description: 'Access key' }
          ],
          responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/SignRequestPublic' } } } }, '404': { description: 'Not found' } }
        },
        put: {
          summary: 'Complete signature (public)',
          parameters: [
            { name: 'shortId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'a', in: 'query', required: true, schema: { type: 'string' }, description: 'Access key' }
          ],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { signature: { type: 'string' }, dynamicFieldValues: { type: 'object' } }, required: ['signature'] } } } },
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/sign-requests/{shortId}/pdf': {
        get: {
          summary: 'Download signed contract PDF (public)',
          parameters: [
            { name: 'shortId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'a', in: 'query', required: true, schema: { type: 'string' } }
          ],
          responses: { '200': { description: 'PDF' }, '400': { description: 'Bad request' } }
        }
      },
      '/api/signatures': {
        get: {
          summary: 'List signatures',
          security: [{ CookieAuth: [] }],
          parameters: [
            { name: 'contractId', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string' } }
          ],
          responses: { '200': { description: 'OK' } }
        },
        post: {
          summary: 'Create signature (server-to-server)',
          security: [{ CookieAuth: [] }, { ApiKeyAuth: [] }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { contractId: { type: 'string' }, signature: { type: 'string' } }, required: ['contractId', 'signature'] } } } },
          responses: { '201': { description: 'Created' } }
        }
      }
    }
  }

  return NextResponse.json(openapi)
}



