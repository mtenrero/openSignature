import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getDatabase } from '@/lib/db/mongodb'
import { extractBearerToken, validateJWT } from '@/lib/auth/jwt'

export const runtime = 'nodejs'

async function isAuthorized(request: NextRequest) {
  try {
    const session = await auth()
    if (session?.user?.id) return true
  } catch (_) {}

  // Fallback: allow API key or OAuth JWT token via Authorization: Bearer <key>
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = extractBearerToken(authHeader)
    if (!token) return false

    const db = await getDatabase()

    // Check if it's an API key
    const collection = db.collection('esign_apikeys')
    const apiKey = await collection.findOne({ _id: token })
    if (apiKey) return true

    // Check if it's an OAuth JWT token
    const payload = await validateJWT(token)
    return !!payload
  } catch (_) {
    return false
  }
}

function baseUrl() {
  return process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'
}

function apiAudience() {
  return process.env.AUTH0_API_IDENTIFIER || 'https://osign.eu'
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
      title: 'oSign.EU API',
      version: '1.0.0',
      description: `
# oSign.EU API Documentation

Official REST API for electronic signature management.

## Authentication

This API supports **Bearer Token** authentication with two options:

### Option 1: API Keys (Recommended)

The simplest method for permanent authentication.

1. Sign in to ${baseUrl()}/settings/api-keys
2. Create a new API Key
3. Use it in your requests:

\`\`\`bash
curl -H "Authorization: Bearer osk_your_api_key_here" ${baseUrl()}/api/contracts
\`\`\`

**Advantages:**
- ✅ No expiration (permanent until revoked)
- ✅ Simple to use - no token refresh needed
- ✅ Can be revoked anytime from settings

### Option 2: OAuth 2.0 JWT Tokens

For applications requiring temporary tokens with expiration.

**Step 1:** Obtain an access token:

\`\`\`bash
curl -X POST ${baseUrl()}/api/oauth/token \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "client_credentials",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "audience": "${apiAudience()}"
  }'
\`\`\`

Response:
\`\`\`json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 86400
}
\`\`\`

**Step 2:** Use the token in requests:

\`\`\`bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" ${baseUrl()}/api/contracts
\`\`\`

**Note:** Tokens expire after 24 hours. Request a new token when needed.

## Rate Limiting

API requests are rate-limited based on your subscription plan.

## Support

For API support, contact: api@osign.eu
      `
    },
    servers,
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
          description: `
**API Key Authentication** (recommended for simplicity)

Use an API Key for simple, permanent authentication without OAuth complexity.

**How to get an API Key:**
1. Sign in to your account at ${baseUrl()}
2. Go to Settings → API Keys
3. Click "Create API Key"
4. Copy the generated key (starts with \`osk_\`)
5. Store it securely - it won't be shown again

**Usage:**
\`\`\`bash
curl -H "Authorization: Bearer osk_your_api_key_here" ${baseUrl()}/api/contracts
\`\`\`

**Advantages:**
- ✅ No expiration (permanent until revoked)
- ✅ Simple to use
- ✅ Can be revoked anytime from settings
- ✅ Track last usage date
          `
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: `
**OAuth 2.0 JWT Token** (for temporary access)

1. Get your access token from \`/api/oauth/token\`:
   \`\`\`bash
   curl -X POST ${baseUrl()}/api/oauth/token \\
     -H "Content-Type: application/json" \\
     -d '{
       "grant_type": "client_credentials",
       "client_id": "YOUR_CLIENT_ID",
       "client_secret": "YOUR_CLIENT_SECRET",
       "audience": "${apiAudience()}"
     }'
   \`\`\`

2. Copy the \`access_token\` from the response

3. Use as: \`Authorization: Bearer YOUR_TOKEN\`

**Token expires in 24 hours.** Request a new token when needed.
          `
        }
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
    security: [
      { ApiKeyAuth: [] },
      { BearerAuth: [] }
    ],
    paths: {
      '/api/oauth/token': {
        post: {
          summary: 'OAuth2 Token Endpoint',
          description: 'Request access tokens using client credentials for server-to-server authentication.',
          tags: ['OAuth2'],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: {
                  type: 'object',
                  properties: {
                    grant_type: {
                      type: 'string',
                      enum: ['client_credentials', 'authorization_code', 'refresh_token'],
                      default: 'client_credentials',
                      description: 'OAuth2 grant type (only client_credentials is currently supported)'
                    },
                    client_id: { type: 'string', description: 'Your application client ID' },
                    client_secret: { type: 'string', description: 'Your application client secret' },
                    audience: { type: 'string', description: `Optional API audience (default: ${apiAudience()})`, example: apiAudience() },
                    scope: { type: 'string', description: 'Optional space-separated list of scopes', example: 'read:contracts write:contracts' }
                  },
                  required: ['client_id', 'client_secret']
                }
              },
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    grant_type: {
                      type: 'string',
                      enum: ['client_credentials', 'authorization_code', 'refresh_token'],
                      default: 'client_credentials',
                      description: 'OAuth2 grant type (only client_credentials is currently supported)'
                    },
                    client_id: { type: 'string', description: 'Your application client ID' },
                    client_secret: { type: 'string', description: 'Your application client secret' },
                    audience: { type: 'string', description: `Optional API audience (default: ${apiAudience()})`, example: apiAudience() },
                    scope: { type: 'string', description: 'Optional space-separated list of scopes', example: 'read:contracts write:contracts' }
                  },
                  required: ['client_id', 'client_secret']
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Token successfully issued',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      access_token: { type: 'string', description: 'The access token for API authentication' },
                      token_type: { type: 'string', example: 'Bearer' },
                      expires_in: { type: 'integer', description: 'Token lifetime in seconds' },
                      scope: { type: 'string', description: 'Granted scopes' }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Bad request - invalid parameters',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: { type: 'string', example: 'invalid_request' },
                      error_description: { type: 'string' }
                    }
                  }
                }
              }
            },
            '401': {
              description: 'Unauthorized - invalid client credentials',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: { type: 'string', example: 'invalid_client' },
                      error_description: { type: 'string' }
                    }
                  }
                }
              }
            },
            '403': {
              description: 'Forbidden - client not authorized for the requested audience',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      error: { type: 'string', example: 'access_denied' },
                      error_description: { type: 'string', example: `Client is not authorized to access "${apiAudience()}"` }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/status': {
        get: {
          summary: 'Health check',
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/contracts': {
        get: {
          summary: 'List contracts',
          description: 'Retrieve all contracts for the authenticated user. By default, heavy fields like `content`, `htmlContent`, and `signedPdfBuffer` are excluded for efficiency. Use `full=true` to include all fields.',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filter by status (draft, signed, archived)' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 }, description: 'Maximum number of contracts to return' },
            { name: 'skip', in: 'query', schema: { type: 'integer', default: 0 }, description: 'Number of contracts to skip (pagination)' },
            { name: 'full', in: 'query', schema: { type: 'boolean', default: false }, description: 'Include all fields including heavy content (content, htmlContent, signedPdfBuffer)' }
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
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
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
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'contractId', in: 'query', schema: { type: 'string' } }
          ],
          responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } }
        },
        post: {
          summary: 'Create signature request',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
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
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } }
        },
        patch: {
          summary: 'Update signature request (archive/resend)',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { action: { type: 'string', enum: ['archive', 'resend'] } } } } } },
          responses: { '200': { description: 'OK' } }
        },
        delete: {
          summary: 'Delete/discard signature request',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/signature-requests/{id}/archive': {
        post: {
          summary: 'Archive signature request and process refund if applicable',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/signature-requests/{id}/sign': {
        get: {
          summary: 'View signature request for signing (public)',
          description: 'Public endpoint to view a signature request. Accepts either ObjectId or shortId. Requires access key for validation.',
          tags: ['Signature Workflow'],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Signature request ID (ObjectId) or shortId' },
            { name: 'a', in: 'query', required: true, schema: { type: 'string' }, description: 'Access key for validation' }
          ],
          responses: {
            '200': {
              description: 'Signature request details',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/SignRequestPublic' } } }
            },
            '404': { description: 'Signature request not found' },
            '410': { description: 'Signature request expired or already signed' }
          }
        },
        put: {
          summary: 'Complete signature (public)',
          description: 'Public endpoint to complete a signature. Accepts either ObjectId or shortId.',
          tags: ['Signature Workflow'],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Signature request ID (ObjectId) or shortId' },
            { name: 'a', in: 'query', required: true, schema: { type: 'string' }, description: 'Access key for validation' }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    signature: { type: 'string', description: 'Base64 encoded signature image' },
                    dynamicFieldValues: { type: 'object', description: 'Form field values' },
                    deviceMetadata: { type: 'object', description: 'Device and browser information' }
                  },
                  required: ['signature']
                }
              }
            }
          },
          responses: {
            '200': { description: 'Signature completed successfully' },
            '400': { description: 'Invalid request' },
            '404': { description: 'Signature request not found' }
          }
        }
      },
      '/api/signature-requests/{id}/pdf': {
        get: {
          summary: 'Download signed PDF (public)',
          description: 'Public endpoint to download signed contract PDF. Accepts either ObjectId or shortId.',
          tags: ['Signature Workflow'],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Signature request ID (ObjectId) or shortId' },
            { name: 'a', in: 'query', required: true, schema: { type: 'string' }, description: 'Access key for validation' }
          ],
          responses: {
            '200': {
              description: 'Signed PDF file',
              content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } }
            },
            '400': { description: 'Invalid request' },
            '404': { description: 'PDF not found' }
          }
        }
      },
      '/api/sign-requests': {
        get: {
          summary: '[DEPRECATED] Use /api/signature-requests instead',
          deprecated: true,
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          responses: { '200': { description: 'OK' } }
        },
        post: {
          summary: '[DEPRECATED] Use /api/signature-requests instead',
          deprecated: true,
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { contractId: { type: 'string' } }, required: ['contractId'] } } } },
          responses: { '201': { description: 'Created' } }
        }
      },
      '/api/sign-requests/{shortId}': {
        get: {
          summary: '[DEPRECATED] Use /api/signature-requests/{id}/sign instead',
          deprecated: true,
          parameters: [
            { name: 'shortId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'a', in: 'query', required: true, schema: { type: 'string' } }
          ],
          responses: { '200': { description: 'OK' } }
        },
        put: {
          summary: '[DEPRECATED] Use /api/signature-requests/{id}/sign instead',
          deprecated: true,
          parameters: [
            { name: 'shortId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'a', in: 'query', required: true, schema: { type: 'string' } }
          ],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { signature: { type: 'string' } }, required: ['signature'] } } } },
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/sign-requests/{shortId}/pdf': {
        get: {
          summary: '[DEPRECATED] Use /api/signature-requests/{id}/pdf instead',
          deprecated: true,
          parameters: [
            { name: 'shortId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'a', in: 'query', required: true, schema: { type: 'string' } }
          ],
          responses: { '200': { description: 'PDF' } }
        }
      },
      '/api/signatures': {
        get: {
          summary: 'List signatures',
          description: 'Retrieve all signatures for the authenticated user. By default, heavy fields like `signature` (base64 image), `metadata.auditTrail`, `metadata.dynamicFieldValues`, and TSA tokens are excluded for efficiency. Use `full=true` to include all fields.',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [
            { name: 'contractId', in: 'query', schema: { type: 'string' }, description: 'Filter by contract ID' },
            { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filter by status' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 }, description: 'Maximum number of signatures to return' },
            { name: 'skip', in: 'query', schema: { type: 'integer', default: 0 }, description: 'Number of signatures to skip (pagination)' },
            { name: 'full', in: 'query', schema: { type: 'boolean', default: false }, description: 'Include all fields including signature data, audit trail, and form values' }
          ],
          responses: {
            '200': { description: 'List of signatures with pagination metadata' },
            '401': { description: 'Unauthorized' }
          }
        },
        post: {
          summary: 'Create signature (server-to-server)',
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { contractId: { type: 'string' }, signature: { type: 'string' } }, required: ['contractId', 'signature'] } } } },
          responses: {
            '201': { description: 'Signature created successfully' },
            '401': { description: 'Unauthorized' }
          }
        }
      }
    }
  }

  return NextResponse.json(openapi)
}



